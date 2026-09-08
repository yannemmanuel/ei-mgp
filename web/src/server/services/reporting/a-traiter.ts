import { prisma } from '@/lib/prisma'
import type { UtilisateurAutorise } from '@/server/authz'
import { datesLimites, etapesSuivies, etapeActuelle } from '../dossier/delais'
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
  const suivis = [...etapesSuivies()]
  const statutsSuivis = (
    ['affecte', 'en_analyse', 'en_investigation', 'en_attente_information', 'action_corrective_en_cours', 'resolu'] as const
  ).filter((statut) => {
    const etape = etapeActuelle(statut)
    return etape !== null && suivis.includes(etape)
  })

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
