// The one EV Exec email design (user decision, 2026-10-03): white card, navy
// "EV EXEC / PREMIUM AIRPORT TRANSFERS" header, gold stripe, coloured status
// pill, navy footer. Matches public.evexec_notification_email() in the
// database and evexec's lib/emailLayout.js, so every email looks the same.

export const PILL = {
  gold:  { bg: '#fbf3e0', fg: '#8a6516' },
  blue:  { bg: '#e6effb', fg: '#1e4a8a' },
  green: { bg: '#dcfce7', fg: '#166534' },
  red:   { bg: '#fee2e2', fg: '#991b1b' },
  grey:  { bg: '#f1f5f9', fg: '#334155' },
} as const

export function pillHtml(text: string, tone: { bg: string; fg: string } = PILL.gold): string {
  return `<span style="display:inline-block;background:${tone.bg};color:${tone.fg};border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700">${text}</span>`
}

/** Wraps body HTML in the shared EV Exec email shell. */
export function emailShell(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${title}</title><style>:root{color-scheme:light;supported-color-schemes:light}</style></head>`
    + `<body style="margin:0;background:#E9EBF2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f1b33">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#E9EBF2" style="background:#E9EBF2"><tr><td align="center">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e5ee">`
    + `<tr><td bgcolor="#0B132B" style="background:#0B132B;padding:22px 28px"><div style="color:#d7a23f;font-size:20px;font-weight:800;letter-spacing:.22em">EV EXEC</div><div style="color:#9aa3b2;font-size:10px;letter-spacing:.28em;margin-top:4px">PREMIUM AIRPORT TRANSFERS</div></td></tr>`
    + `<tr><td bgcolor="#C9A550" style="background:#C9A550;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>`
    + `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:26px 28px;font-family:Arial,Helvetica,sans-serif;color:#0f1b33">${content}</td></tr>`
    + `<tr><td bgcolor="#0B132B" style="background:#0B132B;padding:14px 28px;color:#9aa3b2;font-size:11px">EV Exec · Premium Airport Transfers · 07721 070370 · book@evexec.co.uk · evexec.co.uk</td></tr>`
    + `</table></td></tr></table></body></html>`
}
