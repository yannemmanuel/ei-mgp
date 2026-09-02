'use server'

import { signOut } from '@/server/auth'

export async function seDeconnecter() {
  await signOut({ redirectTo: '/login' })
}
