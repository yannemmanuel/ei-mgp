/**
 * Traduction des codes d'action du journal en français lisible.
 *
 * Le journal stockait — et affichait — des codes de la forme `role.permissions_modifiees`. C'est
 * la clé technique de l'évènement, et elle doit le rester : les filtres, les tests et les lignes
 * déjà écrites s'y réfèrent. Mais rien n'oblige à la MONTRER telle quelle à qui vient chercher ce
 * qui s'est passé.
 *
 * La traduction est décomposée en deux tables plutôt qu'énumérée action par action : un code
 * nouveau, ajouté ailleurs dans le code, se traduit alors tout seul. ⚠️ Et quand il ne se traduit
 * pas, `libelleAction` rend le code BRUT — jamais un tiret ni un vide. Une ligne d'audit qu'on ne
 * sait pas nommer doit rester visible et identifiable ; la masquer serait pire que l'afficher
 * mal.
 */

const OBJETS: Record<string, string> = {
  action_corrective: 'Action corrective',
  auth: 'Session',
  canal_captage: 'Canal de réception',
  categorie: 'Catégorie',
  direction: 'Direction',
  dossier: 'Dossier',
  dossier_affectation: 'Affectation',
  investigation: 'Investigation',
  message: 'Message',
  niveau_gravite: 'Niveau de gravité',
  notification: 'Notification',
  notification_template: 'Modèle de message',
  piece_jointe: 'Pièce jointe',
  qr_code: 'QR code',
  rapport: 'Rapport',
  role: 'Rôle',
  site: 'Site',
  sla_delai: 'Délai',
  statut_dossier: 'Statut',
  poste: 'Poste',
  lieu: 'Lieu',
  ville: 'Ville',
  trancheAnciennete: 'Tranche d’ancienneté',
  /*
    ⚠️ Deux écritures pour le même objet, et il faut garder les deux.

    Le code d'action est composé par interpolation de la clé de liste — `trancheAnciennete` — et
    arrive en base tout en minuscules, contrairement à toutes les autres actions, qui suivent le
    serpent : `niveau_gravite`, `canal_captage`, `notification_template`. Deux lignes portent déjà
    la forme aplatie ; le journal étant en ajout seul, elle doit rester lisible pour toujours.

    La forme conventionnelle est prévue ici pour le jour où l'émetteur sera aligné. Les deux
    cohabiteront alors sans que rien ne se perde.
  */
  trancheanciennete: 'Tranche d’ancienneté',
  tranche_anciennete: 'Tranche d’ancienneté',
  suivi: 'Suivi de dossier',
  user: 'Compte',
  // Le TYPE de déclaration lui-même, depuis que ses réglages se paramètrent (familles de risque,
  // 2026-09-21). « Parcours » est le nom technique ; « Type de déclaration » est celui que les
  // écrans emploient, et c'est celui qu'on lit dans le journal.
  parcours: 'Type de déclaration',
  famille_risque: 'Famille de risque',
}

const VERBES: Record<string, string> = {
  active: 'réactivé',
  anonymise: 'anonymisé',
  archive: 'archivé',
  connexion: 'ouverte',
  cree: 'créé',
  creee: 'créée',
  deconnexion: 'fermée',
  desactive: 'désactivé',
  detachee: 'détachée de son site',
  envoyee: 'envoyée',
  export_nominatif: '— export avec les identités',
  gravite_qualifiee: '— gravité qualifiée',
  identifiants_envoyes: '— identifiants envoyés par e-mail',
  identite_modifiee: 'renommé',
  modifie: 'modifié',
  modifiee: 'modifiée',
  mot_de_passe_change: '— mot de passe changé',
  mot_de_passe_regenere: '— mot de passe réattribué',
  parcours_modifies: '— parcours modifiés',
  permissions_modifiees: '— droits modifiés',
  premiere_connexion: '— compte pris en main',
  rattachee: 'rattachée',
  roles_modifies: '— rôles modifiés',
  statut_change: '— statut changé',
  supprime: 'supprimé',
  supprimee: 'supprimée',
  tentative_echouee: '— tentative échouée',
}

/**
 * Le code d'action tel qu'on veut le lire, ou le code brut si on ne sait pas le traduire.
 */
export function libelleAction(code: string): string {
  const separateur = code.indexOf('.')
  if (separateur === -1) return code

  const objet = OBJETS[code.slice(0, separateur)]
  const verbe = VERBES[code.slice(separateur + 1)]
  if (!objet || !verbe) return code

  return `${objet} ${verbe}`
}

const TYPES: Record<string, string> = {
  ActionCorrective: 'Action corrective',
  CanalCaptage: 'Canal de réception',
  Categorie: 'Catégorie',
  Direction: 'Direction',
  Dossier: 'Dossier',
  DossierAffectation: 'Affectation',
  Investigation: 'Investigation',
  Message: 'Message',
  NiveauGravite: 'Niveau de gravité',
  NotificationTemplate: 'Modèle de message',
  PieceJointe: 'Pièce jointe',
  QrCode: 'QR code',
  Role: 'Rôle',
  Site: 'Site',
  SlaDelai: 'Délai',
  StatutDossier: 'Statut',
  Poste: 'Poste',
  Lieu: 'Lieu',
  Ville: 'Ville',
  TrancheAnciennete: 'Tranche d’ancienneté',
  User: 'Compte',
  Parcours: 'Type de déclaration',
  FamilleRisque: 'Famille de risque',
}

/**
 * Le type d'objet visé, en français.
 *
 * La colonne porte le nom de classe PHP hérité de Laravel — « App\Models\User » — et c'est la clé
 * de rapprochement avec les lignes déjà écrites : elle ne bouge pas. Seul son affichage change.
 * Comme pour `libelleAction`, un type inconnu ressort tel quel plutôt que masqué.
 */
export function libelleObjet(type: string): string {
  const court = type.split('\\').pop() ?? type

  return TYPES[court] ?? court
}

const CHAMPS: Record<string, string> = {
  actif: 'Actif',
  canal_captage_id: 'Canal de réception',
  categorie_id: 'Catégorie',
  code: 'Code',
  commentaire: 'Commentaire',
  couleur: 'Couleur',
  date_echeance: 'Échéance',
  description: 'Description',
  direction_id: 'Direction',
  email: 'E-mail',
  jours: 'Jours',
  libelle: 'Libellé',
  libelle_affiche: 'Libellé vu du déclarant',
  libelle_interne: 'Libellé interne',
  matricule: 'Matricule',
  mot_de_passe_change: 'Mot de passe changé',
  mot_de_passe_regenere: 'Mot de passe réattribué',
  motif: 'Motif',
  name: 'Nom',
  niveau: 'Niveau',
  niveau_gravite_id: 'Gravité',
  ordre: 'Ordre',
  parcours: 'Types de déclaration confiés',
  parcours_id: 'Type de déclaration',
  permissions: 'Droits',
  poste: 'Poste',
  responsable_hierarchique_id: 'Responsable',
  roles: 'Rôles',
  site_id: 'Site',
  statut: 'Statut',
  statut_id: 'Statut',
  telephone: 'Téléphone',
  titre: 'Titre',
}

/**
 * Le nom d'un champ modifié, en français — ou le nom de colonne si on ne le connaît pas.
 *
 * Même règle que partout ici : ce qu'on ne sait pas traduire s'affiche quand même. Le journal
 * doit pouvoir montrer un changement sur une colonne ajoutée hier.
 */
export function libelleChamp(champ: string): string {
  return CHAMPS[champ] ?? champ
}
