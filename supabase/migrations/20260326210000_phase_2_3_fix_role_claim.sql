-- Phase 2.3: fix JWT role claim resolution for RLS owner/manager checks
-- JWT top-level role is usually "authenticated", so custom business role
-- must prefer app_metadata/user_metadata.

create or replace function public.jwt_claim_text(claim text)
returns text
language sql
stable
as $$
  select case
    when lower(claim) = 'role' then coalesce(
      auth.jwt() -> 'app_metadata' ->> claim,
      auth.jwt() -> 'user_metadata' ->> claim,
      auth.jwt() ->> claim
    )
    else coalesce(
      auth.jwt() ->> claim,
      auth.jwt() -> 'app_metadata' ->> claim,
      auth.jwt() -> 'user_metadata' ->> claim
    )
  end;
$$;
