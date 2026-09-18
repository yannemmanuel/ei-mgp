import { PERMISSIONS, type Permission } from './permissions'
import type { Role } from './roles'

/**
 * Traduction des permissions en langage courant.
 *
 * L'écran des habilitations s'adresse à un DPO, un responsable métier, un auditeur — pas à un
 * développeur. `dossiers.status.update` ne dit rien à personne ; « Faire avancer un dossier » se
 * comprend sans explication.
 *
 * Chaque permission porte donc trois choses : ce qu'elle **permet** (un verbe), ce qu'elle
 * **implique** concrètement (une phrase), et si elle touche à des **données personnelles ou à
 * des droits** — auquel cas l'écran la met en évidence, parce que l'accorder n'est pas anodin.
 *
 * Un test vérifie que chaque permission du catalogue a son entrée : une permission sans libellé
 * s'afficherait sous son nom technique, et personne ne saurait ce qu'il coche.
 */
export type Sensibilite = 'ordinaire' | 'donnees_personnelles' | 'gouvernance'

export type LibellePermission = {
  readonly libelle: string
  readonly explication: string
  readonly sensibilite: Sensibilite
  /**
   * Aucun code ne consulte cette permission : l'accorder ou la retirer ne change rien.
   *
   * Elle existe dans le catalogue et dans la base — héritées de la baseline Laravel —, et la
   * retirer casserait la parité. Mais un droit qui ne fait rien tout en ayant l'air d'agir est
   * pire qu'un droit absent : l'écran doit le dire, et un test vérifie que la mention reste vraie.
   */
  readonly sansEffet?: true
}

export type Domaine = {
  readonly cle: string
  readonly titre: string
  readonly description: string
  readonly permissions: readonly Permission[]
}

