import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import {
  MODELES,
  attributsCrees,
  difference,
  journaliser,
  sansChangement,
  type ModeleAudite,
  type ValeursAudit,
} from '../audit/journal'

/**
 * Référentiels administrables (module 7) — port des composants `App\Livewire\Administration\*`.
 *
 * **Une entrée citée par l'historique ne peut pas être supprimée** (RG-03). La suppression
 * existe depuis le 12/09/2026, mais elle est CONDITIONNELLE : chaque fonction compte d'abord ce
 * qui référence la ligne, et refuse tant que ce compte n'est pas nul. Une catégorie déjà portée
 * par un dossier ne part donc jamais — il reste la désactivation (`actif`), qui la retire des
 * formulaires sans toucher au passé. Postes, lieux, villes et tranches, eux, ne sont cités par
 * aucune table : leur valeur est recopiée en texte au moment de la déclaration, et les effacer
 * ne réécrit aucun historique.
 *
 * Chaque mutation est journalisée au format de `AuditObserver` (`modele.cree` / `modele.modifie`,
 * avec le différentiel des seuls champs modifiés), pour que la console d'audit de Laravel
 * continue de lire ces lignes à l'identique pendant la migration.
 */

type Acteur = { id: bigint }

// --- Catégories ------------------------------------------------------------------------------

export type DonneesCategorie = {
  parcoursId: bigint
  code: string
  libelle: string
  isAutre: boolean
  actif: boolean
}

/**
 * Rang manuel d'abord, alphabétique ensuite — groupé par parcours.
 *
 * Ces deux critères ne s'opposent pas, ils se complètent, et c'est ce qui permet de tenir les
 * deux demandes à la fois (arbitrages des 11 et 12/09/2026) :
 *
 * - le champ « Ordre d'affichage » a disparu des paramètres : plus de numéro à taper, plus de
 *   renumérotation à la main à chaque ajout ;
 * - tant que les lignes d'un groupe partagent le même rang — c'est le cas de la plupart d'entre
 *   elles — le rang ne départage rien et l'affichage est ALPHABÉTIQUE, par défaut ;
 * - les boutons « monter / descendre » attribuent des rangs distincts, et l'ordre voulu prend
 *   alors le pas sur l'alphabet, là où il porte un sens.
 *
 * Ce dernier point n'est pas théorique : les tranches d'ancienneté forment une échelle. Classées
 * alphabétiquement, « Moins d'1 an » tombait en quatrième position, après « 5 à 10 ans ».
 */
export async function listerCategories() {
  return prisma.categories.findMany({
    orderBy: [{ parcours: { libelle: 'asc' } }, { ordre: 'asc' }, { libelle: 'asc' }],
    select: {
      id: true,
      code: true,
      libelle: true,
      is_autre: true,
      actif: true,
      ordre: true,
      parcours_id: true,
      parcours: { select: { libelle: true } },
    },
  })
}

export async function enregistrerCategorie(
  acteur: Acteur,
  donnees: DonneesCategorie,
  categorieId?: bigint
): Promise<bigint> {
  // L'unicité porte sur le COUPLE (parcours, code) : deux parcours peuvent légitimement avoir
  // une catégorie « autre ». La contrainte base reste le filet final, cette vérification n'est
  // là que pour rendre l'erreur intelligible.
  const doublon = await prisma.categories.findFirst({
    where: {
      parcours_id: donnees.parcoursId,
      code: donnees.code,
      ...(categorieId ? { NOT: { id: categorieId } } : {}),
    },
    select: { id: true },
  })

  if (doublon) {
    throw new ErreurWorkflow('Ce code est déjà utilisé pour ce parcours.')
  }

  const valeurs = {
    parcours_id: donnees.parcoursId,
    code: donnees.code,
    libelle: donnees.libelle,
    is_autre: donnees.isAutre,
    actif: donnees.actif,
  }

  if (categorieId === undefined) {
    const creee = await prisma.categories.create({
      data: { ...valeurs, created_at: new Date(), updated_at: new Date() },
      select: { id: true },
    })

    await journaliser({
      action: 'categorie.cree',
      acteurId: acteur.id,
      auditableType: MODELES.categorie,
      auditableId: String(creee.id),
      nouvelles: attributsCrees(valeurs),
    })

    return creee.id
  }

  const avant = await prisma.categories.findUniqueOrThrow({ where: { id: categorieId } })

  await prisma.categories.update({
    where: { id: categorieId },
    data: { ...valeurs, updated_at: new Date() },
  })

  await journaliserModification(
    'categorie.modifie',
    MODELES.categorie,
    String(categorieId),
    acteur,
    avant as unknown as ValeursAudit,
    valeurs
  )

  return categorieId
}

