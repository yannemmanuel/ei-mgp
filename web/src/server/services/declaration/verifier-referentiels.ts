import { prisma } from '@/lib/prisma'
import type { Champ } from './parcours-config'

/**
 * Confronte les valeurs choisies dans une liste administrable au référentiel réel.
 *
 * ⚠️ Sans ce contrôle, le formulaire ne prouverait rien. Poste, lieu, ville et tranche
 * d'ancienneté sont transmis en clair — c'est voulu, pour que renommer un référentiel ne réécrive
 * pas rétroactivement ce qu'un déclarant a choisi — mais une chaîne libre acceptée telle quelle
 * laisserait n'importe quelle requête forgée écrire n'importe quoi dans ces colonnes. Le
 * formulaire public est la surface d'abus la plus large de l'application : ce qui vient de lui
 * n'est jamais cru sur parole.
 *
 * Le poste est vérifié AVEC sa direction : un poste réel mais rattaché à une autre direction est
 * refusé, sans quoi la cascade n'aurait de sens que pour qui la respecte.
 */
export async function verifierReferentiels(
  champs: readonly Champ[],
  valeurs: Record<string, unknown>
): Promise<Record<string, string> | null> {
  const erreurs: Record<string, string> = {}

  for (const champ of champs) {
    if (champ.referentiel === undefined || champ.referentiel === 'directions') continue

    const valeur = valeurs[champ.nom]
    if (valeur === undefined || valeur === '') continue

    const libelle = String(valeur)
    const connue = await estDansLeReferentiel(champ, libelle, valeurs)

    if (!connue) {
      erreurs[champ.nom] = `« ${champ.libelle} » ne correspond à aucune valeur proposée.`
    }
  }

  return Object.keys(erreurs).length > 0 ? erreurs : null
}

async function estDansLeReferentiel(
  champ: Champ,
  libelle: string,
  valeurs: Record<string, unknown>
): Promise<boolean> {
  if (champ.referentiel === 'postes') {
    const direction = champ.dependDe ? valeurs[champ.dependDe] : undefined
    if (direction === undefined || direction === '') return false

    const compte = await prisma.postes.count({
      where: { libelle, actif: true, direction_id: BigInt(String(direction)) },
    })

    return compte > 0
  }

  if (champ.referentiel === 'lieux') {
    return (await prisma.lieux.count({ where: { libelle, actif: true } })) > 0
  }

  if (champ.referentiel === 'villes') {
    return (await prisma.villes.count({ where: { libelle, actif: true } })) > 0
  }

  return (await prisma.tranches_anciennete.count({ where: { libelle, actif: true } })) > 0
}