export const LIBELLES: Record<Permission, LibellePermission> = {
  // --- Dossiers ---
  'dossiers.view': {
    libelle: 'Consulter les dossiers',
    explication: 'Voir les dossiers des parcours dont le rôle a la charge.',
    sensibilite: 'ordinaire',
  },
  'dossiers.view.own': {
    libelle: 'Consulter ses propres dossiers',
    explication: 'Voir uniquement les dossiers que la personne a elle-même déclarés.',
    sensibilite: 'ordinaire',
  },
  'dossiers.view.all': {
    libelle: 'Consulter tous les dossiers',
    explication: 'Voir les dossiers de TOUS les parcours, sans restriction de périmètre.',
    sensibilite: 'donnees_personnelles',
  },
  'dossiers.create': {
    libelle: 'Déposer une déclaration',
    explication: 'Saisir une déclaration, y compris pour le compte d’un tiers (saisie relais).',
    sensibilite: 'ordinaire',
  },
  'dossiers.assign': {
    libelle: 'Affecter un dossier',
    explication:
      'Désigner qui traite un dossier. La première affectation est automatique ; les suivantes passent par « Réaffecter un dossier ».',
    sensibilite: 'ordinaire',
    // Accorder ou retirer ce droit ne change RIEN. Le dire est le minimum : un administrateur qui
    // le révoque en croyant fermer une porte doit savoir qu'elle n'existe pas.
    sansEffet: true,
  },
  'dossiers.reassign': {
    libelle: 'Réaffecter un dossier',
    explication: 'Confier un dossier à quelqu’un d’autre, avec motif obligatoire.',
    sensibilite: 'ordinaire',
  },
  'dossiers.status.update': {
    libelle: 'Faire avancer un dossier',
    explication: 'Passer un dossier à l’étape suivante du traitement.',
    sensibilite: 'ordinaire',
  },
  'dossiers.close': {
    libelle: 'Clôturer un dossier',
    explication: 'Terminer un dossier résolu, avec une synthèse obligatoire.',
    sensibilite: 'ordinaire',
  },
  'dossiers.reopen': {
    libelle: 'Rouvrir un dossier',
    explication: 'Reprendre un dossier clôturé, avec motif obligatoire.',
    sensibilite: 'ordinaire',
  },

  // --- Investigations ---
  'investigations.view': {
    libelle: 'Consulter les investigations',
    explication: 'Lire les fiches d’enquête rattachées aux dossiers.',
    sensibilite: 'ordinaire',
  },
  'investigations.create': {
    libelle: 'Ouvrir une investigation',
    explication: 'Démarrer une enquête sur un dossier.',
    sensibilite: 'ordinaire',
  },
  'investigations.update': {
    libelle: 'Renseigner une investigation',
    explication: 'Saisir constats, personnes rencontrées, causes et recommandations.',
    sensibilite: 'ordinaire',
  },
  'investigations.validate': {
    libelle: 'Valider une investigation',
    explication:
      'Une investigation n’est plus soumise à validation : la fiche est renseignée puis alimente directement les actions correctives. Ce droit ne commande plus rien.',
    sensibilite: 'ordinaire',
    // Accorder ou retirer ce droit ne change RIEN depuis la suppression de l'étape de validation
    // (2026-09-18). Le dire est le minimum : un administrateur qui le révoque en croyant fermer
    // une porte doit savoir qu'elle n'existe pas.
    sansEffet: true,
  },

  // --- Actions correctives ---
  'actions.view': {
    libelle: 'Consulter les actions correctives',
    explication: 'Lire les mesures décidées à la suite d’un dossier.',
    sensibilite: 'ordinaire',
  },
  'actions.create': {
    libelle: 'Créer une action corrective',
    explication: 'Décider une mesure, désigner son responsable et son échéance.',
    sensibilite: 'ordinaire',
  },
  'actions.update': {
    libelle: 'Faire avancer une action',
    explication: 'Démarrer une action ou la marquer réalisée.',
    sensibilite: 'ordinaire',
  },
  'actions.verify_efficacite': {
    libelle: 'Vérifier l’efficacité d’une action',
    explication: 'Constater si la mesure a effectivement réglé le problème.',
    sensibilite: 'ordinaire',
  },
  'actions.close': {
    libelle: 'Clôturer une action',
    explication: 'Terminer une action dont l’efficacité a été vérifiée positivement.',
    sensibilite: 'ordinaire',
  },

  // --- Messagerie ---
  'messagerie.view': {
    libelle: 'Lire les échanges avec le déclarant',
    explication: 'Consulter la messagerie sécurisée d’un dossier.',
    sensibilite: 'ordinaire',
  },
  'messagerie.send': {
    libelle: 'Répondre au déclarant',
    explication: 'Écrire au déclarant, y compris lorsqu’il est anonyme.',
    sensibilite: 'ordinaire',
  },

  // --- Pilotage et rapports ---
  'reporting.view': {
    libelle: 'Consulter le tableau de bord',
    explication: 'Voir les indicateurs consolidés des quatre parcours.',
    sensibilite: 'ordinaire',
  },
  'reporting.export': {
    libelle: 'Exporter les rapports',
    explication: 'Télécharger les dossiers en Excel ou PDF, sans données d’identité.',
    sensibilite: 'ordinaire',
  },
  'reporting.export.nominatif': {
    libelle: 'Exporter avec les identités',
    explication:
      'Inclure nom, e-mail et téléphone des déclarants dans les exports. Chaque export est enregistré.',
    sensibilite: 'donnees_personnelles',
  },

  // --- Traçabilité ---
  'audit.view': {
    libelle: 'Consulter le journal d’audit',
    explication:
      'Lire l’historique des actions. L’adresse d’origine n’est visible que par le DPO et l’auditeur.',
    sensibilite: 'donnees_personnelles',
  },

  // --- Protection des données ---
  'rgpd.conservation.manage': {
    libelle: 'Gérer la conservation des données',
    explication:
      'Poser ou lever le blocage « contentieux », qui suspend l’effacement automatique à 10 ans.',
    sensibilite: 'gouvernance',
  },
  'rgpd.acces.view': {
    libelle: 'Accéder aux données personnelles',
    explication:
      'Consulter l’identité des déclarants. En pratique, tous les rôles la voient sauf le Comité éthique.',
    sensibilite: 'donnees_personnelles',
    /*
     * Jamais consultée — ni ici, ni dans la baseline Laravel, où le `git grep` ne trouve aucun
     * appel non plus. Le défaut est donc hérité, pas introduit par le portage.
     *
     * L'accès aux identités passe par `peutVoirIdentite()`, une liste d'exclusion à un seul nom :
     * tout le monde voit, sauf `comite_ethique`. Basculer sur cette permission changerait qui voit
     * quoi pour la moitié des rôles — un arbitrage métier, pas une correction technique. La
     * mention dit la vérité en attendant cette décision.
     */
    sansEffet: true,
  },

  // --- Référentiels métier ---
  'referentiels.categories.manage': {
    libelle: 'Gérer les catégories',
    explication: 'Modifier les catégories proposées dans les formulaires de déclaration.',
    sensibilite: 'ordinaire',
  },
  'referentiels.statuts.manage': {
    libelle: 'Gérer les statuts',
    explication: 'Modifier les libellés d’étape, dont celui montré au déclarant.',
    sensibilite: 'ordinaire',
  },
  'referentiels.sites.manage': {
    libelle: 'Gérer les sites',
    explication: 'Ajouter ou désactiver un site d’exploitation.',
    sensibilite: 'ordinaire',
  },
  'referentiels.delais.manage': {
    libelle: 'Gérer les délais de traitement',
    explication:
      'Régler les délais par étape. Un délai désactivé supprime relances et escalades pour cette étape.',
    sensibilite: 'gouvernance',
  },
  'referentiels.gravites.manage': {
    libelle: 'Gérer les niveaux de gravité',
    explication:
      'Régler l’échelle de gravité, dont le déclenchement de l’alerte immédiate à la Direction.',
    sensibilite: 'gouvernance',
  },
  'notifications.templates.manage': {
    libelle: 'Gérer les modèles de notification',
    explication:
      'Modifier objet, corps et destinataires des messages envoyés. Sans modèle actif, plus rien n’est envoyé.',
    sensibilite: 'gouvernance',
  },

  // --- Paramétrage technique ---
  'canaux.manage': {
    libelle: 'Gérer les canaux de réception',
    explication: 'Activer ou renommer les voies par lesquelles une déclaration parvient.',
    sensibilite: 'ordinaire',
  },
  'qrcodes.manage': {
    libelle: 'Gérer les QR codes',
    explication: 'Générer un support d’affichage ou le retirer de la circulation.',
    sensibilite: 'ordinaire',
  },
  'users.manage': {
    libelle: 'Gérer les comptes',
    explication:
      'Créer un compte, l’activer ou le désactiver, lui attribuer des rôles, réattribuer un mot de passe.',
    sensibilite: 'gouvernance',
  },
  'roles.manage': {
    libelle: 'Gérer les habilitations',
    explication:
      'Décider ce que chaque rôle a le droit de faire — y compris cette permission. Au moins un compte actif doit toujours la conserver.',
    sensibilite: 'gouvernance',
  },
}

