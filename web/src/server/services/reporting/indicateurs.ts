import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { clauseFiltre, type FiltreReporting } from './filtre'

/**
 * EX-REP-03 : indicateurs du tableau de bord — port de `App\Services\Reporting\IndicateurService`.
 *
 * Tout est agrégé par la base : `count`, `groupBy`, `AVG`. Jamais de chargement des dossiers en
 * mémoire pour les compter — c'est la seule approche qui reste praticable quel que soit le volume.
 *
 * Définitions retenues (DT-31, le CDC ne les formule pas) :
 * - **taux de résolution** = part des dossiers « Résolu » OU « Clôturé » — le problème est réglé,
 *   indépendamment de la formalité administrative ;
 * - **taux de clôture** = part des dossiers dans un statut TERMINAL (« Clôturé » ou « Rejeté ») —
 *   l'avancement administratif, indépendamment de l'issue.
 *
 * Un dossier rejeté compte donc dans le taux de clôture, jamais dans le taux de résolution.
 */

const CODES_RESOLUS = ['resolu', 'cloture'] as const

export async function nbDeclarations(filtre: FiltreReporting): Promise<number> {
  return prisma.dossiers.count({ where: clauseFiltre(filtre) })
}

/** `null` — et non 0 — si aucun dossier : un taux n'a pas de sens sur un ensemble vide. */
export async function tauxResolution(filtre: FiltreReporting): Promise<number | null> {
  const total = await nbDeclarations(filtre)
  if (total === 0) return null

  const resolus = await prisma.dossiers.count({
    where: { ...clauseFiltre(filtre), statuts_dossier: { code: { in: [...CODES_RESOLUS] } } },
  })

  return arrondir((resolus / total) * 100)
}

export async function tauxCloture(filtre: FiltreReporting): Promise<number | null> {
  const total = await nbDeclarations(filtre)
  if (total === 0) return null

  const clotures = await prisma.dossiers.count({
    where: { ...clauseFiltre(filtre), statuts_dossier: { is_terminal: true } },
  })

  return arrondir((clotures / total) * 100)
}

/**
 * Délai moyen en jours entre soumission et clôture effective.
 *
 * `date_cloture` n'est renseignée que par la clôture, jamais par le rejet : le filtre
 * `NOT NULL` exclut donc naturellement les dossiers rejetés et ceux encore en cours, sans
 * condition supplémentaire.
 *
 * Requête brute car aucune API d'agrégat de Prisma ne sait soustraire deux dates. Les valeurs du
 * filtre passent en PARAMÈTRES (`Prisma.sql`), jamais concaténées dans le texte SQL.
 */
