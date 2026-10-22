-- Phase 1 foundation for the Dispatch Marketplace.
-- Delivery completion is confirmed by the assigned rider; proof-of-delivery
-- media is not required for the MVP.

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'CUSTOMER',
  'RIDER',
  'DISPATCH_OPERATOR',
  'DISPATCH_COMPANY_MANAGER',
  'VERIFICATION_OFFICER',
  'SUPPORT_OFFICER',
  'FINANCE_OFFICER',
  'FINANCE_APPROVER_AUDITOR',
  'ADMIN'
);

create type public.account_status as enum (
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'PENDING_VERIFICATION'
);

create type public.verification_status as enum (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED'
);

create type public.availability_status as enum (
  'ONLINE',
  'OFFLINE',
  'BUSY',
  'ON_BREAK'
);

create type public.liable_party_type as enum (
  'RIDER',
  'DISPATCH_COMPANY'
);

create type public.order_status as enum (
  'CONFIRMED',
  'SEARCHING',
  'ASSIGNED',
  'ARRIVED_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
  'NO_RIDER_AVAILABLE',
  'DELIVERY_EXCEPTION'
);

create type public.assignment_status as enum (
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'REASSIGNED',
  'COMPLETED'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  status public.account_status not null default 'PENDING_VERIFICATION',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_phone_unique on public.profiles(phone) where phone is not null;

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.dispatch_companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  business_identifier text,
  contact_details jsonb not null default '{}'::jsonb,
  verification_status public.verification_status not null default 'PENDING',
  status public.account_status not null default 'PENDING_VERIFICATION',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  verification_status public.verification_status not null default 'PENDING',
  availability_status public.availability_status not null default 'OFFLINE',
  liable_party_type public.liable_party_type not null default 'RIDER',
  active_company_id uuid references public.dispatch_companies(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_liability_party_consistent check (
    (liable_party_type = 'RIDER' and active_company_id is null)
    or (liable_party_type = 'DISPATCH_COMPANY' and active_company_id is not null)
  )
);

create table public.company_riders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.dispatch_companies(id) on delete restrict,
  rider_id uuid not null references public.riders(id) on delete restrict,
  authorised_from timestamptz not null default now(),
  authorised_until timestamptz,
  status public.account_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  constraint company_rider_period_valid check (
    authorised_until is null or authorised_until > authorised_from
  )
);

create unique index company_riders_one_current_link
  on public.company_riders(company_id, rider_id)
  where authorised_until is null;

create table public.rider_documents (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete restrict,
  document_type text not null,
  storage_key text not null,
  status public.verification_status not null default 'PENDING',
  expires_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  boundary jsonb,
  currency char(3) not null default 'NGN',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_area_id uuid not null references public.service_areas(id) on delete restrict,
  version integer not null check (version > 0),
  base_fee_kobo bigint not null check (base_fee_kobo >= 0),
  distance_rule jsonb not null default '{}'::jsonb,
  surcharge_rule jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null,
  effective_until timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (service_area_id, version),
  constraint pricing_rule_period_valid check (
    effective_until is null or effective_until > effective_from
  )
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_area_id uuid not null references public.service_areas(id) on delete restrict,
  pricing_rule_id uuid references public.pricing_rules(id) on delete restrict,
  pickup_address jsonb not null,
  destination_address jsonb not null,
  package_description text,
  quoted_fee_kobo bigint not null check (quoted_fee_kobo >= 0),
  final_fee_kobo bigint check (final_fee_kobo is null or final_fee_kobo >= 0),
  currency char(3) not null default 'NGN',
  status public.order_status not null default 'CONFIRMED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rider_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  rider_id uuid not null references public.riders(id) on delete restrict,
  liable_party_type public.liable_party_type not null,
  liable_party_id uuid not null,
  status public.assignment_status not null default 'OFFERED',
  offer_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_timestamps_valid check (
    (accepted_at is null or accepted_at >= offer_sent_at)
    and (completed_at is null or accepted_at is not null)
  )
);

create unique index one_accepted_assignment_per_order
  on public.rider_assignments(order_id)
  where status = 'ACCEPTED';

create index rider_assignments_rider_status_idx
  on public.rider_assignments(rider_id, status);

create index rider_assignments_order_idx
  on public.rider_assignments(order_id);

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index orders_customer_created_idx
  on public.orders(customer_id, created_at desc);

create index orders_status_created_idx
  on public.orders(status, created_at);

create index orders_service_area_status_idx
  on public.orders(service_area_id, status);

create index order_status_events_order_created_idx
  on public.order_status_events(order_id, created_at);

