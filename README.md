# Floor · Warehouse Operations

An incremental extension of the existing React + TypeScript + Vite application, through **PALLETIZATION START**. npm, package-lock.json, GitHub Pages configuration, Supabase Auth, RLS, Realtime and the original migration are preserved. No commits, pushes, deployments or live database changes were made during this update.

## After Codex Finishes — Nolan's Setup Steps

1. **Use the existing folder:** `C:\Users\nolan\Desktop\Logistics-App` (hyphen). The earlier “Logistics App” folder is not the project.
2. **Supabase migration:** first test against a development copy of your existing database. In Supabase SQL Editor run the entire **supabase/migrations/002_operational_workflow.sql** file once. It is transactional and assumes 001 is already applied. **Do not rerun 001 or the old seed.sql.** Back up operational data before applying a schema update. Do not paste only individual fragments of 002.
3. **Optional demo data:** in a development database, run **supabase/seed_workflow.sql** after 002. It adds two planned WF-DEMO orders, 36 products per row (324 per order), flexible case packs, BIG TRUCK, and PB/NW/EC workers. It can be repeated without rewriting existing demo records. It does not start an order, change staffing, create passwords, or modify your old seed data. Its order dates are the first run's warehouse date; later testing can move an unstarted demo order's scheduled_date through trusted SQL.
4. **Auth accounts:** no new role is required. Keep Nolan's existing real-email ADMIN account. Inventory Attention belongs to ADMIN/SHEET_MANAGER. Existing row accounts work if their Auth email is, for example, **b2-r1@warehouse.example**. Otherwise create the account administratively with that email and associate its Auth UUID with an active PICK_LEAD profile assigned to B2-R1. Repeat for the other row leads as needed. Confirm accounts administratively; warehouse.example cannot receive invitation mail. Disable public signups. Password or PIN is a label for the same Supabase password authentication; existing password requirements remain in force.
5. **Worker roster:** workers are operational names/initials, separate from Auth users. Use **Team** to create workers and assign the daily roster before starting an order. Existing active orders can select workers directly from each row's **Row team** section. Managers can move named workers from the order overview. Daily roster changes do not rewrite already captured order snapshots.
6. **Environment:** no new .env.local settings and no GitHub Actions variable changes are required. Preserve your existing values. Never put a service-role key in the browser. Keep VITE_BASE_PATH=/Logistics-App/ for project Pages and VITE_WAREHOUSE_TIMEZONE aligned with warehouse_settings.timezone.
7. **Local checks:** run the commands below. Existing node_modules and installed dependencies were reused; use npm ci if reinstalling on another machine or restoring dependencies.
8. **Local testing:** open the Vite address, use the development Supabase project, and follow the desktop/iPhone acceptance walkthrough below. The synthetic fixture at /tests/visual-fixture.html exercises layouts without executing any database writes.
9. **GitHub Pages:** after reviewing/testing, you can commit and push yourself. The existing workflow runs lint, tests and build, and uses the existing Pages base path. Apply 002 before exposing this client version. Close old PWA windows and reopen to activate the updated service worker. Cached older clients receive a refresh-required error for the retired generic pick action.
10. **Realtime:** sign into the same development order on desktop as manager and on an iPhone as a row lead. Watch initials, inventory reports, clearing, boxes, counts and group readiness update on desktop. If disconnected, the UI shows reconnecting and polls every 30 seconds while visible. Hosted Auth, Realtime delivery and physical iPhone/PWA behavior still require this test; local embedded PostgreSQL tests cannot prove them.

