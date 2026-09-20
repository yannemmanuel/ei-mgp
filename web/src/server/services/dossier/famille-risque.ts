import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from './workflow'

/**
 * Famille de risque d'une déclaration — posée PENDANT le traitement.
 *
 * ⚠️ À ne pas confondre avec la catégorie. La catégorie dit de quoi parle la déclaration, choisie
 * au dépôt, dans les mots du déclarant. La famille de risque dit à quoi elle se rattache une fois
 * instruite : c'est une lecture de traitant, et elle n'a de sens qu'après analyse.
 *
 * Confondre les deux reviendrait à demander au déclarant de qualifier lui-même son signalement,
 * ce qu'il n'est pas en mesure de faire — et ce que le dispositif n'a pas à lui demander.
 */

export type FamilleRisque = {
  readonly id: bigint
  readonly libelle: string
}

/** Familles proposées au traitement — les actives, dans l'ordre du référentiel. */
export async function famillesRisqueActives(): Promise<FamilleRisque[]> {
  const lignes = await prisma.familles_risque.findMany({
    where: { actif: true },
    orderBy: { ordre: 'asc' },
    select: { id: true, libelle: true },
  })

  return lignes
}

/**
 * Pose ou retire la famille de risque d'un dossier.
 *
 * ⚠️ `familleId` à `null` RETIRE la qualification, et c'est voulu : une famille posée par erreur
 * doit pouvoir être défaite. Sans cela, la seule issue serait d'en choisir une autre, également
 * fausse.
 *
 * ⚠️ UNE FAMILLE DÉSACTIVÉE NE PEUT PLUS ÊTRE POSÉE, mais les dossiers qui la portent la gardent.
 * C'est la règle de tous les référentiels ici : désactiver retire du CHOIX, jamais du passé.
 */
export async function qualifierFamilleRisque(params: {
  dossierId: string
  familleId: bigint | null
}): Promise<void> {
  if (params.familleId !== null) {
    const famille = await prisma.familles_risque.findUnique({
      where: { id: params.familleId },
      select: { actif: true },
    })

    if (!famille) {
      throw new ErreurWorkflow('Famille de risque inconnue.')
    }

    if (!famille.actif) {
      throw new ErreurWorkflow(
        'Cette famille de risque est désactivée : elle n’est plus proposée. Choisissez-en une autre.'
      )
    }
  }

  await prisma.dossiers.update({
    where: { id: params.dossierId },
    data: { famille_risque_id: params.familleId, updated_at: new Date() },
  })
}
