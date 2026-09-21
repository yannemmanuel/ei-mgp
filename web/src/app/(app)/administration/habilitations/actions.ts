'use server'

import { utilisateurCourant } from '@/server/auth'
import { aPermission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  changerActivationRole,
  changerComportementRole,
  COMPORTEMENTS_NOMS,
  COMPORTEMENTS_ROLE,
  creerRole,
  modifierEtapesRole,
  modifierIdentiteRole,
  modifierParcoursRole,
  modifierPermissionsRole,
  supprimerRole,
  type ComportementRole,
} from '@/server/services/administration/habilitations'
import { revaliderHabilitations } from '@/server/revalidation'

/**
 * Modification des habilitations d'un rôle.
 *
 * L'effet est immédiat et global : les permissions sont relues en base à chaque requête. Une
 * erreur ici change ce que tout le monde peut faire, d'où la revérification d'autorisation et la
 * validation stricte côté service.
 */
export type EtatHabilitation = { erreur?: string; succes?: string }

export async function actionModifierHabilitations(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à modifier les habilitations." }
  }

  const role = String(donnees.get('role') ?? '').trim()

  if (role === '') return { erreur: 'Rôle manquant.' }

  // Cases décochées : le navigateur ne les envoie pas. L'absence vaut retrait — c'est bien le
  // sens voulu, la liste reçue décrit l'état complet du rôle.
  const permissions = donnees.getAll('permissions').map((p) => String(p))

  try {
    await modifierPermissionsRole(acteur, role, permissions)
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Modification des habilitations en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }

  revaliderHabilitations()
  return { succes: `Habilitations de « ${role} » enregistrées. Effet immédiat.` }
}

/**
 * Les quatre comportements du rôle — voir `COMPORTEMENTS_ROLE`.
 *
 * Même portée que les permissions : l'effet est immédiat et vaut pour tous les porteurs du rôle.
 * L'autorisation est donc revérifiée ici, indépendamment de l'affichage de l'écran.
 *
 * ⚠️ UN SEUL FORMULAIRE, QUATRE ÉCRITURES — et c'est voulu. Le service n'écrit et ne journalise
 * que ce qui CHANGE réellement : cocher une case n'inscrit qu'une ligne au journal, et non quatre
 * dont trois ne disent rien. Quatre formulaires séparés auraient obligé à quatre allers-retours
 * pour paramétrer un rôle neuf.
 */
export async function actionChangerComportementsRole(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à modifier les habilitations." }
  }

  const role = String(donnees.get('role') ?? '').trim()

  if (role === '') return { erreur: 'Rôle manquant.' }

  /*
    Cases décochées : le navigateur ne les envoie pas. On lit donc le catalogue, pas le
    formulaire — une case absente vaut « non », jamais « ne pas toucher ».

    ⚠️ LE CATALOGUE EST LA SOURCE, et le service le revalide de son côté : un champ forgé ne peut
    désigner que l'un des quatre comportements, jamais une autre colonne de `roles`.
  */
  const cochees = new Set(donnees.getAll('comportements').map((c) => String(c)))

  try {
    for (const comportement of COMPORTEMENTS_NOMS) {
      await changerComportementRole(
        acteur,
        role,
        comportement as ComportementRole,
        cochees.has(comportement)
      )
    }
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Modification des comportements du rôle en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }

  revaliderHabilitations()

  const actifs = COMPORTEMENTS_NOMS.filter((c) => cochees.has(c))

  return {
    succes:
      actifs.length === 0
        ? `« ${role} » ne porte plus aucun de ces comportements.`
        : `Enregistré : ${actifs.map((c) => COMPORTEMENTS_ROLE[c].libelle.toLowerCase()).join(', ')}. Effet immédiat.`,
  }
}

/**
 * La grille « qui fait avancer quoi » : les étapes que ce rôle peut franchir, par type.
 *
 * ⚠️ CE GESTE PEUT BLOQUER UN CIRCUIT. Décocher la dernière case d'une colonne n'affiche aucune
 * erreur : les dossiers arrivent à cette étape et n'en repartent jamais. Le tableau de bord
 * d'administration remonte ces colonnes vides — c'est le seul endroit où on les verra.
 */
export async function actionModifierEtapesRole(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à modifier les habilitations." }
  }

  const role = String(donnees.get('role') ?? '').trim()

  if (role === '') return { erreur: 'Rôle manquant.' }

  /*
    Chaque case cochée arrive sous la forme « type/étape ». Un couple mal formé est REFUSÉ plutôt
    qu'ignoré : l'ignorer enregistrerait une grille amputée en annonçant que tout est enregistré.
  */
  const cases: { parcours: string; statut: string }[] = []

  for (const brut of donnees.getAll('etapes')) {
    const [parcours, statut] = String(brut).split('/')

    if (!parcours || !statut) return { erreur: 'Grille des étapes illisible.' }

    cases.push({ parcours, statut })
  }

  try {
    await modifierEtapesRole(acteur, role, cases)
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Modification des étapes du rôle en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }

  revaliderHabilitations()

  return {
    succes:
      cases.length === 0
        ? `« ${role} » ne peut plus faire avancer aucun dossier.`
        : `${cases.length} étape(s) enregistrée(s) pour « ${role} ». Effet immédiat.`,
  }
}

