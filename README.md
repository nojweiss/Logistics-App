# Floor · Warehouse Operations

Phase 1 **foundation**, built incrementally on the existing React + TypeScript + Vite repository. Uses **npm and package-lock.json exclusively**. The original Git repository, remote, framework versions, entry point, ESLint configuration and TypeScript project structure are preserved.

This delivery stops after the twelve-step first implementation goal in the project brief. It does not implement the rest of Phase 1 or begin Phase 2.

## Quick start

Run commands from **C:\Users\nolan\Desktop\Logistics-App**, not the deleted folder named “Logistics App”.

Use Node.js 24 LTS and npm.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in your Supabase URL and publishable key in .env.local.
npm run dev
```

```sh
npm run lint
npm test
npm run build
npm run preview
```

No credentials are included. Without configuration the app shows “Connect your warehouse”; it does not pretend to load real orders. After changing environment variables, restart Vite.

## Environment variables

| Variable | Purpose |
| --- | --- |
| VITE_SUPABASE_URL | HTTPS project URL from Supabase |
| VITE_SUPABASE_PUBLISHABLE_KEY | Publishable client key, or legacy anon key |
| VITE_BASE_PATH | Use / locally, /Logistics-App/ for the existing GitHub project Pages site |
| VITE_WAREHOUSE_TIMEZONE | Defaults to America/Chicago; keep in sync with warehouse_settings.timezone |

Never use a service-role key, sb_secret_ key, database password, or other secret in Vite. The build rejects recognized secret/service-role keys. All VITE_ variables used by the application are public in the compiled bundle. The Git ignore rules exclude environment variants and explicitly allow .env.example.

## Supabase setup — manual

1. Create/select a **Supabase Free development project with an empty application schema**. If the earlier attempt already created database tables, do not blindly apply this initial migration over them; use a fresh development project or reconcile its schema first.
2. In SQL Editor, execute the whole file **supabase/migrations/001_foundation.sql** once. It runs in a transaction, creates the schema, seeds the nine rows, configures RLS, creates the write functions and enables Realtime for orders, order_items and pick_sessions. Future changes should be additional migrations.
3. Optionally execute **supabase/seed.sql** once in the development project. This creates clearly labeled sample products and two planned orders for the current warehouse date. It does not create accounts or passwords.
4. Disable public signups in Authentication. Create email/password accounts administratively in Supabase Auth. This slice supports existing-account password sign-in; invitation acceptance and password recovery screens are future work.
5. Create a profile using each Auth user's UUID. The client cannot set or promote its own role:

```sql
insert into public.profiles (id, display_name, role, assigned_row_id)
values ('AUTH-USER-UUID', 'Warehouse administrator', 'ADMIN', null);

