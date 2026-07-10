# Tripistic Technical Architecture

## 1. Recommended Architecture

Tripistic should be built as a SaaS platform with a clean modular architecture.

Recommended stack direction:

- Frontend: React / Next.js
- Backend: Node.js/NestJS or Laravel
- Database: PostgreSQL
- Cache/Queue: Redis
- Payments: Stripe
- File storage: S3-compatible storage
- AI: OpenAI/OpenRouter/Claude via provider abstraction
- Messaging: Twilio, WhatsApp Business API, email provider
- Hosting: VPS or cloud container deployment

## 2. Multi-Tenant Model

Tripistic should support multi-tenancy from day one.

Core tenant entity:

- `organizations`

Every major table should reference `organization_id`.

## 3. Core Database Tables

### Organizations

- id
- name
- slug
- country
- timezone
- currency
- plan_id
- status
- created_at

### Users

- id
- organization_id
- name
- email
- password_hash
- role
- status
- created_at

### Tours

- id
- organization_id
- title
- description
- duration
- location
- capacity
- base_price
- status

### Availability

- id
- organization_id
- tour_id
- start_time
- end_time
- capacity
- booked_count
- guide_id
- status

### Bookings

- id
- organization_id
- tour_id
- availability_id
- customer_id
- status
- total_amount
- paid_amount
- payment_status
- source
- created_at

### Customers

- id
- organization_id
- name
- email
- phone
- country
- tags
- consent_status
- created_at

### Payments

- id
- organization_id
- booking_id
- provider
- provider_payment_id
- amount
- currency
- status
- created_at

### Waivers

- id
- organization_id
- booking_id
- customer_id
- waiver_template_id
- signed_at
- signature_url
- ip_address
- status

### Messages

- id
- organization_id
- booking_id
- customer_id
- channel
- template_key
- status
- sent_at

### AI Insights

- id
- organization_id
- insight_type
- title
- summary
- recommendation
- confidence_score
- status
- created_at

## 4. API Structure

Recommended REST API structure:

```txt
/api/v1/auth
/api/v1/organizations
/api/v1/tours
/api/v1/availability
/api/v1/bookings
/api/v1/customers
/api/v1/payments
/api/v1/waivers
/api/v1/messages
/api/v1/guides
/api/v1/reports
/api/v1/ai/insights
/api/v1/ai/booking-agent
/api/v1/integrations/stripe
/api/v1/integrations/viator
/api/v1/integrations/google-calendar
```

## 5. Frontend App Areas

### Admin Dashboard

- Overview
- Bookings
- Calendar
- Tours
- Customers
- Payments
- Waivers
- Guides
- Messages
- AI Growth
- Reports
- Integrations
- Settings

### Guide Dashboard

- Today’s tours
- Guest list
- Waiver status
- Notes
- Check-in
- Emergency/contact info

### Public Booking Widget

- Tour list
- Date/time picker
- Guest count
- Add-ons
- Payment
- Confirmation

## 6. AI Architecture

Use a provider abstraction layer.

```txt
AI Request → AI Gateway → Provider Adapter → Model → Output Validator → App Action
```

### Required Controls

- Prompt templates
- System rules per feature
- Organization-specific data scope
- Output validation
- Hallucination guardrails
- Logging
- Rate limits
- Human override

## 7. Booking Agent Safety Architecture

The AI booking agent must only answer from:

- Tour database
- Availability database
- Policy database
- FAQ database
- Payment link generator

The agent should never invent:

- Availability
- Discounts
- Refund policies
- Legal/safety claims
- Pickup details

## 8. Webhook System

Events:

- booking.created
- booking.paid
- booking.cancelled
- waiver.signed
- message.failed
- review.received
- ai.insight.created

Use webhooks for:

- Zapier
- Make
- CRM connectors
- Google Sheets
- Agency workflows

## 9. Security Requirements

- Multi-tenant data isolation
- Role-based access control
- Password hashing
- MFA later
- Stripe-hosted payment flow
- Audit logs
- Signed webhook validation
- API rate limiting
- Secure file uploads
- Encrypted sensitive data

## 10. WordPress Strategy

Because your ecosystem is WordPress-first, Tripistic can have:

1. SaaS app as the main system
2. WordPress plugin as connector/booking widget
3. Shortcodes/blocks for tour listing and booking widget
4. Webhook sync with WordPress sites
5. Future integration with Bookingistic/Memberistic/Licenseistic

Best approach:

- Do not build the whole SaaS inside WordPress.
- Build SaaS separately.
- Use WordPress plugin as connector, widget, and marketing distribution channel.
