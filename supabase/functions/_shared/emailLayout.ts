// Canonical EV Exec email shell, matching evexec/lib/emailLayout.js (and its
// emailJourneyHtml()/refBadgeHtml() row conventions) exactly -- same markup,
// same colors, same logo -- so every email in the system looks identical
// regardless of which repo, language, or runtime sent it: dark #020813 card,
// gold #d5a538 accent bar, logo at top, footer below the card.
//
// Standard accents: gold (#d5a538, default) for confirmations/new jobs/
// reminders; gray (#374151, accentText #fff) for cancellations/unavailable.

const APP_URL = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'
const LOGO_URL = `${APP_URL}/public/images/ev-exec-logo.jpg`

export function emailLayout(opts: {
  title: string
  body: string
  accent?: string
  accentText?: string
}): string {
  const accent = opts.accent ?? '#d5a538'
  const accentText = opts.accentText ?? '#06101c'
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${opts.title}</title></head><body style="margin:0;padding:0;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;padding:32px 12px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td bgcolor="#020813" style="background:#020813;padding:24px 28px 4px;border-radius:12px 12px 0 0;text-align:center"><a href="${APP_URL}" style="display:block;text-decoration:none"><img src="${LOGO_URL}" alt="EV Exec" width="150" style="width:150px;height:auto;display:block;margin:0 auto;border:0" /></a></td></tr><tr><td style="background:${accent};padding:16px 28px"><h1 style="margin:0;font-family:Inter,Arial,sans-serif;font-size:17px;font-weight:700;color:${accentText};line-height:1.3">${opts.title}</h1></td></tr><tr><td bgcolor="#020813" style="background:#020813;padding:28px;border-radius:0 0 12px 12px">${opts.body}</td></tr><tr><td style="padding:20px 0 0;text-align:center"><p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#6b7280">EV Exec &nbsp;&middot;&nbsp; Premium Airport Transfers<br><a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a> &nbsp;&middot;&nbsp; <a href="${APP_URL}" style="color:#d5a538;text-decoration:none">evexec.co.uk</a></p></td></tr></table></td></tr></table></body></html>`
}

export const escHtml = (s: string): string =>
  String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))

// Label/value row -- matches evexec/lib/format.js's emailJourneyHtml() rows exactly.
export function emailRow(label: string, value: string, last = false): string {
  if (!value) return ''
  const F = 'font-family:Inter,Arial,sans-serif;'
  const lbl = `margin:0 0 2px;${F}font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em`
  const val = `margin:0 0 ${last ? '20px' : '14px'};${F}font-size:15px;font-weight:600;color:#fff;line-height:1.4`
  return `<p style="${lbl}">${escHtml(label)}</p><p style="${val}">${escHtml(value)}</p>`
}

// Gold-bordered reference badge -- matches evexec/lib/format.js's refBadgeHtml().
export function emailRefBadge(ref: string, note?: string): string {
  if (!ref) return ''
  const F = 'font-family:Inter,Arial,sans-serif;'
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;width:100%"><tr><td style="background:rgba(213,165,56,.08);border:1px solid rgba(213,165,56,.35);border-radius:10px;padding:14px 16px">
    <p style="margin:0 0 4px;${F}font-size:11px;font-weight:700;color:#d5a538;text-transform:uppercase;letter-spacing:.08em">Reference</p>
    <p style="margin:${note ? '0 0 6px' : '0'};${F}font-size:20px;font-weight:800;color:#fff;letter-spacing:.04em">${escHtml(ref)}</p>
    ${note ? `<p style="margin:0;${F}font-size:12px;color:rgba(255,255,255,.55);line-height:1.5">${note}</p>` : ''}
  </td></tr></table>`
}

// Status pill -- matches the pill used inline in evexecoperator's routes.
export function emailPill(text: string, bg: string, color: string): string {
  const F = 'font-family:Inter,Arial,sans-serif;'
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;${F}margin:0 0 16px">${escHtml(text)}</span>`
}

// Gold CTA button -- matches evexec's "Choose Payment Method"/"Accept" buttons.
export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:block;background:#d5a538;color:#06101c;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;text-align:center;text-decoration:none;padding:14px 20px;border-radius:8px">${escHtml(label)}</a>`
}

// Large gold price line -- matches evexec's own price display exactly.
export function emailPrice(amount: string): string {
  return `<p style="margin:0 0 24px;font-family:Inter,Arial,sans-serif;font-size:26px;font-weight:900;color:#d5a538">${escHtml(amount)}</p>`
}

// Lead-in paragraph -- matches evexec's "Hi {name}, ..." body opener.
export function emailLead(text: string): string {
  return `<p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">${text}</p>`
}

// Muted footnote paragraph -- matches evexec's "Questions? 07721 070370" closer.
export function emailFootnote(text: string): string {
  return `<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">${text}</p>`
}
