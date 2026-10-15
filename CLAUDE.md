# Cost policy (hard constraint — read before doing anything)

**We do not pay for any additional cost, under any circumstance, without explicit prior approval from the user.**

This applies to all three repos in this project (`evexec`, `evexecoperator`, `evexecdriverapp`) and to the shared Supabase project (`yoltkmhtxwluqxxpewbl`) they all depend on.

- **No new billed resources, ever, without asking first.** This includes (not an exhaustive list): Supabase database branches, additional Supabase projects, upgraded Supabase/Vercel plan tiers or add-ons, new paid third-party APIs or SaaS tools, additional cloud compute, paid monitoring/observability tiers, domain purchases, etc.
- **Twilio SMS is dormant (user decision, 2026-10-03).** All Twilio sending (SMS, WhatsApp, voice) across the three repos is gated behind an `SMS_ENABLED=true` env var / Supabase secret, which is unset, so nothing is sent or billed. Customer updates are now sent manually from the driver's or operator's own phone via pre-filled `sms:` links. Do not set `SMS_ENABLED`, remove the gate, or add new Twilio-sending flows without explicit approval.
- **Before taking any action that would create a new billed resource or increase spend on an existing one, stop and ask.** This applies even to trivially small amounts (pennies, hourly micro-charges) — the rule is "always ask first," not "ask only above some threshold."
- **Prefer free tiers and already-provisioned infrastructure.** When a task could be done either by spinning up a paid resource (e.g. a Supabase branch to test a migration) or by a slower/more careful free alternative (e.g. read-only validation queries plus additive, reversible migrations applied directly, with review), default to the free alternative unless the user has explicitly approved the paid one.
- Abandon or redesign any plan that turns out to require a new cost, rather than proceeding and asking forgiveness after the fact.

# Date and time format (hard rule, user decision)

**Every date anywhere in EV Exec is DD/MM/YYYY. Every time is 24-hour HH:MM, UK time.** This applies to all three repos (`evexec`, `evexecoperator`, `evexecdriverapp`) and the shared Supabase project: screens, emails, texts (including two-tap `sms:` messages), push notifications, PDFs/invoices, subjects, toasts and database templates. Never show `YYYY-MM-DD`, US order, or a written-out month.

- Plain `YYYY-MM-DD` values are rearranged directly (no `Date` parsing, so no timezone can shift the day). Use the shared helpers: `evexec/lib/format.js` `fmtDate`, `evexecoperator/src/lib/dates.ts` (`fmtDate`, `fmtDateTime`), `evexecdriverapp/lib/format.ts` (`formatDate`, `formatStamp*`). In SQL use `to_char(..., 'DD/MM/YYYY')`.
- Timestamps are shown in `Europe/London` time.
- Only exception: native `<input type="date">` / `<input type="time">` pickers, which follow the phone's own settings.

## Update — 2026-10-07: customer reminders go by email AND two-tap SMS

User decision: every customer gets both reminders on every channel they have. The week-ahead (5–7 days before) and day-before reminders are sent by email when there is an email on file **and** handed off to the assigned driver as a two-tap SMS when there is a phone number (before this, the SMS handoff was only created when there was no email). No Twilio: the driver sends it from their own phone.

- Website: `evexec/api/reminders/trigger.js` creates both independently; the cron still runs once a day (`0 8 * * *`, 09:00 UK in summer) and picks bookings by UK calendar date. No driver assigned → email only (warning logged). Tests: `npm run test:unit` (`tests/unit/reminders.test.cjs`).
- Driver app: the job screen offers "Send Week-Ahead Reminder" (2–7 days before, once the website has handed one off, or when opened from its notification) as well as "Send 24hr Reminder"; the "Customer reminder due" push links to `/jobs/<id>?reminder=7day|24hr`. The text is generated when the driver taps ("in 6 days" / "tomorrow" / "today"), so it is never stale.

## Update — 2026-10-14: Chat tab removed from the Driver App

Audit found the Chat tab sent messages to `driver_messages`, but nothing in the Operator app ever read or answered them (one message ever sent, never seen). User decision: remove it rather than build an operator side. The `/chat` page, its bottom-bar tab and unread badge are gone; `/chat` redirects to `/dashboard` (`next.config.ts`). The `driver_messages` table and its one row were left in place (no code uses them).


## Update — 2026-10-15: Driver App invites and trusted partners

- **`drivers.kind`**: `driver` (uses the Driver App) or `partner` (trusted third-party operator: no app login, never invited). James Addy (Crestways Travel) and Marks Taxi are partners (user, 15/10/2026). Migration `20261015150000_driver_kind_partner.sql` in `evexec` (applied); it also lets staff mark `driver_sms_reminders` as sent.
- **Invites** (Operator app, Drivers): `/api/drivers` (staff only, service role). POST `{ driverId }` creates the login **with the driver row's own id** (the Driver App identifies drivers by `drivers.id = auth.uid()`), adds a `tenant_users` `driver` role, fills `full_name`, and emails a one-time link (Resend, `driverInvite` in `src/lib/email/staff.js`) to the Driver App's `/reset-password?token_hash=…&type=recovery&invite=1`, which verifies it with `verifyOtp`. GET returns each driver's app status (partner / none / invited / active). An email already used by another login is refused (409), not merged. New drivers are invited on Add by default.
- **Partner jobs**: still get the job emails (`enqueue_driver_notifications`). Their customers' two-tap reminder texts stay in `driver_sms_reminders` but go to the office: the Driver App sweep (`send-customer-sms-reminder-push`, deployed v4) skips partners and pushes every office device via the Operator app's `/api/push/dispatch`; the confirm-pickup engine (`attestation-engine`, deployed v11) skips partner jobs (it had sent two false "driver hasn't confirmed" alerts).
- **Texts to send** (Operator app, Today, `TextsToSend.jsx`, `useTextTasks`, `lib/operator/textTasks.js`): pending `operator_sms_tasks` plus partner jobs' `driver_sms_reminders`, hiding past or finished jobs. "Open Messages" (pre-written `sms:` link) then "Mark as sent". This replaces the sms-tasks screen removed on 06/10/2026; the website's `handOffSmsToOperator` now pushes through `/api/push/dispatch` (its old `/api/push/notify-operators` target no longer existed).
