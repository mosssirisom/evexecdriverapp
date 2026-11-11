// Settings that belong to whoever runs this platform, not to one business.

// The contact address web-push services may use to reach the platform operator
// (the VAPID "subject"). Set the VAPID_SUBJECT secret to change it.
export const VAPID_SUBJECT: string =
  (typeof Deno !== 'undefined' ? Deno.env.get('VAPID_SUBJECT') : undefined) || 'mailto:driver@evexec.co.uk'