create function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = required_role
  );
$$;

revoke all on function public.has_role(public.app_role) from public;
grant execute on function public.has_role(public.app_role) to authenticated;

create function public.can_access_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders as o
    join public.customers as c on c.id = o.customer_id
    where o.id = p_order_id
      and c.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.rider_assignments as a
    join public.riders as r on r.id = a.rider_id
    where a.order_id = p_order_id
      and r.user_id = (select auth.uid())
      and a.status in ('OFFERED', 'ACCEPTED', 'COMPLETED')
  )
  or public.has_role('DISPATCH_OPERATOR')
  or public.has_role('FINANCE_OFFICER')
  or public.has_role('FINANCE_APPROVER_AUDITOR')
  or public.has_role('ADMIN');
$$;

revoke all on function public.can_access_order(uuid) from public;
grant execute on function public.can_access_order(uuid) to authenticated;

create function public.create_profile_for_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'CUSTOMER');

  insert into public.customers (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_auth_user();

create function public.accept_rider_offer(p_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rider_id uuid;
  v_order_id uuid;
  v_order_status public.order_status;
  v_assignment_status public.assignment_status;
  v_rider_available boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select r.id, r.availability_status = 'ONLINE'
    into v_rider_id, v_rider_available
    from public.riders as r
    join public.profiles as p on p.id = r.user_id
   where r.user_id = v_user_id
     and r.verification_status = 'APPROVED'
     and p.status = 'ACTIVE'
   for update of r;

  if v_rider_id is null or not v_rider_available then
    raise exception using errcode = '42501', message = 'An active, approved, online rider account is required';
  end if;

  select a.order_id
    into v_order_id
    from public.rider_assignments as a
   where a.id = p_assignment_id
     and a.rider_id = v_rider_id;

  if v_order_id is null then
    raise exception using errcode = 'P0002', message = 'Offer not found';
  end if;

  select o.status
    into v_order_status
    from public.orders as o
   where o.id = v_order_id
   for update;

  select a.status
    into v_assignment_status
    from public.rider_assignments as a
   where a.id = p_assignment_id
     and a.order_id = v_order_id
     and a.rider_id = v_rider_id
   for update;

  if v_assignment_status is distinct from 'OFFERED' then
    raise exception using errcode = '55000', message = 'Offer is no longer available';
  end if;

  if v_order_status not in ('CONFIRMED', 'SEARCHING') then
    raise exception using errcode = '55000', message = 'Order is not accepting offers';
  end if;

  update public.rider_assignments
     set status = 'EXPIRED',
         updated_at = now()
   where order_id = v_order_id
     and id <> p_assignment_id
     and status = 'OFFERED';

  update public.rider_assignments
     set status = 'ACCEPTED',
         accepted_at = now(),
         updated_at = now()
   where id = p_assignment_id;

  update public.orders
     set status = 'ASSIGNED',
         updated_at = now()
   where id = v_order_id;

  update public.riders
     set availability_status = 'BUSY',
         updated_at = now()
   where id = v_rider_id;

  insert into public.order_status_events (
    order_id, from_status, to_status, actor_id
  ) values (
    v_order_id, v_order_status, 'ASSIGNED', v_user_id
  );

  return p_assignment_id;
end;
$$;

revoke all on function public.accept_rider_offer(uuid) from public;
grant execute on function public.accept_rider_offer(uuid) to authenticated;

create function public.update_rider_order_status(
  p_assignment_id uuid,
  p_next_status public.order_status
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rider_id uuid;
  v_order_id uuid;
  v_current_status public.order_status;
  v_assignment_status public.assignment_status;
  v_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select r.id
    into v_rider_id
    from public.riders as r
   where r.user_id = v_user_id
     and r.verification_status = 'APPROVED';

  if v_rider_id is null then
    raise exception using errcode = '42501', message = 'An approved rider account is required';
  end if;

  select a.order_id
    into v_order_id
    from public.rider_assignments as a
   where a.id = p_assignment_id
     and a.rider_id = v_rider_id;

  if v_order_id is null then
    raise exception using errcode = 'P0002', message = 'Assignment not found';
  end if;

  select o.status
    into v_current_status
    from public.orders as o
   where o.id = v_order_id
   for update;

  select a.status
    into v_assignment_status
    from public.rider_assignments as a
   where a.id = p_assignment_id
     and a.order_id = v_order_id
     and a.rider_id = v_rider_id
   for update;

  if v_assignment_status is null then
    raise exception using errcode = 'P0002', message = 'Assignment not found';
  end if;

  if v_current_status = p_next_status
     and p_next_status = 'COMPLETED'
     and v_assignment_status = 'COMPLETED' then
    return v_current_status;
  end if;

  if v_assignment_status <> 'ACCEPTED' then
    raise exception using errcode = '55000', message = 'Assignment is not active';
  end if;

  v_allowed := case v_current_status
    when 'ASSIGNED' then p_next_status = 'ARRIVED_PICKUP'
    when 'ARRIVED_PICKUP' then p_next_status = 'PICKED_UP'
    when 'PICKED_UP' then p_next_status = 'IN_TRANSIT'
    when 'IN_TRANSIT' then p_next_status = 'COMPLETED'
    else false
  end;

  if not v_allowed then
    raise exception using errcode = '55000', message = 'Invalid order status transition';
  end if;

  update public.orders
     set status = p_next_status,
         final_fee_kobo = case
           when p_next_status = 'COMPLETED' then coalesce(final_fee_kobo, quoted_fee_kobo)
           else final_fee_kobo
         end,
         updated_at = now()
   where id = v_order_id;

  if p_next_status = 'PICKED_UP' then
    update public.rider_assignments
       set picked_up_at = now(),
           updated_at = now()
     where id = p_assignment_id;
  elsif p_next_status = 'COMPLETED' then
    update public.rider_assignments
       set status = 'COMPLETED',
           completed_at = now(),
           updated_at = now()
     where id = p_assignment_id;

    update public.riders
       set availability_status = 'ONLINE',
           updated_at = now()
     where id = v_rider_id
       and availability_status = 'BUSY';
  end if;

  insert into public.order_status_events (
    order_id, from_status, to_status, actor_id
  ) values (
    v_order_id, v_current_status, p_next_status, v_user_id
  );

  return p_next_status;
end;
$$;

revoke all on function public.update_rider_order_status(uuid, public.order_status) from public;
grant execute on function public.update_rider_order_status(uuid, public.order_status) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.customers enable row level security;
alter table public.dispatch_companies enable row level security;
alter table public.riders enable row level security;
alter table public.company_riders enable row level security;
alter table public.rider_documents enable row level security;
alter table public.service_areas enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.orders enable row level security;
alter table public.rider_assignments enable row level security;
alter table public.order_status_events enable row level security;

create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_role('ADMIN')));

create policy "Users can read own roles"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('ADMIN')));

