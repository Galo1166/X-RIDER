# Dispatch Marketplace
## Software Blueprint

Prepared: 9 October 2026  
Status: Proposed blueprint — operational choices and legal requirements must be confirmed before launch.

## 1. Executive Summary

This product is a delivery marketplace, not a fleet-owning courier company. It connects customers with verified independent riders and dispatch-company partners. The platform provides pricing, order management, dispatch, rider tracking, rider-confirmed completion, customer support, and commission accounting.

Key commercial rules:

- Customer pays the rider directly in cash for the delivery fee.
- The platform does not collect customer delivery fees.
- The platform earns a 15% commission on eligible completed deliveries.
- Independent riders settle commission weekly.
- Dispatch-company partners are invoiced for commission owed.
- The backend is the only source of truth for price, order status, rider eligibility, commissions, statements, invoices, and permissions.
- Financial history must remain immutable and auditable.

## 2. Business Model and Money Flow

### 2.1 Core flow

1. Customer requests a delivery and receives a quote from the platform.
2. Customer confirms the order.
3. The platform identifies an eligible rider or dispatch partner.
4. Rider completes the pickup and delivery workflow.
5. Rider confirms completion in the app.
6. Backend validates the assigned rider and order state, records the completion event, and (in the finance phase) creates a commission charge exactly once.
7. Customer pays the rider directly in cash, separate from the rider's commission obligation to the platform.
8. Platform includes the commission in the rider's weekly statement or the dispatch company's invoice.
9. Finance verifies actual receipt of payments and allocates verified funds to outstanding charges.

### 2.2 Example

| Item | Amount |
|---|---:|
| Eligible final delivery fee | ₦5,000 |
| Platform commission | 15% |
| Commission owed to platform | ₦750 |
| Amount retained by rider before expenses | ₦4,250 |

Assumptions: no approved discount, refund, tip, reimbursement, or additional adjustment.

Recommended rule: commission should be calculated on the final eligible delivery fee after approved discounts; exclude tips and reimbursements unless explicitly stated in the agreement.

### 2.3 Financial rules

- Store monetary values as integer kobo, not floating-point naira values.
- Store commission rates as basis points; 15% = 1,500 bps.
- Snapshot commission rate, eligible delivery fee, liable party, currency, and assignment reference when the commission charge is created.
- Exactly one liable party must owe commission for each delivery: the independent rider or the contracted dispatch company, not both.
- No standard completion commission on cancellations.
- Use immutable charges, adjustments, reversals, and receipt-allocation records; do not overwrite history.
- A transfer screenshot or customer cash acknowledgement is not proof the platform received commission payment.

## 3. Product Scope

### 3.1 Customer features

- Account registration and authentication.
- Pickup and destination entry, package details, contact details, service-area validation, and price quote.
- Order creation and cancellation requests.
- Order status tracking, rider details, delivery updates.
- Ability to report a problem or open a dispute.
- Order history and notifications.

### 3.2 Rider features

- Application and verification workflow.
- Identity, contact details, document submission, and verification status.
- Availability and service-area eligibility control.
- Delivery offers with accept/decline and timeout handling.
- Pickup, transit, and completion updates.
- Completion confirmation by the assigned rider.
- Cash handover acknowledgement record, kept separate from platform commission payments.
- Commission statement, settlement history, outstanding balances, and dispute submission.

### 3.3 Dispatch-company partner features

- Company onboarding and verification.
- Management of authorised riders.
- Company-level access to assigned work and operational performance.
- Consolidated invoices, invoice history, payment references, and disputes.

### 3.4 Operations and finance features

- Live order queue and rider availability.
- Manual assignment and reassignment workflows.
- Exception handling and audit trails.
- Rider and company verification, suspension, document expiry checks, and service-area configuration.
- Pricing and commission-rate management with effective dates and version history.
- Weekly statement and invoice generation.
- Receipt verification, payment allocation, adjustments, and reconciliation.
- Role-based dashboards, exports, notifications, and searchable audit events.

## 4. Order Lifecycle and Rider Confirmation

| Stage | Meaning / system rule |
|---|---|
| Quote | Calculate price using the active rule version and display a clear breakdown. |
| Confirmed | Customer accepts the quote; order details are stored. |
| Searching | Dispatch engine identifies eligible riders and sends offers. |
| Assigned | Exactly one active assignment is recorded. |
| Arrived at pickup | Rider records arrival where required. |
| Picked up | Pickup status and timestamp are recorded. |
| In transit | Rider is carrying the package. |
| Completed | Assigned rider confirms completion; server validates the assignment and state, records the status event, and later creates the commission entry exactly once. |
| Settlement / invoice | Commission charge appears in the correct weekly statement or partner invoice. |
| Paid / reconciled | Finance verifies receipt and allocates payment against the liability. |

