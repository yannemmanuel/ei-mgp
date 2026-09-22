import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * EX-REP-05 : historisation mensuelle agrégée et anonymisée — port de
 * `App\Services\Reporting\StatistiqueMensuelleService`.
 *
 * RG-12 : aucune colonne d'identité, aucune référence à un dossier individuel — uniquement des
 * compteurs et des moyennes par combinaison parcours × catégorie × gravité. C'est ce qui autorise
 * une conservation sans limite de durée, là où les dossiers eux-mêmes sont soumis à RG-11.
 *
 * **Jamais de `upsert`.** Une ligne déjà calculée pour une période n'est plus jamais modifiée :
 * un nouvel appel sur un mois déjà traité est un non-évènement silencieux, pas une correction
 * implicite d'une valeur déjà publiée. Une correction éventuelle passerait par une décision
 * explicite, jamais par ce service.
 */

const CODES_RESOLUS = ['resolu', 'cloture']

export type ResultatCalcul = {
  /** Lignes réellement créées. 0 signifie « période déjà entièrement archivée ». */
  creees: number
  ignorees: number
}

export async function calculerPour(mois: Date): Promise<ResultatCalcul> {
  const debut = new Date(Date.UTC(mois.getUTCFullYear(), mois.getUTCMonth(), 1, 0, 0, 0, 0))
  const finExclue = new Date(Date.UTC(mois.getUTCFullYear(), mois.getUTCMonth() + 1, 1, 0, 0, 0, 0))

  const combinaisons = await prisma.dossiers.groupBy({
    by: ['parcours_id', 'categorie_id', 'niveau_gravite_id'],
    where: { created_at: { gte: debut, lt: finExclue } },
  })

  let creees = 0
  let ignorees = 0

  for (const combinaison of combinaisons) {
    const cle = {
      periode: debut,
      parcours_id: combinaison.parcours_id,
      categorie_id: combinaison.categorie_id,
      niveau_gravite_id: combinaison.niveau_gravite_id,
    }

    const existe = await prisma.statistiques_mensuelles.findFirst({ where: cle, select: { id: true } })

    if (existe) {
      ignorees += 1
      continue
    }

    // Périmètre de cette combinaison sur le mois : la période est portée par `created_at`, pas
    // par la colonne `periode`, qui n'existe que sur la ligne archivée.
    const where = {
      parcours_id: combinaison.parcours_id,
      categorie_id: combinaison.categorie_id,
      niveau_gravite_id: combinaison.niveau_gravite_id,
      created_at: { gte: debut, lt: finExclue },
    }

    const [total, resolues, cloturees, delaiMoyen] = await Promise.all([
      prisma.dossiers.count({ where }),
      prisma.dossiers.count({ where: { ...where, statuts_dossier: { code: { in: CODES_RESOLUS } } } }),
      prisma.dossiers.count({ where: { ...where, statuts_dossier: { is_terminal: true } } }),
      delaiMoyenDe(where.parcours_id, where.categorie_id, where.niveau_gravite_id, debut, finExclue),
    ])

    await prisma.statistiques_mensuelles.create({
      data: {
        ...cle,
        nb_declarations: total,
        nb_resolues: resolues,
        nb_cloturees: cloturees,
        delai_moyen_jours: delaiMoyen,
        taux_resolution: total > 0 ? arrondir((resolues / total) * 100) : null,
        taux_cloture: total > 0 ? arrondir((cloturees / total) * 100) : null,
        created_at: new Date(),
      },
    })

    creees += 1
  }

  return { creees, ignorees }
}

/**
 * ⚠️ `niveauGraviteId` peut être NUL depuis que la gravité se qualifie au traitement (EI8).
 *
 * `= NULL` ne vaut jamais vrai en SQL : écrit ainsi, le délai moyen des dossiers non encore
 * qualifiés aurait toujours été vide, sans erreur ni signal. La comparaison est donc choisie
 * selon le cas, et non paramétrée.
 */