create policy "Customers can read own customer record"
  on public.customers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('ADMIN')));

create policy "Riders can read own rider record"
  on public.riders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('ADMIN')));

create policy "Verified operations can read companies"
  on public.dispatch_companies for select to authenticated
  using ((select public.has_role('DISPATCH_OPERATOR')) or (select public.has_role('ADMIN')));

create policy "Riders can read their company links"
  on public.company_riders for select to authenticated
  using (
    exists (
      select 1 from public.riders as r
      where r.id = rider_id and r.user_id = (select auth.uid())
    )
    or (select public.has_role('DISPATCH_OPERATOR'))
    or (select public.has_role('ADMIN'))
  );

create policy "Riders and verification staff can read rider documents"
  on public.rider_documents for select to authenticated
  using (
    exists (
      select 1 from public.riders as r
      where r.id = rider_id and r.user_id = (select auth.uid())
    )
    or (select public.has_role('VERIFICATION_OFFICER'))
    or (select public.has_role('ADMIN'))
  );

create policy "Authenticated users can read active service areas"
  on public.service_areas for select to authenticated
  using (is_active or (select public.has_role('ADMIN')));

create policy "Authenticated users can read active pricing rules"
  on public.pricing_rules for select to authenticated
  using (is_active or (select public.has_role('ADMIN')));

create policy "Order parties and operations can read orders"
  on public.orders for select to authenticated
  using ((select public.can_access_order(id)));

create policy "Assignment parties and operations can read assignments"
  on public.rider_assignments for select to authenticated
  using (
    exists (
      select 1 from public.riders as r
      where r.id = rider_id and r.user_id = (select auth.uid())
    )
    and rider_assignments.status in ('OFFERED', 'ACCEPTED', 'COMPLETED')
    or exists (
      select 1 from public.orders as o
      join public.customers as c on c.id = o.customer_id
      where o.id = order_id and c.user_id = (select auth.uid())
    )
    or (select public.has_role('DISPATCH_OPERATOR'))
    or (select public.has_role('ADMIN'))
  );

create policy "Order parties and operations can read status history"
  on public.order_status_events for select to authenticated
  using ((select public.can_access_order(order_id)));
