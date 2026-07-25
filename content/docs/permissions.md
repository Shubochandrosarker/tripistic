---
title: Permissions
description: The full capability matrix for every Tripistic role, how tenant isolation is enforced, and how to choose the right role for each person.
eyebrow: Administration
category: Administration
icon: shield
order: 7
publishedAt: 2026-07-01
---

Permissions in Tripistic are role-based and workspace-scoped. Two rules govern everything:

1. **Tenant isolation is absolute.** Every data access path filters by the active workspace. There is no role that can read another workspace's data.
2. **Role determines capability inside a workspace.** Roles are assigned per membership, so the same person can be an Admin in one workspace and a Guide in another.

## Capability matrix

| Capability | Owner | Admin | Operations | Guide | Read-only |
| --- | --- | --- | --- | --- | --- |
| View dashboard and reports | Yes | Yes | Yes | Assigned only | Yes |
| Create and edit bookings | Yes | Yes | Yes | No | No |
| Cancel bookings | Yes | Yes | Yes | No | No |
| Adjust booking price | Yes | Yes | Yes | No | No |
| View customer financials | Yes | Yes | Yes | No | Yes |
| Create and edit tours | Yes | Yes | Yes | No | No |
| Generate availability | Yes | Yes | Yes | No | No |
| Assign guides, drivers, vehicles | Yes | Yes | Yes | No | No |
| View assigned manifests | Yes | Yes | Yes | Yes | Yes |
| Check participants in | Yes | Yes | Yes | Yes | No |
| Report incidents | Yes | Yes | Yes | Yes | No |
| Set departure status | Yes | Yes | Yes | Assigned only | No |
| Create and edit CRM records | Yes | Yes | Yes | No | No |
| Send marketing messages | Yes | Yes | Yes | No | No |
| Manage vendors and vehicles | Yes | Yes | Yes | No | No |
| Generate AI itineraries | Yes | Yes | Yes | No | No |
| View AI business insights | Yes | Yes | No | No | No |
| Export data | Yes | Yes | Yes | No | Yes |
| Manage members and roles | Yes | Yes | No | No | No |
| Change workspace settings | Yes | Yes | No | No | No |
| Configure payments | Yes | Yes | No | No | No |
| Configure integrations and AI providers | Yes | Yes | No | No | No |
| Manage white label and domains | Yes | Yes | No | No | No |
| View audit logs | Yes | Yes | No | No | No |
| Manage billing and plan | Yes | No | No | No | No |
| Delete the workspace | Yes | No | No | No | No |

## What "assigned only" means

Guides see the departures they are assigned to, and the participants on those departures. They do not see the wider booking list, other guides' departures, customer lifetime value, or revenue. This is deliberate: a guide needs the manifest for today, not the commercial picture.

## Choosing a role

| Person | Role | Why |
| --- | --- | --- |
| Business owner | Owner | Billing and plan control |
| Operations manager | Admin | Full configuration without billing |
| Reservations staff | Operations | Bookings and customers, no settings risk |
| Freelance guide | Guide | Only their departures |
| Accountant or investor | Read-only | Reporting without edit risk |
| Seasonal temp | Operations or Guide | Scoped access, removed at season end |

Grant the least privilege that lets someone do their job. It is easy to promote later and much harder to undo an accidental change.

## Enforcement

Permission checks run on the server for every request — page loads, API routes, and mutations alike. Hiding a button in the interface is a usability affordance, never a security control. An API call made with a Guide's credentials against a booking they are not assigned to is rejected regardless of what the interface showed.

## Public and portal access

- **Public booking pages** are unauthenticated and expose only what you publish: tour details, availability, and pricing.
- **Booking confirmations** use unguessable public tokens, scoped to a single booking, so a traveller can view and pay without an account.
- **The customer portal** authenticates travellers and shows only their own bookings, invoices, documents, and messages.

## API permissions

API credentials inherit the permissions of the role they are issued under. Issue keys with the narrowest role that satisfies the integration, rotate them on personnel change, and never embed them in client-side code. See [API](/docs/api).

## Enterprise super admin

The platform super-admin role sits above workspaces for provisioning, plan assignment, white-label configuration, domain verification, AI provider governance, and maintenance mode. It is a platform-operator role for the organisation running the deployment, not something granted to customers, and its actions are audit-logged.

## Related

- [Users & Teams](/docs/users) · [API](/docs/api) · [Security Policy](/legal/security-policy)
