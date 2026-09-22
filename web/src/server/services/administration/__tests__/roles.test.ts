import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { chargerUtilisateurAutorise } from '@/server/authz'
import { nettoyerAudit } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import {
  changerActivationRole,
  chargerHabilitations,
  modifierIdentiteRole,
} from '../habilitations'
import { enregistrerUtilisateur } from '../utilisateurs'
import { MODELES } from '@/server/modeles'

/**
 * Rôles administrables : identité modifiable, activation réversible.
 *
 * La propriété qui compte n'est pas qu'un écran affiche « désactivé » — c'est qu'un rôle
 * désactivé cesse RÉELLEMENT de conférer ses droits, à la requête suivante. Ces cas l'exercent
 * de bout en bout, sur un vrai compte, en relisant les autorisations comme le fait chaque page.
 */
const MODEL_TYPE_USER = MODELES.utilisateur
const MODEL_TYPE_ROLE = MODELES.role

const comptesCrees: bigint[] = []
const rolesTouches = new Set<string>()

async function acteur() {
  const utilisateur = await prisma.users.findFirstOrThrow({ select: { id: true } })
  return { id: utilisateur.id }
}

/**
 * Rôle de test : porté par personne aujourd'hui, et sans `roles.manage`.
 *
 * Choisi dynamiquement plutôt que codé en dur : un rôle figé finirait par se retrouver attribué
 * à quelqu'un, et le test désactiverait alors un rôle en service — sur la base réelle.
 */
async function roleSansEnjeu(): Promise<string> {
  const candidats = await prisma.roles.findMany({
    where: {
      actif: true,
      model_has_roles: { none: {} },
      role_has_permissions: { none: { permissions: { name: 'roles.manage' } } },
    },
    select: { name: true },
    orderBy: { name: 'asc' },
  })

  expect(candidats.length, 'aucun rôle libre pour le test').toBeGreaterThan(0)
  return candidats[0].name
}

