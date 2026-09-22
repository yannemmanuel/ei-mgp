import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, journaliser } from '../audit/journal'
import { nomTechnique } from './habilitations'

/**
 * Quels TYPES de déclaration demandent une famille de risque à leurs traitants.
 *
 * ⚠️ CE RÉGLAGE EST NÉ D'UN RETRAIT. Le métier a demandé de retirer les familles de risque des
 * évènements indésirables — leur nomenclature propre, catégorie au dépôt et gravité à la
 * qualification, dit déjà ce qu'il faut en savoir — « mais en laissant une possibilité de
 * paramétrage dans le back-office ». L'écrire dans le code aurait demandé un déploiement pour le
 * défaire ; il se coche ici, type par type.
 *
 * ⚠️ DÉCOCHER RETIRE DU CHOIX, JAMAIS DU PASSÉ. C'est la règle de tous les référentiels de cette
 * application : les dossiers qui portent déjà une famille la gardent, et leur fiche continue de
 * l'afficher. Seule la POSE devient impossible — et le retrait reste ouvert, sans quoi un dossier
 * qualifié avant la bascule resterait enfermé avec une donnée qu'on ne peut plus défaire.
 */

export type TypeDeclaration = {
  readonly code: string
  readonly libelle: string
  /** Ce type est-il proposé aux déclarants ? Un type éteint ne reçoit plus rien. */
  readonly actif: boolean
  readonly qualifieLaFamille: boolean
  /** Dossiers de ce type portant DÉJÀ une famille — ce qu'un décochage laisserait derrière lui. */
  readonly dossiersQualifies: number
}

export type FamilleRisqueVue = {
  readonly id: string
  readonly code: string
  readonly libelle: string
  readonly actif: boolean
  /** Nombre de dossiers qui la portent, tous types confondus. */
  readonly dossiers: number
}

export type ParametrageFamillesRisque = {
  readonly types: readonly TypeDeclaration[]
  readonly familles: readonly FamilleRisqueVue[]
}

/**
 * Tout ce que l'écran doit montrer : les types, leur réglage, et les familles qu'il commande.
 *
 * ⚠️ LES FAMILLES SONT AFFICHÉES, même si elles ne se modifient pas ici. Cocher « ce type qualifie
 * une famille » sans voir lesquelles reviendrait à décider à l'aveugle — et le compte de dossiers
 * par famille est ce qui permet de juger si le réglage sert vraiment.
 */
export async function chargerParametrageFamillesRisque(): Promise<ParametrageFamillesRisque> {
  const [types, familles] = await Promise.all([
    prisma.parcours.findMany({
      orderBy: { ordre: 'asc' },
      select: {
        code: true,
        libelle: true,
        actif: true,
        familles_risque_actives: true,
        _count: { select: { dossiers: { where: { famille_risque_id: { not: null } } } } },
      },
    }),
    prisma.familles_risque.findMany({
      orderBy: { ordre: 'asc' },
      select: {
        id: true,
        code: true,
        libelle: true,
        actif: true,
        _count: { select: { dossiers: true } },
      },
    }),
  ])

  return {
    types: types.map((t) => ({
      code: t.code,
      libelle: t.libelle,
      actif: t.actif,
      qualifieLaFamille: t.familles_risque_actives,
      dossiersQualifies: t._count.dossiers,
    })),
    familles: familles.map((f) => ({
      id: String(f.id),
      code: f.code,
      libelle: f.libelle,
      actif: f.actif,
      dossiers: f._count.dossiers,
    })),
  }
}

/**
 * Coche ou décoche « ce type de déclaration qualifie une famille de risque ».
 *
 * ⚠️ CE GESTE CHANGE CE QUE VOIENT LES TRAITANTS, immédiatement : le réglage est relu à chaque
 * ouverture de fiche. Décocher fait disparaître la carte de qualification de tous les dossiers du
 * type, et sort ce type de la répartition du tableau de bord.
 *
 * ⚠️ L'ABSENCE DE LIGNE VAUT « NON ». La liste reçue décrit l'état complet — un type absent est
 * décoché, jamais « laissé tel quel ». Un formulaire de cases à cocher n'envoie pas les cases
 * décochées ; les interpréter comme « ne pas toucher » rendrait tout décochage impossible.
 */
