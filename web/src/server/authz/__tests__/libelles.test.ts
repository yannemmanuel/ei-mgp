import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '../permissions'
import { DOMAINES, LIBELLES, permissionsSansDomaine } from '../libelles'

/**
 * Lisibilité du catalogue d'habilitations.
 *
 * L'écran s'adresse à un DPO, un responsable métier, un auditeur. Une permission sans libellé s'y
 * afficherait sous son nom technique — et personne ne saurait ce qu'il coche. Ces cas garantissent
 * qu'aucune ne passe entre les mailles, y compris celles ajoutées plus tard.
 */
describe('Couverture du catalogue', () => {
  it('donne un libellé à CHAQUE permission', () => {
    for (const permission of PERMISSIONS) {
      expect(LIBELLES[permission], `permission « ${permission} »`).toBeDefined()
    }
  })

  it('ne décrit aucune permission qui n’existe pas', () => {
    // Une entrée orpheline signalerait une permission renommée ou retirée sans que la traduction
    // ait suivi — l'écran afficherait alors une ligne qui ne correspond à rien.
    for (const nom of Object.keys(LIBELLES)) {
      expect(PERMISSIONS, `libellé « ${nom} »`).toContain(nom)
    }
  })

  it('classe chaque permission dans un domaine, et un seul', () => {
    expect(permissionsSansDomaine()).toEqual([])

    const vues = new Set<string>()
    for (const domaine of DOMAINES) {
      for (const permission of domaine.permissions) {
        expect(vues.has(permission), `« ${permission} » apparaît deux fois`).toBe(false)
        vues.add(permission)
      }
    }

    expect(vues.size).toBe(PERMISSIONS.length)
  })
})

describe('Qualité des libellés', () => {
  it('énonce une action, pas un nom technique', () => {
    for (const [nom, libelle] of Object.entries(LIBELLES)) {
      // Un libellé qui reprend le point ou le tiret bas du nom technique n'a pas été traduit.
      expect(libelle.libelle, `« ${nom} »`).not.toMatch(/[._]/)
      expect(libelle.libelle.length, `« ${nom} »`).toBeGreaterThan(5)
      expect(libelle.explication.length, `« ${nom} »`).toBeGreaterThan(20)
    }
  })

  it('signale les permissions qui touchent aux données personnelles ou aux droits', () => {
    const sensibles = Object.entries(LIBELLES)
      .filter(([, l]) => l.sensibilite !== 'ordinaire')
      .map(([nom]) => nom)

    // Ces quatre-là exposent des identités ou décident de ce que les autres peuvent faire :
    // les accorder n'est jamais anodin, et l'écran doit le montrer.
    expect(sensibles).toContain('reporting.export.nominatif')
    expect(sensibles).toContain('rgpd.acces.view')
    expect(sensibles).toContain('roles.manage')
    expect(sensibles).toContain('users.manage')
  })
})

describe('Un droit affiché doit agir', () => {
  async function corpus(exclus: readonly string[]) {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')

    function sources(depuis: string): string[] {
      return readdirSync(depuis).flatMap((entree) => {
        const chemin = join(depuis, entree)
        if (statSync(chemin).isDirectory()) return sources(chemin)
        if (!/[.]tsx?$/.test(entree)) return []
        if (exclus.includes(entree)) return []
        if (chemin.includes('__tests__')) return []
        return [chemin]
      })
    }

    return sources(join(process.cwd(), 'src')).map((f) => readFileSync(f, 'utf8'))
  }

  it('chaque permission est consultée quelque part', async () => {
    // Une permission ajoutée au catalogue puis oubliée s'afficherait sur l'écran des
    // habilitations comme un droit qu'on accorde ou retire — sans que cela change rien.
    const fichiers = await corpus(['libelles.ts', 'permissions.ts', 'roles.ts'])
    const texte = fichiers.join(String.fromCharCode(10))

    for (const permission of PERMISSIONS) {
      if (LIBELLES[permission].sansEffet) continue

      expect(
        texte.includes(`'${permission}'`),
        `« ${permission} » n’est consultée nulle part : déclarez-la « sansEffet » ou câblez-la`
      ).toBe(true)
    }
  })

  it('recense les droits sans effet, pour qu’aucun ne s’ajoute en silence', () => {
    // Deux, et ils sont documentés. Un troisième qui apparaîtrait ferait échouer ce cas : ajouter
    // un droit décoratif doit être une décision, jamais une dérive.
    const sansEffet = PERMISSIONS.filter((p) => LIBELLES[p].sansEffet)

    expect(sansEffet.sort()).toEqual(['dossiers.assign', 'rgpd.acces.view'])
  })

  it('« dossiers.assign » reste sans appelant, comme la mention l’annonce', async () => {
    /**
     * Elle EST citée — par `peutAffecterDossier()` — mais cette policy n'est appelée par personne :
     * la première affectation est automatique (EX-GES-02) et les suivantes relèvent de
     * `dossiers.reassign`. Un droit cité par du code mort n'agit pas davantage qu'un droit absent.
     *
     * C'est donc l'absence d'appelant qu'il faut surveiller : le jour où un écran d'affectation
     * appellera cette policy, ce cas échouera — et rappellera de retirer la mention.
     */
    expect(LIBELLES['dossiers.assign'].sansEffet).toBe(true)

    const fichiers = await corpus(['dossier.ts'])
    const appels = fichiers.filter((f) => f.includes('peutAffecterDossier')).length

    expect(appels, '`peutAffecterDossier` a désormais un appelant : la mention est à retirer').toBe(0)
  })
})