Additional states may include:

- NO_RIDER_AVAILABLE
- DELIVERY_EXCEPTION
- CANCELLED
- DISPUTED

Status transitions must be validated server-side. Clients must not be allowed to jump directly to a final state.

### 4.1 Completion confirmation

- Proof-of-delivery photos, recipient PINs, and recipient confirmation are not required for the MVP.
- Only the rider assigned to the active delivery may confirm completion.
- The server validates the rider, assignment, and allowed prior state before recording completion.
- Record the order ID, assignment ID, rider, and completion timestamp in the status history.
- Commission creation must be tied to this validated completion and be idempotent; it is implemented in the finance phase.
- Treat cash acknowledgement as a separate event from delivery completion and from platform payment.

### 4.2 Cancellation and exceptions

A cancelled delivery must not receive the standard completion commission. If cancellation fees are introduced, define:

- who may be charged,
- lifecycle stage,
- initiating party,
- allowed reasons,
- evidence,
- separate ledger entry.

Disputes must not erase delivery history. Reversing a charge should create a traceable reversal or adjustment rather than mutating the original record.

## 5. Dispatch and Assignment

### 5.1 Eligibility

Only offer work to riders who are:

- verified and active,
- have valid required documents,
- available,
- within the service area,
- compatible with the job,
- not blocked by policy or suspension.

### 5.2 Recommended algorithm

1. Find eligible riders matching the pickup and delivery requirements.
2. Rank candidates by estimated pickup distance, availability, reliability, and operational criteria.
3. Send an offer with a configurable timeout and retry policy.
4. Accept the first valid acceptance using a database transaction/lock so simultaneous acceptances cannot create multiple active assignments.
5. Expire competing offers after assignment; retry or escalate to operations if no rider accepts.
6. Allow authorised manual assignment or reassignment, while enforcing eligibility and recording operator, timestamp, prior rider, new rider, and reason.

Suggested initial defaults:

- one rider at a time,
- 30-second offer timeout,
- weekly settlement on Monday,
- three-day grace period,
- Proof-of-delivery photo retention is out of MVP scope; rider verification documents still require a retention policy.

## 6. Commission, Settlements, and Invoices

### 6.1 Independent rider weekly statement

Each statement should show:

- statement period,
- opening balance,
- each eligible delivery,
- final eligible fee,
- commission rate,
- commission amount,
- reversals and adjustments,
- verified payments,
- closing amount due,
- due date.

Partial balances carry forward.

### 6.2 Dispatch-company invoice

Each invoice should contain:

- unique invoice number,
- legal and billing details,
- billing period,
- line items linked to delivery/commission records,
- issue date,
- due date,
- currency,
- total,
- payment instructions and reference,
- status.

Once issued, an invoice must not be silently edited. Use a credit note, reversal, or replacement invoice.

### 6.3 Receipt verification and allocation

1. Record the claimed payment with payer, amount, date, reference, and evidence.
2. Keep payment in PENDING_VERIFICATION until finance confirms the platform actually received the funds.
3. Mark it VERIFIED or REJECTED; support REVERSAL for conditions where a previously verified receipt must be undone.
4. Allocate only verified receipts to outstanding charges or invoices, using database locking and checks against over-allocation.
5. Maintain an auditable allocation trail. Any unallocated verified funds remain visible as unapplied credit until assigned.

### 6.4 Suggested statuses

| Record type | Suggested statuses |
|---|---|
| Receipt / settlement | PENDING_VERIFICATION, VERIFIED, REJECTED, REVERSED |
| Invoice | DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, DISPUTED, VOID |
| Dispute | OPEN, UNDER_REVIEW, AWAITING_EVIDENCE, DECIDED, APPEALED, CLOSED |

Overdue reminders, grace periods, account restrictions, and dispute pauses should be disclosed in the relevant agreements and configured before launch.

## 7. Roles and Permissions

| Role | Typical permissions |
|---|---|
| Customer | Create and view own orders; confirm receipt; cancel where allowed; raise disputes. |
| Independent rider | Manage own availability and documents; view offers; update assigned jobs; confirm completion; view own statements. |
| Dispatch-company manager | Manage authorised company users and riders; view company work and invoices. |
| Dispatch operator | Monitor orders; assign/reassign eligible riders; resolve operational exceptions. |
| Verification officer | Review rider and company documents and verification applications. |
| Finance officer | Generate statements and invoices; record receipts; reconcile and allocate verified payments. |
| Support officer | Review customer and rider cases and disputes within permitted scope. |
| Administrator | Manage system configuration and roles; sensitive actions remain audited. |
| Finance approver / auditor | Approve high-risk adjustments and review financial and audit records. |

