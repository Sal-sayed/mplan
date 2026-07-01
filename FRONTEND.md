# Frontend — Sirah (measurement-plan-agent)

> **Note on architecture:** this app is a **single full-stack Next.js monolith** — frontend and backend live in one codebase and deploy as one Render web service. This document describes only the **frontend** half (what renders in the browser). See [`BACKEND.md`](./BACKEND.md) for the API/server half. The boundary between them is `app/api/**` (the backend) vs everything below (the frontend); the frontend talks to the backend purely via same-origin `fetch('/api/...')`.

---

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, React 19, TypeScript) |
| Styling | **Tailwind CSS v4** (`@theme` in CSS, no `tailwind.config`) |
| Design system | Namespaced **`ds-*` tokens** (dark violet, always-dark) + core components in `components/ds/` |
| Icons | `lucide-react` |
| Animation | `framer-motion`, `gsap` |
| Charts | `recharts` |
| Client export helpers | `html2canvas`, `jspdf` (in-browser PDF/image) |
| Streaming | custom SSE client (`lib/stream-client.ts`) for live plan generation |

The whole product is **dark, enterprise-SaaS** styled and organized as a 4-stage journey: **Plan → Set up → Go live → Monitor**.

---

## 2. Routes (pages the user sees)

All under `app/`, App Router. `page.tsx` = a route.

| Route | File | What it is |
|---|---|---|
| `/` | `app/page.tsx` | **The app.** Client state machine that runs the whole flow: chooser → scrape → score → generate (streaming) → success → results. Also hosts the returning-user shortcut + account control. |
| `/home` | `app/home/page.tsx` | **Marketing landing** (nav, hero, how-it-works, features, pricing, footer). CTAs → Google sign-in. Uses the brand logo `public/logo.png`. |
| `/signin` | `app/signin/page.tsx` | Google sign-in / sign-out. |
| `/history` | `app/history/page.tsx` | Saved-plan list; opens a plan's launch readiness. |
| `/privacy`, `/terms` | `app/privacy`, `app/terms` | Legal placeholder pages (for Google verification). |
| `/design-preview` | `app/design-preview/page.tsx` | Throwaway preview of the `ds-*` design system. |
| `/leads`, `/leads/login`, `/leads/errors` | `app/leads/**` | Internal **admin** UI (lead capture + error log). |

**Shell:** `app/layout.tsx` (root layout, fonts, theme-init script, `ThemeToggle`) and `app/globals.css` (the `ds-*` design tokens + dark theme + scrollbar styling).

---

## 3. Components (`components/`)

### 3.1 Screens (the journey)
| Component | Role in the journey |
|---|---|
| `HeroScreen.tsx` | Entry chooser (New / Existing site) + returning-user "Welcome back" card + account/sign-out. |
| `LoadingScreen.tsx` (+ `components/loading/*`) | The animated "building your plan" screen (activity log, stats, feature showcase, mini-game). |
| `ConfirmBusinessModel.tsx` | Low-confidence business-model confirmation step. |
| `SuccessScreen.tsx` | "Plan sent to your inbox" + entry to the results. |
| `ResultsScreen.tsx` | **Plan hub**, wrapped in `AppShell` — Stage 1 tabs (Overview/KPIs/Events/Data Layer/Consent/Tooling) and the launcher for Set up / Go live / Monitor. |
| `ImplementationGuideScreen.tsx` | **Set up** — GTM/GA4/Meta create + inject + event split. |
| `LaunchReadinessScreen.tsx` | **Go live** — readiness verdict, drift, consent, Tracking-Spy import. |
| `MetricHealthScreen.tsx` | **Monitor** — threshold verdicts + the subordinate Python "preliminary" statistical tier. |
| `AuditResultsScreen.tsx` | The parallel **audit** path's results (existing-site audit). |
| Support | `KPICard`, `TrackingScoreTab`, `MeasurementPlanDisplay`, `GitHubInject`, `EmailExportModal`, `ExportButton`, `ThemeToggle`, … |

### 3.2 Design system (`components/ds/`)
Reusable, token-driven, presentational — this is the shared UI kit:
- `AppShell.tsx` — the 4-stage journey nav + top bar + progress.
- `Card`, `Badge`, `Button`, `StatTile`, `StepRow`, `VerdictBanner` — primitives.
- `tokens.ts` — pure class-map helpers (`badgeClasses`, `verdictClasses`, `buttonClasses`, `computeJourneyNav`, …). **No JSX → unit-tested** (`tokens.test.ts`).
- `index.ts` — barrel export. `README.md` — usage.

### 3.3 Loading visuals (`components/loading/`)
Purely decorative animation pieces used by `LoadingScreen` (ActivityLog, StatsDashboard, FeatureShowcase, particle/holographic effects, the bug-chase mini-game).

---

## 4. Client-side logic (frontend-only `lib/` bits)
Most of `lib/` is backend (see BACKEND.md), but a few modules run in the browser or are pure presentation:
- `lib/stream-client.ts` — SSE client for the streaming `/api/generate-plan`.
- Pure **view helpers** consumed by components (no server access): `lib/measurement/metric-health-view.ts`, `lib/measurement/metric-analysis-format.ts`, `lib/measurement/journey-stage.ts`.
- `lib/loading-features.ts`, `lib/loading-messages.ts` — copy/data for the loading screen.

---

## 5. Assets (`public/`)
- `logo.png` — the Sirah brand logo (transparent).
- default Next svgs (`next.svg`, `vercel.svg`, …) — unused placeholders.

---

## 6. How the frontend talks to the backend
- **Same-origin only.** Components call `fetch('/api/...')`; there is no separate API host.
- **Auth** is a `session` cookie (JWT) set by the backend; the frontend just reads identity via `/api/auth/me` (marked `no-store` so account switches reflect immediately).
- **Streaming**: plan generation streams Server-Sent Events from `/api/generate-plan` via `stream-client.ts`.
- Key endpoints the UI hits: `/api/analyze`, `/api/score`, `/api/generate-plan`, `/api/send-plan`, `/api/plans`, `/api/launch-readiness`, `/api/metrics/validate`, `/api/implementation/*`, `/api/github/*`, `/api/google/*`, `/api/auth/*`.

The full request/response contract for each is documented in [`BACKEND.md`](./BACKEND.md).

---

## 7. Build & run (frontend)
- Dev: `npm run dev` (Next dev server).
- Build: part of `npm run build` (`next build`) — pages are statically prerendered where possible (`/home`, `/privacy`, `/terms`, `/signin`, …).
- The frontend is served by the **same** `next start` process as the backend (one Render service). There is no separate frontend deploy.

---

## 8. If you ever split frontend ↔ backend
The clean seam already exists: **`app/api/**` is the entire backend surface.** To split, you'd:
1. Move `app/api/**` + `lib/**` (server bits) + `scripts/**` into a standalone service.
2. Replace same-origin `fetch('/api/...')` with an absolute API base URL (env var) and add CORS + cookie/domain handling for auth.
3. Keep this frontend (pages + `components/` + `components/ds/` + `public/`) as a static/SSR Next app pointing at that API.

Today it's intentionally **one deployment** — simpler to ship and reason about.