// --- Statuts ---------------------------------------------------------------------------------

export type DonneesStatut = {
  libelleInterne: string
  libelleAffiche: string
  ordre: number
  /**
   * Faux = plus proposé comme destination d'une transition manuelle.
   *
   * ⚠️ Les dossiers qui s'y trouvent déjà y RESTENT et continuent d'en sortir : on retire une
   * valeur du choix futur, on ne réécrit pas le passé. La création d'une déclaration ne consulte
   * pas ce drapeau — « reçu » est attribué quoi qu'il arrive, le premier état d'un dossier
   * n'étant pas un choix qu'on lui propose.
   */
  actif: boolean
}

export async function listerStatuts() {
  return prisma.statuts_dossier.findMany({ orderBy: { ordre: 'asc' } })
}

/**
 * Modification seule : `code` est la colonne pivot du graphe de transitions. Créer ou retirer un
 * statut casserait ce graphe — l'opération n'est donc pas exposée.
 *
 * `libelle_affiche` est la projection montrée au déclarant (RGI-10) : la modifier ici la modifie
 * partout, immédiatement.
 */
export async function modifierStatut(
  acteur: Acteur,
  statutId: bigint,
  donnees: DonneesStatut
): Promise<void> {
  const avant = await prisma.statuts_dossier.findUniqueOrThrow({ where: { id: statutId } })

  const valeurs = {
    libelle_interne: donnees.libelleInterne,
    libelle_affiche: donnees.libelleAffiche,
    ordre: donnees.ordre,
    actif: donnees.actif,
  }

  await prisma.statuts_dossier.update({
    where: { id: statutId },
    data: { ...valeurs, updated_at: new Date() },
  })

  await journaliserModification(
    'statut_dossier.modifie',
    MODELES.statutDossier,
    String(statutId),
    acteur,
    avant as unknown as ValeursAudit,
    valeurs
  )
}

// --- Sites -----------------------------------------------------------------------------------

export type DonneesSite = { code: string; libelle: string; actif: boolean }

/**
 * Sites, avec ce qui en dépend.
 *
 * Les décomptes ne sont pas décoratifs : désactiver un site dont des directions dépendent
 * couperait l'acheminement des déclarations qui les visent. Les voir avant d'agir évite de
 * découvrir la conséquence après.
 */
export async function listerSites() {
  return prisma.sites.findMany({
    orderBy: { libelle: 'asc' },
    include: { _count: { select: { directions: true, users: true } } },
  })
}

export async function enregistrerSite(
  acteur: Acteur,
  donnees: DonneesSite,
  siteId?: bigint
): Promise<bigint> {
  const doublon = await prisma.sites.findFirst({
    where: { code: donnees.code, ...(siteId ? { NOT: { id: siteId } } : {}) },
    select: { id: true },
  })

  if (doublon) {
    throw new ErreurWorkflow('Ce code de site est déjà utilisé.')
  }

  /**
   * Un site encore porteur de directions actives ne se désactive pas.
   *
   * Le site d'un dossier découle de sa direction : désactiver le site laisserait ces directions
   * pointer vers un rattachement hors service, et les déclarations qui les visent continueraient
   * d'être acheminées vers un site que l'administration croit fermé. Détacher d'abord les
   * directions rend la décision explicite.
   */
  if (siteId !== undefined && !donnees.actif) {
    const rattachees = await prisma.directions.count({ where: { site_id: siteId, actif: true } })

    if (rattachees > 0) {
      throw new ErreurWorkflow(
        `Impossible de désactiver ce site : ${rattachees} direction${rattachees > 1 ? 's y sont' : ' y est'} encore rattachée${rattachees > 1 ? 's' : ''}. Rattachez-les ailleurs, ou désactivez-les d'abord.`
      )
    }
  }

  if (siteId === undefined) {
    const cree = await prisma.sites.create({
      data: { ...donnees, created_at: new Date(), updated_at: new Date() },
      select: { id: true },
    })

    await journaliser({
      action: 'site.cree',
      acteurId: acteur.id,
      auditableType: MODELES.site,
      auditableId: String(cree.id),
      nouvelles: attributsCrees(donnees),
    })

    return cree.id
  }

  const avant = await prisma.sites.findUniqueOrThrow({ where: { id: siteId } })

  await prisma.sites.update({ where: { id: siteId }, data: { ...donnees, updated_at: new Date() } })

  await journaliserModification(
    'site.modifie',
    MODELES.site,
    String(siteId),
    acteur,
    avant as unknown as ValeursAudit,
    donnees
  )

  return siteId
}

