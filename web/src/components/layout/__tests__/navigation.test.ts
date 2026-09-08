import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { ROLES, type Role } from '@/server/authz/roles'
import { navigationPour, toutesLesDestinations } from '../navigation'

/**
 * Intégrité de la barre latérale.
 *
 * Ces cas naissent d'un défaut réel : la navigation a proposé pendant toute la migration quatre
 * liens vers `/investigations` et `/actions-correctives`, deux écrans qui n'avaient jamais été
 * portés. Les pages cibles répondaient 404, et rien ne le signalait — aucun test ne reliait ce
 * que la barre annonce à ce que l'application sert.
 */

const RACINE = join(process.cwd(), 'src', 'app', '(app)')

describe('Chaque destination existe', () => {
  it('correspond à une page réellement présente', () => {
    for (const href of toutesLesDestinations()) {
      const chemin = href.split('?')[0].replace(/^\//, '')
      const page = join(RACINE, chemin, 'page.tsx')

      expect(existsSync(page), `« ${href} » n’a pas de page (${page})`).toBe(true)
    }
  })

  it('ne propose jamais deux fois la même destination', () => {
    // Deux entrées vers le même chemin allument le repère d'écran courant sur les deux lignes à
    // la fois — la comparaison ignore la query string — et gonflent la barre sans rien ajouter.
    const chemins = toutesLesDestinations().map((href) => href.split('?')[0])

    expect(new Set(chemins).size).toBe(chemins.length)
  })
})

describe('Filtrage par permission', () => {
  it('n’expose à aucun rôle une destination qu’il ne peut pas ouvrir', () => {
    // Le masquage n'est PAS le contrôle d'accès — chaque page revérifie — mais proposer une
    // impasse reste un défaut d'interface.
    for (const role of Object.keys(ROLES) as Role[]) {
      const utilisateur = utilisateurAvecRoles(role)
      const liens = navigationPour(utilisateur).flatMap((section) => section.liens)

      for (const lien of liens) {
        const admis =
          lien.permissions.length === 0 ||
          lien.permissions.some((permission) => utilisateur.permissions.has(permission))

        expect(admis, `${role} se voit proposer « ${lien.libelle} »`).toBe(true)
      }
    }
  })

  it('laisse à tout compte au moins le tableau de bord', () => {
    // DT-31 : `/dashboard` est la page d'atterrissage de tous les comptes authentifiés. Un rôle
    // qui n'aurait aucune entrée arriverait sur une coquille vide après connexion.
    for (const role of Object.keys(ROLES) as Role[]) {
      const destinations = navigationPour(utilisateurAvecRoles(role))
        .flatMap((section) => section.liens)
        .map((lien) => lien.href)

      expect(destinations, `${role} n’a aucune entrée`).toContain('/dashboard')
    }
  })
})
