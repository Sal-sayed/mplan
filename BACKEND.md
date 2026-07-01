# Backend — Sirah (measurement-plan-agent)

> **Note on architecture:** this app is a **single full-stack Next.js monolith** — frontend and backend live in one codebase and deploy as one Render web service. This document describes only the **backend** half (API endpoints, server logic, integrations, data, jobs). See [`FRONTEND.md`](./FRONTEND.md) for the UI half. The backend surface is exactly **`app/api/**`** (route handlers) plus the server logic in **`lib/**`** and the scheduled jobs in **`scripts/**`**.

---

## 1. Stack & runtime

| Concern | Choice |
|---|---|
| API layer | **Next.js route handlers** (`app/api/**/route.ts`) — server-side, run on the Node server |
| Language | TypeScript (Node) |
| LLM | **Gemini** via `@anthropic-ai/sdk`-style client (`lib/gemini.ts`, `lib/claude-stream.ts`) |
| Database | **Supabase** (Postgres) via `@supabase/supabase-js` — service-role, with a dev-only local-JSON fallback |
| Auth | JWT sessions (`jose`) in an httpOnly `session` cookie; admin uses a separate `admin_token` |
| Rate limiting | `@upstash/ratelimit` + `@upstash/redis` |
| Headless browser | **Playwright** (+ `puppeteer-core`) for scraping & live capture |
| Email | **Resend** (+ `nodemailer`) via `lib/email-sender.ts` |
| File output | `exceljs` (workbooks), `jspdf`/`pdf-generator` |
| Deploy | Render **Docker** web service (Playwright base image) → `next start` |

---

## 2. API endpoints (`app/api/**`)

### 2.1 Plan / audit pipeline
| Endpoint | Purpose |
|---|---|
| `POST /api/analyze` | Scrape the site (Playwright) → structured `ScrapeResult`. |
| `POST /api/score` | Heuristic tracking-readiness score. |
| `POST /api/detect-mode` | New vs existing-site detection. |
| `POST /api/generate-plan` | **Streaming (SSE)** — classify + generate the `MeasurementPlan` (Gemini, with template fallback). Returns `409` for low-confidence (confirmation flow). |
| `POST /api/generate-audit` | **Streaming** — audit an existing site's tracking. |
| `POST /api/parse-existing-plan` | Parse an uploaded Excel plan. |
| `POST /api/audit-existing-site` | Existing-site audit orchestration. |
| `POST /api/send-plan` | Email the plan/audit as an Excel workbook. |
| `POST /api/download-plan`, `POST /api/export-excel` | Generate the workbook for download. |

### 2.2 Identity auth (Google sign-in)
`GET /api/auth/google/start` · `GET /api/auth/google/callback` · `GET /api/auth/me` (`no-store`) · `POST /api/auth/logout`.

### 2.3 Analytics OAuth (GA4/GTM read+write — operator-gated)
`GET /api/google/oauth/start` (read) · `/start-write` (write) · `/callback` · `GET /api/google/status` · `POST /api/google/disconnect`.

### 2.4 GitHub (snippet injection via PRs)
`GET /api/github/start` · `/callback` · `/status` · `/repos` · `POST /api/github/disconnect` · `POST /api/github/inject-gtm` · `POST /api/github/inject-datalayer`.

### 2.5 Implementation (Set-up stage — create + apply, never publishes)
`POST /api/implementation/proposal` · `/apply` · `/create-container` · `/create-ga4` · `GET /api/implementation/provision-status`.

### 2.6 Readiness / governance / metrics (Go-live + Monitor)
| Endpoint | Purpose |
|---|---|
| `POST /api/launch-readiness` | Plan-consistency + optional live capture (or a pasted **Tracking Spy** capture) → go/no-go. |
| `POST /api/governance/check` | Config drift vs the last saved run. |
| `POST /api/governance/run-scheduled` | Cron-gated governance sweep. |
| `POST /api/metrics/fetch-scheduled` | Cron-gated GA4 daily metric collection. |
| `POST /api/metrics/validate` | Threshold metric-health verdicts (+ the preliminary statistical tier). |
| `POST /api/metrics/backfill` | One-time historical GA4 backfill. |
| `GET/POST /api/plans` | Save / list / fetch the user's plans (owner-scoped, `no-store`). |

### 2.7 Leads admin (internal)
`POST /api/leads-admin/login` · `/logout` · `GET /api/leads-admin/data` · `/errors`.

**Gating:** cron endpoints require `Bearer MONITOR_SECRET`; operator/analytics actions require an authenticated operator; per-user data (`/plans`, `/auth/me`) is session-scoped and `no-store`.

---

## 3. Server logic (`lib/`)

### 3.1 Plan generation
`lib/measurement/`: `classify.ts`, `generate-plan.ts`, `pipeline.ts`, `templates.ts` + `template-plan.ts` (the deterministic no-AI fallback), `types.ts`, `sanitize-plan.ts` — plus `lib/gemini.ts`, `lib/prompts.ts`, `lib/claude-stream.ts`, `lib/json-generator.ts`, `lib/json-repair.ts`.

### 3.2 Scrape & audit
`lib/scraper.ts` (Playwright), `lib/existing-site-auditor.ts`, `lib/audit-prompt.ts`, `lib/mode-detector.ts`.

### 3.3 Readiness / governance / metrics
`launch-readiness.ts`, `readiness.ts`, `governance.ts` + `governance-diff.ts` + `governance-store.ts`, `data-validation.ts` (threshold validator), `metric-store.ts`, `metric-analysis-store.ts`, `live-capture.ts`, `observed-signals.ts`, `spy-import.ts` (Tracking-Spy adapter), `consent-compliance.ts` / `consent-coverage.ts`.