// --- Directions ------------------------------------------------------------------------------

export type DonneesDirection = {
  code: string
  libelle: string
  siteId: bigint | null
  actif: boolean
}

/**
 * Directions, avec leur site de rattachement.
 *
 * Le rattachement n'est pas décoratif : c'est lui qui donne son site à un dossier, et donc le
 * secrétaire CSST qui le recevra. Une direction sans site produit des dossiers que seuls les
 * rôles transverses voient — l'écran le signale plutôt que de le laisser deviner.
 */
export async function listerDirections() {
  return prisma.directions.findMany({
    orderBy: [{ sites: { libelle: 'asc' } }, { libelle: 'asc' }],
    select: {
      id: true,
      code: true,
      libelle: true,
      actif: true,
      site_id: true,
      sites: { select: { libelle: true } },
      // Un détachement concerne aussi les comptes rattachés : les compter ici évite une requête
      // par ligne dans l'écran.
      _count: { select: { users: true } },
    },
  })
}

export async function enregistrerDirection(
  acteur: Acteur,
  donnees: DonneesDirection,
  directionId?: bigint
): Promise<bigint> {
  const doublon = await prisma.directions.findFirst({
    where: { code: donnees.code, ...(directionId ? { NOT: { id: directionId } } : {}) },
    select: { id: true },
  })

  if (doublon) {
    throw new ErreurWorkflow('Ce code de direction est déjà utilisé.')
  }

  if (donnees.siteId !== null) {
    const site = await prisma.sites.findUnique({
      where: { id: donnees.siteId },
      select: { id: true },
    })

    if (!site) {
      throw new ErreurWorkflow('Site inconnu.')
    }
  }

  const colonnes = {
    code: donnees.code,
    libelle: donnees.libelle,
    site_id: donnees.siteId,
    actif: donnees.actif,
  }

  if (directionId === undefined) {
    const cree = await prisma.directions.create({
      data: { ...colonnes, created_at: new Date(), updated_at: new Date() },
      select: { id: true },
    })

    await journaliser({
      action: 'direction.creee',
      acteurId: acteur.id,
      auditableType: MODELES.direction,
      auditableId: String(cree.id),
      nouvelles: attributsCrees(colonnes),
    })

    return cree.id
  }

  const avant = await prisma.directions.findUniqueOrThrow({ where: { id: directionId } })

  await prisma.directions.update({
    where: { id: directionId },
    data: { ...colonnes, updated_at: new Date() },
  })

  /**
   * Changer le site d'une direction ne réécrit PAS les dossiers déjà déposés.
   *
   * Leur `site_id` a été figé à la déclaration, et c'est voulu : il dit de quel site relevait le
   * signalement au moment des faits, pas où la direction se trouve aujourd'hui. Réattribuer
   * rétroactivement ferait changer de mains des dossiers en cours de traitement, sans que
   * personne l'ait décidé — la réaffectation existe pour cela, et elle est tracée.
   */
  await journaliserModification(
    'direction.modifiee',
    MODELES.direction,
    String(directionId),
    acteur,
    avant as unknown as ValeursAudit,
    colonnes
  )

  return directionId
}

/**
 * Rattache une direction à un site, ou l'en détache.
 *
 * Geste distinct de `enregistrerDirection` à dessein : c'est le seul de cet écran qui déplace une
 * direction d'un site à l'autre, et le journal doit pouvoir le dire sans qu'on ait à comparer
 * quatre colonnes pour deviner ce qui a changé.
 *
 * Ne réécrit AUCUN dossier déjà déposé : leur `site_id` a été figé à la déclaration, et il dit de
 * quel site relevait le signalement à ce moment-là. Réattribuer rétroactivement ferait changer de
 * mains des dossiers en cours sans que personne l'ait décidé.
 */
