import { prisma } from '@/lib/prisma'
import type { UtilisateurAutorise } from '@/server/authz'
import { datesLimites, statutsAvecEcheance } from '../dossier/delais'
import { perimetreDossiers } from '../dossier/liste'
import type { StatutCode } from '../dossier/statuts'

/**
 * Ce qui appelle une action, par opposition à ce qui se compte.
 *
 * Le tableau de bord affichait quatre taux et trois répartitions — de quoi décrire ce qui s'est
 * passé, rien pour décider quoi faire ce matin. Sur la base réelle il montrait « taux de clôture
 * 0 % », « délai moyen — », « actions en retard 0 », « investigations à valider 0 » : quatre cases
 * vides, alors que cinq déclarations attendaient sans destinataire et que le calcul d'échéance
 * n'était simplement pas fait.
 *
 * Les deux chiffres qui manquaient sont ici.
 */

export type ADTraiter = {
  /** Dossiers dont l'échéance d'étape est dépassée, dans le périmètre de l'utilisateur. */
  readonly enRetard: number
  /** Reçus sans aucun destinataire actif : personne ne les traite, et personne ne le sait. */
  readonly nonAffectes: number
  /** Parmi ceux qui lui sont affectés, ceux dont l'échéance est dépassée. */
  readonly miensEnRetard: number
  /** Ses affectations actives parmi les dossiers OUVERTS et suivis — pas son historique. */
  readonly miens: number
}

/**
 * ⚠️ Borné aux dossiers OUVERTS dont l'étape est suivie.
 *
 * Le calcul d'échéance lit `historique_statuts` : le restreindre est ce qui rend l'opération
 * tenable sur la page la plus visitée. Un dossier clos ou dans une étape sans délai n'aurait de
 * toute façon aucune échéance courante — la borne ne cache donc rien qu'on voudrait voir.
 */
export async function aTraiter(u: UtilisateurAutorise): Promise<ADTraiter> {
  // Lue à la source, jamais recopiée : une liste écrite ici en doublon a déjà cessé d'être vraie
  // le jour où « reçu » est devenu une étape suivie, et le tableau de bord annonçait alors moins
  // de retards qu'il n'y en avait.
  const statutsSuivis = statutsAvecEcheance()

  const perimetre = perimetreDossiers(u)

  const [ouverts, nonAffectes] = await Promise.all([
    prisma.dossiers.findMany({
      where: {
        AND: [perimetre, { statuts_dossier: { code: { in: [...statutsSuivis] } } }],
      },
      select: {
        id: true,
        parcours_id: true,
        statuts_dossier: { select: { code: true } },
        dossier_affectations: {
          where: { user_id: u.id, actif: true },
          select: { id: true },
          take: 1,
        },
      },
    }),

    // « Reçu » sans destinataire actif : l'affectation automatique n'a trouvé aucun compte portant
    // le rôle de captage du parcours (EX-GES-02). Le dossier existe, personne ne l'a.
    prisma.dossiers.count({
      where: {
        AND: [
          perimetre,
          { statuts_dossier: { code: 'recu' } },
          { dossier_affectations: { none: { actif: true } } },
        ],
      },
    }),
  ])

  const limites = await datesLimites(
    ouverts.map((d) => ({
      id: d.id,
      statutCode: d.statuts_dossier.code as StatutCode,
      parcoursId: d.parcours_id,
    }))
  )

  const maintenant = Date.now()
  let enRetard = 0
  let miensEnRetard = 0
  let miens = 0

  for (const dossier of ouverts) {
    const aMoi = dossier.dossier_affectations.length > 0
    if (aMoi) miens += 1

    const limite = limites.get(dossier.id)
    if (!limite || limite.getTime() >= maintenant) continue

    enRetard += 1
    if (aMoi) miensEnRetard += 1
  }

  return { enRetard, nonAffectes, miensEnRetard, miens }
}

/**
 * Aperçu borné par construction (les affectations d'un seul compte) : pas de risque de N+1.
 *
 * ⚠️ Le PÉRIMÈTRE s'applique ici comme partout ailleurs, et pas seulement l'affectation.
 *
 * Cet aperçu ne regardait que `dossier_affectations`, sans vérifier aucun droit. L'administrateur
 * digital, à qui DT-02 refuse délibérément tout accès aux déclarations, se voyait ainsi présenter
 * la référence, la catégorie et le statut de deux dossiers qui lui avaient été affectés — sur un
 * écran d'où la liste et la fiche, elles, lui étaient bien refusées. Chaque ligne menait de
 * surcroît vers une page qui répondait « introuvable ».
 *
 * La même clause que la liste des dossiers, donc : ce que cet aperçu montre est exactement ce que
 * `/dossiers` montrerait.
 */
export async function dossiersATraiter(utilisateur: UtilisateurAutorise) {
  return prisma.dossiers.findMany({
    where: {
      AND: [
        perimetreDossiers(utilisateur),
        { dossier_affectations: { some: { user_id: utilisateur.id, actif: true } } },
      ],
    },
    orderBy: { updated_at: 'desc' },
    take: 5,
    select: {
      id: true,
      reference: true,
      categories: { select: { libelle: true } },
      statuts_dossier: { select: { libelle_interne: true } },
    },
  })
}
