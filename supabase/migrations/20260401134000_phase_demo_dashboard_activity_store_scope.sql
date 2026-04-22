-- Phase: demo dashboard activity store scope refinement
-- Seed activities are org-shared; sandbox activities can be store-scoped.

alter table public.dashboard_activities
  add column if not exists store_id uuid null references public.stores(id) on delete set null,
  add column if not exists created_by_agent_id uuid null references public.agents(id) on delete set null;

create index if not exists idx_dashboard_activities_org_demo_store
  on public.dashboard_activities(org_id, demo_data_type, store_id);

create index if not exists idx_dashboard_activities_created_by_agent_id
  on public.dashboard_activities(created_by_agent_id);
