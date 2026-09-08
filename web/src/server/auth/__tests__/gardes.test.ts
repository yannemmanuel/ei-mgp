import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Toute page du back-office revérifie côté serveur, et toute Server Action aussi.
 *
 * C'est le principe qui commande l'architecture (`ARCHITECTURE.md` §1) et il ne tenait qu'à la
 * vigilance : `acces-refuse/page.tsx` lisait la base sans aucune vérification, protégé du seul
 * `proxy.ts` — dont l'en-tête dit pourtant en toutes lettres qu'il n'est PAS un contrôle d'accès.
 * Personne ne l'avait vu parce que rien ne le regardait.
 *
 * Ces cas lisent le source : un layout et une page ne s'appellent pas hors requête HTTP.
 */
const RACINE = join(process.cwd(), 'src', 'app')

const GARDES = ['exigerUtilisateur', 'exigerPermission']

function fichiers(depuis: string, nom: string): string[] {
  const trouves: string[] = []

  for (const entree of readdirSync(depuis)) {
    const chemin = join(depuis, entree)

    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiers(chemin, nom))
    } else if (entree === nom) {
      trouves.push(chemin)
    }
  }

  return trouves
}

const relatif = (chemin: string) => chemin.slice(RACINE.length + 1).split('\\').join('/')

describe('Chaque page du back-office revérifie', () => {
  it('appelle une garde serveur, sans exception', () => {
    const pages = fichiers(join(RACINE, '(app)'), 'page.tsx')

    expect(pages.length, 'aucune page trouvée : la lecture a échoué').toBeGreaterThan(10)

    for (const page of pages) {
      const source = readFileSync(page, 'utf8')

      expect(
        GARDES.some((garde) => source.includes(garde)),
        `« ${relatif(page)} » n’appelle ni ${GARDES.join(' ni ')}`
      ).toBe(true)
    }
  })
})

describe('Chaque Server Action revérifie', () => {
  /**
   * Quatre modules publics par nature, chacun avec sa propre authentification — plus stricte que
   * la session pour deux d'entre eux. Les nommer un par un force à justifier tout nouvel entrant.
   */
  const PUBLICS: Record<string, string> = {
    '(auth)/login/actions.ts': 'la connexion elle-même',
    '(app)/actions.ts': 'la déconnexion seule, qui n’exige rien',
    '(public)/declarer/[parcours]/actions.ts': 'dépôt public — anti-spam et limitation de débit',
    '(public)/suivi/actions.ts': 'référence + code d’accès, vérifiés à temps constant',
    '(public)/suivi/messagerie-actions.ts': 'cookie signé de suivi + limitation de débit',
  }

  it('appelle une garde, ou figure dans la liste des entrées publiques', () => {
    const modules = fichiers(RACINE, 'actions.ts').concat(fichiers(RACINE, 'messagerie-actions.ts'))
    const gardesEtendues = [...GARDES, 'utilisateurCourant', 'acteurAutorise']

    for (const chemin of modules) {
      const source = readFileSync(chemin, 'utf8')
      if (!source.includes("'use server'")) continue

      const nom = relatif(chemin)
      if (nom in PUBLICS) continue

      expect(
        gardesEtendues.some((garde) => source.includes(garde)),
        `« ${nom} » ne revérifie rien et n’est pas déclaré public`
      ).toBe(true)
    }
  })

  it('ne déclare public que ce qui l’est réellement', () => {
    // Une entrée qui disparaîtrait de l'arborescence sans quitter cette liste y ouvrirait une
    // dispense silencieuse pour un futur fichier du même nom.
    for (const nom of Object.keys(PUBLICS)) {
      const source = readFileSync(join(RACINE, ...nom.split('/')), 'utf8')

      expect(source.includes("'use server'"), `« ${nom} » n’est plus une Server Action`).toBe(true)
    }
  })
})
