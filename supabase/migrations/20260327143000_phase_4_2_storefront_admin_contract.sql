-- Phase 4.2: storefront admin contract hardening (service_type enum)

update public.store_services
set service_type = 'consultation'
where service_type not in ('buy', 'sell', 'rental', 'management', 'consultation');

alter table public.store_services
  alter column service_type set default 'consultation';

alter table public.store_services
  drop constraint if exists store_services_service_type_check,
  add constraint store_services_service_type_check
    check (service_type in ('buy', 'sell', 'rental', 'management', 'consultation'));
