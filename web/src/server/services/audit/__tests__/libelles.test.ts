import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { libelleAction, libelleObjet } from '../libelles'

/**
 * Le journal d'audit affichait ses codes bruts — `role.permissions_modifiees`, `App\Models\User`.
 *
 * Les traduire ne doit RIEN retirer : le journal est la pièce à produire quand on cherche ce qui
 * s'est passé, et une ligne qu'on ne sait pas nommer doit rester lisible et identifiable. Le
 * risque de cette traduction n'est pas de mal nommer, c'est de faire disparaître.
 */
describe('Libellés du journal d’audit', () => {
  it('nomme chaque action réellement présente en base', async () => {
    const codes = await prisma.audit_logs.findMany({
      distinct: ['action'],
      select: { action: true },
    })

    expect(codes.length, 'journal vide : le cas ne prouverait rien').toBeGreaterThan(0)

    const bruts = codes.map((c) => c.action).filter((code) => libelleAction(code) === code)

    expect(bruts, 'ces actions s’affichent encore avec leur code technique').toEqual([])
  })

  it('nomme chaque type d’objet réellement présent en base', async () => {
    const types = await prisma.audit_logs.findMany({
      distinct: ['auditable_type'],
      select: { auditable_type: true },
    })

    const bruts = types
      .map((t) => t.auditable_type)
      .filter((type): type is string => type !== null)
      .filter((type) => libelleObjet(type) === type)

    expect(bruts, 'ces objets s’affichent encore avec leur nom de classe').toEqual([])
  })

  it('rend le code brut plutôt que rien quand il ne sait pas traduire', () => {
    // Une action ajoutée ailleurs dans le code, sans entrée ici : elle doit rester VISIBLE.
    expect(libelleAction('marmotte.emballee')).toBe('marmotte.emballee')
    expect(libelleAction('sans_point')).toBe('sans_point')
    expect(libelleAction('')).toBe('')

    expect(libelleObjet(String.raw`App\Models\Marmotte`)).toBe('Marmotte')
    expect(libelleObjet('Marmotte')).toBe('Marmotte')
  })

  it('traduit sans perdre l’objet visé ni l’acte commis', () => {
    expect(libelleAction('role.permissions_modifiees')).toBe('Rôle — droits modifiés')
    expect(libelleAction('user.mot_de_passe_regenere')).toBe('Compte — mot de passe réattribué')
    expect(libelleAction('dossier.anonymise')).toBe('Dossier anonymisé')
    expect(libelleObjet(String.raw`App\Models\User`)).toBe('Compte')
  })
})
