# Architecture: where this repo sits in the EV Exec / Dissy Autobook system

This note exists so future work (e.g. "Booking Brain" AI intake) lands in the
right repo. It is the result of inspecting this codebase and the two Supabase
projects in the org before writing any new code.

## 1. What this repo is

`evexec-driver` (this repo, `evexecdriverapp`) is a **driver-only Next.js 15
PWA**. It has:

- No public/customer-facing routes — `middleware.ts` gates every `(app)`
  route behind Supabase auth, and `app/page.tsx` only redirects to
  `/login` or `/dashboard`.
- No Anthropic/Claude SDK, no Stripe SDK, in `package.json`.
- No custom API routes — every page reads/writes `bookings`/`drivers`/etc.
  directly via the Supabase browser client, scoped by RLS to
  `auth.uid()` / `assigned_driver_id`. (An unauthenticated, service-role
  `app/api/jobs/route.ts` + `lib/dispatch.ts` existed but had no callers and
  was removed as a security risk.)
- Its own Supabase Edge Function, `supabase/functions/attestation-engine`,
  which sends **outbound-only** Twilio SMS/WhatsApp/voice to nudge a driver to
  confirm a pickup, escalate, and reallocate to the next driver if they don't
  respond. It does not read inbound messages.

It connects to Supabase project **`yoltkmhtxwluqxxpewbl`** ("EV Exec"), a
small, single-tenant project (11 tables: `bookings`, `drivers`, `missed_calls`,
`quote_requests`, `contact_messages`, `reviews`, `push_subscriptions`,
`driver_unavailable_dates`, `profiles`, `notification_log`,
`notification_queue`; edge functions `send-push`, `set-vercel-env`,
`attestation-engine`).

**Role: driver operations PWA / satellite app.** It is not the main booking
platform, not a landing page, and not an automation backend.

## 2. Where the actual booking platform lives

A separate, much larger Supabase project, **`xrcrwcejxkcowhrfbmgq`**, is the
real "Dissy Autobook" / EV Executive operations platform:

- **Booking creation & dispatch**: `bookings` → `initial-dispatch` edge
  function (fired on `INSERT`) → `_shared/dispatch.ts` picks the best driver
  (reliability score + Haversine distance) → `allocations` row + SMS offer.
  `driver-response`, `offer-driver`, `reallocation-engine` handle the
  accept/decline/reallocate loop via inbound Twilio SMS.
- **Pricing**: `pricing_rules`, `airport_pricing` (per-company fare tables,
  multipliers, surcharges).
- **Customers**: `customers`, `customer_profiles`.
- **Payments**: `create-payment-intent`, `stripe-webhook`, `payment_methods`,
  `manage-payment-methods` (Stripe).
- **Flight monitoring**: `flight-monitor`, `flight_data`, `flight_alerts`.
- **Multi-operator network**: `companies`, `operators`, `network_operators`,
  `revenue_shares`, `overflow_requests`.
- **AI / messaging tables that already exist but have no extraction function
  wired up yet**: `whatsapp_messages` (`ai_extracted_intent`,
  `extraction_status`, `parsed_payload`, `confidence_score`, `ai_response`,
  `quote_generated`, `message_sid`), `message_threads`, `message_logs`,
  `message_templates`, `missed_calls`, `leads` (pickup/destination/datetime/
  passengers/quote/payment fields + `conversation` jsonb + `ai_paused`),
  `quotes` (`extraction_confidence`, `extraction_payload`, `price_breakdown`,
  `quote_status`, `converted_booking_id`), `ai_actions`, `automation_logs`.
- **Existing Claude usage**: `concierge-chat` edge function — a customer
  support chatbot (model `claude-opus-4-5`) that streams replies via SSE. It
  answers questions about bookings/pricing/etc.; it does **not** extract
  structured booking data from messages.

This is the system that owns booking, pricing, calendar and customer logic.

## 3. Booking Brain integration points (not in this repo)

The flow described —
`customer enquiry → Twilio/web webhook → Claude extraction → missing-info
follow-up → draft booking → operator review → Dissy booking/pricing/dispatch
→ confirmation` — maps onto tables that **already exist** in
`xrcrwcejxkcowhrfbmgq` but currently have no producer:

