import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, journaliser } from '../audit/journal'

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
