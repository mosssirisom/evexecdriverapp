'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Mock auth: accept any @evexec.co.uk email with any password,
  // or the demo credentials below.
  const valid =
    (email?.includes('@evexec.co.uk') && password?.length >= 6) ||
    (email === 'driver@evexec.com' && password === 'password')

  if (!valid) {
    return { error: 'Invalid credentials. Use your @evexec.co.uk account.' }
  }

  const cookieStore = await cookies()
  cookieStore.set('driver_token', 'mock_token_' + Date.now(), {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
  })

  redirect('/dashboard')
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('driver_token')
  redirect('/login')
}