/**
 * Regroupement par domaine métier, dans un ordre de lecture — du quotidien vers le paramétrage.
 *
 * Le préfixe technique (`dossiers.`, `rgpd.`) ne fait pas un bon regroupement : `audit.view` et
 * `rgpd.acces.view` relèvent tous deux de la traçabilité pour un lecteur, alors que leurs
 * préfixes les séparent.
 */
export const DOMAINES: readonly Domaine[] = [
  {
    cle: 'dossiers',
    titre: 'Dossiers',
    description: 'Consulter et faire avancer les déclarations.',
    permissions: [
      'dossiers.view',
      'dossiers.view.own',
      'dossiers.view.all',
      'dossiers.create',
      'dossiers.assign',
      'dossiers.reassign',
      'dossiers.status.update',
      'dossiers.close',
      'dossiers.reopen',
    ],
  },
  {
    cle: 'investigations',
    titre: 'Investigations',
    description: 'Enquêter sur un dossier et faire valider les conclusions.',
    permissions: [
      'investigations.view',
      'investigations.create',
      'investigations.update',
      'investigations.validate',
    ],
  },
  {
    cle: 'actions',
    titre: 'Actions correctives',
    description: 'Décider des mesures, les suivre, en vérifier l’efficacité.',
    permissions: [
      'actions.view',
      'actions.create',
      'actions.update',
      'actions.verify_efficacite',
      'actions.close',
    ],
  },
  {
    cle: 'messagerie',
    titre: 'Échanges avec le déclarant',
    description: 'Dialoguer avec la personne à l’origine du signalement.',
    permissions: ['messagerie.view', 'messagerie.send'],
  },
  {
    cle: 'pilotage',
    titre: 'Pilotage et rapports',
    description: 'Suivre l’activité et extraire des données.',
    permissions: ['reporting.view', 'reporting.export', 'reporting.export.nominatif'],
  },
  {
    cle: 'conformite',
    titre: 'Traçabilité et protection des données',
    description: 'Contrôler ce qui a été fait, et veiller aux droits des personnes.',
    permissions: ['audit.view', 'rgpd.acces.view', 'rgpd.conservation.manage'],
  },
  {
    cle: 'referentiels',
    titre: 'Paramétrage métier',
    description: 'Régler ce que l’application propose et surveille.',
    permissions: [
      'referentiels.categories.manage',
      'referentiels.statuts.manage',
      'referentiels.sites.manage',
      'referentiels.delais.manage',
      'referentiels.gravites.manage',
      'notifications.templates.manage',
    ],
  },
  {
    cle: 'technique',
    titre: 'Administration technique',
    description: 'Comptes, habilitations et supports de captage.',
    permissions: ['canaux.manage', 'qrcodes.manage', 'users.manage', 'roles.manage'],
  },
]