### 3.4 Implementation
`implementation-proposal.ts`, `gtm-apply.ts` / `gtm-config.ts`, `ga4-provision.ts` / `ga4-config.ts` / `ga4-data.ts`, `provision-check.ts`, `approve-apply.ts`, `inject-link.ts`, `event-routing.ts`.

### 3.5 Integrations
- **Google** (`lib/google/`): `oauth.ts`, `oauth-login.ts`, `token-store.ts`, `ga4-write.ts`, `gtm-write.ts` — GA4 Admin API + Tag Manager API.
- **GitHub** (`lib/github/`): `oauth.ts`, `repo.ts`, `token-store.ts`, `head-injector.ts`, `datalayer-artifact.ts`, `datalayer-locator.ts` — opens review PRs (never edits handlers directly).
- **Tracking Spy** (`lib/tracking-spy/`): `parsers.ts` (RawHit → NormalizedEvent), `injected.js`, `index.ts`.

### 3.6 Output
`lib/excel-export.ts` + `lib/plan-workbook.ts` (the branded "Sirah Digital" workbook), `lib/audit-excel-generator.ts`, `lib/pdf-generator.ts`, `lib/email-sender.ts`.

### 3.7 Infra / cross-cutting
`lib/auth.ts` (session JWTs, owner resolution, operator gate), `lib/rate-limit.ts` (Upstash), `lib/env-validation.ts` (fail-fast on missing env), `lib/critical-errors.ts`. **Stores** (Supabase + local fallback): `plans-store.ts`, `users-store.ts`, `leads-store.ts`, `governance-store.ts`, `metric-store.ts`, `metric-analysis-store.ts`, and the OAuth `token-store`s.

---

## 4. Data (Supabase / Postgres)
Service-role client; degrades to a dev-only local JSON file when unconfigured (never throws). Tables are created **by hand** (SQL in code comments + `scripts/sql/`):

| Table | Holds |
|---|---|
| `users` | Signed-in identities (Google). |
| `plans` | Saved measurement plans (`user_id, site_url, business_model, plan jsonb, created_at`). |
| `leads` | Captured leads (internal). |
| `governance_runs` | Config verdicts over time. |
| `ga4_metric_daily` | Daily GA4 metric series (`user_id, property_id, metric_name, dimension_value, date, value`). |
| `metric_analysis` | Python statistical tier output (changepoint + trend, `validated:false`). |
| `google_oauth`, `github_oauth` | Per-owner OAuth tokens. |

**Durability note:** on Render the local file is ephemeral — **Supabase is the only durable store.**

---

## 5. Scheduled jobs (separate from the web server)
The web server does **not** run background loops. A **GitHub Actions cron** (`.github/workflows/scheduled-metrics-and-governance.yml`, daily 08:00 UTC) drives them by POSTing the `MONITOR_SECRET`-gated endpoints:
- `scripts/run-governance-cron.mjs` → `/api/governance/run-scheduled`
- `scripts/run-metrics-cron.mjs` → `/api/metrics/fetch-scheduled`
- `scripts/python/analyze_metrics.py` → reads `ga4_metric_daily`, writes `metric_analysis` (the preliminary statistical tier; stdlib-only, best-effort).

`scripts/sql/*.sql` = hand-run migrations. `scripts/seed-and-verify-metrics.mjs`, `scripts/create-template.js` = dev utilities.

---

## 6. External services (dependencies, not our servers)
- **Gemini** — LLM for plan/audit generation.
- **Google OAuth + GA4 Admin API + Tag Manager API** — identity, and GA4/GTM read/create/apply.
- **GitHub App/OAuth** — repo access to open snippet PRs.
- **Resend** — transactional email (plan delivery).
- **Upstash Redis** — rate limiting.
- **Supabase** — Postgres.

---

## 7. Environment variables (server)
Required/consumed by the backend (validated at boot in `lib/env-validation.ts`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, the Gemini/LLM key, Google OAuth client id/secret + redirect URIs (login + analytics), GitHub App/OAuth creds + `GITHUB_OAUTH_REDIRECT_URI`, `RESEND_*`, Upstash `UPSTASH_REDIS_*`, `MONITOR_SECRET`, `APP_BASE_URL`, admin creds for the leads panel. (See `render.yaml` / Render dashboard for the live set.)

---

## 8. Tests
`node --test` (type-stripping, no JSX) over an explicit file list in `package.json`. Backend logic is covered by pure unit tests (e.g. `generate-plan`, `launch-readiness`, `governance*`, `data-validation`, `metric-store`, `spy-import`, `template-plan`, `journey-stage`, the google/github libs, and the API route tests under `app/api/**`). The Python tier has its own `--self-test`.

---

## 9. Build & run (backend)
- Same process as the frontend: `next build` then `next start` (one Render service). Heavy routes set `maxDuration` (e.g. launch-readiness = 120s for the headless browser).
- Docker image installs Playwright chromium (`postinstall` / `build`).

---

## 10. The frontend ↔ backend seam
The backend is addressable **only** through `app/api/**` (same-origin from the UI today). If you split into two deployments, that folder + `lib/**` + `scripts/**` become the standalone service; the frontend would point at it via an absolute base URL with CORS + cross-domain cookie handling. See [`FRONTEND.md`](./FRONTEND.md) §8.