1. **Inbound channel** → insert into `whatsapp_messages` /
   `message_threads` (Twilio webhook).
2. **Claude extraction** → new edge function (same pattern as
   `concierge-chat`, but using tool-use/structured output) writes
   `parsed_payload`, `extraction_status`, `confidence_score`,
   `ai_extracted_intent` on `whatsapp_messages`, and upserts a `leads` row.
3. **Missing-info follow-up** → templated reply via `message_templates` /
   `_shared/twilio.ts`, looped until required fields are present.
4. **Draft booking** → `quotes` row with `quote_status = 'pending_review'`
   and `extraction_payload`/`price_breakdown` populated.
5. **Operator review inbox** → new admin UI reading `quotes`/`leads` where
   `quote_status = 'pending_review'` (lives in the operator dashboard, not
   this repo).
6. **Approval → booking** → existing flow inserts into `bookings`
   (`quotes.converted_booking_id`), which triggers the existing
   `initial-dispatch` → driver matching → SMS offer pipeline unchanged.
7. **Confirmation/quote sent** → existing Twilio SMS templates in
   `_shared/twilio.ts` (extend with a quote-specific template if needed).

**This repo needs no changes for Booking Brain.** It only ever sees
`bookings` rows in `yoltkmhtxwluqxxpewbl` after an operator has approved and
assigned a driver, read directly via the Supabase client under RLS
(`assigned_driver_id = auth.uid()`).

## 4. Risks / duplicates to avoid

- Do **not** add WhatsApp/SMS AI-intake, quote generation, or Claude
  extraction to this repo — it would duplicate the schema-ready (but
  unwired) pipeline already in `xrcrwcejxkcowhrfbmgq`
  (`leads`/`quotes`/`whatsapp_messages`/`message_threads`).
- Do **not** add Stripe or pricing logic here — both are centralised in
  `xrcrwcejxkcowhrfbmgq` (`pricing_rules`, `airport_pricing`,
  `create-payment-intent`, `stripe-webhook`).
- This repo's `attestation-engine` (driver-confirmation/reallocation via
  outbound Twilio against `yoltkmhtxwluqxxpewbl`) is conceptually similar to
  `xrcrwcejxkcowhrfbmgq`'s `reallocation-engine` / `driver-response` /
  `offer-driver` (accept/decline/reallocate via inbound Twilio against the
  bigger schema). They run against different projects today, so they aren't
  literally duplicated, but if the two systems are ever merged this is the
  pair to reconcile first.
- **Critical security issue (separate project, surfaced for awareness):**
  `public.app_users` in `xrcrwcejxkcowhrfbmgq` has Row Level Security
  **disabled** — it is fully readable/writable by the anon and authenticated
  keys. Remediation (`ALTER TABLE public.app_users ENABLE ROW LEVEL
  SECURITY;`) should not be applied blindly, since RLS with no policies
  blocks all access — policies need to be written first. This is outside
  this repo but should be addressed in `xrcrwcejxkcowhrfbmgq`.

## 5. Safe implementation plan (when Booking Brain work starts)

All of this happens in the `xrcrwcejxkcowhrfbmgq`-backed platform repo, not
here:

1. Twilio webhook edge function → write inbound messages to
   `whatsapp_messages` / `message_threads` / `missed_calls`.
2. Claude extraction edge function (reuse `ANTHROPIC_API_KEY`, structured
   tool-use) → populate `parsed_payload` / `extraction_status` /
   `confidence_score` and upsert `leads`.
3. Missing-info loop → templated follow-up messages until required fields
   are present.
4. Create `quotes` row (`quote_status = 'pending_review'`) with
   `extraction_payload` / `price_breakdown`.
5. Operator review inbox UI → approve/edit/reject `quotes`.
6. On approval, existing logic converts the quote into a `bookings` row
   (`converted_booking_id`) — `initial-dispatch` and the existing
   pricing/dispatch/driver pipeline take over unchanged.
7. Send confirmation/quote to the customer via existing Twilio templates.

Claude only ever writes to `whatsapp_messages` / `leads` / `quotes`
extraction fields — never directly to `bookings`, `pricing_rules`,
`allocations`, or `drivers`. Operator approval remains the gate before
Dissy's existing booking/pricing/dispatch logic runs.
