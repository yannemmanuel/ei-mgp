import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  identifiantUtilisateurAuth,
  journaliserConnexion,
  journaliserDeconnexion,
  journaliserEchecConnexion,
} from '../audit-authentification'

const idsCrees: bigint[] = []

afterAll(async () => {
  if (idsCrees.length > 0) await prisma.audit_logs.deleteMany({ where: { id: { in: idsCrees } } })
  await prisma.$disconnect()
})

async function derniere(action: string) {
  return prisma.audit_logs.findFirstOrThrow({ where: { action }, orderBy: { id: 'desc' } })
}

describe('Piste d’audit de l’authentification', () => {
  it('consigne l’ouverture et la fermeture de session sur le compte', async () => {
    const utilisateur = await prisma.users.findFirstOrThrow({ select: { id: true } })

    await journaliserConnexion(utilisateur.id)
    const connexion = await derniere('auth.connexion')
    idsCrees.push(connexion.id)

    await journaliserDeconnexion(utilisateur.id)
    const deconnexion = await derniere('auth.deconnexion')
    idsCrees.push(deconnexion.id)

    for (const ligne of [connexion, deconnexion]) {
      expect(ligne.user_id).toBe(utilisateur.id)
      expect(ligne.auditable_type).toBe('user')
      expect(ligne.auditable_id).toBe(String(utilisateur.id))
    }
  })

  it('consigne un refus sans conserver l’adresse ni aucun secret', async () => {
    const email = 'Personne.Sensible@Sodeci.ci'
    await journaliserEchecConnexion(email, 'identifiants_invalides')

    const ligne = await derniere('auth.tentative_echouee')
    idsCrees.push(ligne.id)
    const contenu = JSON.stringify(ligne.new_values)

    expect(contenu).toContain('identifiants_invalides')
    expect(contenu).not.toContain(email)
    expect(contenu).not.toContain(email.toLowerCase())
    expect(contenu).toMatch(/[a-f0-9]{64}/)
    expect(ligne.user_id).toBeNull()
  })

  it('n’interprète comme compte qu’un identifiant numérique Auth.js valide', () => {
    expect(identifiantUtilisateurAuth('42')).toBe(42n)
    expect(identifiantUtilisateurAuth(undefined)).toBeNull()
    expect(identifiantUtilisateurAuth('42x')).toBeNull()
    expect(identifiantUtilisateurAuth(-1)).toBeNull()
  })
})
