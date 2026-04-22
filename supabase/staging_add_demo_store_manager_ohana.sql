-- Provision demo store_manager account for external testing.
-- Target email: ohana3028@gmail.com
-- Scope: DEMO_ORG single-store sandbox flow

do $$
declare
  v_email constant text := 'ohana3028@gmail.com';
  v_agent_id constant uuid := '00000000-0000-4000-8000-00000000de14';
  v_org_id uuid;
  v_store_id uuid;
  v_auth_user_id uuid;
begin
  select id into v_org_id
  from public.organizations
  where organization_code = 'DEMO_ORG'
  limit 1;

  if v_org_id is null then
    raise exception 'DEMO_ORG not found. Please seed demo organization first.';
  end if;

  select id into v_store_id
  from public.stores
  where organization_id = v_org_id
  order by created_at asc
  limit 1;

  if v_store_id is null then
    raise exception 'No demo store found under DEMO_ORG.';
  end if;

  insert into public.agents (
    id,
    organization_id,
    store_id,
    name,
    role,
    email,
    title,
    phone,
    phone_public,
    line_url,
    is_active,
    is_public,
    is_demo
  )
  values (
    v_agent_id,
    v_org_id,
    v_store_id,
    'Ohana Demo 店長',
    'store_manager',
    v_email,
    'Demo Store Manager',
    null,
    null,
    null,
    true,
    true,
    true
  )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    store_id = excluded.store_id,
    name = excluded.name,
    role = excluded.role,
    email = excluded.email,
    title = excluded.title,
    phone = excluded.phone,
    phone_public = excluded.phone_public,
    line_url = excluded.line_url,
    is_active = excluded.is_active,
    is_public = excluded.is_public,
    is_demo = excluded.is_demo;

  insert into public.admin_profiles (email, role, org_id, is_demo)
  values (v_email, 'store_manager', v_org_id, true)
  on conflict (email) do update
  set
    role = excluded.role,
    org_id = excluded.org_id,
    is_demo = true,
    updated_at = now();

  select id into v_auth_user_id
  from auth.users
  where email = v_email
  limit 1;

  if v_auth_user_id is null then
    v_auth_user_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    values (
      v_auth_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      jsonb_build_object(
        'provider', 'email',
        'providers', array['email'],
        'organization_id', v_org_id::text,
        'agent_id', v_agent_id::text
      ),
      jsonb_build_object(
        'organization_id', v_org_id::text,
        'agent_id', v_agent_id::text,
        'role', 'store_manager'
      ),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
    set
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'provider', 'email',
          'providers', array['email'],
          'organization_id', v_org_id::text,
          'agent_id', v_agent_id::text
        ),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'organization_id', v_org_id::text,
          'agent_id', v_agent_id::text,
          'role', 'store_manager'
        ),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    where id = v_auth_user_id;
  end if;

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_auth_user_id,
    v_auth_user_id::text,
    jsonb_build_object(
      'sub', v_auth_user_id::text,
      'email', v_email,
      'email_verified', true
    ),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
  set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = now();
end
$$;