export async function delaiMoyenJours(filtre: FiltreReporting): Promise<number | null> {
  const conditions = conditionsSql(filtre)

  const lignes = await prisma.$queryRaw<{ moyenne: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (date_cloture - created_at)) / 86400) AS moyenne
    FROM dossiers
    WHERE date_cloture IS NOT NULL
    ${conditions}
  `

  const moyenne = lignes[0]?.moyenne
  return moyenne == null ? null : arrondir(Number(moyenne))
}

/**
 * Conditions du filtre sous forme de fragments SQL paramétrés.
 *
 * `Prisma.sql` produit une requête préparée : les valeurs restent des paramètres liés, jamais du
 * texte interpolé. Les noms de colonnes, eux, sont des littéraux écrits ici — aucune entrée
 * utilisateur ne peut devenir un identifiant SQL.
 */
function conditionsSql(filtre: FiltreReporting): Prisma.Sql {
  const fragments: Prisma.Sql[] = []

  if (filtre.parcoursId != null) fragments.push(Prisma.sql`AND parcours_id = ${filtre.parcoursId}`)

  /*
    ⚠️ Le plafond du lecteur, ici aussi.

    `delaiMoyenJours` est la seule mesure qui n'emprunte pas `clauseFiltre` : elle passe par ce
    SQL brut. Poser le périmètre dans le filtre sans l'appliquer ici aurait cloisonné six
    indicateurs sur sept, et laissé le septième dire la vérité de tout le monde — l'écart
    n'aurait sauté aux yeux de personne.

    Sous-requête sur les CODES plutôt que sur des identifiants : le périmètre est exprimé en codes
    partout ailleurs, les convertir ici ouvrirait une seconde traduction à maintenir.
  */
  if (filtre.parcoursDuLecteur !== undefined) {
    const codes = [...filtre.parcoursDuLecteur]

    fragments.push(
      codes.length === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND parcours_id IN (SELECT id FROM parcours WHERE code IN (${Prisma.join(codes)}))`
    )
  }
  if (filtre.categorieId != null) fragments.push(Prisma.sql`AND categorie_id = ${filtre.categorieId}`)
  if (filtre.statutId != null) fragments.push(Prisma.sql`AND statut_id = ${filtre.statutId}`)
  if (filtre.niveauGraviteId != null) {
    fragments.push(Prisma.sql`AND niveau_gravite_id = ${filtre.niveauGraviteId}`)
  }
  /*
    ⚠️ Le plafond de RATTACHEMENT, ici aussi — même raison que pour le parcours juste au-dessus.
    Le poser dans `clauseFiltre()` sans le reporter ici aurait cloisonné six indicateurs sur sept
    et laissé le septième, le délai moyen, dire la vérité de tout le monde.
  */
  if (filtre.directionDuLecteur != null) {
    fragments.push(Prisma.sql`AND direction_id = ${filtre.directionDuLecteur}`)
  } else if (filtre.siteDuLecteur != null) {
    fragments.push(Prisma.sql`AND site_id = ${filtre.siteDuLecteur}`)
  }

  // Critères de l'URL : ignorés quand le plafond a déjà tranché sur la même colonne.
  if (filtre.siteId != null && filtre.siteDuLecteur == null && filtre.directionDuLecteur == null) {
    fragments.push(Prisma.sql`AND site_id = ${filtre.siteId}`)
  }
  if (filtre.directionId != null && filtre.directionDuLecteur == null) {
    fragments.push(Prisma.sql`AND direction_id = ${filtre.directionId}`)
  }

  const clause = clauseFiltre(filtre).created_at

  if (clause && typeof clause === 'object' && 'gte' in clause && clause.gte != null) {
    fragments.push(Prisma.sql`AND created_at >= ${clause.gte}`)
  }
  if (clause && typeof clause === 'object' && 'lte' in clause && clause.lte != null) {
    fragments.push(Prisma.sql`AND created_at <= ${clause.lte}`)
  }

  return fragments.length > 0 ? Prisma.join(fragments, ' ') : Prisma.empty
}

export type LigneRepartition = {
  libelle: string
  total: number
  /** Renseignée pour la gravité uniquement : sert la couleur du graphique. */
  couleur?: string | null
}

