# GO-LIVE — Multi-User Rollout Runbook

Ordered, checkable steps to take the multi-user product (Stages 0–5, commits
`80feb14` → `6aaa74e`) live. Work top to bottom — **do not deploy before the
migrations in step 1 are applied.**

Production host: `https://mplan-1.onrender.com` (Render, Docker). Substitute your
own domain if it differs.

---

## 1. PRE-DEPLOY — Supabase migrations (run BY HAND, in this exact order, BEFORE deploying)

> Assumes the base tables already exist from prior deploys (`governance_runs`,
> `ga4_metric_daily`, `google_oauth`, `leads`). These migrations only add the
> multi-user ownership layer.

- [ ] **Stage 0 — ownership schema + backfill existing data to `admin`.** Replace `<your-admin-email>` with the real admin email.
  ```sql
  create table users (
    id text primary key,
    email text unique,
    name text,
    created_at timestamptz default now()
  );
  insert into users (id, email, name) values ('admin', '<your-admin-email>', 'Admin')
    on conflict do nothing;

  alter table governance_runs  add column if not exists user_id text;
  alter table ga4_metric_daily add column if not exists user_id text;
  alter table google_oauth     add column if not exists user_id text;

  create table plans (
    id text primary key,
    user_id text not null,
    site_url text,
    business_model text,
    plan jsonb not null,
    created_at timestamptz default now()
  );
  create index on plans (user_id, created_at desc);

  update governance_runs  set user_id = 'admin' where user_id is null;
  update ga4_metric_daily set user_id = 'admin' where user_id is null;
  update google_oauth     set user_id = 'admin' where user_id is null;
  ```

- [ ] **Stage 3 — re-key `ga4_metric_daily` so the PK includes `user_id`** (must run AFTER the Stage-0 backfill, so `user_id` is non-null).
  ```sql
  alter table ga4_metric_daily alter column user_id set not null;
  alter table ga4_metric_daily drop constraint ga4_metric_daily_pkey;
  alter table ga4_metric_daily
    add primary key (user_id, property_id, metric_name, dimension_value, date);
  ```

- [ ] **Stage 4 — unique constraint on `google_oauth.user_id`** (the per-user token upsert's conflict target).
  ```sql
  alter table google_oauth add constraint google_oauth_user_id_key unique (user_id);
  ```

> ⚠️ **The Stage-3 PK migration MUST be applied before the new code's metric
> writes run.** The collector/backfill upsert now uses the conflict key
> `(user_id, property_id, metric_name, dimension_value, date)`. Until the PK
> includes `user_id`, that conflict key has no matching constraint and **metric
> upserts warn-and-skip** (no data lost, but nothing is written).

---

## 2. ENV VARS (set on Render before/with the deploy)

Exact names the code reads (`lib/env-validation.ts`, `lib/google/oauth-login.ts`, `lib/google/oauth.ts`, `lib/google/token-store.ts`).

**New for this rollout:**
- [ ] `GOOGLE_LOGIN_REDIRECT_URI` = `https://mplan-1.onrender.com/api/auth/google/callback`
      (the Google **Sign-In / identity** callback — `openid email profile` flow; defaults to localhost if unset)

**Confirm already set (boot fails without the required ones):**
- [ ] `JWT_SECRET` — **≥ 32 chars** (roots the admin JWT, the user session JWT, AND the Google refresh-token AES key)
- [ ] `GEMINI_API_KEY`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ADMIN_PASSWORD_HASH` — required in production (raw bcrypt hash; Render injects it literally)
- [ ] One email provider: `RESEND_API_KEY` **or** `N8N_WEBHOOK_URL`
- [ ] Analytics OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (the **same** OAuth client is reused by login)
- [ ] `GOOGLE_OAUTH_REDIRECT_URI` = `https://mplan-1.onrender.com/api/google/oauth/callback` (the **analytics** GA4/GTM callback — distinct from login)
- [ ] `MONITOR_SECRET` (governance + metrics cron auth)
- [ ] `APP_BASE_URL` = `https://mplan-1.onrender.com` (used by the cron scripts / GitHub Action)

**Optional (warn-only, safe to omit):**
- [ ] `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (rate limiting; disabled if unset)
- [ ] `GEMINI_MODEL` (default `gemini-2.5-flash`), `GEMINI_BASE_URL`
- [ ] `GOOGLE_TOKEN_ENC_KEY` (token encryption key; **falls back to `JWT_SECRET`** if unset)
- [ ] `ADMIN_USERNAME` (admin login)

---

## 3. GOOGLE CLOUD CONSOLE

The login and analytics flows are **two separate callbacks on the same OAuth
client** — **both** redirect URIs must be present.

- [ ] **Add the LOGIN callback** to Authorized redirect URIs:
      `https://mplan-1.onrender.com/api/auth/google/callback`
- [ ] **Keep the ANALYTICS callback** (must remain):
      `https://mplan-1.onrender.com/api/google/oauth/callback`
- [ ] (Dev, optional) add the localhost variants:
      `http://localhost:3000/api/auth/google/callback` and
      `http://localhost:3000/api/google/oauth/callback`
- [ ] **Login scopes** — `openid`, `email`, `profile` (non-sensitive; no Google verification needed)
- [ ] **Analytics scopes** — `https://www.googleapis.com/auth/analytics.readonly` + `https://www.googleapis.com/auth/tagmanager.readonly` (separate, **optional** per-user connection; sensitive — keep the operator/test users on the consent screen)

---

## 4. DEPLOY

- [ ] Verify the working tree (OneDrive-clobber check — repo lives under `Documents/`):
  ```bash
  git log -1 --oneline        # expect: 6aaa74e Stage 5: saved-plan history ...
  git status -sb              # expect: clean, up to date with origin/master
  ```
- [ ] Confirm `master` is pushed: `git push origin master` → "Everything up-to-date"
- [ ] Trigger the Render deploy (autoDeploy on push, or "Manual Deploy" in the dashboard). **Migrations from step 1 must already be applied.**
- [ ] Watch Render logs for `✓ Environment validated` and `Ready` (no "Missing required environment variables").

---

## 5. POST-DEPLOY SMOKE TEST (the real go-live gate)

- [ ] **Account A — happy path:** at `https://mplan-1.onrender.com/signin`, sign in with Google account **A** → generate a plan → **Save to history** → open `/history` → **Open** a saved plan → confirm the **launch gate runs on the stored plan with no regeneration** (no Gemini call; the readiness report renders).

- [ ] **CROSS-USER ISOLATION (MUST PASS — this is the go-live gate):** sign in with a **second** Google account **B** → open `/history` → confirm **B sees NONE of A's plans**. Then hit A's plan directly, e.g. `GET /api/plans?id=<A's plan id>` while signed in as B → **must return `404`**. If B can see or open A's plan, **do not go live** — stop and investigate.

- [ ] **Optional-Google check:** a signed-in user who has **not** connected analytics runs a launch readiness check → the GA4/GTM checks **skip gracefully** (status `skipped`), they do **not** error.

---

## 6. ROLLBACK / FIRST-CHECK NOTE

- [ ] **If sign-in fails:** first check `redirect_uri_mismatch` — the LOGIN callback URL in Google Cloud (`…/api/auth/google/callback`) must **exactly** match `GOOGLE_LOGIN_REDIRECT_URI` (scheme, host, path, no trailing slash).
