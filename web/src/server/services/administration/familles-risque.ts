import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, journaliser } from '../audit/journal'
import { nomTechnique } from './habilitations'

/**
 * Quels TYPES de déclaration demandent une famille de risque à leurs traitants.
 *
 * ⚠️ Décocher retire du CHOIX, jamais du passé : les dossiers qui portent déjà une famille la
 * gardent et continuent de l'afficher. Seule la pose devient impossible — le retrait reste
 * ouvert, sans quoi un dossier qualifié avant la bascule resterait enfermé avec sa valeur.
 */

export type TypeDeclaration = {
  readonly code: string
  readonly libelle: string
  /** Ce type est-il proposé aux déclarants ? Un type éteint ne reçoit plus rien. */
  readonly actif: boolean
  readonly qualifieLaFamille: boolean
  /** Dossiers de ce type portant DÉJÀ une famille — ce qu'un décochage laisserait derrière lui. */
  readonly dossiersQualifies: number
  /**
   * Familles que ce type propose RÉELLEMENT : les siennes, plus celles de « tous les types ».
   *
   * ⚠️ Ce chiffre dit si cocher la case sert à quelque chose : un type coché qui ne propose rien
   * affiche une carte vide, sans message. Calculé ici, l'écran devant sinon apparier par libellé.
   */
  readonly famillesProposees: number
}

export type FamilleRisqueVue = {
  readonly id: string
  readonly code: string
  readonly libelle: string
  readonly actif: boolean
  /**
   * Type de déclaration auquel elle est réservée — `null` = proposée sur TOUS les types.
   *
   * ⚠️ « Tous les types » n'est pas un défaut de paramétrage : « Autre » ou « Corruption et
   * fraude » relèvent réellement des quatre. Les dupliquer quatre fois aurait fait passer le
   * référentiel de neuf lignes à trente-six, et rendu chaque renommage quadruple.
   */
  readonly parcoursId: string | null
  readonly parcoursLibelle: string | null
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
        id: true,
        code: true,
        libelle: true,
        actif: true,
        familles_risque_actives: true,
        _count: {
          select: {
            dossiers: { where: { famille_risque_id: { not: null } } },
            familles_risque: { where: { actif: true } },
          },
        },
      },
    }),
    prisma.familles_risque.findMany({
      /*
        Groupées par type, puis par rang. C'est l'ordre dans lequel l'écran les affiche, et celui
        dans lequel le rang se compte : monter la première famille d'un type ne doit pas la faire
        passer dans le type précédent.
      */
      orderBy: [{ parcours: { ordre: 'asc' } }, { ordre: 'asc' }],
      select: {
        id: true,
        code: true,
        libelle: true,
        actif: true,
        parcours_id: true,
        parcours: { select: { libelle: true } },
        _count: { select: { dossiers: true } },
      },
    }),
  ])

  // Les familles sans rattachement sont proposées sur TOUS les types : elles s'ajoutent au compte
  // de chacun.
  const communes = familles.filter((f) => f.actif && f.parcours_id === null).length

  return {
    types: types.map((t) => ({
      code: t.code,
      libelle: t.libelle,
      actif: t.actif,
      qualifieLaFamille: t.familles_risque_actives,
      dossiersQualifies: t._count.dossiers,
      // Les siennes, plus les communes : c'est ce que le traitant verra dans sa liste.
      famillesProposees: t._count.familles_risque + communes,
    })),
    familles: familles.map((f) => ({
      id: String(f.id),
      code: f.code,
      libelle: f.libelle,
      actif: f.actif,
      parcoursId: f.parcours_id === null ? null : String(f.parcours_id),
      parcoursLibelle: f.parcours?.libelle ?? null,
      dossiers: f._count.dossiers,
    })),
  }
}

/**
 * Coche ou décoche « ce type de déclaration qualifie une famille de risque ».
 *
 * ⚠️ Effet immédiat : décocher fait disparaître la carte de qualification de tous les dossiers du
 * type, et le sort de la répartition du tableau de bord.
 *
 * ⚠️ L'absence vaut « non » : la liste reçue décrit l'état complet. Un formulaire n'envoie pas ses
 * cases décochées, et les lire comme « ne pas toucher » rendrait tout décochage impossible.
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

  // ⚠️ Une SEULE entrée de journal, portant l'état avant et après de tous les types : une entrée
  // par type éclaterait un geste unique en quatre lignes qu'il faudrait recoller.
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
  /** Type auquel la réserver, ou `null` pour « tous les types ». */
  readonly parcoursId: bigint | null
}

