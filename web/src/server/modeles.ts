/**
 * Les types d'objets du dispositif, tels qu'ils sont ÉCRITS EN BASE.
 *
 * Ces codes apparaissent dans quatre colonnes qu'aucune clé étrangère ne contraint :
 * `audit_logs.auditable_type`, `pieces_jointes.attachable_type`,
 * `model_has_roles.model_type` et `notifications.notifiable_type`. Ce sont des liens
 * POLYMORPHES : la colonne dit à quelle table appartient l'identifiant voisin.
 *
 * ⚠️ ILS PORTAIENT DES NOMS DE CLASSE PHP jusqu'au 2026-09-22, de la forme `App\Models\User`.
 * La raison était bonne en son temps : les deux applications lisaient le même journal pendant la
 * migration, et s'en écarter l'aurait rendu illisible d'un côté. L'application PHP est partie ;
 * la raison avec elle.
 *
 * ⚠️ CE NE SONT PAS DES NOMS INVENTÉS. Chaque code reprend le préfixe que la colonne
 * `audit_logs.action` emploie DÉJÀ pour le même objet — `statut_dossier.modifie`,
 * `famille_risque.creee`, `user.cree`. Les deux colonnes d'une même ligne se contredisaient :
 * l'une disait `App\Models\StatutDossier`, l'autre `statut_dossier`. Elles disent maintenant la
 * même chose, et la seconde table de correspondance qui servait à les réconcilier a disparu.
 *
 * ⚠️ MODULE FEUILLE, SANS AUCUNE IMPORTATION, et c'est délibéré. Ces constantes étaient
 * recopiées à l'identique dans HUIT fichiers (`const MODEL_TYPE_USER = …`), de l'autorisation au
 * stockage. Huit copies d'une valeur qui doit être la même partout, c'est huit occasions de
 * diverger lors d'un renommage — celui-ci, précisément. Un module sans dépendance peut être
 * importé de partout, y compris par `authz`, sans y traîner la moitié du serveur.
 */
export const MODELES = {
  actionCorrective: 'action_corrective',
  canalCaptage: 'canal_captage',
  categorie: 'categorie',
  direction: 'direction',
  dossier: 'dossier',
  dossierAffectation: 'dossier_affectation',
  familleRisque: 'famille_risque',
  investigation: 'investigation',
  lieu: 'lieu',
  message: 'message',
  niveauGravite: 'niveau_gravite',
  notificationTemplate: 'notification_template',
  parcours: 'parcours',
  pieceJointe: 'piece_jointe',
  poste: 'poste',
  qrCode: 'qr_code',
  role: 'role',
  site: 'site',
  slaDelai: 'sla_delai',
  statutDossier: 'statut_dossier',
  trancheAnciennete: 'tranche_anciennete',
  /*
    ⚠️ CLÉ EN FRANÇAIS, VALEUR EN ANGLAIS — et l'écart est le seul de la table.

    La clé est du vocabulaire de code : `MODELES.utilisateur` se lit comme le reste du projet.
    La valeur, elle, n'est pas un choix mais une donnée DÉJÀ ÉCRITE — 73 lignes d'audit portent
    l'action `user.cree` ou `user.modifie`, 61 autres `auth.connexion` sur le même objet. Aligner
    la colonne de type sur le préfixe d'action est tout l'intérêt de l'opération ; franciser la
    valeur rouvrirait l'écart qu'elle ferme, et obligerait à réécrire 134 lignes de journal pour
    un gain purement cosmétique.
  */
  utilisateur: 'user',
  ville: 'ville',
} as const

/** Ce qu'une colonne de type polymorphe peut légitimement contenir. */
export type ModeleAudite = (typeof MODELES)[keyof typeof MODELES]
