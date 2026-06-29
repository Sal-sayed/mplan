#!/usr/bin/env python3
"""analyze_metrics.py — Python statistical tier, SLICE 1 (build-now / validate-later).

Reads a metric's daily series from Supabase (ga4_metric_daily) and runs a
DELIBERATELY SIMPLE analysis, writing results to `metric_analysis`:

  * single mean-shift changepoint (CUSUM-style two-segment mean comparison)
  * linear trend direction (slope sign)

It does NOT duplicate the Node threshold validator (data-validation.ts) — no
drop/zero-fire/threshold logic. It ADDS changepoint + trend only.

CRITICAL HONESTY — built into the contract, not bolted on:
  * NOT validated on real data in this slice. Every row carries validated=False,
    confidence='low' (capped), weeks_of_data, and caveats.
  * The method is intentionally simple: thin data + day-of-week noise make fancy
    methods over-confident. NO seasonality, NO day-of-week decomposition (those
    need months of data) — "day-of-week effects not modelled" is a standing caveat.
  * The UI labels everything "preliminary — not yet validated on real data" and
    never lets it displace the fast threshold check.

Deps: Python stdlib only (urllib/json) — no numpy, no changepoint libraries.

USAGE:
  python analyze_metrics.py                 # real run: read Supabase, analyze, write
  python analyze_metrics.py --mock          # PLUMBING TEST: run on built-in mock
                                            #   series, print contracts, write NOTHING
  python analyze_metrics.py --input f.json  # plumbing test on a JSON fixture file
  python analyze_metrics.py --self-test     # run assertions on the analysis + contract

Env (real run only; GitHub Actions secrets):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# ─── Tunables (kept conservative on purpose) ─────────────────────────────────
MIN_LEN_FOR_CHANGEPOINT = 8   # < this → no changepoint call (too little data)
MIN_SEGMENT = 3               # each side of a split needs ≥ this many points
EFFECT_THRESHOLD = 1.0        # mean shift must be ≥ ~1 pooled std to be "detected"
FLAT_PCT = 0.05               # |fitted change across series| < 5% of mean → 'flat'
LOOKBACK_DAYS = 120           # how far back to pull (thin data; bounded query)

CONFIDENCE_CAP = "low"        # NEVER higher in this slice
STANDING_CAVEAT_DOW = "day-of-week effects not modelled"


# ─── Core analysis (PURE — unit-tested via --self-test) ──────────────────────

def linear_trend(values):
    """Least-squares slope sign over the series. Returns (trend, slope).

    'flat' unless the fitted line moves more than FLAT_PCT of the mean across the
    whole series — so tiny wiggles on noisy/thin data don't read as a trend.
    """
    n = len(values)
    if n < 2:
        return "flat", 0.0
    xs = range(n)
    mean_x = sum(xs) / n
    mean_y = sum(values) / n
    sxx = sum((x - mean_x) ** 2 for x in xs)
    sxy = sum((xs[i] - mean_x) * (values[i] - mean_y) for i in range(n))
    slope = (sxy / sxx) if sxx else 0.0
    total_change = slope * (n - 1)
    denom = abs(mean_y) if abs(mean_y) > 1e-9 else 1.0
    pct = total_change / denom
    if pct > FLAT_PCT:
        return "up", slope
    if pct < -FLAT_PCT:
        return "down", slope
    return "flat", slope


def single_changepoint(dates, values):
    """ONE mean-shift via the best two-segment split (max between-segment SS),
    accepted only if the shift is ≥ EFFECT_THRESHOLD pooled std and there's
    enough data. Returns (detected: bool, changepoint_date: str | None).

    Deliberately a single mean-shift — NOT a multi-changepoint library.
    """
    n = len(values)
    if n < MIN_LEN_FOR_CHANGEPOINT:
        return False, None

    best_k = None
    best_between = -1.0
    for k in range(MIN_SEGMENT, n - MIN_SEGMENT + 1):
        left, right = values[:k], values[k:]
        ml = sum(left) / len(left)
        mr = sum(right) / len(right)
        between = (len(left) * len(right) / n) * (ml - mr) ** 2
        if between > best_between:
            best_between, best_k = between, k

    if best_k is None:
        return False, None

    left, right = values[:best_k], values[best_k:]
    ml = sum(left) / len(left)
    mr = sum(right) / len(right)
    within = sum((v - ml) ** 2 for v in left) + sum((v - mr) ** 2 for v in right)
    pooled = (within / max(1, n - 2)) ** 0.5
    effect = abs(ml - mr) / (pooled + 1e-9)
    if effect >= EFFECT_THRESHOLD:
        return True, dates[best_k]  # first date of the right (post-shift) segment
    return False, None


def weeks_of(n):
    return round(n / 7.0, 1)


def build_caveats(weeks):
    caveats = [f"preliminary — {weeks} week(s) of data", STANDING_CAVEAT_DOW]
    if weeks < 3:
        caveats.append("very thin data")
    return caveats


def verdict_line(trend, cp_detected, cp_date, weeks):
    trend_part = {"up": "trend rising", "down": "trend falling", "flat": "trend flat"}[trend]
    cp_part = f"possible shift around {cp_date}" if cp_detected else "no clear shift"
    return f"Preliminary ({weeks}w, not validated): {trend_part}; {cp_part}."


def analyze_series(user_id, property_id, metric_name, dimension_value, points, analyzed_at=None):
    """points = list of {date, value} (any order). Returns the FULL contract dict.

    Honesty fields are ALWAYS present and capped — there is no code path that
    produces a row without validated=False / confidence='low' / weeks / caveats.
    """
    ordered = sorted(points, key=lambda p: p["date"])
    dates = [p["date"] for p in ordered]
    values = [float(p["value"]) for p in ordered]

    weeks = weeks_of(len(values))
    trend, slope = linear_trend(values)
    cp_detected, cp_date = single_changepoint(dates, values)

    return {
        "userId": user_id,
        "propertyId": property_id,
        "metricName": metric_name,
        "dimensionValue": dimension_value,
        "changepoint_detected": bool(cp_detected),
        "changepoint_date": cp_date,
        "trend": trend,
        "trend_slope": round(slope, 6),
        "weeks_of_data": weeks,
        "confidence": CONFIDENCE_CAP,   # capped — never higher this slice
        "validated": False,             # NOT validated on real data this slice
        "verdict": verdict_line(trend, cp_detected, cp_date, weeks),
        "caveats": build_caveats(weeks),
        "analyzed_at": analyzed_at or datetime.now(timezone.utc).isoformat(),
    }


def to_db_row(contract):
    """Map the camelCase contract to the metric_analysis (snake_case) columns."""
    return {
        "user_id": contract["userId"],
        "property_id": contract["propertyId"],
        "metric_name": contract["metricName"],
        "dimension_value": contract["dimensionValue"],
        "analyzed_at": contract["analyzed_at"],
        "changepoint_detected": contract["changepoint_detected"],
        "changepoint_date": contract["changepoint_date"],
        "trend": contract["trend"],
        "trend_slope": contract["trend_slope"],
        "weeks_of_data": contract["weeks_of_data"],
        "confidence": contract["confidence"],
        "validated": contract["validated"],
        "verdict": contract["verdict"],
        "caveats": contract["caveats"],  # jsonb
    }


# ─── Supabase I/O (PostgREST via stdlib urllib — no client lib) ──────────────

def _sb_headers(key):
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def fetch_series(url, key):
    """Read recent ga4_metric_daily rows and group them into series.

    NOTE: PostgREST defaults to a 1000-row page; on thin data (this slice's
    reality) that's plenty. A later slice paginates if volume grows.
    """
    since = _lookback_date()
    q = urlencode({
        "select": "user_id,property_id,metric_name,dimension_value,date,value",
        "date": f"gte.{since}",
        "order": "date.asc",
    })
    req = Request(f"{url.rstrip('/')}/rest/v1/ga4_metric_daily?{q}",
                  headers={**_sb_headers(key), "Accept": "application/json"})
    with urlopen(req, timeout=30) as r:
        rows = json.loads(r.read().decode())

    series = {}
    for row in rows:
        k = (row.get("user_id") or "admin", row["property_id"], row["metric_name"], row.get("dimension_value") or "")
        series.setdefault(k, []).append({"date": row["date"], "value": row["value"]})
    return series


def insert_analysis(url, key, db_row):
    """Append one metric_analysis row (analyzed_at is part of the PK → no clobber;
    the UI reads the latest analyzed_at per series)."""
    req = Request(
        f"{url.rstrip('/')}/rest/v1/metric_analysis",
        data=json.dumps(db_row).encode(),
        method="POST",
        headers={**_sb_headers(key), "Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    urlopen(req, timeout=30).read()


def _lookback_date():
    from datetime import timedelta
    return (datetime.now(timezone.utc).date() - timedelta(days=LOOKBACK_DAYS)).isoformat()


# ─── Mock fixture (PLUMBING TEST ONLY — made-up data, NOT validated) ─────────

def mock_series():
    """A tiny set of made-up daily series to prove the plumbing end-to-end."""
    def day(i):
        from datetime import timedelta
        return (datetime(2026, 1, 1) + timedelta(days=i)).date().isoformat()

    step_up = [{"date": day(i), "value": 10 + (1 if i % 2 else 0)} for i in range(7)] + \
              [{"date": day(i), "value": 30 + (1 if i % 2 else 0)} for i in range(7, 14)]
    flat = [{"date": day(i), "value": 20 + (1 if i % 2 else -1)} for i in range(14)]
    thin = [{"date": day(i), "value": 5 + i} for i in range(5)]  # < 3 weeks → "very thin data"

    return {
        ("mock-user", "properties/000", "eventCount", "purchase"): step_up,
        ("mock-user", "properties/000", "eventCount", "page_view"): flat,
        ("mock-user", "properties/000", "eventCount", "sign_up"): thin,
    }


# ─── Self-test (the Python test — asserts analysis + contract honesty) ───────

def self_test():
    fixtures = mock_series()
    fixed_at = "2026-01-15T00:00:00+00:00"

    # 1) obvious step-up → changepoint detected (plumbing works)
    k = ("mock-user", "properties/000", "eventCount", "purchase")
    c = analyze_series(*k, fixtures[k], analyzed_at=fixed_at)
    assert c["changepoint_detected"] is True, "step-up should detect a changepoint"
    assert c["changepoint_date"] is not None

    # 2) flat series → trend 'flat'
    k = ("mock-user", "properties/000", "eventCount", "page_view")
    c = analyze_series(*k, fixtures[k], analyzed_at=fixed_at)
    assert c["trend"] == "flat", f"flat series should be flat, got {c['trend']}"

    # 3) honesty fields ALWAYS present + capped on every contract
    required = {"userId", "propertyId", "metricName", "dimensionValue",
                "changepoint_detected", "changepoint_date", "trend", "trend_slope",
                "weeks_of_data", "confidence", "validated", "verdict", "caveats", "analyzed_at"}
    for k, pts in fixtures.items():
        c = analyze_series(*k, pts, analyzed_at=fixed_at)
        assert required.issubset(c.keys()), f"missing contract fields: {required - set(c.keys())}"
        assert c["confidence"] == "low", "confidence must be capped at 'low'"
        assert c["validated"] is False, "validated must be False this slice"
        assert any("preliminary" in cav for cav in c["caveats"]), "must carry a 'preliminary' caveat"
        assert STANDING_CAVEAT_DOW in c["caveats"], "must carry the day-of-week caveat"

    # 4) very thin data caveat appears under 3 weeks
    k = ("mock-user", "properties/000", "eventCount", "sign_up")
    c = analyze_series(*k, fixtures[k], analyzed_at=fixed_at)
    assert "very thin data" in c["caveats"], "thin series should warn 'very thin data'"

    print("self-test OK: changepoint + trend + honesty contract all pass (plumbing only — NOT validated).")
    return 0


# ─── Entrypoint ──────────────────────────────────────────────────────────────

def run_mock(input_path=None):
    if input_path:
        with open(input_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        # fixture file shape: [{userId, propertyId, metricName, dimensionValue, points:[{date,value}]}]
        series = {(s["userId"], s["propertyId"], s["metricName"], s.get("dimensionValue", "")): s["points"] for s in raw}
    else:
        series = mock_series()

    print("PLUMBING TEST — mock data, NOT validated analysis. Would write these rows:\n")
    for key, points in series.items():
        contract = analyze_series(*key, points)
        print(json.dumps(contract, indent=2))
        print("  → db row:", json.dumps(to_db_row(contract)))
        print()
    print(f"Computed {len(series)} contract(s). Nothing written (mock mode).")
    return 0


def run_real():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.", file=sys.stderr)
        return 2

    try:
        series = fetch_series(url, key)
    except Exception as e:  # total read failure — preliminary tier is best-effort
        print(f"Could not read ga4_metric_daily: {e}", file=sys.stderr)
        return 0  # don't red-X the workflow; this tier is non-critical/preliminary

    analyzed = skipped = 0
    for key, points in series.items():
        try:
            contract = analyze_series(*key, points)
            insert_analysis(url, key, to_db_row(contract))
            analyzed += 1
            print(f"[{key[1]}::{key[2]}::{key[3]}] {contract['verdict']}")
        except Exception as e:  # warn-and-continue per series (cron resilience)
            skipped += 1
            print(f"[{key[1]}::{key[2]}::{key[3]}] skipped: {e}", file=sys.stderr)

    print(f"Done: {analyzed} analyzed, {skipped} skipped (of {len(series)} series). "
          f"All rows validated=False, confidence='low' — preliminary, not yet validated.")
    return 0


def main(argv):
    if "--self-test" in argv:
        return self_test()
    if "--mock" in argv:
        return run_mock()
    if "--input" in argv:
        i = argv.index("--input")
        return run_mock(argv[i + 1] if i + 1 < len(argv) else None)
    return run_real()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
