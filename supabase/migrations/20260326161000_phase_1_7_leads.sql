-- Phase 1.7: minimal lead capture (public)

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  company text null,
  phone text null,
  email text null,
  message text null,
  source_page text null,
  language text null,
  created_at timestamptz not null default now(),
  constraint leads_contact_required check (
    (email is not null and char_length(trim(email)) > 0)
    or (phone is not null and char_length(trim(phone)) > 0)
  )
);

create index if not exists idx_leads_created_at on public.leads(created_at desc);

alter table public.leads enable row level security;

-- Public write-only intake endpoint.
drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert
on public.leads
for insert
to anon, authenticated
with check (true);
