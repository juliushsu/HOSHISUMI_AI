# Demo Sandbox Architecture v1

## Goal
- Build a demo environment that is interactive but does not pollute formal business data.
- Use dual-layer data in demo org:
  - `seed`: fixed sample data
  - `sandbox`: user-generated test data

## Canonical demo scope
- Demo organization code: `DEMO_ORG`
- Demo organization UUID: `00000000-0000-4000-8000-00000000de00`

## Schema
- Added `admin_profiles` table for demo/admin profile records.
- Added `demo_data_type` to core tables:
  - `clients` (customer equivalent)
  - `properties`
  - `leads` (pipeline/deal equivalent)
  - `ai_usage_logs` (AI logs)
  - `dashboard_activities` (dashboard latest-activity feed source)
  - optional: `tasks` / `notes` when those tables exist
- Constraint for each table:
  - `demo_data_type in ('seed','sandbox') or demo_data_type is null`

## Service-layer enforcement
- `src/services/demoScope.js` centralizes demo behavior:
  - force demo writes to demo org + `demo_data_type='sandbox'`
  - scope demo reads to `seed + sandbox`
  - guard demo updates from touching `seed`
- Applied in:
  - `/api/clients`
  - `/api/properties`
  - `/api/admin/properties`
  - `/api/admin/leads`
  - `/api/admin/import-batches` (draft creation forced to `sandbox`)
  - `/api/agents` (summary read scope)
  - `/api/intake-queue`
  - `/api/partners`
  - `/api/admin/storefront/overview`
  - `/api/ai/*`
  - property lifecycle sync routes (`/api/rental`, `/api/management`)

## Auth context
- `requireAuth` now resolves both `agents.is_demo` and `organizations.is_demo`.
- `req.auth.isDemo = agent.is_demo OR organization.is_demo`.

## Seed
- `supabase/demo_sandbox_seed.sql` seeds:
  - demo org
  - demo store manager profile
  - demo store + agents
  - at least 5 clients
  - at least 5 properties
  - at least 3 leads
  - at least 2 ai usage logs
- All seeded business records use `demo_data_type='seed'`.

## Sandbox reset
- SQL function:
  - `public.reset_demo_sandbox()`
- Deletes `sandbox` rows in demo org from:
  - `clients`
  - `properties`
  - `leads`
  - `ai_usage_logs`
  - `dashboard_activities`

## Optional weekly reset
- Suggested scheduler query:
```sql
select public.reset_demo_sandbox();
```