export async function rattacherDirection(
  acteur: Acteur,
  directionId: bigint,
  siteId: bigint | null
): Promise<void> {
  const direction = await prisma.directions.findUniqueOrThrow({
    where: { id: directionId },
    select: { site_id: true, libelle: true },
  })

  if (direction.site_id === siteId) return

  if (siteId !== null) {
    const site = await prisma.sites.findUnique({
      where: { id: siteId },
      select: { id: true, actif: true },
    })

    if (!site) {
      throw new ErreurWorkflow('Site inconnu.')
    }

    // Rattacher à un site désactivé produirait des dossiers acheminés vers un site hors service.
    if (!site.actif) {
      throw new ErreurWorkflow('Ce site est désactivé : on ne peut pas y rattacher une direction.')
    }
  }

  await prisma.directions.update({
    where: { id: directionId },
    data: { site_id: siteId, updated_at: new Date() },
  })

  await journaliser({
    action: siteId === null ? 'direction.detachee' : 'direction.rattachee',
    acteurId: acteur.id,
    auditableType: MODELES.direction,
    auditableId: String(directionId),
    anciennes: { libelle: direction.libelle, site_id: direction.site_id?.toString() ?? null },
    nouvelles: { libelle: direction.libelle, site_id: siteId?.toString() ?? null },
  })
}

// --- Canaux de captage -----------------------------------------------------------------------

export type DonneesCanal = { libelle: string; actif: boolean }

export async function listerCanaux() {
  return prisma.canaux_captage.findMany({ orderBy: { libelle: 'asc' } })
}

/** Libellé et activation seuls : les 4 codes de canaux sont fixés par le CDC §6.7. */
export async function modifierCanal(
  acteur: Acteur,
  canalId: bigint,
  donnees: DonneesCanal
): Promise<void> {
  const avant = await prisma.canaux_captage.findUniqueOrThrow({ where: { id: canalId } })

  await prisma.canaux_captage.update({
    where: { id: canalId },
    data: { ...donnees, updated_at: new Date() },
  })

  await journaliserModification(
    'canal_captage.modifie',
    MODELES.canalCaptage,
    String(canalId),
    acteur,
    avant as unknown as ValeursAudit,
    donnees
  )
}

// --- Gabarits de notification ------------------------------------------------------------------

export const CANAUX_NOTIFICATION = ['outil', 'email'] as const
export type CanalNotification = (typeof CANAUX_NOTIFICATION)[number]

export type DonneesGabarit = {
  evenementCode: string
  parcoursId: bigint | null
  canal: CanalNotification
  objet: string
  corps: string
  destinatairesSupplementaires: string[]
  actif: boolean
}

export async function listerGabarits() {
  return prisma.notification_templates.findMany({
    orderBy: [{ evenement_code: 'asc' }, { canal: 'asc' }],
    select: {
      id: true,
      evenement_code: true,
      parcours_id: true,
      canal: true,
      objet: true,
      corps: true,
      actif: true,
      destinataires_email_supplementaires: true,
      parcours: { select: { libelle: true } },
    },
  })
}

export async function enregistrerGabarit(
  acteur: Acteur,
  donnees: DonneesGabarit,
  gabaritId?: bigint
): Promise<bigint> {
  const valeurs = {
    evenement_code: donnees.evenementCode,
    parcours_id: donnees.parcoursId,
    canal: donnees.canal,
    objet: donnees.objet,
    corps: donnees.corps,
    actif: donnees.actif,
    destinataires_email_supplementaires:
      donnees.destinatairesSupplementaires.length > 0
        ? donnees.destinatairesSupplementaires
        : undefined,
  }

  if (gabaritId === undefined) {
    const cree = await prisma.notification_templates.create({
      data: { ...valeurs, created_at: new Date(), updated_at: new Date() },
      select: { id: true },
    })

    await journaliser({
      action: 'notification_template.cree',
      acteurId: acteur.id,
      auditableType: MODELES.notificationTemplate,
      auditableId: String(cree.id),
      nouvelles: attributsCrees({
        ...valeurs,
        destinataires_email_supplementaires: donnees.destinatairesSupplementaires,
      }),
    })

    return cree.id
  }

  const avant = await prisma.notification_templates.findUniqueOrThrow({ where: { id: gabaritId } })

  await prisma.notification_templates.update({
    where: { id: gabaritId },
    data: {
      ...valeurs,
      // `undefined` conserverait la valeur : pour effacer la liste il faut écrire NULL en base,
      // ce que Prisma exprime par `DbNull` — `null` y désignerait le littéral JSON `null`.
      destinataires_email_supplementaires:
        donnees.destinatairesSupplementaires.length > 0
          ? donnees.destinatairesSupplementaires
          : Prisma.DbNull,
      updated_at: new Date(),
    },
  })

  await journaliserModification(
    'notification_template.modifie',
    MODELES.notificationTemplate,
    String(gabaritId),
    acteur,
    {
      ...(avant as unknown as ValeursAudit),
      destinataires_email_supplementaires: JSON.stringify(
        avant.destinataires_email_supplementaires ?? []
      ),
    },
    {
      ...valeurs,
      destinataires_email_supplementaires: JSON.stringify(donnees.destinatairesSupplementaires),
    }
  )

  return gabaritId
}