export async function modifierTypesQualifiants(
  acteur: { id: bigint },
  codesVoulus: readonly string[]
): Promise<void> {
  const types = await prisma.parcours.findMany({
    select: { id: true, code: true, libelle: true, familles_risque_actives: true },
  })

  const connus = new Set(types.map((t) => t.code))
  const inconnus = codesVoulus.filter((code) => !connus.has(code))

  if (inconnus.length > 0) {
    throw new ErreurWorkflow(`Type de déclaration inconnu : ${inconnus.join(', ')}.`)
  }

  const voulus = new Set(codesVoulus)
  const aChanger = types.filter((t) => t.familles_risque_actives !== voulus.has(t.code))

  if (aChanger.length === 0) return

  const maintenant = new Date()

  for (const type of aChanger) {
    await prisma.parcours.update({
      where: { id: type.id },
      data: { familles_risque_actives: voulus.has(type.code), updated_at: maintenant },
    })
  }

  /*
    ⚠️ UNE SEULE ENTRÉE DE JOURNAL, qui porte l'état AVANT et APRÈS de tous les types.

    Une entrée par type aurait éclaté un geste unique en quatre lignes qu'il aurait fallu recoller
    pour comprendre ce qui a été voulu.

    Le journal l'affiche « Type de déclaration modifié » : l'objet `parcours` a été ajouté à la
    table des libellés, qu'un cas dédié tient synchronisée avec les codes que le code sait écrire.
    Les valeurs ci-dessous disent exactement ce qui a changé, type par type.
  */
  await journaliser({
    action: 'parcours.modifie',
    acteurId: acteur.id,
    auditableType: MODELES.parcours,
    auditableId: aChanger.map((t) => t.code).sort().join(','),
    anciennes: {
      famillesRisqueActives: types
        .filter((t) => t.familles_risque_actives)
        .map((t) => t.code)
        .sort(),
    },
    nouvelles: { famillesRisqueActives: [...voulus].sort() },
  })
}
/* ------------------------------------------------------------------------------------------- */
/* Le référentiel lui-même : créer, renommer, réordonner, supprimer.                            */
/* ------------------------------------------------------------------------------------------- */

type Acteur = { id: bigint }

export type SensDeplacement = 'monter' | 'descendre'

export type DonneesFamille = {
  readonly libelle: string
  readonly actif: boolean
}

/**
 * Le code technique d'une famille, dérivé de son libellé.
 *
 * ⚠️ IL N'EST PAS SAISI, et c'est délibéré. Aucun code applicatif ne cite un code de famille —
 * vérifié : les neuf livrées ne sont nommées nulle part dans `src`. Le demander à l'administrateur
 * n'aurait servi qu'à lui faire inventer une valeur technique dont rien ne dépend, avec le risque
 * de collisions qu'il n'aurait aucun moyen d'anticiper.
 *
 * ⚠️ Il reste UNIQUE et IMMUABLE : c'est la clé de rapprochement du journal d'audit, qui est en
 * ajout seul. Renommer une famille change son libellé, jamais son code — sans quoi les lignes
 * déjà écrites désigneraient une entrée qu'on ne retrouverait plus.
 */
function codeDepuisLibelle(libelle: string): string {
  return nomTechnique(libelle).slice(0, 64)
}

/**
 * ⚠️ AU MOINS UNE FAMILLE ACTIVE TANT QU'UN TYPE EN DEMANDE UNE.
 *
 * Le trou que cette garde ferme est silencieux : un type coché dont plus aucune famille n'est
 * active affiche une carte de qualification VIDE — ou, selon le chemin, ne l'affiche plus du tout.
 * Le traitant voit alors disparaître une étape de son travail sans qu'aucun message ne l'explique,
 * et l'administrateur, lui, voit toujours la case cochée.
 *
 * Deux issues sont laissées ouvertes, et c'est ce qui rend la garde acceptable : décocher les
 * types d'abord, ou activer une autre famille. Le message le dit.
 */
