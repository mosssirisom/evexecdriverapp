// CORS helper for edge functions called from the driver app browser client.
//
// Restricts Access-Control-Allow-Origin to the configured APP_URL so that
// the preflight and response headers are not granted to arbitrary origins.
// Falls back to the production URL when APP_URL is not set.

const APP_URL = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  APP_URL,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
