import { revalidatePath } from 'next/cache'

/**
 * Quels ÉCRANS une modification rend périmés.
 *
 * ⚠️ LE DÉFAUT QUE CE MODULE CORRIGE : chaque action revalidait le seul écran depuis lequel on
 * l'avait lancée. On changeait le statut d'un dossier, sa fiche se mettait à jour — puis on
 * revenait à la liste, qui affichait encore l'ancien statut. Le serveur rend pourtant ces pages à
 * la demande : c'est le cache de routeur du navigateur qui resservait la version précédente, et
 * `revalidatePath` est ce qui purge l'entrée correspondante.
 *
 * Le retour reçu était « les pages ne sont pas souvent mises à jour après une action » — souvent,
 * et non toujours, parce que l'écran d'origine, lui, se rafraîchissait bien.
 *
 * ⚠️ CE MODULE EST LE SEUL ENDROIT où cette liste est tenue. Une action qui énumère ses propres
 * chemins finit par en oublier un le jour où un écran se met à lire la même donnée — et l'oubli
 * ne se voit pas : la page affiche simplement quelque chose d'ancien, sans erreur.
 *
 * Revalider un chemin de trop ne coûte presque rien : ces pages sont rendues à la demande, il n'y
 * a pas de calcul à refaire, seulement une entrée de cache à retirer. En oublier un se paie en
 * confiance.
 */

/**
 * Tout ce qu'un changement sur un dossier touche.
 *
 * Sa fiche, évidemment — mais aussi la liste des dossiers (statut, gravité, échéance), le tableau
 * de bord (compteurs, « vos dossiers à traiter », répartitions par statut, gravité et famille de
 * risque), et les deux registres transverses, qui affichent tous deux l'état du dossier parent.
 */
export function revaliderDossier(dossierId: string): void {
  revalidatePath(`/dossiers/${dossierId}`)
  revalidatePath('/dossiers')
  revalidatePath('/dashboard')
  revalidatePath('/investigations')
  revalidatePath('/actions-correctives')
}

/**
 * Tout ce qu'un changement d'habilitation touche.
 *
 * ⚠️ BIEN AU-DELÀ DE L'ÉCRAN DES HABILITATIONS. Cocher un type de déclaration sur un rôle change
 * ce que voient TOUS ses porteurs : leurs listes, leur tableau de bord, et la colonne « ce que ce
 * compte verra » de la console des comptes. Ne revalider que l'écran d'origine laissait ces pages
 * annoncer un périmètre qui n'était plus le bon.
 */
export function revaliderHabilitations(): void {
  revalidatePath('/administration/habilitations')
  revalidatePath('/administration/utilisateurs')
  revalidatePath('/dossiers')
  revalidatePath('/dashboard')
}

/**
 * Tout ce qu'un changement sur un compte touche.
 *
 * L'écran des comptes, et celui des habilitations : il affiche pour chaque rôle le nombre de
 * comptes qui le portent, et c'est ce nombre qui décide si le rôle est supprimable.
 */
export function revaliderComptes(): void {
  revalidatePath('/administration/utilisateurs')
  revalidatePath('/administration/habilitations')
}
