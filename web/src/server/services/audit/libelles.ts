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
  role: 'Rôle',
  site: 'Site',
  sla_delai: 'Délai',
  statut_dossier: 'Statut',
  user: 'Compte',
}

const VERBES: Record<string, string> = {
  anonymise: 'anonymisé',
  archive: 'archivé',
  connexion: 'ouverte',
  cree: 'créé',
  creee: 'créée',
  deconnexion: 'fermée',
  envoyee: 'envoyée',
  identite_modifiee: 'renommé',
  modifie: 'modifié',
  modifiee: 'modifiée',
  mot_de_passe_change: '— mot de passe changé',
  mot_de_passe_regenere: '— mot de passe réattribué',
  permissions_modifiees: '— droits modifiés',
  rattachee: 'rattachée',
  roles_modifies: '— rôles modifiés',
  statut_change: '— statut changé',
  supprime: 'supprimé',
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
  User: 'Compte',
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
