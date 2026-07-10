# Tripistic Compliance and Risk Plan

## 1. Compliance Priorities

Tripistic will handle bookings, customer data, payments, waivers, and communication. Compliance must be designed early.

Main areas:

- PCI-DSS
- GDPR
- UK GDPR
- CCPA/CPRA
- Digital waiver storage
- Data retention
- Messaging consent
- AI safety

## 2. Payments and PCI

Tripistic should avoid storing card data.

Recommended:

- Use Stripe Checkout or Stripe Payment Element
- Store only Stripe customer/payment IDs
- Never store raw card numbers
- Validate Stripe webhooks
- Use HTTPS everywhere
- Keep payment scope low

## 3. GDPR / UK GDPR

Required features:

- Consent tracking
- Data export request
- Data deletion request
- Privacy policy support
- Vendor DPA readiness
- Data retention settings
- Marketing opt-in/opt-out
- Cookie consent on public widgets where needed

## 4. CCPA/CPRA

For California users/customers:

- Allow data access request
- Allow deletion request
- Explain data usage
- Do not sell personal data
- Respect opt-outs where applicable

## 5. Digital Waivers

Waivers should store:

- Signed document snapshot
- Customer name
- Signature
- Timestamp
- IP address
- Booking ID
- Participant ID
- Waiver template version

Important:

- Keep waiver versions immutable.
- If waiver text changes, create a new version.
- Attach signed waiver to booking and participant.

## 6. Messaging Compliance

For SMS/WhatsApp/email:

- Store consent
- Provide unsubscribe/opt-out where required
- Avoid spam-like promotional messages
- Separate transactional and marketing messages
- Log delivery status

## 7. AI Risks

### Main AI Risks

- Hallucinated availability
- Wrong pricing
- Wrong refund policy
- Unsafe travel advice
- Overpromising accessibility/safety
- Incorrect legal/liability information

### Controls

- Retrieval from verified business data
- Output validation
- No free-form pricing decisions without source data
- Human handoff
- Audit log
- Confidence thresholds
- Operator approval for sensitive actions

## 8. Dynamic Pricing Risk

Dynamic pricing can create backlash if customers feel manipulated.

Recommended controls:

- Operator approval first
- Price floor and cap
- Transparent explanation
- Manual override
- Avoid aggressive surge language

## 9. Data Security

Required:

- Role-based access control
- Audit logs
- Encrypted secrets
- Secure file storage
- Tenant isolation
- Rate limiting
- Backup strategy
- Incident response plan

## 10. Launch Compliance Minimum

Before public launch:

- Privacy Policy
- Terms of Service
- Data Processing Addendum direction
- Refund/cancellation policy template support
- Stripe secure payment flow
- Consent records
- Waiver versioning
- Data deletion workflow
- Secure webhook validation

## 11. Risk Warning

Do not market Tripistic as legally guaranteeing waiver enforceability.

Better wording:

> Tripistic helps operators collect and store digital waivers with timestamps, signatures, and booking records. Operators should consult local legal counsel for enforceability.
