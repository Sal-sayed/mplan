-- metric_analysis — output of the Python statistical tier (SLICE 1: changepoint + trend).
-- Run this BY HAND in Supabase (SQL editor). Idempotent (IF NOT EXISTS). The Python
-- cron (scripts/python/analyze_metrics.py) appends one row per series per run; the
-- Metric Health UI reads the LATEST analyzed_at per series.
--
-- KEYED to mirror a ga4_metric_daily series + the run time:
--   (user_id, property_id, metric_name, dimension_value, analyzed_at)
--
-- HONESTY by construction: validated defaults false and confidence defaults 'low'
-- this slice — nothing here is a trustworthy verdict until validated on real data.

create table if not exists metric_analysis (
  user_id              text        not null,
  property_id          text        not null,
  metric_name          text        not null,
  dimension_value      text        not null default '',
  analyzed_at          timestamptz not null,
  changepoint_detected boolean     not null default false,
  changepoint_date     date,
  trend                text        not null,                 -- 'up' | 'down' | 'flat'
  trend_slope          double precision not null default 0,
  weeks_of_data        double precision not null default 0,
  confidence           text        not null default 'low',   -- capped at 'low' this slice
  validated            boolean     not null default false,    -- NOT validated this slice
  verdict              text,
  caveats              jsonb       not null default '[]'::jsonb,
  primary key (user_id, property_id, metric_name, dimension_value, analyzed_at)
);

-- Fast "latest analysis per series" lookup for the UI.
create index if not exists metric_analysis_series_idx
  on metric_analysis (user_id, property_id, metric_name, dimension_value, analyzed_at desc);
