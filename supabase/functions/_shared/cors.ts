// CORS helper for edge functions called from the driver app browser client.
//
// Only the Driver App's own origin is allowed (APP_URL, default the Driver
// App's production address), so the preflight and response headers are not
// granted to arbitrary origins.

const APP_URL = Deno.env.get('APP_URL') ?? 'https://evexecdriverapp.vercel.app'

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  APP_URL,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
