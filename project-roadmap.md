# Dispatch Marketplace MVP Roadmap

This roadmap starts from the blueprint and narrows the scope to a realistic first release for one service area.

**Current status:** The first schema migration has been applied successfully. Supabase client setup and OTP authentication are now being connected; apply the follow-up profile RPC migration before editing profile names.

## 1. Goal for the first release

Build a working marketplace loop for a single city/service area with these core flows:

- Customer requests quote and places order
- System identifies eligible rider(s)
- Rider receives offer and accepts
- Rider updates pickup / transit / completion status
- Assigned rider confirms completion in the app; no proof-of-delivery photo or recipient confirmation is required for the MVP
- System validates completion and creates commission exactly once
- Finance sees statement/invoice and payment reconciliation flow

## 2. Principle: build the rules before the screens

**Delivery order: backend first, frontend later.** The existing Next.js screens are prototypes only. We will not build or polish customer, rider, operations, or finance UI during the backend milestones. Backend work means Supabase schema, RLS, database functions, server-side APIs, and automated verification.

The highest-risk and most important work is the business logic:

- rider eligibility
- order status transitions
- assignment locking
- rider-confirmed completion validation
- commission generation exactly once
- immutable financial ledger
- permissions and audit trails

Frontend implementation begins only after the backend workflows and API contracts below are implemented and verified. Phase 2 describes customer and rider business workflows at the API/database level, not UI work.

## 3. Delivery phases

### Phase 1 — Production-ready domain foundation

Focus: data integrity and business rules.

Tasks:

1. Define auth and role model
   - customer
   - rider
   - dispatch operator
   - verification officer
   - finance officer
   - admin

2. Set up the core domain tables in Supabase/Postgres
   - profiles linked to Supabase Auth
   - user_roles
   - customers
   - riders
   - dispatch_companies
   - company_riders
   - rider_documents
   - service_areas
   - pricing_rules
   - orders
   - rider_assignments
   - order_status_events

3. Add server-side enforcement
   - status transition validation
   - rider eligibility checks
   - assignment uniqueness
   - assigned-rider-only completion confirmation
   - idempotency keys for financial actions

Acceptance criteria:

- one order cannot have multiple active assignments
- status cannot jump directly to final states from client input
- completion by any user other than the assigned rider is rejected
- completion from an invalid order state is rejected
- users cannot grant themselves privileged roles

### Phase 2 — Customer + rider backend workflows

Focus: end-to-end delivery loop.

Tasks:

1. Quote and order creation
   - customer creates pickup + destination
   - system calculates quote using active pricing rules
   - order stored with final fee and price breakdown

2. Rider offer workflow
   - matching eligible riders
   - offer created
   - rider accept/decline handling
   - timeout handling

3. Delivery lifecycle states
   - searching
   - assigned
   - picked_up
   - in_transit
   - completed
   - cancelled
   - disputed

4. Rider-confirmed completion
   - only the assigned rider can confirm completion
   - backend validates the order state and active assignment
   - persist a completion status event; do not require photo or recipient confirmation

Acceptance criteria:

- valid quote is persisted before order confirmation
- accepted offer becomes the single active assignment
- rider can only update status in valid sequence
- completion requires rider confirmation and server validation

### Phase 3 — Finance and operations

Focus: settlements, invoices, and auditability.

Tasks:

1. Commission creation
   - determine liable party
   - calculate eligible fee and commission rate
   - create immutable commission entry
   - store source_event_key and reversal chain

2. Weekly statements and invoices
   - generate rider statement for period
   - generate company invoice when partner is liable
   - status tracking for invoice lifecycle

3. Payment verification and allocation
   - payment receipt record
   - verification workflow
   - allocation to outstanding charges
   - unapplied credits

4. Dispute handling
   - open/review/decision flow
   - keep original record and create adjustments or reversals instead of overwriting history

Acceptance criteria:

- finance can only allocate verified receipts
- invoice history is immutable once issued
- disputes do not erase delivery or financial history
- all financial entries are audit traceable

### Phase 4 — Frontend integration and dashboards

Focus: operational visibility and control.

This phase starts after Phases 1–3 backend APIs, permissions, and workflows are tested. Until then, changes are limited to backend implementation and API/database tests; existing screens remain prototypes.

Tasks:

1. Operational dashboard
   - live order queue
   - rider availability
   - manual reassignments
   - exception handling

2. Admin controls
   - pricing-rules management
   - commission rate management
   - rider/company verification actions
   - document expiry tracking

3. Audit and support tools
   - searchable event log
   - user permissions
   - dispute review

Acceptance criteria:

- operations users can oversee the queue and intervene when needed
- finance and admin actions remain auditable
- authorization checks are enforced by role and object ownership

## 4. First sprint backlog (first 2 weeks)

### Sprint 1 — Data and rules foundation

- Create Supabase project and environment variables
- Configure the hosted project's SMS provider and verify OTP sign-up/login
- Apply `20261010100000_update_own_profile.sql` through the hosted project's SQL Editor
- Configure Supabase Auth and confirm new users receive only the customer role
- Provision privileged roles through trusted admin-only operations
- Verify RLS prevents users from reading other users' records or directly changing order state
- Connect authenticated quote/order endpoints after project credentials are configured

### Sprint 2 — Dispatch and delivery flow

- Build server-side quote calculation and customer order endpoints
- Add rider availability and eligibility checks
- Implement offer creation and timeout logic
- Implement accept/decline actions
- Add assignment record and lock-safe assignment acceptance
- Add pickup / transit / completion status updates
- Do not implement proof-of-delivery upload for the MVP
- Use the Phase 1 completion validation RPC
- Add audit event write on each state change

## 5. Recommended technical setup for the MVP

- Frontend (later phase): Next.js + TypeScript
- Auth: Supabase Auth
- Database: Supabase Postgres
- Storage: Supabase Storage for private rider verification documents
- Realtime: Supabase Realtime for order/rider status updates
- Server logic: Next.js Route Handlers and server actions
- Background jobs: BullMQ or Supabase cron / edge jobs if required
- Validation: server-side only; never trust client-provided pricing or financial values

## 6. Go-live constraints

Before launch, confirm:

- final service-area boundary
- operating city and rider coverage
- verification requirements for riders and companies
- pricing and fee policy
- commission terms and settlement schedule
- legal/privacy review for rider-document retention and customer data handling

## 7. Definition of done for the MVP

The MVP is considered ready when all of the following work:

- quote and order flow work end-to-end
- rider can accept and complete a delivery
- assigned rider can confirm completion and the status history records it
- commission is created once only
- finance can see a statement/invoice trail
- a dispute can be raised without deleting history
- role-based permissions and audit logs are in place

## 8. Today’s first actions

1. Set up the Supabase project and environment config
2. Apply the initial migration for profiles, roles, riders, service_areas, pricing_rules, orders, assignments, and status_events
3. Verify the migration and RPC behavior in the Supabase project
4. Verify authentication, RLS, and profile operations through Supabase/API tests
5. Build and test quote and order creation endpoints

This is the best starting point for the first milestone.
