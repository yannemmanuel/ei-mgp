import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import {
  MODELES,
  attributsCrees,
  difference,
  journaliser,
  sansChangement,
  type ValeursAudit,
} from '../audit/journal'

/**
 * Référentiels administrables (module 7) — port des composants `App\Livewire\Administration\*`.
 *
 * **Aucune suppression n'est exposée, nulle part.** Un référentiel déjà cité par un dossier ne
 * peut pas disparaître sans casser l'intégrité de l'historique : seule la désactivation (`actif`)
 * est proposée, comme pour les dossiers eux-mêmes (RG-03).
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
  ordre: number
}

export async function listerCategories() {
  return prisma.categories.findMany({
    orderBy: [{ parcours_id: 'asc' }, { ordre: 'asc' }],
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
    ordre: donnees.ordre,
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