/** Permissions absentes de tout domaine — vide par construction, vérifié par un test. */
export function permissionsSansDomaine(): Permission[] {
  const classees = new Set(DOMAINES.flatMap((d) => d.permissions))

  return PERMISSIONS.filter((p) => !classees.has(p))
}

/**
 * Noms lisibles des rôles, repris de `docs/acteurs.md` §2.
 *
 * Les identifiants techniques (`secretaire_csst`, `rqse`) sont des abréviations internes : les
 * afficher seuls suppose de connaître l'organisation. Le nom complet est donné en premier,
 * l'identifiant reste visible en dessous pour qui doit le rapprocher d'un document.
 *
 * ⚠️ Ce ne sont plus les valeurs AFFICHÉES : depuis que les rôles sont administrables, le libellé
 * vit dans `roles.libelle` et s'édite depuis `/administration/habilitations`. Ce catalogue reste
 * la RÉFÉRENCE livrée — celle qui a alimenté la base au départ — et le repli si un rôle du code
 * manquait en base. Même partage que pour les permissions : le code dit ce qui existe, la base
 * dit comment cela s'appelle et à qui cela sert.
 */
export const LIBELLES_ROLE: Record<Role, string> = {
  employe_declarant: 'Employé déclarant',
  agent_relais: 'Agent relais',
  secretaire_csst: 'Secrétaire CSST / Comité SST',
  rqse: 'RQSE — Responsable qualité, sécurité, environnement',
  rgp: 'RGP — Responsable gestion des plaintes',
  responsable_grief_employe: 'DRH / Directeur — griefs employés',
  correspondant_mgp: 'Correspondant MGP / Enquêteur',
  correspondant_drh: 'Correspondant DRH — griefs employés',
  correspondant_dadd: 'Correspondant DADD — griefs communautaires',
  correspondant_dl: 'Correspondant DL — griefs sous-traitants',
  responsable_mgp_structure: 'Responsable MGP de structure',
  charge_securite: 'Chargé de sécurité du site',
  service_mgp: 'Service MGP / DADD',
  comite_ethique: 'Comité éthique / Syndicats',
  captage_grief_communaute: 'Captage — griefs communauté',
  captage_grief_soustraitant: 'Captage — griefs sous-traitants',
  dg: 'Direction générale',
  dpo: 'DPO — Référent protection des données',
  administrateur_digital: 'Administrateur digital',
  auditeur: 'Auditeur',
}