insert into public.profiles (id, display_name, role, assigned_row_id)
values ('ANOTHER-AUTH-UUID', 'Row lead', 'PICK_LEAD', 'B2-R1');
-- SHEET_MANAGER is the third available role.
```

6. Copy the project URL and **publishable/anon** key into .env.local, restart Vite and sign in.
7. Set Supabase Auth's Site URL to the deployed Pages URL when available.
8. Confirm your warehouse timezone. If different, update both VITE_WAREHOUSE_TIMEZONE and the single warehouse_settings.timezone row before starting real orders.

One Supabase project represents one warehouse organization. There is no multi-tenant organization management in this foundation. Unknown or inactive accounts have no warehouse access.

## Initial data entry

Admin management screens are outside this first implementation slice. Use the trusted Supabase SQL/Table Editor to provision data until those screens and their audited RPCs exist.

- Products: SKU, name, pick row, category, active flag.
- Orders: unique order number, stand name, scheduled date; leave status PLANNED.
- Order items: order_id, product_id, full_case_qty and loose_qty. A trigger copies the product's row, SKU and name into the order item automatically. Product changes later cannot rewrite the historical pick sheet.
- Staffing: one daily_staffing record for the current warehouse date and daily_staffing_rows allocations. Row allocations plus float workers must equal the total. Missing row allocations represent zero workers.
- Start an order from the app as ADMIN or SHEET_MANAGER. It captures the **actual start day's** staffing, not the planned order date, and creates nine independent row sessions. Missing staffing is recorded explicitly as an unknown/null snapshot; no worker counts are invented.

Add or edit planned order contents before starting. Direct SQL is a trusted administrative route and must not be used to change active operations casually.

## Working foundation

- Supabase email/password login/logout, active profile/role loading and protected hash routes.
- Mobile app shell, bottom navigation, safe-area support, loading/error states and large action buttons.
- Today's planned, active and completed orders; active orders from earlier dates remain visible.
- Manager order start with confirmation, one-active-order constraint, daily staffing snapshot and exact server timestamp.
- Reusable row pick sheet for any of the nine rows. Pick Leads open their assigned row; managers can inspect all rows.
- Full-case and loose/pack quantities, whole-product completion and Undo while the row is running.
- Independent row start/complete timestamps. Completion requires all products picked and confirmation; completed rows lock item changes.
- Nine-row manager view with status, elapsed time, completed/total products and cases, percentage, and clear incomplete rows.
- Realtime subscriptions, refetch on resume/reconnect, and 30-second fallback polling while visible.
- Database-derived clock offset to reduce device-clock differences. Timers are calculated from timestamps, never stored counters.
- Append-only event history for order start, row start/complete, product completion and undo.
- Installable PWA configuration, cached application shell and GitHub Pages deployment workflow.

Progress percentage counts completed product lines divided by total lines. Full-case totals exclude loose quantities. Empty rows can be started/completed to acknowledge that no picking is needed; completed empty rows show 100%.

## Database summary

| Tables | Responsibility |
| --- | --- |
| profiles | Auth UUID, name, role, active flag, assigned row |
| warehouse_settings | Warehouse timezone |
| pick_rows | B2-R1…B2-R6 and B3-R1…B3-R3, building and display order |
| products | UUID, SKU, name, pick row, category, active |
| orders | Order number, stand, date, status, exact start/completion timestamps |
| order_items | Required/completed case and loose quantities; order-time product/row snapshots |
| pick_sessions | Unique order/row, independent row_started_at and row_completed_at |
| daily_staffing + daily_staffing_rows | Normalized daily totals, float count and row assignments |
| order_staffing_snapshots + order_staffing_rows | Staffing copied when the order starts |
| worker_movements | Reserved for source/destination row, worker count, time and actor |
| exceptions | Reserved for all seven requested exception types, row, note, time and actor |
| events | Append-only action/milestone history, actor, payload and optional correction reference |

UUIDs are used for entities; pick row IDs are stable human-readable keys. Timestamps use timestamptz. Write functions take database locks and use server timestamps after acquiring locks. Duplicate target-state actions are idempotent. Staffing validation/copy happens under a database lock.

Milestone names from the brief are represented in the schema. Repack and palletization have no mutually exclusive state: future milestone recording will preserve overlap. Cycle time must use ORDER_COMPLETE minus ORDER_START, not summed phase durations.

## Permissions and security decisions

- No anonymous warehouse reads. Every application table has RLS.
- Authenticated clients have SELECT only; operational writes go through narrow RPCs with explicit role/row checks and fixed search paths.
- ADMIN and SHEET_MANAGER see all operational rows and can start orders. PICK_LEAD sees order headers and only assigned-row items, sessions and row history.
- Admin management, timestamp correction and export screens are not implemented yet. Even ADMIN cannot directly alter tables through the public client API.
- Events cannot be changed/deleted by application roles. Trusted database owners can bypass application restrictions; direct SQL administration is not automatically covered by application event auditing.
- Supabase Auth persists the login session. No warehouse database is persisted in localStorage/IndexedDB. Sign out on shared devices and decide account/device ownership before operational use.
- Only one warehouse order can be active. Each lead has one default row. These are explicit assumptions for this foundation.
- No real credentials or private warehouse data are included in source. .env variants, node_modules and build output stay out of Git.

### Connectivity and uncertain writes

Offline actions are disabled; requests time out rather than hanging indefinitely. A failed or uncertain write is never reported as synced. Refresh verifies the database state before retrying. Target-state RPCs safely tolerate repeated requests. In-memory data may remain visible with an unavailable/stale warning, but it never becomes authoritative.

There is **no offline action queue, no offline database and no offline synchronization**. The service worker caches assets only, not Supabase responses. Logging in or opening fresh warehouse data still requires connectivity.

## GitHub Pages deployment — manual

The existing remote remains **https://github.com/nojweiss/Logistics-App.git**. No new Git repository was initialized, and nothing has been committed, pushed or deployed by this implementation.

1. Review the changes and push to main when ready.
2. In repository Settings → Pages, choose **GitHub Actions** as the source.
3. In Settings → Secrets and variables → Actions → Variables, set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
4. Set VITE_BASE_PATH to **/Logistics-App/**, or **/** if using a custom domain. Set VITE_WAREHOUSE_TIMEZONE if needed.
5. Run the workflow or push to main. It uses Node 24, npm ci, npm run lint, npm test and npm run build, then publishes dist.
6. Expected default URL: https://nojweiss.github.io/Logistics-App/

The workflow intentionally fails if production Supabase variables are missing. Repository variables suit these public client values. If you choose Actions secrets, change vars.NAME references to secrets.NAME; the resulting values will still be public in the frontend bundle.

Hash routing supports direct links such as /Logistics-App/#/orders/UUID without server rewrites.

The architecture requires no paid services. Stay within Supabase Free and GitHub Pages/Actions allowances; free-project inactivity pauses and service limits still apply. Pages availability for private repositories depends on your GitHub plan. A public source repository must never contain private data. See [Supabase pricing](https://supabase.com/pricing) and [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## iPhone PWA installation

Deploy over HTTPS. Open the site in Safari, then **Share → Add to Home Screen**. Open the installed app and sign in. The manifest uses standalone display, scoped start URL and 192/512px icons; the page includes an Apple touch icon and safe-area layout.

The included geometric icons are placeholders. Replace floor.svg and both PNG sizes for final branding. The service worker is generated for production builds, not the Vite dev server. New versions wait for existing app windows to close; reopen the app to activate the update. Shell caching does not imply offline warehouse access.

## Architecture / file tree

```text
Logistics-App/
├── package.json                    existing npm project; test script added
├── package-lock.json               preserved, updated by npm
├── .gitignore
├── .env.example
├── index.html
├── vite.config.ts
├── tsconfig.json                   preserved project references
├── tsconfig.app.json               strict typing enabled
├── tsconfig.node.json
├── eslint.config.js                existing rules preserved
├── .github/workflows/deploy.yml
├── public/
│   ├── floor.svg
│   ├── floor-192.png
│   └── floor-512.png
├── src/
│   ├── main.tsx                    existing entry point preserved
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   ├── assets/                     original starter assets retained
│   ├── components/{Shell,Status}.tsx
│   ├── features/auth/
│   │   ├── context.ts
│   │   ├── AuthProvider.tsx
│   │   ├── Login.tsx
│   │   └── Protected.tsx
│   ├── features/orders/
│   │   ├── Today.tsx
│   │   ├── OrderScreen.tsx
│   │   ├── RowDashboard.tsx
│   │   └── PickRow.tsx
│   ├── hooks/useWarehouse.ts
│   ├── lib/{config,metrics,supabase,types}.ts
│   └── services/{auth,warehouse}.ts
├── supabase/
│   ├── migrations/001_foundation.sql
│   └── seed.sql
├── tests/
│   ├── database.test.ts
│   ├── metrics.test.ts
│   ├── screens.test.tsx
│   ├── visual-fixture.html
│   └── visual-fixture.tsx
└── README.md
```

React components use services instead of issuing database calls. useWarehouse owns subscription/refetch/error state. Supabase RPCs own operational validation, audit events and transactions. Frontend DTOs explicitly type consumed data; generate Database types against the deployed schema when expanding repositories.

Only two development dependencies were added through npm: Vitest and PGlite. Existing runtime dependencies and framework versions were not changed.

## Validation and remaining acceptance checks

- Baseline npm dependency inspection, build and lint passed before edits.
- **19 tests pass**: actual migration/seed execution in embedded PostgreSQL (PGlite), anonymous access, role escalation, row restrictions, inactive users, staffing checks/snapshots, product snapshots, duplicate requests, independent sessions, completion rules, undo auditing, timestamp metrics and role-specific rendering.
- Build and lint pass with the existing strict ESLint rules.
- Local browser checks exercised setup, all nine dashboard rows and the pick sheet at a 390px viewport and checked the desktop dashboard at 1280px. No horizontal overflow or browser runtime errors were observed.
- Development-only visual harness: with npm run dev, open **/tests/visual-fixture.html**. It is visibly labeled synthetic data, disables operational actions and is not included as a production build entry.
- Database tests are not hosted Supabase Auth/Realtime integration tests. No live Supabase credentials were supplied.

Before operational use, verify on a development Supabase project and actual iPhones:

1. Manager and lead login on two devices, plus logout on a shared device.
2. Assigned-row permissions and rejection of direct unauthorized API writes.
3. Start order, check staffing snapshot, start two rows and observe cross-device updates.
4. Pick/undo items, race duplicate taps, and complete a fully picked row.
5. Lock Safari, reopen and refresh; elapsed time should still derive from original timestamps.
6. Disconnect/reconnect network and verify offline states and server reconciliation.
7. Deploy under the GitHub Pages base path, open a direct order link and install the PWA.
8. Confirm timezone, single-active-order rule, whole-line picking and missing-staffing behavior.

## Remaining Phase 1 — stopped intentionally

- Admin user/product/order management screens.
- Daily staffing editor and worker movement entry.
- Partial quantity entry/verification and exceptions/delays UI.
- Warehouse milestone recording, including order completion.
- Completed-order history and detailed timelines.
- Audited timestamp correction workflows.
- CSV exports, backup retention and tested restoration.
- Password recovery/invitation UX and full hosted/mobile integration acceptance.

**A completed pick row does not complete the order.** The order remains ACTIVE until the later Phase 1 order-completion workflow exists; this foundation is not ready to run an entire production day. Reserved tables are not finished interfaces.

Exports/backups are particularly important before entering real operational data. Nothing from Phase 2 or later has been implemented.
