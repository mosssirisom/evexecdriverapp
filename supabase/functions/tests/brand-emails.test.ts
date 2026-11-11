import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brandFromRow, displayPhone, loadBrand, _clearBrandCache, NO_BRAND } from '../_shared/brand.ts'
import { emailShell, helpLine } from '../_shared/emailLayout.ts'
import { reminderEmail, cancellationEmail, updateEmail } from '../_shared/email.ts'

// A business shows only its own details in the driver app's emails, and the
// old EV Exec header, number and address never appear for anyone else.

const COASTAL = brandFromRow({
  name: 'Coastal Cars', contact_email: 'hello@coastal.test', contact_phone: '+44 7123 456789',
  brand: { licence: 'PHO1234', site_url: 'https://coastal.test/', tagline: 'Airport transfers from Southport', colors: { primary: '#123456', accent: '#FF8800' } },
})
const BARE = brandFromRow({ name: 'Bare Business', contact_email: null, contact_phone: null, brand: {} })
const LEAKS = /EV Exec|EV EXEC|07721|PHO0079|evexec\.co\.uk|070370/i

const base = { driverName: 'Sam', ref: 'EVX-1', customer: 'Jo', pickup: 'A', dropoff: 'B', date: '12/11/2026', time: '09:30', bookingUrl: 'https://driver.test/jobs/1' }
const all = (brand: ReturnType<typeof brandFromRow>) => [
  reminderEmail({ ...base, type: '24h', brand }).html,
  reminderEmail({ ...base, type: '1h', brand }).html,
  cancellationEmail({ ...base, brand }).html,
  updateEmail({ ...base, brand }).html,
  emailShell('Journey receipt', `x${helpLine(brand)}`, brand),
]

test('brand: phone numbers read the house way', () => {
  assert.equal(displayPhone('07721070370'), '07721 070370')
  assert.equal(displayPhone('+44 7721 070370'), '07721 070370')
  assert.equal(displayPhone('01253 123456'), '01253 123456')
  assert.equal(displayPhone(null), '')
})

test('brand: only what the business row holds, nothing from another business', () => {
  assert.deepEqual({ ...COASTAL }, {
    name: 'Coastal Cars', wordmark: 'COASTAL CARS', phone: '07123 456789', email: 'hello@coastal.test', licence: 'PHO1234',
    site: 'https://coastal.test', tagline: 'Airport transfers from Southport', primary: '#123456', accent: '#FF8800',
  })
  assert.deepEqual({ ...brandFromRow(null) }, { ...NO_BRAND })
  assert.equal(brandFromRow({ name: 'X', brand: { colors: { primary: 'red', accent: '#12345' } } }).primary, null)
})

test('emails: another business shows its own name, colours, contact details and licence', () => {
  const html = emailShell('T', 'body', COASTAL)
  assert.match(html, />COASTAL CARS<\/div>/)
  assert.match(html, /background:#123456/)
  assert.match(html, /color:#FF8800/)
  assert.match(html, /Coastal Cars · Airport transfers from Southport · 07123 456789 · hello@coastal\.test · coastal\.test/)
  assert.match(html, /Private hire operator licence PHO1234/)
  assert.match(helpLine(COASTAL), /Call or WhatsApp 07123 456789\./)
})

test('emails: no template shows EV Exec details for another business', () => {
  for (const html of [...all(COASTAL), ...all(BARE), ...all(NO_BRAND)]) assert.doesNotMatch(html, LEAKS)
})

test('emails: a business with no number, licence or site leaves them out cleanly', () => {
  const html = emailShell('T', 'body', BARE)
  assert.doesNotMatch(html, /licence|undefined|null|tel:/i)
  assert.equal(helpLine(BARE), '')
  assert.match(html, /Bare Business<\/td>/)
})

test('emails: EV Exec\'s own row still gives its header, number and licence', () => {
  const ev = brandFromRow({
    name: 'EV Exec', contact_email: 'book@evexec.co.uk', contact_phone: '07721070370',
    brand: { licence: 'PHO0079', site_url: 'https://www.evexec.co.uk', tagline: 'Premium airport transfers from Blackpool & the Fylde Coast' },
  })
  const html = reminderEmail({ ...base, type: '24h', brand: ev }).html
  assert.match(html, />EV EXEC<\/div>/)
  assert.match(html, /EV Exec · Premium airport transfers from Blackpool &amp; the Fylde Coast · 07721 070370 · book@evexec\.co\.uk · www\.evexec\.co\.uk/)
  assert.match(html, /Private hire operator licence PHO0079/)
})

test('emails: text from the business row is escaped', () => {
  const html = emailShell('T', 'x', brandFromRow({ name: 'A <b>&"B', brand: {} }))
  assert.doesNotMatch(html, /<b>/)
  assert.match(html, /A &lt;B&gt;&amp;&quot;B/)
})

test('loadBrand: caches a minute, keeps the last good copy in an outage, never invents one', async () => {
  _clearBrandCache()
  let calls = 0; let mode: 'ok' | 'throw' | 'empty' = 'ok'
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      calls++
      if (mode === 'throw') throw new Error('down')
      return { data: mode === 'ok' ? { name: 'Coastal Cars', contact_phone: '07123456789' } : null }
    } }) }) }),
  }
  assert.equal((await loadBrand(client, 't1')).name, 'Coastal Cars')
  await loadBrand(client, 't1')
  assert.equal(calls, 1)
  assert.equal(await loadBrand(client, null), NO_BRAND)
  mode = 'throw'
  _clearBrandCache()
  assert.equal(await loadBrand(client, 't2'), NO_BRAND)
})