```powershell
Set-Location 'C:\Users\nolan\Desktop\Logistics-App'
# Only if dependencies need restoring:
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Do not overwrite an existing .env.local with the example. No new dependency is needed for this update. npm ci uses the existing lockfile.

### Profile provisioning example

Use actual Auth UUIDs, not worker IDs. Existing correct profiles need no change.

```sql
insert into public.profiles (id, display_name, role, assigned_row_id)
values ('AUTH-USER-UUID', 'B2-R1 lead', 'PICK_LEAD', 'B2-R1');
-- Existing ADMIN/SHEET_MANAGER profiles continue to work.
```

## Implemented workflow

- **Login:** trim input; usernames become lowercase + @warehouse.example. Real emails keep their value after trimming. Auth and RLS are unchanged.
- **Product administration:** name-first search, create/edit, valid row selection, active/inactive state, version checks and audit records. Packaging keeps the original display, each integer level, and calculated units per case. Supports 4/1, 12/1, 8/20/100 and up to eight positive levels within safe numeric bounds.
- **Order snapshots:** name, SKU, row, group and case-pack data are copied to new order items. Later product edits cannot relocate or rename historical work. Migration 002 leaves historical unknown packaging/picker fields unknown rather than inventing values.
- **Named picking:** one tap on a team worker's initials records the pick and database time. Picked products collapse, show initials and quantities, and can expand for review, LOW/ZERO, Undo and correction. Original picker attribution survives undo/correction.
- **Stock attention:** LOW means current order can be fulfilled but replenishment is needed; ZERO means the location cannot fulfill the current requirement. ZERO is urgent/red and sorted above LOW/yellow. Available cases/packs are optional; unknown is not treated as zero. Manager status changes and notes remain auditable.
- **Picking → clearing:** completing picking records ROW_PICK_COMPLETE and ROW_CLEARING_START. Clearing completion is a distinct server-timestamped action. Original pick start/end timestamps remain intact.
- **Repack and full cases:** separate name searches exclude ineligible quantities. Repack boxes may contain several products, remain open simultaneously, and be corrected. Full-case verification never includes loose quantities.
- **Physical counts:** verified full cases + closed repack boxes, one physical case per box. Open boxes and unresolved full-case discrepancies are excluded.
- **Group readiness:** when one group has completed applicable picking/clearing and verified its quantities, managers can start that group's palletization while others continue. First start records the order's PALLETIZE_START; each group also gets a start event. Repack is not automatically completed.
- **Managers:** nine-row dashboard, relative bottleneck indicators, named teams, separate clearing state, group status, open/closed boxes, counts, inventory/discrepancy summaries, initial staffing and movements, recent event trail.

### Operational groups and responsibilities

The grouping assumption is one Building 2 aisle per pair of rows and one Building 3 group:

| Group | Source rows         | Repack lead / box series | Full-case lead(s) |
| ----- | ------------------- | ------------------------ | ----------------- |
| A     | B2-R1, B2-R2        | B2-R1 · A1, A2…          | B2-R2             |
| B     | B2-R3, B2-R4        | B2-R3 · B1, B2…          | B2-R4             |
| C     | B2-R5, B2-R6        | B2-R5 · C1, C2…          | B2-R6             |
| D     | B3-R1, B3-R2, B3-R3 | B3-R1 · D1, D2…          | B3-R2 and B3-R3   |

Numbering resets per order and station. Only B3-R1 operates repack in Building 3. Leads must finish their own clearing to verify; the source product must also be picked and cleared. Managers can handle any station, but cannot verify uncleared source products.

### Discrepancies and deliberate split boxes

A new repack allocation defaults to all remaining expected loose packs. For an intentional split across boxes, reduce **Expected packs allocated to this box**, then enter actual packs placed there. The form explicitly compares actual with that allocation. The database serializes order mutations and checks all other allocations to prevent duplicate reservation.

If expected 7 and actual 6, select **Review discrepancy**, then correct the count or **Confirm discrepancy**. Confirmation records an OPEN discrepancy; it does not pretend the shortage is resolved. The full expected allocation remains reserved. Another box can continue with other unallocated products. Correct the original box when stock/recount arrives. Corrections resolve or supersede prior discrepancy records; history is retained. Removing an allocation releases it and retains its removal event.

A box cannot close with an unresolved discrepancy. Only managers can reopen a closed box. Reopening or a new blocking ZERO revokes readiness but preserves any already recorded palletization start. No timestamp is silently erased. LOW does not block group readiness; unresolved ZERO does.

Empty/non-applicable rows do not block readiness or count in bottleneck comparisons. Empty open boxes do not count as cases or block readiness; they cannot be closed.

### Bottleneck thresholds

Centralized in src/lib/workflow.ts, BOTTLENECK_THRESHOLDS:

- Caution: at least 50% of **other applicable rows** finished picking.
- Urgent: at least 87.5% finished (7 of 8 other rows when all nine apply).
- Completed rows, empty rows and comparisons without other applicable rows remain normal.

This measures relative workflow progress, not employee performance or predictive timing.

## Permissions, history and concurrency

Every application table has RLS. Anonymous/inactive users have no warehouse access. Clients have read access only to authorized data; mutations use fixed-search-path RPCs with role/row/group checks. Hiding a button is never the only authorization check.

| Action                                                                             | Authorized roles                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Product CRUD / soft deactivate                                                     | ADMIN                                                   |
| Worker management; movement; inventory resolution; palletization start; box reopen | ADMIN, SHEET_MANAGER                                    |
| Own current-day daily team selection and own active-order team                     | Assigned PICK_LEAD; managers can override               |
| Pick, Undo, LOW/ZERO, row phases                                                   | Assigned PICK_LEAD; managers                            |
| Repack/full-case verification                                                      | Assigned group's matching lead responsibility; managers |

Leads can read their group's product/session verification data so paired rows can be verified. Picking writes remain restricted to their own row. Worker directory and named roster are available to active users for team selection. Leads cannot steal a worker currently assigned to another row. Managers use movements to select worker names and record count/source/destination/time.

Daily staffing uses the warehouse timezone. Starting captures both named workers and numeric totals. Workers added after start are distinguished from the start roster; moves update current row while retaining initial assignment. Deactivation adjusts current/future daily totals, not existing order snapshots. Initials should be distinct within a team; names appear on buttons/tooltips and selection lists to disambiguate people.

Undo is allowed during picking and before downstream work. Leads can correct picker attribution while picking; managers can correct it after pick completion. Optimistic versions reject stale corrections. Box creation has a request ID for safe same-screen retry; after an uncertain write, refresh server data before doing anything else.

Append-only events capture operational actions with actor and server timestamp, before/after context, original picker and quantity changes. Admin audit records capture product/worker/daily-roster edits. Trusted database owners can bypass RLS; direct SQL edits are outside app audit guarantees.

## Database and application changes

**001_foundation.sql and seed.sql are untouched.** New 002 adds packaging snapshots, groups/responsibilities, clearing timestamps, workers/rosters, inventory attention, boxes/lines, full-case verification, quantity discrepancies, group readiness, palletization start and administrative audit. It expands valid event names and replaces narrow foundation RPCs where behavior changed. It does not drop historical operational rows.

Internal helper functions are not executable by clients. Writes lock the active order, then records, and use database time. Repack reservations and box numbering are enforced transactionally. order_bundle returns one RLS-enforced JSON snapshot per refresh; the physical-count view also uses invoker security.

Main additions:

- src/features/admin/Products.tsx
- src/features/staffing/Staffing.tsx
- src/features/inventory/Inventory.tsx
- src/features/orders/{PickProduct,Team,Verification,ManagerOverview}.tsx
- src/lib/{workflow,operations,realtime}.ts
- src/services/operations.ts
- supabase/migrations/002_operational_workflow.sql
- supabase/seed_workflow.sql
- tests/workflow*.ts / .tsx

React components call services; RPCs own authorization and business integrity. New DTOs are typed and TypeScript remains strict. Product/admin pages load separately. Realtime subscriptions are scoped by screen and order, short event bursts are coalesced, and subscriptions/timers are cleaned up. Visible-screen fallback polling remains 30 seconds.

### Connectivity and timing

No offline action queue, offline database or replay mechanism exists. Offline writes are disabled. Failures/uncertain results request a server refresh; no optimistic success is shown. Service-worker caching covers application assets, not Supabase data.

Timers calculate from database timestamps plus measured clock offset. Picking, clearing, repack and palletization can overlap across groups; never sum overlapping phase durations as order cycle time.

## Desktop and iPhone acceptance walkthrough

Use a development database; no real inventory should be changed for acceptance.

1. Sign in as Nolan with your real email/password. On the phone sign in as B2-R1 without typing the suffix. Confirm wrong passwords and unassigned/inactive users cannot operate.
2. Run the optional workflow seed. Assign PB/NW/EC in Team, then start WF-DEMO-01 as manager. Only one order can be ACTIVE. If an earlier demo is still active, use a clean test database or deliberately finish that test record through trusted administration; this pass has no order-completion UI.
3. Start B2-R1. Confirm 36 products. Tap PB for BIG TRUCK, check its collapsed row, initials and time on both devices. Expand, Undo, re-pick and correct initials; original picker remains traceable.
4. Report LOW on one product and ZERO on another. Confirm priority, quantities, reporter and time on Inventory Attention. Move ZERO through IN_PROGRESS to RESOLVED with a note; records remain in history.
5. Move selected workers as manager. Confirm current initials update, movement count/source/destination/time is recorded, and the order's initial roster/count stays unchanged.
6. Finish several applicable rows in different orders. Check yellow at half the others complete and red at seven of eight. Complete B2-R1 picking; its pick timer stops and clearing starts. Complete clearing. Do the same for B2-R2.
7. B2-R1 continues to Repack A; B2-R2 goes to Full-case verification. A lead's wrong station URL/action must fail. B3-R2/R3 must never gain D repack access.
8. Create A1. Search BIG TRUCK (7 loose packs in this seed), enter 6, review and confirm the discrepancy. A1 stays open with the unresolved warning. Create A2 and process another loose product; A1 must not block it.
9. Correct A1 to 7. Allocate another product deliberately across boxes if desired, remove/re-add a line, close reconciled boxes. Try allocating the same remaining quantity concurrently on two devices; one stale/over-allocation must be rejected. Reopen a box as manager, then close it again. Lead reopen must fail.
10. Verify full cases using name search on B2-R2. A loose-only product must be absent; a full-only product must be absent from repack. Test a full-case discrepancy and correction. Verify the original picker and verifier/time remain visible.
11. Finish all applicable quantities for group A and resolve its ZERO reports while B/C/D still have work. Check verified full cases + closed boxes = total physical cases. Start palletization for A. Its timestamp appears; other repack boxes remain open and no trailer workflow appears.
12. Check B/C/D labels, and A1 numbering on a different development order. Check a product moved/deactivated in Products keeps its original name/row/pack on the existing order.
13. On a physical iPhone at roughly 390px width: inspect 3–6 initials, collapse/expand, numeric keyboard, search, box switching, status messages and scrolling. Lock/reopen Safari; elapsed time must remain based on the original database timestamps.
14. Disconnect/reconnect on each device. Confirm actions disable offline, errors are visible, retry requires fresh data after uncertain results, and updates resume without duplicate handlers.
15. After your own deployment, test /Logistics-App/#/orders/ORDER_UUID directly on GitHub Pages, sign in, install from Safari → Share → Add to Home Screen, close/reopen to activate the new app version, and repeat the cross-device checks.

## Validation completed locally

- Existing project/dependencies inspected before modification; baseline build, lint and 19 tests passed.
- Current suite: **54 tests** including original foundation regressions, migration/seed execution in PGlite, RLS, role restrictions, packaging, snapshots, named picking, clearing, box reservations/numbering, discrepancies, physical counts, independent group readiness, start-only palletization, roster changes, search, bottlenecks, realtime coalescing and screen rendering.
- Synthetic browser checks at 390px and 1280px: 36-product row, collapsed/expanded products, multiple boxes, fuzzy/exclusive search, explicit discrepancy confirmation; no horizontal overflow or browser runtime errors observed.
- Lint and production build pass. A bundle-size advisory may remain for the main React/Supabase bundle; it is not a build failure.
- Local embedded SQL checks are not hosted Supabase Auth/Realtime tests. No live Supabase changes were performed. The fixture never executes its supplied action callbacks.

## Scope limits and remaining work

This pass **ends at palletization start**. It does not implement palletization completion, wrapping/labeling execution, trailers, shipping, order completion, employee rankings, predictions, offline synchronization, exports or backup/restore tooling.

One active warehouse order remains the existing rule. The missing order-completion workflow means this is not yet a complete production-day execution system. Order creation/import, profile provisioning and historical timestamp corrections still use trusted administration; those management interfaces are future work. Password recovery/invitation screens remain future work.

Existing active legacy orders need named workers selected manually and, if picking was already completed, an explicit Start clearing. Historical packaging and original picker remain unknown where never recorded. Product masters with unknown packaging must be configured before creating new real orders. Historic order-time snapshots are not automatically rewritten from today's product catalog.

Before operational use, complete the hosted desktop/iPhone acceptance walkthrough, validate the group mapping and loose-pack business meaning, and establish a tested backup/recovery process. Full event history is retained in PostgreSQL; the overview shows only the latest 60 events.
