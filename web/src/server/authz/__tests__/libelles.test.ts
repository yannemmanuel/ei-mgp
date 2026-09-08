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