/**
 * Types de déclaration ouverts par un rôle.
 *
 * Même portée que les permissions : l'effet est immédiat et vaut pour tous les porteurs du rôle.
 * L'autorisation est donc revérifiée ici, indépendamment de l'affichage de l'écran.
 */
export async function actionModifierParcoursRole(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à modifier les habilitations." }
  }

  const role = String(donnees.get('role') ?? '').trim()

  if (role === '') return { erreur: 'Rôle manquant.' }

  // Cases décochées : le navigateur ne les envoie pas. L'absence vaut retrait — la liste reçue
  // décrit l'état complet du rôle.
  const parcours = donnees.getAll('parcours').map((p) => String(p))

  /*
    L'alerte de circuit accéléré vit sur la MÊME ligne que le type (`role_parcours`), et se règle
    donc dans le même geste. Décocher un type emporte son alerte : la ligne disparaît.
  */
  const circuit = donnees.getAll('circuitCritique').map((p) => String(p))

  try {
    await modifierParcoursRole(acteur, role, parcours, circuit)
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Modification des types de déclaration en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }

  revaliderHabilitations()

  return {
    succes:
      parcours.length === 0
        ? `« ${role} » n’ouvre plus aucun type de déclaration. Ses porteurs ne voient plus aucun dossier.`
        : `Types de déclaration de « ${role} » enregistrés. Effet immédiat.`,
  }
}

/**
 * Modification du nom lisible d'un rôle et de sa description.
 *
 * L'identifiant technique n'est pas exposé ici et ne le sera pas : il est référencé par le
 * cloisonnement des parcours, qu'un renommage romprait sans rien signaler.
 */
export async function actionModifierIdentiteRole(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à modifier les rôles." }
  }

  const role = String(donnees.get('role') ?? '').trim()
  if (role === '') return { erreur: 'Rôle manquant.' }

  const libelle = String(donnees.get('libelle') ?? '')
  const description = String(donnees.get('description') ?? '')

  try {
    await modifierIdentiteRole(acteur, role, { libelle, description })
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Modification du rôle en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }

  revaliderHabilitations()
  return { succes: 'Rôle enregistré.' }
}

/**
 * Activation ou désactivation d'un rôle.
 *
 * Un rôle désactivé cesse de conférer ses permissions à la requête suivante, pour tous les comptes
 * qui le portent. C'est l'opération la plus lourde de conséquences de cet écran — le service
 * refuse celle qui priverait le dispositif de tout administrateur.
 */
export async function actionChangerActivationRole(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à modifier les rôles." }
  }

  const role = String(donnees.get('role') ?? '').trim()
  if (role === '') return { erreur: 'Rôle manquant.' }

  const actif = String(donnees.get('actif') ?? '') === '1'

  try {
    await changerActivationRole(acteur, role, actif)
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Changement d’activation du rôle en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }

  revaliderHabilitations()

  return {
    succes: actif
      ? 'Rôle réactivé. Les comptes qui le portent retrouvent leurs droits.'
      : 'Rôle désactivé. Il ne confère plus aucun droit, dès la requête suivante.',
  }
}

/**
 * Création d'un rôle.
 *
 * L'identifiant technique est dérivé du libellé par le service, jamais saisi : il devient une clé
 * dans `model_has_roles` et dans le journal d'audit, et ne changera plus.
 */
export async function actionCreerRole(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à créer un rôle." }
  }

  const libelle = String(donnees.get('libelle') ?? '')
  const description = String(donnees.get('description') ?? '')
  const permissions = donnees.getAll('permissions').map((p) => String(p))

  try {
    await creerRole(acteur, { libelle, description, permissions })
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Création du rôle en échec', erreur)
    return { erreur: "La création n'a pas abouti. Vous pouvez réessayer." }
  }

  revaliderHabilitations()

  return {
    succes: `Rôle « ${libelle.trim()} » créé. Attribuez-le depuis la console des comptes.`,
  }
}

/**
 * Suppression d'un rôle.
 *
 * Le service refuse un rôle livré — le code s'y réfère — et un rôle encore porté par un compte.
 * Ce sont les deux seules formes de suppression qui retireraient un accès sans le dire.
 */
export async function actionSupprimerRole(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à supprimer un rôle." }
  }

  const role = String(donnees.get('role') ?? '').trim()
  if (role === '') return { erreur: 'Rôle manquant.' }

  try {
    await supprimerRole(acteur, role)
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Suppression du rôle en échec', erreur)
    return { erreur: "La suppression n'a pas abouti. Vous pouvez réessayer." }
  }

  revaliderHabilitations()
  return { succes: 'Rôle supprimé. Le journal en garde la trace.' }
}
