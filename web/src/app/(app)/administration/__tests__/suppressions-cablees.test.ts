import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Toute action de suppression est APPELÉE par un écran.
 *
 * ⚠️ Le moteur a existé une journée entière sans qu'aucun bouton ne l'appelle : huit services
 * écrits, testés, exposés en Server Actions — et rien dans l'interface. Le code était juste, la
 * fonctionnalité absente, et rien ne le signalait. C'est le genre d'écart qu'aucun test unitaire
 * ne voit, chacun vérifiant sa moitié.
 *
 * Le contrôle est fait sur la SOURCE : ces écrans sont des composants serveur et clients, et les
 * rendre hors requête exigerait un décor qui ne prouverait rien de plus.
 */
const ADMIN = join(process.cwd(), 'src', 'app', '(app)', 'administration')

function sources(depuis: string): string[] {
  const trouves: string[] = []

  for (const entree of readdirSync(depuis)) {
    const chemin = join(depuis, entree)

    if (statSync(chemin).isDirectory()) {
      if (entree === '__tests__') continue
      trouves.push(...sources(chemin))
    } else if (entree.endsWith('.tsx')) {
      trouves.push(chemin)
    }
  }

  return trouves
}

describe('Le moteur de suppression est branché', () => {
  it('⚠️ chaque action exportée est appelée par au moins un écran', () => {
    const actions = readFileSync(join(ADMIN, 'suppressions-actions.ts'), 'utf8')
    const exportees = [...actions.matchAll(/export const (actionSupprimer\w+)/g)].map((m) => m[1])

    expect(exportees.length, 'aucune action trouvée : la lecture a échoué').toBeGreaterThan(5)

    const ecrans = sources(ADMIN)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')

    const orphelines = exportees.filter((nom) => !ecrans.includes(nom))

    expect(
      orphelines,
      `exposées mais appelées nulle part : ${orphelines.join(', ')}`
    ).toEqual([])
  })

  it('demande confirmation plutôt que d’effacer au premier clic', () => {
    /*
      Une suppression ne s'annule pas. La seule chose qui la rattrape est de ne pas l'avoir
      déclenchée par mégarde sur la ligne d'à côté — d'où deux gestes, et un libellé qui NOMME ce
      qui va disparaître.
    */
    const bouton = readFileSync(join(ADMIN, 'bouton-supprimer.tsx'), 'utf8')

    expect(bouton, 'le bouton efface au premier clic').toContain('arme')
    expect(bouton, 'la confirmation ne nomme pas ce qui disparaît').toContain('Supprimer « {nom} »')
  })

  it('⚠️ affiche le motif du refus, qui porte la moitié utile', () => {
    // Le refus nomme ce qui cite la ligne — « 30 dossiers » — et renvoie vers la désactivation.
    // L'avaler laisserait l'administrateur devant un bouton qui ne fait rien.
    const bouton = readFileSync(join(ADMIN, 'bouton-supprimer.tsx'), 'utf8')

    expect(bouton).toContain('etat.erreur')
  })
})