// --- Rang et suppression -----------------------------------------------------------------------

export type SensDeplacement = 'monter' | 'descendre'

/** `App\Models\Categorie` → `categorie`, pour composer le code d'action du journal. */
function codeModele(type: ModeleAudite): string {
  return (type.split('\\').pop() ?? type).toLowerCase()
}

/**
 * Déplace une ligne d'un rang, et RENUMÉROTE tout son groupe.
 *
 * Renuméroter plutôt qu'échanger deux valeurs n'est pas un excès de zèle : aujourd'hui, la
 * plupart des listes ont toutes leurs lignes au même rang — leur affichage n'est qu'alphabétique.
 * Échanger deux valeurs identiques ne déplacerait rien du tout. La renumérotation fige donc
 * l'ordre affiché au moment du clic, puis y applique le déplacement demandé.
 *
 * Le groupe est reçu DÉJÀ TRIÉ comme il est affiché : « monter » doit signifier « d'une ligne
 * vers le haut à l'écran », et non « d'une unité de rang ».
 */
async function deplacerDansGroupe(
  acteur: Acteur,
  type: ModeleAudite,
  groupe: readonly { id: bigint; ordre: number }[],
  cibleId: bigint,
  sens: SensDeplacement,
  ecrire: (id: bigint, ordre: number) => Prisma.PrismaPromise<unknown>
): Promise<void> {
  const depuis = groupe.findIndex((l) => l.id === cibleId)

  if (depuis === -1) throw new ErreurWorkflow('Entrée introuvable.')

  const vers = sens === 'monter' ? depuis - 1 : depuis + 1

  if (vers < 0 || vers >= groupe.length) {
    throw new ErreurWorkflow(
      sens === 'monter'
        ? 'Cette entrée est déjà la première.'
        : 'Cette entrée est déjà la dernière.'
    )
  }

  const ordonne = [...groupe]
  ;[ordonne[depuis], ordonne[vers]] = [ordonne[vers], ordonne[depuis]]

  // Une seule transaction : un groupe à moitié renuméroté porterait des rangs en double, donc un
  // classement qui dépendrait de l'ordre de lecture de la base.
  await prisma.$transaction(ordonne.map((ligne, index) => ecrire(ligne.id, index + 1)))

  // Le journal ne retient que la ligne sur laquelle on a agi. Les autres rangs bougent
  // mécaniquement ; les tracer une par une noierait le geste réel sous sa comptabilité.
  await journaliserModification(
    `${codeModele(type)}.modifie`,
    type,
    String(cibleId),
    acteur,
    { ordre: groupe[depuis].ordre } as unknown as ValeursAudit,
    { ordre: vers + 1 }
  )
}

export async function deplacerCategorie(
  acteur: Acteur,
  categorieId: bigint,
  sens: SensDeplacement
): Promise<void> {
  const cible = await prisma.categories.findUniqueOrThrow({
    where: { id: categorieId },
    select: { parcours_id: true },
  })

  // Le groupe, c'est le PARCOURS : les catégories sont affichées regroupées ainsi, et une
  // catégorie d'Événement indésirable n'a pas de rang relatif à une catégorie de Grief.
  const fratrie = await prisma.categories.findMany({
    where: { parcours_id: cible.parcours_id },
    orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
    select: { id: true, ordre: true },
  })

  await deplacerDansGroupe(acteur, MODELES.categorie, fratrie, categorieId, sens, (id, ordre) =>
    prisma.categories.update({ where: { id }, data: { ordre, updated_at: new Date() } })
  )
}

export async function deplacerPoste(
  acteur: Acteur,
  posteId: bigint,
  sens: SensDeplacement
): Promise<void> {
  const cible = await prisma.postes.findUniqueOrThrow({
    where: { id: posteId },
    select: { direction_id: true },
  })

  const fratrie = await prisma.postes.findMany({
    where: { direction_id: cible.direction_id },
    orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
    select: { id: true, ordre: true },
  })

  await deplacerDansGroupe(acteur, MODELES.poste, fratrie, posteId, sens, (id, ordre) =>
    prisma.postes.update({ where: { id }, data: { ordre, updated_at: new Date() } })
  )
}