async function creerCompte(roles: string[]) {
  const resultat = await enregistrerUtilisateur(await acteur(), {
    name: 'Compte de test — rôles',
    email: `test-roles-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
    matricule: null,
    poste: null,
    directionId: null,
    siteId: null,
    responsableHierarchiqueId: null,
    actif: true,
    roles,
    parcours: [],
  })

  comptesCrees.push(resultat.utilisateurId)
  return resultat.utilisateurId
}

afterEach(async () => {
  // Remise en état AVANT toute autre chose : un rôle laissé désactivé priverait de leurs droits
  // des comptes réels, bien après la fin de la suite.
  for (const nom of rolesTouches) {
    await prisma.roles.updateMany({ where: { name: nom }, data: { actif: true } })
  }

  const idsRoles = await prisma.roles.findMany({
    where: { name: { in: [...rolesTouches] } },
    select: { id: true },
  })

  await nettoyerAudit(
    MODEL_TYPE_ROLE,
    idsRoles.map((r) => r.id)
  )
  rolesTouches.clear()

  if (comptesCrees.length === 0) return

  await prisma.audit_logs.deleteMany({ where: { user_id: { in: comptesCrees } } })
  await nettoyerAudit(MODEL_TYPE_USER, comptesCrees)
  await prisma.model_has_roles.deleteMany({
    where: { model_type: MODEL_TYPE_USER, model_id: { in: comptesCrees } },
  })
  await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })
  comptesCrees.length = 0
})

describe('Désactivation', () => {
  it('retire ses droits ET son parcours à qui porte le rôle', async () => {
    const nom = await roleSansEnjeu()
    rolesTouches.add(nom)

    const utilisateurId = await creerCompte([nom])

    const avant = await chargerUtilisateurAutorise(utilisateurId)
    expect(avant?.roles).toContain(nom)
    const permissionsAvant = avant ? [...avant.permissions] : []

    await changerActivationRole(await acteur(), nom, false)

    const apres = await chargerUtilisateurAutorise(utilisateurId)

    // Le rôle disparaît de `roles`, pas seulement ses permissions : `parcoursAutorises()` et
    // `aRole()` s'appuient dessus, et un rôle éteint qui ouvrirait encore un parcours serait pire
    // qu'un rôle actif.
    expect(apres?.roles).not.toContain(nom)

    for (const permission of permissionsAvant) {
      expect([...(apres?.permissions ?? [])], `« ${permission} » subsiste`).not.toContain(permission)
    }
  })

  it('conserve le rattachement : la réactivation rend les droits', async () => {
    const nom = await roleSansEnjeu()
    rolesTouches.add(nom)

    const utilisateurId = await creerCompte([nom])
    const avant = await chargerUtilisateurAutorise(utilisateurId)

    await changerActivationRole(await acteur(), nom, false)
    await changerActivationRole(await acteur(), nom, true)

    const apres = await chargerUtilisateurAutorise(utilisateurId)

    // C'est la différence entre suspendre un rôle et le vider : personne n'a eu à réattribuer.
    expect(apres?.roles).toEqual(avant?.roles)
    expect([...(apres?.permissions ?? [])].sort()).toEqual([...(avant?.permissions ?? [])].sort())

    const liens = await prisma.model_has_roles.count({
      where: { model_type: MODEL_TYPE_USER, model_id: utilisateurId },
    })
    expect(liens).toBe(1)
  })

  it('est journalisée', async () => {
    const nom = await roleSansEnjeu()
    rolesTouches.add(nom)

    await changerActivationRole(await acteur(), nom, false)

    const ligne = await prisma.roles.findFirstOrThrow({
      where: { name: nom },
      select: { id: true },
    })

    const trace = await prisma.audit_logs.findFirst({
      where: { auditable_type: MODEL_TYPE_ROLE, auditable_id: String(ligne.id) },
      orderBy: { id: 'desc' },
      select: { action: true },
    })

    expect(trace?.action).toBe('role.desactive')
  })

  it('refuse de couper le dernier accès administrateur', async () => {
    // Sans aucune commande en ligne, personne ne pourrait plus rétablir la
    // situation. Le contrôle raisonne sur l'état résultant : désactiver le rôle produit le même
    // effet que lui retirer la permission, et les deux chemins doivent être fermés.
    const porteurs = await prisma.roles.findMany({
      where: {
        actif: true,
        role_has_permissions: { some: { permissions: { name: 'roles.manage' } } },
      },
      select: { name: true },
    })

    expect(porteurs.length, 'aucun rôle actif ne gère les habilitations').toBeGreaterThan(0)

    if (porteurs.length > 1) {
      // Plusieurs porteurs : aucun n'est le dernier, le contrôle n'a rien à refuser ici.
      return
    }

    await expect(changerActivationRole(await acteur(), porteurs[0].name, false)).rejects.toThrow(
      ErreurWorkflow
    )

    const inchange = await prisma.roles.findFirstOrThrow({
      where: { name: porteurs[0].name },
      select: { actif: true },
    })
    expect(inchange.actif).toBe(true)
  })
})

describe('Identité du rôle', () => {
  it('modifie le libellé sans jamais toucher l’identifiant technique', async () => {
    const nom = await roleSansEnjeu()
    rolesTouches.add(nom)

    const avant = await prisma.roles.findFirstOrThrow({
      where: { name: nom },
      select: { id: true, libelle: true, description: true },
    })

    await modifierIdentiteRole(await acteur(), nom, {
      libelle: 'Libellé de vérification',
      description: 'Description de vérification.',
    })

    const apres = await prisma.roles.findUniqueOrThrow({
      where: { id: avant.id },
      select: { name: true, libelle: true, description: true },
    })

    expect(apres.name).toBe(nom)
    expect(apres.libelle).toBe('Libellé de vérification')
    expect(apres.description).toBe('Description de vérification.')

    // Remise en état : ce libellé s'affiche partout, il ne doit pas survivre au test.
    await prisma.roles.update({
      where: { id: avant.id },
      data: { libelle: avant.libelle, description: avant.description },
    })
  })

  it('refuse un rôle inconnu et un libellé trop court', async () => {
    const qui = await acteur()

    await expect(
      modifierIdentiteRole(qui, 'role_forge', { libelle: 'Peu importe', description: null })
    ).rejects.toThrow(ErreurWorkflow)

    await expect(
      modifierIdentiteRole(qui, await roleSansEnjeu(), { libelle: 'ab', description: null })
    ).rejects.toThrow(ErreurWorkflow)
  })
})

describe('Écran des habilitations', () => {
  it('expose l’activation et le libellé de chaque rôle', async () => {
    const { lignes } = await chargerHabilitations()

    for (const ligne of lignes) {
      expect(ligne.libelle.length, `« ${ligne.role} » sans libellé`).toBeGreaterThan(0)
      expect(typeof ligne.actif).toBe('boolean')
    }
  })
})
