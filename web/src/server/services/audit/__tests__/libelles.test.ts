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

  it('nomme chaque action que le code sait écrire, pas seulement celles déjà en base', async () => {
    /*
      Les deux cas précédents ne voient que le passé. `role.active` et `role.desactive` étaient
      ainsi passés au travers : le code les écrit, aucune ligne n'existait encore, et le journal
      les aurait affichés en clair technique le jour où quelqu'un désactive un rôle.
    */
    const { readdir, readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')

    async function fichiers(racine: string): Promise<string[]> {
      const entrees = await readdir(racine, { withFileTypes: true })

      const listes = await Promise.all(
        entrees.map(async (e) => {
          const chemin = join(racine, e.name)
          if (e.isDirectory()) return e.name === '__tests__' ? [] : fichiers(chemin)
          return e.name.endsWith('.ts') ? [chemin] : []
        })
      )

      return listes.flat()
    }

    const sources = await fichiers(join(process.cwd(), 'src', 'server'))
    const emises = new Set<string>()

    for (const chemin of sources) {
      const source = await readFile(chemin, 'utf8')
      /*
        ⚠️ La valeur de `action:` n'est pas toujours un littéral.

        `changerActivationRole` écrit `action: actif ? 'role.active' : 'role.desactive'`. Une
        expression qui n'accepterait qu'un littéral collé à `action:` aurait laissé passer ces
        deux codes — les deux qui manquaient réellement. On lit donc la fin de ligne, puis on y
        cherche toutes les chaînes de la forme attendue.
      */
      for (const ligne of source.matchAll(/action:([^\n]*)/g)) {
        for (const code of ligne[1].matchAll(/'([a-z_]+\.[a-z_]+)'/g)) emises.add(code[1])
      }
    }

    expect(emises.size, 'aucune action lue : la lecture a échoué').toBeGreaterThan(10)

    const muettes = [...emises]
      .filter((code) => !code.startsWith('test.'))
      .filter((code) => libelleAction(code) === code)

    expect(muettes.sort(), 'ces actions s’afficheraient avec leur code technique').toEqual([])
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
