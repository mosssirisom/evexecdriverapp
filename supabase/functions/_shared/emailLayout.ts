// The one email design: white card, navy header with the business's wordmark,
// gold stripe, coloured status pill, navy footer. Matches
// public.evexec_notification_email() in the database and evexec's
// lib/emailLayout.js. The business's name, contact details and colours come
// from its Brand (see ./brand.ts), so every business's emails carry its own.

import type { Brand } from './brand.ts'

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

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "Questions? Call or WhatsApp 07123 456789." or '' when the business has no number. */
export function helpLine(brand: Brand): string {
  return brand.phone
    ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#475569">Questions? Call or WhatsApp ${esc(brand.phone)}.</p>`
    : ''
}

/** Wraps body HTML in the shared email shell for this business. */
export function emailShell(title: string, content: string, brand: Brand): string {
  const header = brand.primary ?? '#0B132B'
  const accent = brand.accent ?? '#d7a23f'
  const domain = brand.site.replace(/^https?:\/\//i, '')
  const footer = [brand.name, brand.tagline, brand.phone, brand.email, domain].filter(Boolean).map(esc).join(' · ')
  const licence = brand.licence ? `<br>Private hire operator licence ${esc(brand.licence)}` : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${title}</title><style>:root{color-scheme:light;supported-color-schemes:light}</style></head>`
    + `<body style="margin:0;background:#E9EBF2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f1b33">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#E9EBF2" style="background:#E9EBF2"><tr><td align="center">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e5ee">`
    + `<tr><td bgcolor="${header}" style="background:${header};padding:22px 28px"><div style="color:${accent};font-size:20px;font-weight:800;letter-spacing:.22em">${esc(brand.wordmark)}</div></td></tr>`
    + `<tr><td bgcolor="${accent}" style="background:${accent};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>`
    + `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:26px 28px;font-family:Arial,Helvetica,sans-serif;color:#0f1b33">${content}</td></tr>`
    + `<tr><td bgcolor="${header}" style="background:${header};padding:14px 28px;color:#9aa3b2;font-size:11px">${footer}${licence}</td></tr>`
    + `</table></td></tr></table></body></html>`
}
