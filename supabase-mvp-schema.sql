-- DEPRECATED FIRST DRAFT. Do not apply this file.
-- The canonical Phase 1 migration is:
-- supabase/migrations/20261009170000_phase_one_foundation.sql
-- That migration implements rider-confirmed completion without mandatory delivery evidence.

create extension if not exists pgcrypto;

create type user_status as enum ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');
create type verification_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUSPENDED');
create type availability_status as enum ('ONLINE', 'OFFLINE', 'BUSY', 'ON_BREAK');
create type liable_party_type as enum ('RIDER', 'DISPATCH_COMPANY');
create type order_status as enum (
  'QUOTE_CREATED',
  'CONFIRMED',
  'SEARCHING',
  'ASSIGNED',
  'ARRIVED_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED_PENDING_VERIFICATION',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
  'NO_RIDER_AVAILABLE',
  'DELIVERY_EXCEPTION'
);
create type assignment_status as enum (
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'REASSIGNED',
  'COMPLETED'
);
create type evidence_review_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');
create type commission_entry_type as enum ('COMPLETION', 'REVERSAL', 'ADJUSTMENT');
create type receipt_verification_status as enum ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REVERSED');
create type invoice_status as enum ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DISPUTED', 'VOID');

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text unique,
  password_hash text,
  status user_status not null default 'PENDING_VERIFICATION',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table dispatch_companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  business_identifier text,
  contact_details jsonb,
  verification_status verification_status not null default 'PENDING',
  status user_status not null default 'PENDING_VERIFICATION',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  verification_status verification_status not null default 'PENDING',
  availability_status availability_status not null default 'OFFLINE',
  liable_party_type liable_party_type not null default 'RIDER',
  active_company_id uuid references dispatch_companies(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table company_riders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references dispatch_companies(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  authorised_from timestamptz not null default now(),
  authorised_until timestamptz,
  status user_status not null default 'ACTIVE',
  unique (company_id, rider_id, authorised_from)
);

create table rider_documents (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references riders(id) on delete cascade,
  document_type text not null,
  storage_key text not null,
  status verification_status not null default 'PENDING',
  expires_at timestamptz,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  boundary_geometry geography(MultiPolygon, 4326),
  currency text not null default 'NGN',
  status user_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_area_id uuid not null references service_areas(id) on delete cascade,
  version int not null,
  base_fee_kobo bigint not null,
  distance_rule jsonb,
  surcharge_rule jsonb,
  effective_from timestamptz not null,
  effective_until timestamptz,
  status user_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  unique (service_area_id, version)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  service_area_id uuid not null references service_areas(id) on delete restrict,
  pricing_rule_id uuid references pricing_rules(id),
  pickup_address jsonb not null,
  destination_address jsonb not null,
  package_description text,
  quoted_fee_kobo bigint not null,
  final_fee_kobo bigint,
  status order_status not null default 'QUOTE_CREATED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_price_breakdowns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  component_type text not null,
  amount_kobo bigint not null,
  description text,
  rule_reference text,
  created_at timestamptz not null default now()
);

create table rider_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete restrict,
  liable_party_type liable_party_type not null default 'RIDER',
  liable_party_id uuid,
  status assignment_status not null default 'OFFERED',
  offer_sent_at timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, status)
);

create table order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  actor_id uuid references users(id),
  reason text,
  created_at timestamptz not null default now()
);

create table delivery_evidence (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  assignment_id uuid not null references rider_assignments(id) on delete cascade,
  evidence_type text not null,
  storage_key text not null,
  confirmation_reference text,
  submitted_by uuid not null references users(id),
  review_status evidence_review_status not null default 'PENDING',
  created_at timestamptz not null default now()
);

create table cash_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete restrict,
  amount_kobo bigint not null,
  rider_confirmed_at timestamptz,
  customer_confirmed_at timestamptz,
  dispute_status text,
  created_at timestamptz not null default now()
);

create table commission_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  assignment_id uuid not null references rider_assignments(id) on delete restrict,
  liable_party_type liable_party_type not null,
  liable_party_id uuid not null,
  entry_type commission_entry_type not null,
  eligible_fee_kobo bigint not null,
  commission_rate_bps bigint not null,
  amount_kobo bigint not null,
  currency text not null default 'NGN',
  source_event_key text not null unique,
  reversal_of_entry_id uuid references commission_entries(id),
  created_at timestamptz not null default now()
);

create table commission_settlements (
  id uuid primary key default gen_random_uuid(),
  liable_party_type liable_party_type not null,
  liable_party_id uuid not null,
  amount_kobo bigint not null,
  currency text not null default 'NGN',
  payment_reference text,
  received_at timestamptz,
  verification_status receipt_verification_status not null default 'PENDING_VERIFICATION',
  verified_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table settlement_allocations (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references commission_settlements(id) on delete cascade,
  commission_entry_id uuid not null references commission_entries(id) on delete restrict,
  amount_kobo bigint not null,
  created_at timestamptz not null default now()
);

create table settlement_statements (
  id uuid primary key default gen_random_uuid(),
  liable_party_type liable_party_type not null,
  liable_party_id uuid not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  due_date timestamptz not null,
  status text not null default 'DRAFT',
  generated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references dispatch_companies(id),
  invoice_number text not null unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_kobo bigint not null,
  issued_at timestamptz,
  due_date timestamptz,
  status invoice_status not null default 'DRAFT',
  created_at timestamptz not null default now()
);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  commission_entry_id uuid not null references commission_entries(id) on delete restrict,
  amount_kobo bigint not null,
  created_at timestamptz not null default now()
);

create table ledger_adjustments (
  id uuid primary key default gen_random_uuid(),
  original_entry_id uuid not null references commission_entries(id) on delete restrict,
  amount_kobo bigint not null,
  reason_code text not null,
  description text,
  created_by uuid not null references users(id),
  approved_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  actor_id uuid references users(id),
  payload jsonb,
  created_at timestamptz not null default now()
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  commission_entry_id uuid references commission_entries(id),
  invoice_id uuid references invoices(id),
  raised_by uuid not null references users(id),
  category text not null,
  description text not null,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_phone on users(phone);
create index idx_riders_verification on riders(verification_status);
create index idx_riders_availability on riders(availability_status);
create index idx_orders_status on orders(status);
create index idx_orders_service_area on orders(service_area_id);
create index idx_assignments_order on rider_assignments(order_id);
create index idx_assignments_rider on rider_assignments(rider_id);
create index idx_assignments_status on rider_assignments(status);
create index idx_evidence_order on delivery_evidence(order_id);
create index idx_commission_entries_liability on commission_entries(liable_party_type, liable_party_id);
create index idx_commission_entries_order on commission_entries(order_id);
create index idx_invoices_status on invoices(status);
create index idx_audit_events_created on audit_events(created_at desc);

-- Example server-side rule notes:
-- 1. Use a transaction + row lock when accepting an offer.
-- 2. Prevent client-side direct jump to COMPLETED or DISPUTED states.
-- 3. Insert commission_entries with a unique source_event_key.
-- 4. Never update historical finance rows in-place; always create reversal/adjustment records.
