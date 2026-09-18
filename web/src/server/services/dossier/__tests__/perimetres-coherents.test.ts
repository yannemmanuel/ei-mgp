import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { chargerUtilisateurAutorise } from '@/server/authz'
import { perimetreDossiers } from '../liste'
import { perimetreInvestigations } from '../../investigation/liste'
import { perimetreActions } from '../../action-corrective/liste'

/**
 * ⚠️ TOUT DOSSIER QU'UNE LISTE AFFICHE DOIT ÊTRE OUVRABLE.
 *
 * Les listes transverses — investigations, actions correctives — affichent la RÉFÉRENCE du
 * dossier, sa catégorie et le nom de l'enquêteur, et chaque ligne est un lien vers la fiche. Si
 * leur périmètre est plus large que celui de la fiche, deux choses se produisent à la fois :
 *
 *   1. l'utilisateur clique et tombe sur « Page introuvable », sans comprendre pourquoi une ligne
 *      qu'on vient de lui montrer n'existe plus ;
 *   2. et surtout, la ligne elle-même lui a déjà divulgué des informations d'un dossier qu'il n'a
 *      pas le droit de lire — ce que le cloisonnement est censé empêcher.
 *
 * Le second point est le grave. Le premier n'en est que le symptôme visible.
 *
 * Ce cas croise les périmètres SQL RÉELS, sur les comptes RÉELS de la base : c'est la seule
 * façon de voir un écart que des utilisateurs fabriqués masqueraient.
 */

/** Les identifiants de dossiers qu'un périmètre laisse effectivement passer. */
async function dossiersDe(where: Parameters<typeof prisma.dossiers.findMany>[0]): Promise<Set<string>> {
  const lignes = await prisma.dossiers.findMany({ ...where, select: { id: true } })
  return new Set(lignes.map((d) => d.id))
}

describe('⚠️ Cohérence des périmètres entre les listes et la fiche', () => {
  it('ne laisse aucune liste montrer un dossier que la fiche refuserait', async () => {
    const comptes = await prisma.users.findMany({
      where: { actif: true },
      select: { id: true, name: true, email: true },
    })

    expect(comptes.length, 'aucun compte actif : le cas ne prouverait rien').toBeGreaterThan(0)

    const ecarts: string[] = []
    let comptesExamines = 0

    for (const compte of comptes) {
      const utilisateur = await chargerUtilisateurAutorise(compte.id)
      if (!utilisateur) continue

      // Un compte sans aucun droit de lecture ne verra rien nulle part : il ne prouve rien.
      const surLaFiche = await dossiersDe({ where: perimetreDossiers(utilisateur) })
      const parLesInvestigations = await dossiersDe({
        where: { investigations: { some: perimetreInvestigations(utilisateur) } },
      })
      const parLesActions = await dossiersDe({
        where: { actions_correctives: { some: perimetreActions(utilisateur) } },
      })

      if (parLesInvestigations.size === 0 && parLesActions.size === 0) continue
      comptesExamines++

      for (const [liste, vus] of [
        ['investigations', parLesInvestigations],
        ['actions correctives', parLesActions],
      ] as const) {
        const horsPortee = [...vus].filter((id) => !surLaFiche.has(id))

        if (horsPortee.length > 0) {
          const references = await prisma.dossiers.findMany({
            where: { id: { in: horsPortee.slice(0, 3) } },
            select: { reference: true },
          })
          ecarts.push(
            `${compte.name} <${compte.email}> : la liste « ${liste} » montre ${horsPortee.length} dossier(s) ` +
              `que sa fiche refuse (${references.map((r) => r.reference).join(', ')})`
          )
        }
      }
    }

    expect(
      comptesExamines,
      'aucun compte ne voit d’investigation ni d’action : le cas ne prouverait rien'
    ).toBeGreaterThan(0)

    expect(ecarts, `écarts de périmètre :\n  ${ecarts.join('\n  ')}`).toEqual([])
  })
})