async function refuserSiPlusAucuneFamilleProposable(exclureId: bigint): Promise<void> {
  const typesQualifiants = await prisma.parcours.count({ where: { familles_risque_actives: true } })

  if (typesQualifiants === 0) return

  const autresActives = await prisma.familles_risque.count({
    where: { actif: true, NOT: { id: exclureId } },
  })

  if (autresActives > 0) return

  throw new ErreurWorkflow(
    'C’est la dernière famille proposée, et ' +
      `${typesQualifiants} type${typesQualifiants > 1 ? 's' : ''} de déclaration en demande${typesQualifiants > 1 ? 'nt' : ''} une. ` +
      'Activez-en une autre, ou décochez ces types, avant de retirer celle-ci.'
  )
}

/** Crée une famille de risque. Le code est dérivé du libellé, le rang la place en dernier. */
export async function creerFamilleRisque(
  acteur: Acteur,
  donnees: DonneesFamille
): Promise<void> {
  const libelle = donnees.libelle.trim()

  if (libelle === '') {
    throw new ErreurWorkflow('Le libellé est obligatoire.')
  }

  const code = codeDepuisLibelle(libelle)

  if (code === '') {
    throw new ErreurWorkflow(
      'Ce libellé ne produit aucun code technique : utilisez au moins une lettre ou un chiffre.'
    )
  }

  const deja = await prisma.familles_risque.findFirst({ where: { code }, select: { libelle: true } })

  if (deja) {
    throw new ErreurWorkflow(`« ${deja.libelle} » porte déjà ce code technique (${code}).`)
  }

  // Le rang la place en DERNIER : une famille nouvelle n'a aucune raison de passer devant celles
  // que les traitants ont l'habitude de voir en tête.
  const dernier = await prisma.familles_risque.aggregate({ _max: { ordre: true } })

  const creee = await prisma.familles_risque.create({
    data: {
      code,
      libelle,
      actif: donnees.actif,
      ordre: (dernier._max.ordre ?? 0) + 1,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true, code: true, libelle: true, actif: true, ordre: true },
  })

  await journaliser({
    action: 'famille_risque.creee',
    acteurId: acteur.id,
    auditableType: MODELES.familleRisque,
    auditableId: String(creee.id),
    anciennes: null,
    nouvelles: { code: creee.code, libelle: creee.libelle, actif: creee.actif, ordre: creee.ordre },
  })
}

/**
 * Renomme une famille, ou la retire du choix.
 *
 * ⚠️ LE CODE NE CHANGE PAS — voir `codeDepuisLibelle()`. Et désactiver retire du CHOIX, jamais du
 * passé : les dossiers qui portent cette famille la gardent et continuent de l'afficher.
 */
export async function modifierFamilleRisque(
  acteur: Acteur,
  familleId: bigint,
  donnees: DonneesFamille
): Promise<void> {
  const libelle = donnees.libelle.trim()

  if (libelle === '') {
    throw new ErreurWorkflow('Le libellé est obligatoire.')
  }

  const avant = await prisma.familles_risque.findUnique({
    where: { id: familleId },
    select: { code: true, libelle: true, actif: true },
  })

  if (!avant) throw new ErreurWorkflow('Famille de risque inconnue.')

  if (avant.actif && !donnees.actif) {
    await refuserSiPlusAucuneFamilleProposable(familleId)
  }

  if (avant.libelle === libelle && avant.actif === donnees.actif) return

  await prisma.familles_risque.update({
    where: { id: familleId },
    data: { libelle, actif: donnees.actif, updated_at: new Date() },
  })

  await journaliser({
    action: 'famille_risque.modifiee',
    acteurId: acteur.id,
    auditableType: MODELES.familleRisque,
    auditableId: String(familleId),
    anciennes: { libelle: avant.libelle, actif: avant.actif },
    nouvelles: { libelle, actif: donnees.actif },
  })
}

