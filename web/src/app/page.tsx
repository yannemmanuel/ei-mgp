import { redirect } from 'next/navigation'
import { utilisateurCourant } from '@/server/auth'

/** Reproduit la racine de Laravel : /dashboard si authentifié, /login sinon. */
export default async function PageRacine() {
  redirect((await utilisateurCourant()) ? '/dashboard' : '/login')
}
