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
 *
 * ⚠️ ELLE NE S'APPLIQUE PLUS À TOUS LES TYPES depuis le 2026-09-21. L'évènement indésirable n'en
 * relève pas : sa nomenclature propre — catégorie au dépôt, gravité à la qualification — dit déjà
 * ce qu'il faut en savoir. Ce n'est PAS écrit dans le code : `parcours.familles_risque_actives` se
 * coche type par type dans `/administration/familles-risque`, pour que la décision se défasse sans
 * déploiement.
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

/** Ce type de déclaration demande-t-il une famille de risque à ses traitants ? */
export async function typeQualifieLaFamille(parcoursCode: string): Promise<boolean> {
  const parcours = await prisma.parcours.findFirst({
    where: { code: parcoursCode },
    select: { familles_risque_actives: true },
  })

  return parcours?.familles_risque_actives ?? false
}

/**
 * Familles proposées sur CE type de déclaration — vide si le type n'en relève pas.
 *
 * ⚠️ UNE LISTE VIDE FAIT DISPARAÎTRE LA CARTE de la fiche, et c'est exactement l'effet voulu : la
 * question ne se pose plus, plutôt que de se poser sans réponse possible. La fiche continue en
 * revanche d'AFFICHER la famille d'un dossier qui en porte une — décocher un type retire du choix
 * futur, jamais du passé, comme pour tous les référentiels ici.
 *
 * ⚠️ RATTACHÉES AU TYPE depuis le 2026-09-22, et c'est ce qui resserre la liste : un traitant de
 * grief communautaire ne voit plus les familles réservées aux salariés. Celles qui ne portent
 * AUCUN rattachement (`parcours_id` nul) restent proposées partout — « Autre » ou « Corruption et
 * fraude » relèvent réellement des quatre types, et les dupliquer quatre fois aurait rendu chaque
 * renommage quadruple.
 */
export async function famillesRisqueProposees(parcoursCode: string): Promise<FamilleRisque[]> {
  if (!(await typeQualifieLaFamille(parcoursCode))) return []

  const lignes = await prisma.familles_risque.findMany({
    where: {
      actif: true,
      OR: [{ parcours_id: null }, { parcours: { code: parcoursCode } }],
    },
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
 * ⚠️ LE RETRAIT RESTE POSSIBLE MÊME SUR UN TYPE QUI NE QUALIFIE PLUS. C'est la seule issue pour un
 * dossier qui portait une famille avant que son type ne soit décoché : l'interdire enfermerait la
 * donnée. Seule la POSE est refusée.
 *
 * ⚠️ UNE FAMILLE DÉSACTIVÉE NE PEUT PLUS ÊTRE POSÉE, mais les dossiers qui la portent la gardent.
 * C'est la règle de tous les référentiels ici : désactiver retire du CHOIX, jamais du passé.
 */
export async function qualifierFamilleRisque(params: {
  dossierId: string
  familleId: bigint | null
}): Promise<void> {
  if (params.familleId !== null) {
    /*
      ⚠️ LE TYPE DOIT EN RELEVER, et ce contrôle est ici — pas dans l'écran.

      La carte disparaît de la fiche quand le type ne qualifie pas de famille ; masquer un
      formulaire n'est pas une restriction. Une requête forgée poserait sinon une famille sur un
      évènement indésirable, que rien ensuite n'afficherait ni ne permettrait de défaire depuis
      l'écran — une donnée invisible et coincée.

      Lu sur le DOSSIER, et non reçu en paramètre : l'appelant pourrait se tromper de type, et
      c'est précisément ce que la garde doit empêcher.
    */
    const dossier = await prisma.dossiers.findUnique({
      where: { id: params.dossierId },
      select: { parcours: { select: { code: true, libelle: true, familles_risque_actives: true } } },
    })

    if (!dossier) {
      throw new ErreurWorkflow('Dossier inconnu.')
    }

    if (!dossier.parcours.familles_risque_actives) {
      throw new ErreurWorkflow(
        `« ${dossier.parcours.libelle} » ne relève pas des familles de risque. Ce réglage se change dans l’administration.`
      )
    }

    const famille = await prisma.familles_risque.findUnique({
      where: { id: params.familleId },
      select: { actif: true, libelle: true, parcours: { select: { code: true, libelle: true } } },
    })

    if (!famille) {
      throw new ErreurWorkflow('Famille de risque inconnue.')
    }

    if (!famille.actif) {
      throw new ErreurWorkflow(
        'Cette famille de risque est désactivée : elle n’est plus proposée. Choisissez-en une autre.'
      )
    }

    /*
      ⚠️ ET ELLE DOIT RELEVER DE CE TYPE — second verrou, ajouté avec le rattachement.

      La liste affichée sur la fiche est déjà filtrée ; la filtrer ne suffit pas. Une requête
      forgée — ou un formulaire resté ouvert pendant qu'un administrateur rattachait la famille à
      un autre type — poserait sinon sur un grief communautaire une famille réservée aux salariés.
      Le dossier afficherait alors une qualification que sa propre liste ne propose pas, et que
      personne ne saurait d'où elle vient.

      Une famille SANS rattachement relève de tous les types : elle passe.
    */
    if (famille.parcours !== null && famille.parcours.code !== dossier.parcours.code) {
      throw new ErreurWorkflow(
        `« ${famille.libelle} » est réservée aux déclarations de type « ${famille.parcours.libelle} ».`
      )
    }
  }

  await prisma.dossiers.update({
    where: { id: params.dossierId },
    data: { famille_risque_id: params.familleId, updated_at: new Date() },
  })
}
