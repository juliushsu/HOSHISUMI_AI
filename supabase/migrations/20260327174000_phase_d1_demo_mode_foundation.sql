-- Phase D1: demo mode foundation (single-source isolation at organization level)

alter table public.organizations
  add column if not exists is_demo boolean not null default false;

create index if not exists idx_organizations_is_demo on public.organizations(is_demo);

comment on column public.organizations.is_demo is
  'Demo tenant marker. Demo mode data isolation is organization-first; child records are scoped by organization_id/store_id.';