/* Même contrainte qu'à `listerListePlate()` : un `switch` explicite, pas un délégué dynamique. */
function ecrireRangListePlate(liste: ListePlate, id: bigint, ordre: number) {
  const data = { ordre, updated_at: new Date() }

  if (liste === 'lieu') return prisma.lieux.update({ where: { id }, data })
  return prisma.villes.update({ where: { id }, data })
}

export async function deplacerListePlate(
  acteur: Acteur,
  liste: ListePlate,
  ligneId: bigint,
  sens: SensDeplacement
): Promise<void> {
  const lignes = await listerListePlate(liste)

  await deplacerDansGroupe(
    acteur,
    MODELE_DE_LISTE[liste],
    lignes.map((l) => ({ id: l.id, ordre: l.ordre })),
    ligneId,
    sens,
    (id, ordre) => ecrireRangListePlate(liste, id, ordre)
  )
}

/**
 * Supprime une catégorie — À CONDITION que rien ne la cite.
 *
 * `dossiers` et `statistiques_mensuelles` portent une clé vers `categories`. Effacer une ligne
 * citée laisserait des dossiers dont plus personne ne saurait dire de quoi ils traitaient, et des
 * agrégats dont la colonne de regroupement aurait disparu : c'est exactement ce que RG-03
 * protège. Le refus est donc une règle, pas une prudence — et la désactivation reste offerte, qui
 * retire l'entrée des formulaires sans toucher au passé.
 */
export async function supprimerCategorie(acteur: Acteur, categorieId: bigint): Promise<void> {
  const cible = await prisma.categories.findUniqueOrThrow({
    where: { id: categorieId },
    select: {
      code: true,
      libelle: true,
      is_autre: true,
      actif: true,
      ordre: true,
      parcours_id: true,
      _count: { select: { dossiers: true, statistiques_mensuelles: true } },
    },
  })

  const { dossiers, statistiques_mensuelles: statistiques } = cible._count

  if (dossiers > 0 || statistiques > 0) {
    const citations = [
      dossiers > 0 ? `${dossiers} dossier${dossiers > 1 ? 's' : ''}` : null,
      statistiques > 0
        ? `${statistiques} ligne${statistiques > 1 ? 's' : ''} de statistiques`
        : null,
    ]
      .filter(Boolean)
      .join(' et ')

    throw new ErreurWorkflow(
      `Cette catégorie est citée par ${citations} : la supprimer rendrait cet historique ` +
        'incohérent. Désactivez-la pour la retirer des formulaires.'
    )
  }

  await prisma.categories.delete({ where: { id: categorieId } })

  await journaliser({
    action: 'categorie.supprimee',
    acteurId: acteur.id,
    auditableType: MODELES.categorie,
    auditableId: String(categorieId),
    // Les valeurs effacées sont consignées : c'est la seule trace qui restera de la ligne.
    anciennes: {
      code: cible.code,
      libelle: cible.libelle,
      is_autre: cible.is_autre,
      actif: cible.actif,
      ordre: cible.ordre,
      parcours_id: String(cible.parcours_id),
    },
  })
}

/**
 * Supprime un poste.
 *
 * Aucune table ne porte de clé vers `postes` : le poste choisi est recopié en TEXTE dans la
 * déclaration. Effacer la ligne ne réécrit donc aucun historique — elle disparaît seulement de la
 * liste proposée à la saisie suivante.
 */
export async function supprimerPoste(acteur: Acteur, posteId: bigint): Promise<void> {
  const cible = await prisma.postes.findUniqueOrThrow({
    where: { id: posteId },
    select: { libelle: true, actif: true, ordre: true, direction_id: true },
  })

  await prisma.postes.delete({ where: { id: posteId } })

  await journaliser({
    action: 'poste.supprime',
    acteurId: acteur.id,
    auditableType: MODELES.poste,
    auditableId: String(posteId),
    anciennes: {
      libelle: cible.libelle,
      actif: cible.actif,
      ordre: cible.ordre,
      direction_id: String(cible.direction_id),
    },
  })
}

