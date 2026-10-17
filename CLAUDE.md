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

## Update — 2026-10-17: readable job screens (colours), audit fixes

- **Colours** (navy and gold theme kept): the app had moved to a light background but kept dark-theme text colours, so key job details failed contrast (gold time/price 2.3:1, secondary text 2.9:1, status and payment badges 1.7–2.8:1) and some text was white on white (My Jobs drop-off address, passenger/luggage counts, Jobs date filters). Now: gold text on light backgrounds is deep gold `#7a5c14` (6.2:1; buttons, fills and the dark bottom bar keep `#d5a538`); secondary text `#4f6580` / `#5a6f88` / `#3b5470` (5–8:1); badges are dark text on pale fills (`*-800` on `*-100`); green text `#047857`. Job cards: bolder, larger pickup time and customer name, slight shadow, 10px badges. Dark screens left as they were: sign-in, bottom bar, notification prompt, Journey Complete splash. Keep new text on light backgrounds at 4.5:1 or better.
- **Return legs** (`isReturnLeg()` in `lib/format.ts`, notes start "Return leg created automatically"): shown as "Paid with Outbound"; completing one no longer asks "How was payment made?" or writes a payment method. Card / payment link / bank transfer show "Paid to Office" (was "Card on Arrival"), matching the website's driver emails.
- **Dates**: dashboard confirmation cards and the new-job pop-up showed raw YYYY-MM-DD (now DD/MM/YYYY); the dashboard's "today" used UTC (`ukToday()` now), which showed yesterday's jobs between 00:00 and 01:00 in summer.
- Checked, no change: Twilio is gated by `SMS_ENABLED` in every edge function; `npx tsc` and `next build` pass; `next lint` is not configured (it opens a setup prompt).

## Update — 2026-10-17: one font, Manrope

User decision: the whole app uses Manrope, like the website. Self-hosted (`public/fonts/manrope-latin*.woff2`, same files as `evexec`, SIL OFL in `OFL-Manrope.txt`), `@font-face` at the top of the global CSS, body font Manrope, and Tailwind `sans`, `serif` and `mono` all map to Manrope, so booking references and other monospace text match. Weights 200–800 (CSS 900 renders as 800); no italic face (browser slants it). Emails keep their email-safe fonts. Checked in a browser: every visible text element renders in Manrope and the font file loads.
- Driver app: `fonts` is excluded from the sign-in redirect in `middleware.ts`, so the font also loads on the signed-out pages. The receipt reference lost its inline monospace style.

## Update — 2026-10-17: app icon (steering wheel)

User chose option D from five (emblem, EV monogram, bolt, steering wheel, EV in a ring): a gold steering wheel (`#D5A538`) on navy (`#0B1525`). Before, `/favicon.ico` did not exist (no tab icon) and phones used the wide 1.35 MB `logo.png` with text as the home-screen icon.
- Files: `public/favicon.ico` (16/32/48), `public/icons/icon.svg` (tab), `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (wheel inside the safe zone), `badge-96.png` (white on transparent, Android status bar). The 64×64 SVG source of the wheel is `icon.svg`; regenerate the PNGs from it if it changes.
- Wired in `app/layout.tsx` `metadata.icons`, `public/manifest.json`, push notifications (`public/sw.js` icon and badge, cache name bumped to `evexec-driver-v2`) and `components/job-notifier.tsx`. `logo.png` stays on the sign-in, password and receipt screens.
- `favicon.ico` and `icons` are already excluded from the sign-in redirect (`middleware.ts`).

## Update — 2026-10-17: reminder and receipt edge functions redeployed (audit)

- **Found live**: `send-driver-reminders` (v13) and `send-journey-receipt` (v11) were still the 04/10 versions; the 06/10 source changes (commit `b1773d5`) had never been deployed. Effects: drivers got no 24 h/1 h reminder for jobs without a stored `pickup_time` (5 of 21 upcoming jobs on 17/10); fallback emails failed ("RESEND_API_KEY not configured"); no customer journey receipt had ever been queued.
- **Receipts were also blocked by CORS**: the edge functions' `APP_URL` secret is not set and the default was `https://evexec.co.uk`, so the receipt function only allowed that origin and the Driver App's browser call (from `https://evexecdriverapp.vercel.app`) was refused. The default `APP_URL` is now the Driver App's address (`_shared/cors.ts`, `_shared/notify.ts`, `send-driver-reminders`, `notify-job-update`); it is also the host of "View job" links in driver emails.
- **Receipt access**: `send-journey-receipt` now only works for the job's own driver (checks the caller's token against `assigned_driver_id`) and only once the booking is Completed.
- **No duplicate 24 h email**: the database already queues a 24 h reminder email at assignment (`enqueue_driver_notifications`), so `send-driver-reminders` sends the push and skips its own email when that row exists. Partners are skipped entirely (they keep the database email only, as before).
- Deployed: `send-driver-reminders` v15, `send-journey-receipt` v12 (checked: 200 every minute; an unauthenticated receipt call gets 403 with the Driver App origin). `notify-job-update` has the same `APP_URL` default change in source but was not redeployed (its emails are re-rendered by the website at send time).