/** Vérifie que le type existe — un identifiant forgé rattacherait la famille à rien. */
async function verifierParcours(parcoursId: bigint | null): Promise<void> {
  if (parcoursId === null) return

  const existe = await prisma.parcours.count({ where: { id: parcoursId } })

  if (existe === 0) throw new ErreurWorkflow('Type de déclaration inconnu.')
}

/**
 * Le code technique d'une famille, dérivé de son libellé.
 *
 * Jamais saisi : aucun code applicatif ne cite un code de famille, et le demander reviendrait à
 * faire inventer une valeur technique dont rien ne dépend.
 *
 * ⚠️ Unique et IMMUABLE : c'est la clé de rapprochement du journal, qui est en ajout seul.
 * Renommer une famille change son libellé, jamais son code.
 */
function codeDepuisLibelle(libelle: string): string {
  return nomTechnique(libelle).slice(0, 64)
}

/**
 * Un code libre, dérivé du libellé — suffixé par le type si la base le porte déjà.
 *
 * ⚠️ Les collisions sont NORMALES : « Autre » réservée au grief employé et « Autre » réservée au
 * communautaire sont deux familles légitimes, et c'est au code de s'adapter, pas au libellé. Le
 * suffixe n'est ajouté qu'en cas de collision.
 */
async function codeLibre(libelle: string, parcoursId: bigint | null): Promise<string> {
  const base = codeDepuisLibelle(libelle)

  if (base === '') {
    throw new ErreurWorkflow(
      'Ce libellé ne produit aucun code technique : utilisez au moins une lettre ou un chiffre.'
    )
  }

  const pris = async (code: string) =>
    (await prisma.familles_risque.count({ where: { code } })) > 0

  if (!(await pris(base))) return base

  if (parcoursId !== null) {
    const parcours = await prisma.parcours.findUnique({
      where: { id: parcoursId },
      select: { code: true },
    })

    if (parcours) {
      const suffixe = `${base}_${parcours.code}`.slice(0, 64)
      if (!(await pris(suffixe))) return suffixe
    }
  }

  const deja = await prisma.familles_risque.findFirst({
    where: { code: base },
    select: { libelle: true },
  })

  throw new ErreurWorkflow(
    `« ${deja?.libelle ?? base} » porte déjà ce code technique (${base}). Choisissez un autre libellé.`
  )
}

/**
 * ⚠️ Aucun type qualifiant ne doit se retrouver sans aucune famille à proposer.
 *
 * Le trou est silencieux : le traitant voit une carte vide, l'administrateur voit la case cochée.
 *
 * ⚠️ Vérifié TYPE PAR TYPE : compter les familles actives globalement se taisait dès qu'il en
 * restait une, même réservée à un autre type.
 *
 * Deux issues restent ouvertes — décocher le type, ou lui proposer une famille — et le message
 * nomme le type concerné.
 */