async function delaiMoyenDe(
  parcoursId: bigint,
  categorieId: bigint,
  niveauGraviteId: bigint | null,
  debut: Date,
  finExclue: Date
): Promise<number | null> {
  const surLaGravite =
    niveauGraviteId === null
      ? Prisma.sql`niveau_gravite_id IS NULL`
      : Prisma.sql`niveau_gravite_id = ${niveauGraviteId}`

  const lignes = await prisma.$queryRaw<{ moyenne: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (date_cloture - created_at)) / 86400) AS moyenne
    FROM dossiers
    WHERE date_cloture IS NOT NULL
      AND parcours_id = ${parcoursId}
      AND categorie_id = ${categorieId}
      AND ${surLaGravite}
      AND created_at >= ${debut}
      AND created_at < ${finExclue}
  `

  const moyenne = lignes[0]?.moyenne
  return moyenne == null ? null : arrondir(Number(moyenne))
}

export type LigneHistoriqueMensuel = {
  periode: string
  total: number
  cloturees: number
  delaiMoyen: number | null
  tauxResolution: number | null
}

/**
 * EX-REP-05 : les 12 derniers mois archivés, du plus récent au plus ancien.
 *
 * Agrège les lignes d'une même période (une par combinaison parcours × catégorie × gravité) en
 * une seule ligne mensuelle. `SUM` pour les volumes, `AVG` pour les taux et délais — moyenne non
 * pondérée ; le tableau de bord en reste l'unique consommateur.
 */
export async function historiqueMensuel(
  /**
   * Parcours que le lecteur a le droit de voir. `undefined` = aucune restriction.
   *
   * ⚠️ Les lignes archivées portent `parcours_id` : l'historique se cloisonne donc, exactement
   * comme les indicateurs du moment. Sans cela, un rôle restreint à un parcours lirait chaque
   * mois le total de tous les autres — et le tableau du bas contredirait silencieusement les
   * chiffres du haut.
   */
  parcoursDuLecteur?: readonly string[],
  /**
   * Le lecteur est-il borné à un site ou à une direction ?
   *
   * ⚠️ DANS CE CAS L'HISTORIQUE N'EST PAS RENDU, et c'est délibéré. `statistiques_mensuelles` est
   * un agrégat qui ne porte QUE `parcours_id` : ni site, ni direction. Il n'existe donc aucun
   * moyen d'y appliquer le cloisonnement par rattachement.
   *
   * Entre afficher à un lecteur cloisonné des totaux qui incluent les autres sites — en
   * contradiction avec tous les chiffres du haut de la page — et n'afficher rien, ne rien
   * afficher est le seul choix honnête. Rendre ce bloc exact demanderait d'ajouter le
   * rattachement à l'agrégat, ce qui se décide avec le métier.
   */
  cloisonneParRattachement = false,
  limite = 12
): Promise<LigneHistoriqueMensuel[]> {
  if (cloisonneParRattachement) return []

  const perimetre =
    parcoursDuLecteur === undefined
      ? Prisma.empty
      : parcoursDuLecteur.length === 0
        ? Prisma.sql`WHERE FALSE`
        : Prisma.sql`WHERE parcours_id IN (SELECT id FROM parcours WHERE code IN (${Prisma.join([...parcoursDuLecteur])}))`

  const lignes = await prisma.$queryRaw<
    {
      periode: Date
      total: bigint | null
      cloturees: bigint | null
      delai_moyen: number | null
      taux_resolution: number | null
    }[]
  >`
    SELECT periode,
           SUM(nb_declarations)   AS total,
           SUM(nb_cloturees)      AS cloturees,
           AVG(delai_moyen_jours) AS delai_moyen,
           AVG(taux_resolution)   AS taux_resolution
    FROM statistiques_mensuelles
    ${perimetre}
    GROUP BY periode
    ORDER BY periode DESC
    LIMIT ${limite}
  `

  return lignes.map((l) => ({
    periode: l.periode.toISOString().slice(0, 10),
    total: Number(l.total ?? 0),
    cloturees: Number(l.cloturees ?? 0),
    delaiMoyen: l.delai_moyen == null ? null : arrondir(Number(l.delai_moyen)),
    tauxResolution: l.taux_resolution == null ? null : arrondir(Number(l.taux_resolution)),
  }))
}

function arrondir(valeur: number): number {
  return Math.round(valeur * 100) / 100
}
