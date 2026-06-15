// Thin Twilio REST API client for the attestation engine.
//
// Uses fetch + HTTP Basic Auth directly (no SDK) since this runs in the Deno
// edge runtime. All functions are no-ops that return ok:false when Twilio
// credentials are not configured, so the engine can run (and be tested)
// before Twilio is set up.

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER') ?? ''
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? ''

export interface TwilioResult {
  ok: boolean
  sid?: string
  error?: string
}

function isConfigured(): boolean {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER)
}

function authHeader(): string {
  return 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
}

async function postToTwilio(path: string, params: URLSearchParams): Promise<TwilioResult> {
  if (!isConfigured()) {
    return { ok: false, error: 'Twilio is not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER missing)' }
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const json = await res.json().catch(() => null)

    if (!res.ok) {
      return { ok: false, error: json?.message ?? `Twilio responded ${res.status}` }
    }

    return { ok: true, sid: json?.sid }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Send a plain SMS. */
export async function sendSms(to: string, body: string): Promise<TwilioResult> {
  return postToTwilio('Messages.json', new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  }))
}

/** Send a WhatsApp message. Requires TWILIO_WHATSAPP_FROM (e.g. 'whatsapp:+14155238886'). */
export async function sendWhatsApp(to: string, body: string): Promise<TwilioResult> {
  if (!TWILIO_WHATSAPP_FROM) {
    return { ok: false, error: 'TWILIO_WHATSAPP_FROM is not configured' }
  }

  const toAddr = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  return postToTwilio('Messages.json', new URLSearchParams({
    To: toAddr,
    From: TWILIO_WHATSAPP_FROM,
    Body: body,
  }))
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Place an automated voice call that reads `message` aloud (looped 3x).
 * Uses Twilio's inline `Twiml` parameter so no hosted callback URL is needed.
 */
export async function makeVoiceCall(to: string, message: string): Promise<TwilioResult> {
  const twiml = `<Response><Say voice="alice" loop="3">${escapeXml(message)}</Say></Response>`

  return postToTwilio('Calls.json', new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Twiml: twiml,
  }))
}