Use role-based and object-level authorisation. Finance staff must not approve their own high-risk adjustment. Admin and finance accounts should use multi-factor authentication.

## 8. Recommended Technology Architecture

Keep development, staging, and production environments separate. All clients must use the same authoritative API. Do not trust prices, completion status, commission rates, or payment verification values supplied by a client.

| Layer | Recommended technology / purpose |
|---|---|
| Customer web and admin | Next.js + React + TypeScript; responsive customer experience and operational dashboard |
| Mobile apps | React Native + TypeScript; customer and rider workflows |
| Backend API | Next.js Route Handlers + TypeScript for the first release; Supabase Edge Functions for suitable scheduled or integration tasks |
| Database | Supabase PostgreSQL with Row Level Security; consider PostGIS for service-area and proximity queries |
| Background jobs | Supabase Cron/Edge Functions initially; add a dedicated queue such as BullMQ if job volume and retry needs justify it |
| Files and evidence | Private Supabase Storage for rider verification documents; expiring signed URLs |
| API documentation | OpenAPI/Swagger with validation and consistent error responses |
| Testing | Jest with Supabase local database integration and end-to-end tests |
| Hosting and operations | Managed app hosting and Supabase project, logs, alerts, backups, and restore drills |

## 9. Database Design

Recommended logical schema using UUID primary keys, timestamps, foreign keys, indexes, and migrations.

### 9.1 Identity and verification

- users
- user_roles
- customers
- riders
- dispatch_companies
- company_riders
- rider_documents
- agreements

Suggested fields:

- profiles: id (Supabase Auth user ID), full_name, phone, status, created_at, updated_at
- user_roles: user_id, role, created_at; role changes are restricted to trusted admin/server workflows
- customers: id, user_id, created_at
- riders: id, user_id, verification_status, availability_status, liable_party_type, active_company_id, created_at
- dispatch_companies: id, legal_name, business_identifier, contact_details, verification_status, status
- company_riders: company_id, rider_id, authorised_from, authorised_until, status
- rider_documents: id, rider_id, document_type, storage_key, status, expires_at, reviewed_by, reviewed_at
- agreements: id, party_type, party_id, agreement_version, commission_rate, accepted_at, evidence_reference

### 9.2 Pricing, orders, and dispatch

- service_areas
- pricing_rules
- orders
- order_price_breakdowns
- rider_assignments
- order_status_events
- cash_acknowledgements

Suggested fields:

- service_areas: id, name, boundary_geometry, currency, status
- pricing_rules: id, service_area_id, version, base_fee_kobo, distance rules, surcharge rules, effective_from, effective_until, status
- orders: id, customer_id, service_area_id, pickup/destination data, package description, quoted_fee_kobo, final_fee_kobo, pricing_rule_id, status, timestamps
- order_price_breakdowns: id, order_id, component_type, amount_kobo, description, rule_reference
- rider_assignments: id, order_id, rider_id, liable_party_type, liable_party_id, status, offer/acceptance/pickup/completion timestamps
- order_status_events: id, order_id, from_status, to_status, actor_id, reason, created_at
- cash_acknowledgements: id, order_id, rider_id, amount_kobo, rider_confirmed_at, customer_confirmed_at, dispute_status

### 9.3 Commission and reconciliation

- commission_entries
- commission_settlements
- settlement_allocations
- settlement_statements
- invoices
- invoice_lines
- ledger_adjustments

Suggested fields:

- commission_entries: id, order_id, assignment_id, liable_party_type, liable_party_id, entry_type, eligible_fee_kobo, commission_rate_bps, amount_kobo, currency, source_event_key, reversal_of_entry_id, created_at
- commission_settlements: id, liable_party_type, liable_party_id, amount_kobo, currency, payment_reference, received_at, verification_status, verified_by
- settlement_allocations: id, settlement_id, commission_entry_id, amount_kobo, created_at
- settlement_statements: id, liable_party_type, liable_party_id, period_start, period_end, due_date, status, generated_at
- invoices: id, company_id, invoice_number, period_start, period_end, total_kobo, issued_at, due_date, status
- invoice_lines: id, invoice_id, commission_entry_id, amount_kobo
- ledger_adjustments: id, original_entry_id, amount_kobo, reason_code, description, created_by, approved_by, created_at

### 9.4 Integrity and support tables

Add tables for:

- dispute cases and evidence,
- notification delivery attempts,
- API idempotency keys,
- audit events.

Requirements:

- Do not delete historical finance records.
- Use foreign keys and documented retention rules.
- Use transactions and row locks for cross-row rules such as assignment acceptance and receipt allocation.
- Index order status/service area, rider availability, assignment lookups, due dates, invoice status, commission liability/period, and audit timestamps.
- Store only private storage keys in the database; keep sensitive documents outside public web roots.

