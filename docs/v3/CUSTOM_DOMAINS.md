# Custom Domains (V3)

## What already worked before V3

Contrary to `docs/AUDIT.md`, the domain lifecycle was **not** a stub.
`lib/domains/service.ts` already performed real `dns.resolveTxt` ownership
verification, real `dns.resolveCname` checks, Cloudflare Custom Hostname
create/get/remove with ownership and SSL status, an apex strategy (TXT plus
provider health, then a 308 to `www.`), and a polling job behind
`DOMAIN_CRON_SECRET`. Takeover protections — platform-hostname rejection,
reserved subdomains, IP/localhost rejection, unique hostname with a
cross-workspace conflict check — were present.

The Phase 0 audit corrects that claim; nothing in the working lifecycle was
rewritten.

## What V3 added

**A domain can now point at a site.** `custom_domains.site_id` is nullable and
`ON DELETE SET NULL`. Null means "the workspace's default public surface",
which is what every pre-V3 row means — so no backfill, and a domain added before
the Site Builder existed routes exactly as it did.

`SET NULL` rather than cascade is deliberate: deleting a site must not delete
the customer's verified hostname and issued certificate. That is hours of DNS
propagation to undo a mistake.

**Binding is a separate operation from adding.** `POST
/api/workspaces/[id]/sites/[siteId]/domain` binds an already-verified domain;
`DELETE` unbinds. Coupling them to domain creation would mean re-verifying a
domain to point it at a different site.

Both handlers require `storefront_builder` *and* `custom_domain`. A plan with
one and not the other cannot bind.

## Lifecycle states

`pending_dns → verifying → verified → ssl_pending → active`, plus `failed` and
`disabled`. Unchanged from v2.

## Routing

| Target | Path |
|---|---|
| domain with `site_id = null` | Cloudflare → VPS → middleware host-cache → `/book/<slug>` |
| domain bound to a site | Cloudflare Custom Hostname → dispatch Worker → user Worker |

The second requires the dispatch Worker to map hostname → site, which is
Cloudflare-side configuration described in `PRODUCTION_DEPLOYMENT.md`. Until
that mapping exists, a bound domain continues to resolve as it did before —
binding records intent, it does not itself reroute traffic.