/**
 * Supprime une famille — À CONDITION QUE RIEN NE LA CITE.
 *
 * `dossiers.famille_risque_id` porte une clé vers cette table. Effacer une ligne citée laisserait
 * des dossiers dont plus personne ne saurait dire à quoi ils se rattachaient : c'est exactement ce
 * que RG-03 protège. Le refus est donc une règle, pas une prudence — et la DÉSACTIVATION reste
 * offerte, qui retire l'entrée du choix sans toucher au passé.
 */
export async function supprimerFamilleRisque(acteur: Acteur, familleId: bigint): Promise<void> {
  const cible = await prisma.familles_risque.findUnique({
    where: { id: familleId },
    select: {
      code: true,
      libelle: true,
      actif: true,
      ordre: true,
      _count: { select: { dossiers: true } },
    },
  })

  if (!cible) throw new ErreurWorkflow('Famille de risque inconnue.')

  if (cible._count.dossiers > 0) {
    const n = cible._count.dossiers

    throw new ErreurWorkflow(
      `« ${cible.libelle} » est citée par ${n} dossier${n > 1 ? 's' : ''} : la supprimer rendrait ces données incohérentes. ` +
        'Désactivez-la plutôt : elle cessera d’être proposée, et les dossiers qui la portent la garderont.'
    )
  }

  if (cible.actif) {
    await refuserSiPlusAucuneFamilleProposable(familleId)
  }

  await prisma.familles_risque.delete({ where: { id: familleId } })

  /*
    ⚠️ LES VALEURS EFFACÉES SONT CONSIGNÉES. C'est la seule trace qui restera de cette ligne :
    se contenter d'enregistrer « supprimée » rendrait l'audit incapable de répondre à « qu'y
    avait-il exactement ? », qui est la question qu'on se pose précisément quand une suppression
    pose problème.
  */
  await journaliser({
    action: 'famille_risque.supprimee',
    acteurId: acteur.id,
    auditableType: MODELES.familleRisque,
    auditableId: String(familleId),
    anciennes: {
      code: cible.code,
      libelle: cible.libelle,
      actif: cible.actif,
      ordre: cible.ordre,
    },
    nouvelles: null,
  })
}

/**
 * Change le rang d'une famille dans la liste proposée aux traitants.
 *
 * ⚠️ TOUTE LA LISTE EST RENUMÉROTÉE, en une transaction. Une liste à moitié renumérotée porterait
 * des rangs en double, donc un classement qui dépendrait de l'ordre de lecture de la base — et qui
 * changerait d'un écran à l'autre sans que rien ne bouge.
 */
export async function deplacerFamilleRisque(
  acteur: Acteur,
  familleId: bigint,
  sens: SensDeplacement
): Promise<void> {
  const lignes = await prisma.familles_risque.findMany({
    orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
    select: { id: true, ordre: true },
  })

  const depuis = lignes.findIndex((l) => l.id === familleId)

  if (depuis === -1) throw new ErreurWorkflow('Famille de risque inconnue.')

  const vers = sens === 'monter' ? depuis - 1 : depuis + 1

  if (vers < 0 || vers >= lignes.length) {
    throw new ErreurWorkflow(
      sens === 'monter' ? 'Cette famille est déjà la première.' : 'Cette famille est déjà la dernière.'
    )
  }

  const ordonne = [...lignes]
  ;[ordonne[depuis], ordonne[vers]] = [ordonne[vers], ordonne[depuis]]

  await prisma.$transaction(
    ordonne.map((ligne, index) =>
      prisma.familles_risque.update({
        where: { id: ligne.id },
        data: { ordre: index + 1, updated_at: new Date() },
      })
    )
  )

  // Le journal ne retient que la ligne sur laquelle on a agi : les autres rangs bougent
  // mécaniquement, et les tracer une par une noierait le geste réel sous sa comptabilité.
  await journaliser({
    action: 'famille_risque.modifiee',
    acteurId: acteur.id,
    auditableType: MODELES.familleRisque,
    auditableId: String(familleId),
    anciennes: { ordre: lignes[depuis].ordre },
    nouvelles: { ordre: vers + 1 },
  })
}