## 10. API Outline

Base path: `/api/v1`  
Use JSON, auth, validation, pagination, consistent error handling, request correlation IDs, and idempotency keys for retryable financial and order operations.

### Core endpoints

- Customer: `POST /quotes`, `POST /orders`, `GET /orders`, `GET /orders/{orderId}`, `POST /orders/{orderId}/cancel`, `POST /orders/{orderId}/receipt-confirmation`, `POST /orders/{orderId}/disputes`
- Rider: `POST /rider/applications`, `POST /rider/documents`, `GET /rider/offers`, `POST /rider/offers/{offerId}/accept`, `POST /rider/offers/{offerId}/decline`, `POST /orders/{orderId}/events`, `POST /orders/{orderId}/completion`, `POST /orders/{orderId}/cash-acknowledgement`, `GET /rider/commission-statement`
- Operations: `GET /operations/orders`, `POST /operations/orders/{orderId}/assign`, `POST /operations/orders/{orderId}/reassign`, `POST /operations/riders/{riderId}/verification`, `POST /operations/riders/{riderId}/suspension`, `POST /operations/pricing-rules`, `POST /operations/commission-rates`, `GET /operations/audit-events`
- Finance: `GET /finance/commission-entries`, `POST /finance/settlement-statements/generate`, `POST /finance/receipts`, `POST /finance/receipts/{receiptId}/verify`, `POST /finance/receipts/{receiptId}/allocations`, `POST /finance/invoices/generate`, `POST /finance/adjustments`, `POST /finance/adjustments/{adjustmentId}/approve`, `GET /finance/reconciliation`

### 10.1 Critical transaction pattern

When a rider submits completion, the backend should:

- begin a DB transaction,
- lock the order and assignment,
- validate assigned rider and allowed state,
- record rider-confirmed completion and status history,
- insert the commission entry using a unique source event key,
- commit atomically or use a transactional outbox if external jobs are required.

Repeated requests must not create duplicate charges.

### 10.2 API security rules

- Never accept commission amount, rate, or receipt verification as authoritative from a client.
- Enforce ownership and object-level access for every order, document, statement, invoice, and dispute.
- Use database transactions for concurrent assignment acceptance and financial allocation.
- Apply rate limits to authentication, quote, offer, and document endpoints.
- Document endpoint permissions, status transitions, validation, and error codes in OpenAPI.

## 11. Disputes and Corrections

Support dispute categories including:

- delivery not received,
- fee disagreement,
- loss or damage,
- misconduct,
- cancellation fee,
- commission calculation,
- settlement mismatch,
- verification appeal.

Suggested workflow:

`OPEN -> UNDER_REVIEW -> AWAITING_EVIDENCE -> DECIDED -> APPEALED -> CLOSED`

A disputed commission can be flagged and enforcement paused under policy, while the original charge remains visible. Correct the ledger with a reversal or adjustment rather than deleting original records.

- Capture who raised the dispute,
- category,
- related order or charge,
- description,
- evidence,
- timestamps,
- assigned reviewer,
- final decision,
- linked follow-up adjustments or reversals.

## 12. Non-Functional Requirements

- High reliability for dispatch and financial workflows.
- Strict auditability of all order and finance state changes.
- Data integrity with transactional enforcement around assignment and settlement logic.
- Privacy-aware handling and retention of rider verification documents.
- Clear separation between cash handover acknowledgement and platform commission settlement.
- Strong audit and incident response controls.
- Role-separation and approval controls for finance and admin actions.
- Monitoring, alerting, backups, and restore drills for production.

## 13. Recommended Go-Live Scope

Target one city or service area first. Confirm:

- exact operating geography,
- service-area restrictions,
- registration and verification rules,
- pricing policy,
- commission agreement terms,
- partner onboarding process,
- legal and privacy review.

## 14. Success Criteria

The platform should be able to:

- quote a delivery consistently from the same pricing rules,
- assign a rider safely without duplicate active assignments,
- record rider-confirmed completion and validate it deterministically,
- create a commission charge exactly once,
- reconcile payments with auditable allocations,
- support disputes and corrections without erasing financial history,
- provide operations and finance teams with trustworthy data.

## 15. Implementation Summary

The project is best delivered as a modular monolith in its first release, with a strong domain model around orders, rider assignments, commission liabilities, settlements, and audit events. The architecture should prioritise correctness over speed, especially for financial integrity, concurrent dispatch, and permission boundaries.

The business model is straightforward but operationally sensitive: cash is paid directly to riders, while the platform depends on trustworthy accounting and reconciliation of commission charges. The platform's biggest technical and operational risks are therefore not delivery execution alone, but integrity of the financial ledger, status-transition enforcement, and verification controls.