/**
 * Supprime un lieu ou une ville — À CONDITION qu'aucun dossier ne l'ait retenu.
 *
 * ⚠️ CE CONTRÔLE MANQUAIT, et le commentaire qui l'en dispensait disait : « ces trois listes ne
 * sont citées par aucune clé étrangère ». C'était exact et trompeur. Elles SONT citées —
 * `dossiers.lieu` et `dossiers.ville` portent le LIBELLÉ en clair, délibérément, pour que
 * renommer un référentiel ne réécrive pas ce qu'un déclarant a répondu. Simplement, le lien ne
 * passe pas par une clé, donc PostgreSQL ne pouvait pas s'y opposer, donc personne ne s'y
 * opposait.
 *
 * Le défaut n'était pas théorique : `users.poste` porte aujourd'hui « CS Achat », un libellé
 * absent de `postes`. Un dossier dont le lieu a été effacé du référentiel affiche une valeur que
 * plus aucune liste ne propose, et que plus rien n'explique.
 *
 * ⚠️ LE LIBELLÉ EST LA CLÉ ICI, faute de mieux : c'est lui qui est stocké sur le dossier. Le
 * décompte porte donc sur `cible.libelle`, et non sur l'identifiant de la ligne.
 */
export async function supprimerListePlate(
  acteur: Acteur,
  liste: ListePlate,
  ligneId: bigint
): Promise<void> {
  const lignes = await listerListePlate(liste)
  const cible = lignes.find((l) => l.id === ligneId)

  if (!cible) throw new ErreurWorkflow('Entrée introuvable.')

  const citations = await prisma.dossiers.count({
    where: liste === 'lieu' ? { lieu: cible.libelle } : { ville: cible.libelle },
  })

  if (citations > 0) {
    throw new ErreurWorkflow(
      `« ${cible.libelle} » est cité par ${citations} dossier${citations > 1 ? 's' : ''} : ` +
        'le supprimer rendrait ces déclarations incompréhensibles. ' +
        'Désactivez cette entrée pour la retirer des formulaires sans toucher à l’historique.'
    )
  }

  if (liste === 'lieu') await prisma.lieux.delete({ where: { id: ligneId } })
  else await prisma.villes.delete({ where: { id: ligneId } })

  await journaliser({
    action: `${codeModele(MODELE_DE_LISTE[liste])}.supprimee`,
    acteurId: acteur.id,
    auditableType: MODELE_DE_LISTE[liste],
    auditableId: String(ligneId),
    anciennes: { libelle: cible.libelle, actif: cible.actif, ordre: cible.ordre },
  })
}

// --- Journalisation commune --------------------------------------------------------------------

async function journaliserModification(
  action: string,
  type: (typeof MODELES)[keyof typeof MODELES],
  id: string,
  acteur: Acteur,
  avant: ValeursAudit,
  apres: ValeursAudit
): Promise<void> {
  const ecart = difference(avant, apres)

  // Un enregistrement sans changement ne produit pas de ligne : sinon le journal se remplit de
  // bruit et le vrai changement devient introuvable.
  if (sansChangement(ecart)) return

  await journaliser({
    action,
    acteurId: acteur.id,
    auditableType: type,
    auditableId: id,
    anciennes: ecart.anciennes,
    nouvelles: ecart.nouvelles,
  })
}

/* ==========================================================================
   Référentiels des formulaires (retour métier du 11/09/2026)
   ==========================================================================

   Postes, lieux, villes et tranches d'ancienneté alimentent les listes déroulantes des
   formulaires publics. Tous portent `actif` et AUCUN ne se supprime : une valeur retirée de
   l'usage se désactive, sans quoi les déclarations qui l'ont retenue perdraient le sens de ce
   qui y a été choisi. C'est la même règle que pour les sites et les directions.
*/

export type DonneesPoste = {
  directionId: bigint
  libelle: string
  actif: boolean
}

/** Rang puis alphabétique, dans chaque direction — voir `listerCategories()` pour le motif. */
export async function listerPostes() {
  return prisma.postes.findMany({
    orderBy: [{ directions: { libelle: 'asc' } }, { ordre: 'asc' }, { libelle: 'asc' }],
    select: {
      id: true,
      libelle: true,
      actif: true,
      ordre: true,
      direction_id: true,
      directions: { select: { libelle: true } },
    },
  })
}

