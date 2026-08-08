# AI Safety

## Threat model

**Everything a model reads is attacker-controlled text.** A workspace's own FAQ
can contain injected instructions; a curated public guide is edited by whoever
maintains it; a tour description is typed by an operator whose account may be
compromised. A model that treats data as instructions is the whole vulnerability
class.

No text transformation prevents injection, and claiming otherwise is the
dangerous part. What works is making the model's success irrelevant:

1. **Isolation in retrieval** — a document the model cannot be shown cannot be
   leaked by instructing the model. (`lib/ai/rag/retrieve.ts`)
2. **Independent tool authorisation** — a tool call the model was talked into
   still fails the server-side permission check, because the check does not
   consult the conversation. (`lib/ai/tools.ts`)
3. **No tool for high-impact actions** — publishing, refunding, cancelling and
   subscription changes are absent from the registry entirely.

## Delimiting

`wrapUntrusted()` strips the delimiters from the content before wrapping it. A
document containing `</untrusted_content>` could otherwise close the block early
and continue in what the model reads as trusted position — the same class of bug
as an unescaped quote in HTML, with the same fix. Tested.

`UNTRUSTED_CONTENT_POLICY` is a single exported constant so the wording cannot
drift between surfaces.

## Scanning

`scanForInjection()` is a **signal**, used for logging and for declining
obviously hostile public input. Matching text is never silently rewritten:
rewriting would corrupt legitimate questions — an operator genuinely can ask
"how do I write a system prompt for my chatbot?" — and a filter that mangles
real questions gets disabled by the first person it annoys.

`sanitiseUserMessage()` removes zero-width and bidi control characters, which
render as nothing to a reviewer and as content to a model, and caps length —
an unbounded message is both a cost problem and a way to push the system prompt
out of a limited context window, which is injection that needs no clever
wording.

## Output validation

Blocks output containing something shaped like a credential (`sk_live_`,
`whsec_`, a long bearer token) or executable markup (`<script`, `javascript:`).

## Volatile facts

`VOLATILE_FACT_POLICY` forbids asserting visa rules, entry requirements, travel
advisories, opening hours, transport schedules, weather or current prices from
static knowledge. Availability and prices for Tripistic tours must come from a
tool call. Being confidently wrong about a visa requirement is materially worse
than saying "check with the operator" — it can cost someone a trip.

## Logging

Gateway metadata and application logs carry ids and enum labels, never prompt
text, customer names or email addresses. Gateway logs are a second copy of
whatever is put in them, held outside the application's own deletion paths.
