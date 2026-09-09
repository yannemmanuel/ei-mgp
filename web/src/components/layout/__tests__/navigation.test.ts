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

describe('Le sommaire de l’administration ne propose pas d’impasse', () => {
  /**
   * Le lien et la garde doivent s'ouvrir sur EXACTEMENT les mêmes rôles.
   *
   * `/administration` n'exigeait aucune permission : la barre masquait bien le lien, mais
   * l'adresse tapée à la main répondait 200 à n'importe quel compte connecté. Le lien et la garde
   * étant maintenant tous deux dérivés des permissions des consoles, ce cas vérifie qu'ils ne
   * divergent pas — dans un sens comme dans l'autre, un lien proposé sans accès étant un défaut
   * d'interface, et un accès sans lien un défaut de découvrabilité.
   */
  it('s’ouvre aux mêmes rôles que le lien qui y mène', async () => {
    const source = await import('node:fs/promises')
    const page = await source.readFile('src/app/(app)/administration/page.tsx', 'utf8')

    const requises = [...page.matchAll(/permission: '([a-z.]+)'/g)].map((m) => m[1])
    expect(requises.length, 'aucune permission lue : la lecture a échoué').toBeGreaterThan(5)

    for (const role of Object.keys(ROLES) as Role[]) {
      const utilisateur = utilisateurAvecRoles(role)

      const lien = navigationPour(utilisateur)
        .flatMap((section) => section.liens)
        .some((l) => l.href === '/administration')

      const garde = requises.some((permission) =>
        utilisateur.permissions.has(permission as Parameters<typeof utilisateur.permissions.has>[0])
      )

      expect(lien, `${role} : le lien et la garde ne s’accordent pas`).toBe(garde)
    }
  })

  it('chaque console listée a bien sa page', async () => {
    // Même défaut que pour la barre latérale, à un autre endroit : le sommaire de
    // `/administration` porte ses propres liens, qu'aucun test ne reliait à l'arborescence. Deux
    // consoles viennent d'y être fusionnées — l'occasion de fermer aussi cette porte.
    const source = await import('node:fs/promises')
    const page = await source.readFile('src/app/(app)/administration/page.tsx', 'utf8')

    const destinations = [...page.matchAll(/href: '(\/administration\/[a-z-]+)'/g)].map((m) => m[1])

    expect(destinations.length, 'aucune console listée : la lecture a échoué').toBeGreaterThan(5)

    for (const href of destinations) {
      const chemin = join(RACINE, href.replace(/^\//, ''), 'page.tsx')
      expect(existsSync(chemin), `« ${href} » n’a pas de page`).toBe(true)
    }
  })
})