export async function enregistrerPoste(
  acteur: Acteur,
  donnees: DonneesPoste,
  posteId?: bigint
): Promise<bigint> {
  // L'unicité porte sur le COUPLE (direction, libellé) : deux directions peuvent légitimement
  // compter un « Responsable d'exploitation ». La contrainte base reste le filet final ; cette
  // vérification n'est là que pour rendre l'erreur intelligible.
  const doublon = await prisma.postes.findFirst({
    where: {
      direction_id: donnees.directionId,
      libelle: donnees.libelle,
      ...(posteId ? { NOT: { id: posteId } } : {}),
    },
    select: { id: true },
  })

  if (doublon) {
    throw new ErreurWorkflow('Ce poste existe déjà pour cette direction.')
  }

  const valeurs = {
    direction_id: donnees.directionId,
    libelle: donnees.libelle,
    actif: donnees.actif,
  }
  const maintenant = new Date()

  if (posteId === undefined) {
    const creee = await prisma.postes.create({
      data: { ...valeurs, created_at: maintenant, updated_at: maintenant },
      select: { id: true },
    })

    await journaliser({
      action: 'poste.cree',
      acteurId: acteur.id,
      auditableType: MODELES.poste,
      auditableId: String(creee.id),
      nouvelles: attributsCrees(valeurs),
    })

    return creee.id
  }

  const avant = await prisma.postes.findUniqueOrThrow({ where: { id: posteId } })
  await prisma.postes.update({ where: { id: posteId }, data: { ...valeurs, updated_at: maintenant } })

  await journaliserModification(
    'poste.modifie',
    MODELES.poste,
    String(posteId),
    acteur,
    avant as unknown as ValeursAudit,
    valeurs
  )

  return posteId
}

export type DonneesListeSimple = { libelle: string; actif: boolean }

/**
 * Les deux listes plates partagent la même forme : un libellé et un état.
 *
 * ⚠️ ELLES ÉTAIENT TROIS. Les tranches d'ancienneté ont quitté la base le 2026-09-22 : cinq
 * paliers d'années qui ne dépendent ni du site ni de l'organisation n'avaient rien à gagner à
 * être administrables. Ils sont figés dans `TRANCHES_ANCIENNETE`, où ils deviennent une
 * énumération refusée à la porte plutôt qu'une chaîne confrontée à une table après coup.
 */
export type ListePlate = 'lieu' | 'ville'

/*
  ⚠️ Un `switch` explicite, et non un délégué Prisma choisi dynamiquement.

  Regrouper `prisma.lieux` et `prisma.villes` dans une table de correspondance produit une UNION
  de signatures que TypeScript déclare non appelable : chaque modèle a ses propres types d'entrée.
  Le contourner par un `any` aurait fait perdre exactement ce qui protège ici — la vérification
  que les colonnes écrites existent.
*/
export async function listerListePlate(liste: ListePlate) {
  // Rang puis alphabétique — voir `listerCategories()` pour le motif.
  const options = { orderBy: [{ ordre: 'asc' as const }, { libelle: 'asc' as const }] }

  if (liste === 'lieu') return prisma.lieux.findMany(options)
  return prisma.villes.findMany(options)
}

const MODELE_DE_LISTE: Record<ListePlate, ModeleAudite> = {
  lieu: MODELES.lieu,
  ville: MODELES.ville,
}

export async function enregistrerListePlate(
  acteur: Acteur,
  liste: ListePlate,
  donnees: DonneesListeSimple,
  ligneId?: bigint
): Promise<bigint> {
  const existantes = await listerListePlate(liste)
  const doublon = existantes.find((l) => l.libelle === donnees.libelle && l.id !== ligneId)

  if (doublon) {
    throw new ErreurWorkflow('Ce libellé existe déjà.')
  }

  const valeurs = { libelle: donnees.libelle, actif: donnees.actif }
  const maintenant = new Date()

  if (ligneId === undefined) {
    const data = { ...valeurs, created_at: maintenant, updated_at: maintenant }

    const creee =
      liste === 'lieu'
        ? await prisma.lieux.create({ data, select: { id: true } })
        : await prisma.villes.create({ data, select: { id: true } })

    await journaliser({
      action: `${liste}.cree`,
      acteurId: acteur.id,
      auditableType: MODELE_DE_LISTE[liste],
      auditableId: String(creee.id),
      nouvelles: attributsCrees(valeurs),
    })

    return creee.id
  }

  const avant = existantes.find((l) => l.id === ligneId)
  if (!avant) throw new ErreurWorkflow('Ligne introuvable.')

  const data = { ...valeurs, updated_at: maintenant }

  if (liste === 'lieu') await prisma.lieux.update({ where: { id: ligneId }, data })
  else await prisma.villes.update({ where: { id: ligneId }, data })

  await journaliserModification(
    `${liste}.modifie`,
    MODELE_DE_LISTE[liste],
    String(ligneId),
    acteur,
    avant as unknown as ValeursAudit,
    valeurs
  )

  return ligneId
}
