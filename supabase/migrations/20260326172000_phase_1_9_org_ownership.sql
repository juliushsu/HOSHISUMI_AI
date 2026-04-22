-- Phase 1.9: minimal organization ownership support

alter table public.properties
  add column if not exists owner_agent_id uuid null references public.agents(id) on delete set null;

create index if not exists idx_properties_owner_agent on public.properties(owner_agent_id);
