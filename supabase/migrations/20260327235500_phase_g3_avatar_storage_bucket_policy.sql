-- Phase G3 avatar upload last-mile: storage bucket + RLS policy
-- Scope: only avatar upload path for agents profile.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'agent-avatars',
  'agent-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists agent_avatars_select_owner_or_self on storage.objects;
create policy agent_avatars_select_owner_or_self
on storage.objects
for select
to authenticated
using (
  bucket_id = 'agent-avatars'
  and (
    public.current_agent_role() in ('owner', 'super_admin')
    or (
      public.current_agent_id() is not null
      and (storage.foldername(name))[1] = 'agents'
      and (storage.foldername(name))[2] = public.current_agent_id()::text
    )
  )
);

drop policy if exists agent_avatars_insert_owner_or_self on storage.objects;
create policy agent_avatars_insert_owner_or_self
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'agent-avatars'
  and (
    public.current_agent_role() in ('owner', 'super_admin')
    or (
      public.current_agent_id() is not null
      and (storage.foldername(name))[1] = 'agents'
      and (storage.foldername(name))[2] = public.current_agent_id()::text
    )
  )
);

drop policy if exists agent_avatars_update_owner_or_self on storage.objects;
create policy agent_avatars_update_owner_or_self
on storage.objects
for update
to authenticated
using (
  bucket_id = 'agent-avatars'
  and (
    public.current_agent_role() in ('owner', 'super_admin')
    or (
      public.current_agent_id() is not null
      and (storage.foldername(name))[1] = 'agents'
      and (storage.foldername(name))[2] = public.current_agent_id()::text
    )
  )
)
with check (
  bucket_id = 'agent-avatars'
  and (
    public.current_agent_role() in ('owner', 'super_admin')
    or (
      public.current_agent_id() is not null
      and (storage.foldername(name))[1] = 'agents'
      and (storage.foldername(name))[2] = public.current_agent_id()::text
    )
  )
);