async function refuserSiPlusAucuneFamilleProposable(exclureId: bigint): Promise<void> {
  const typesQualifiants = await prisma.parcours.findMany({
    where: { familles_risque_actives: true },
    select: { id: true, libelle: true },
  })

  if (typesQualifiants.length === 0) return

  const restantes = await prisma.familles_risque.findMany({
    where: { actif: true, NOT: { id: exclureId } },
    select: { parcours_id: true },
  })

  // Une famille sans rattachement compte pour TOUS les types.
  const communes = restantes.filter((f) => f.parcours_id === null).length
  const propres = new Set(restantes.filter((f) => f.parcours_id !== null).map((f) => f.parcours_id))

  const orphelins = typesQualifiants.filter((t) => communes === 0 && !propres.has(t.id))

  if (orphelins.length === 0) return

  const noms = orphelins.map((t) => `« ${t.libelle} »`).join(', ')

  throw new ErreurWorkflow(
    `Sans elle, ${orphelins.length > 1 ? 'ces types n’auraient' : 'ce type n’aurait'} plus aucune famille à proposer : ${noms}. ` +
      `Proposez-${orphelins.length > 1 ? 'leur' : 'lui'} une autre famille, ou décochez-${orphelins.length > 1 ? 'les' : 'le'}, avant de retirer celle-ci.`
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

  await verifierParcours(donnees.parcoursId)

  const code = await codeLibre(libelle, donnees.parcoursId)

  /*
    Le rang la place en DERNIER DE SON GROUPE : une famille nouvelle n'a aucune raison de passer
    devant celles que les traitants ont l'habitude de voir en tête, et le rang se compte dans le
    type — comme pour les catégories.
  */
  const dernier = await prisma.familles_risque.aggregate({
    where: { parcours_id: donnees.parcoursId },
    _max: { ordre: true },
  })

  const creee = await prisma.familles_risque.create({
    data: {
      code,
      libelle,
      actif: donnees.actif,
      parcours_id: donnees.parcoursId,
      ordre: (dernier._max.ordre ?? 0) + 1,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true, code: true, libelle: true, actif: true, ordre: true, parcours_id: true },
  })

  await journaliser({
    action: 'famille_risque.creee',
    acteurId: acteur.id,
    auditableType: MODELES.familleRisque,
    auditableId: String(creee.id),
    anciennes: null,
    nouvelles: {
      code: creee.code,
      libelle: creee.libelle,
      actif: creee.actif,
      ordre: creee.ordre,
      parcours_id: creee.parcours_id === null ? null : String(creee.parcours_id),
    },
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

  await verifierParcours(donnees.parcoursId)

  const avant = await prisma.familles_risque.findUnique({
    where: { id: familleId },
    select: { code: true, libelle: true, actif: true, parcours_id: true, ordre: true },
  })

  if (!avant) throw new ErreurWorkflow('Famille de risque inconnue.')

  if (avant.actif && !donnees.actif) {
    await refuserSiPlusAucuneFamilleProposable(familleId)
  }

  const changeDeType = avant.parcours_id !== donnees.parcoursId

  /*
    ⚠️ CHANGER DE TYPE RETIRE LA FAMILLE DU CHOIX DES DOSSIERS DÉJÀ QUALIFIÉS, sans effacer leur
    qualification : ils la gardent et l'affichent, mais ne pourraient plus la re-sélectionner.

    Ce n'est pas une perte de donnée, et ce n'est pas bloqué — un rattachement posé par erreur doit
    pouvoir être corrigé. L'écran l'annonce avant l'enregistrement, parce que c'est exactement le
    genre d'effet qu'on ne devine pas depuis un menu déroulant.
  */
  if (avant.libelle === libelle && avant.actif === donnees.actif && !changeDeType) return

  // Le rang se compte DANS le type : une famille qui change de groupe reprend le rang du bout,
  // faute de quoi elle hériterait d'un rang déjà pris et le classement deviendrait ambigu.
  const rang = changeDeType
    ? ((
        await prisma.familles_risque.aggregate({
          where: { parcours_id: donnees.parcoursId },
          _max: { ordre: true },
        })
      )._max.ordre ?? 0) + 1
    : avant.ordre

  await prisma.familles_risque.update({
    where: { id: familleId },
    data: {
      libelle,
      actif: donnees.actif,
      parcours_id: donnees.parcoursId,
      ordre: rang,
      updated_at: new Date(),
    },
  })

  await journaliser({
    action: 'famille_risque.modifiee',
    acteurId: acteur.id,
    auditableType: MODELES.familleRisque,
    auditableId: String(familleId),
    anciennes: {
      libelle: avant.libelle,
      actif: avant.actif,
      parcours_id: avant.parcours_id === null ? null : String(avant.parcours_id),
    },
    nouvelles: {
      libelle,
      actif: donnees.actif,
      parcours_id: donnees.parcoursId === null ? null : String(donnees.parcoursId),
    },
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
      parcours_id: true,
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
      parcours_id: cible.parcours_id === null ? null : String(cible.parcours_id),
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
  /*
    ⚠️ LE RANG SE COMPTE DANS SON TYPE, comme pour les catégories.

    Prendre toute la table pour groupe ferait passer la première famille d'un type dans le type
    précédent : un geste de mise en ordre deviendrait un geste de rattachement, silencieusement.
  */
  const cible = await prisma.familles_risque.findUnique({
    where: { id: familleId },
    select: { parcours_id: true },
  })

  if (!cible) throw new ErreurWorkflow('Famille de risque inconnue.')

  const lignes = await prisma.familles_risque.findMany({
    where: { parcours_id: cible.parcours_id },
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