export async function repartitionParParcours(filtre: FiltreReporting): Promise<LigneRepartition[]> {
  const groupes = await prisma.dossiers.groupBy({
    by: ['parcours_id'],
    where: clauseFiltre(filtre),
    _count: { _all: true },
  })

  const libelles = await prisma.parcours.findMany({ select: { id: true, libelle: true } })
  const parId = new Map(libelles.map((p) => [p.id, p.libelle]))

  return groupes
    .map((g) => ({ libelle: parId.get(g.parcours_id) ?? '—', total: g._count._all }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
}

/**
 * Répartition par FAMILLE DE RISQUE — la lecture de traitant, par opposition à la catégorie.
 *
 * ⚠️ UNE LIGNE « Non qualifiée » EST RENDUE, et c'est le chiffre le plus utile de ce bloc. La
 * famille se pose pendant le traitement : un dossier qui n'en a pas est un dossier qu'on n'a pas
 * encore lu. Taire ces lignes ferait croire à une répartition complète, et masquerait précisément
 * ce qu'il reste à faire.
 */
export async function repartitionParFamilleRisque(
  filtre: FiltreReporting
): Promise<LigneRepartition[]> {
  /*
    ⚠️ SEULS LES TYPES QUI QUALIFIENT UNE FAMILLE, depuis le 2026-09-21.

    L'évènement indésirable n'en relève plus. Sans ce filtre, ses dossiers auraient grossi la ligne
    « Non qualifiée » pour toujours — et cette ligne est justement celle qu'on lit comme « ce qu'il
    reste à faire ». Elle aurait annoncé un arriéré que personne ne pouvait résorber, sur la
    répartition la plus récente et la moins connue du tableau de bord.

    ⚠️ Si AUCUN type ne qualifie de famille, la liste revient vide et le bloc disparaît : un
    graphique qui n'a rien à montrer vaut moins qu'un blanc.
  */
  const typesQualifiants = await prisma.parcours.findMany({
    where: { familles_risque_actives: true },
    select: { id: true },
  })

  if (typesQualifiants.length === 0) return []

  const groupes = await prisma.dossiers.groupBy({
    by: ['famille_risque_id'],
    where: {
      AND: [clauseFiltre(filtre), { parcours_id: { in: typesQualifiants.map((p) => p.id) } }],
    },
    _count: { _all: true },
  })

  const libelles = await prisma.familles_risque.findMany({
    select: { id: true, libelle: true, ordre: true },
  })
  const parId = new Map(libelles.map((f) => [f.id, f]))

  return groupes
    .map((g) => ({
      libelle:
        g.famille_risque_id === null
          ? 'Non qualifiée'
          : (parId.get(g.famille_risque_id)?.libelle ?? '—'),
      total: g._count._all,
      // L'ordre du référentiel, et « Non qualifiée » en dernier : c'est un reste, pas une famille.
      ordre: g.famille_risque_id === null ? Number.MAX_SAFE_INTEGER : (parId.get(g.famille_risque_id)?.ordre ?? 0),
    }))
    .sort((a, b) => a.ordre - b.ordre)
    .map(({ libelle, total }) => ({ libelle, total }))
}

export async function repartitionParStatut(filtre: FiltreReporting): Promise<LigneRepartition[]> {
  const groupes = await prisma.dossiers.groupBy({
    by: ['statut_id'],
    where: clauseFiltre(filtre),
    _count: { _all: true },
  })

  const statuts = await prisma.statuts_dossier.findMany({
    select: { id: true, libelle_interne: true, ordre: true },
  })
  const parId = new Map(statuts.map((s) => [s.id, s]))

  return groupes
    .map((g) => ({
      libelle: parId.get(g.statut_id)?.libelle_interne ?? '—',
      ordre: parId.get(g.statut_id)?.ordre ?? 0,
      total: g._count._all,
    }))
    .sort((a, b) => a.ordre - b.ordre)
    .map(({ libelle, total }) => ({ libelle, total }))
}

export async function repartitionParGravite(filtre: FiltreReporting): Promise<LigneRepartition[]> {
  const groupes = await prisma.dossiers.groupBy({
    by: ['niveau_gravite_id'],
    where: clauseFiltre(filtre),
    _count: { _all: true },
  })

  const gravites = await prisma.niveaux_gravite.findMany({
    select: { id: true, libelle: true, couleur: true, niveau: true },
  })
  const parId = new Map(gravites.map((g) => [g.id, g]))

  // Un dossier peut n'avoir aucune gravité tant qu'elle n'est pas qualifiée au traitement (EI8) :
  // ces dossiers forment leur propre ligne plutôt que de disparaître de la répartition.
  return groupes
    .map((g) => {
      const gravite = g.niveau_gravite_id === null ? undefined : parId.get(g.niveau_gravite_id)

      return {
        libelle: gravite?.libelle ?? 'À qualifier',
        couleur: gravite?.couleur ?? null,
        niveau: gravite?.niveau ?? 0,
        total: g._count._all,
      }
    })
    .sort((a, b) => a.niveau - b.niveau)
    .map(({ libelle, couleur, total }) => ({ libelle, couleur, total }))
}

export type Indicateurs = {
  total: number
  tauxResolution: number | null
  tauxCloture: number | null
  delaiMoyen: number | null
  parParcours: LigneRepartition[]
  parStatut: LigneRepartition[]
  parGravite: LigneRepartition[]
  parFamilleRisque: LigneRepartition[]
}

export async function calculerIndicateurs(filtre: FiltreReporting): Promise<Indicateurs> {
  const [total, resolution, cloture, delai, parParcours, parStatut, parGravite, parFamilleRisque] =
    await Promise.all([
      nbDeclarations(filtre),
      tauxResolution(filtre),
      tauxCloture(filtre),
      delaiMoyenJours(filtre),
      repartitionParParcours(filtre),
      repartitionParStatut(filtre),
      repartitionParGravite(filtre),
      repartitionParFamilleRisque(filtre),
    ])

  return {
    total,
    tauxResolution: resolution,
    tauxCloture: cloture,
    delaiMoyen: delai,
    parParcours,
    parStatut,
    parGravite,
    parFamilleRisque,
  }
}

function arrondir(valeur: number): number {
  return Math.round(valeur * 100) / 100
}
