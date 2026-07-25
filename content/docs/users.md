---
title: Users & Teams
description: Inviting members, managing roles, handling multiple workspaces, session security, and offboarding staff safely.
eyebrow: Administration
category: Administration
icon: user
order: 6
publishedAt: 2026-07-01
---

Tripistic is multi-tenant. A **user** is a person with a login. A **workspace** is one operating business. Membership connects the two, and carries the role.

## Inviting members

**Settings → Members → Invite**:

1. Enter the work email address.
2. Choose the role.
3. Send. The invitation is valid for 7 days.

The recipient accepts, sets a password if they are new, and lands in the workspace with exactly the access their role allows. Pending invitations can be resent or revoked at any time.

## Roles

| Role | Scope |
| --- | --- |
| **Owner** | Full access including billing, plan changes, and workspace deletion. At least one required. |
| **Admin** | Full operational and configuration access. No billing or deletion. |
| **Operations** | Bookings, tours, availability, dispatch, vehicles, CRM. No settings or member management. |
| **Guide** | Assigned departures, manifests, check-in, incident reporting. No pricing or customer financials. |
| **Read-only** | View records and reports. No changes. |

Roles are changed from the member list and take effect on the member's next request — no sign-out required. Detailed capability mapping is in [Permissions](/docs/permissions).

## Multiple workspaces

One person can belong to several workspaces — useful for agencies managing client accounts, DMCs running regional brands, and consultants. The workspace switcher moves between them, and data never crosses the boundary: every query is scoped to the active workspace.

## Transferring ownership

Promote the incoming owner to **Owner**, confirm they can access billing, then demote or remove the outgoing owner. A workspace can never be left without an owner — the last owner cannot be removed or demoted.

## Offboarding

When someone leaves:

1. Remove them from the workspace. Access ends immediately and their sessions are invalidated.
2. Reassign their open tasks and any upcoming departures where they were the assigned guide or driver.
3. Their historical records — bookings created, notes written, check-ins performed — remain attributed for audit integrity.

Removing a member never deletes the operational records they created.

## Sessions and account security

- Passwords are hashed and never stored or logged in plaintext.
- Sessions rotate on privilege change and are invalidated on removal.
- Enable multi-factor authentication where your plan provides it, and require it for owners and admins.
- Suspicious activity should be reported to [security@tripistic.com](mailto:security@tripistic.com).

## Guide and driver accounts

Guides and drivers can hold a login with the Guide role, giving them their assigned departures, manifests, and check-in on a phone. They can also exist as workforce records **without** a login, if you prefer to run assignments centrally and share manifests another way.

## Audit logging

Privileged and data-changing actions are recorded with the actor, timestamp, and affected record: member added or removed, role changed, settings updated, booking cancelled, payment status changed, data exported. Audit logs are retained for 12 months and are available to owners and admins.

## Enterprise administration

Enterprise deployments add a super-admin layer above individual workspaces for tenant provisioning, plan assignment, white-label brand kits, custom domain verification, AI provider governance, system health, and maintenance mode. See [White Label](/white-label).

## Related

- [Permissions](/docs/permissions) · [Getting Started](/docs/getting-started) · [Security Policy](/legal/security-policy)
