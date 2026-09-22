import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { verifier } from '@/server/auth/hachage'
import { nettoyerAudit } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import {
  enregistrerUtilisateur,
  listerUtilisateurs,
  regenererMotDePasse,
  rolesDisponibles,
} from '../utilisateurs'
import { MODELES } from '@/server/modeles'

/**
 * Console des comptes
 *
 * Trois propriétés de sûreté sont vérifiées ici : le mot de passe n'apparaît jamais en clair ni
 * en empreinte dans l'audit, l'attribution de rôles est tracée séparément (elle échappe au
 * différentiel de colonnes), et un administrateur ne peut pas se verrouiller hors de la console.
 */
const MODEL_TYPE_USER = MODELES.utilisateur
const comptesCrees: bigint[] = []

async function acteur() {
  const utilisateur = await prisma.users.findFirstOrThrow({ select: { id: true } })
  return { id: utilisateur.id }
}

function adresseUnique(): string {
  return `test-migration-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`
}

async function creerCompte(roles: string[] = []) {
  const qui = await acteur()

  const resultat = await enregistrerUtilisateur(qui, {
    name: 'Compte de test',
    email: adresseUnique(),
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
  return resultat
}

afterEach(async () => {
  if (comptesCrees.length === 0) return

  // L'audit référence le compte des deux côtés (acteur et cible) : les traces partent d'abord,
  // sans quoi la contrainte de clé étrangère bloquerait la suppression. Le filtre sur
  // `auditable_id` est TOUJOURS accompagné du type — un identifiant numérique est partagé entre
  // tous les modèles.
  await prisma.audit_logs.deleteMany({ where: { user_id: { in: comptesCrees } } })
  await nettoyerAudit(MODEL_TYPE_USER, comptesCrees)
  await prisma.model_has_roles.deleteMany({
    where: { model_type: MODEL_TYPE_USER, model_id: { in: comptesCrees } },
  })
  await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })

  comptesCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Création de compte', () => {
  it('génère un mot de passe utilisable, haché au format accepté par PHP', async () => {
    const resultat = await creerCompte()

    expect(resultat.motDePasseInitial).toBeTruthy()

    const compte = await prisma.users.findUniqueOrThrow({
      where: { id: resultat.utilisateurId },
      select: { password: true },
    })

    // Le préfixe est décisif : les empreintes déjà en base portent toutes `$2y$`.
    expect(compte.password?.startsWith('$2y$')).toBe(true)
    expect(await verifier(resultat.motDePasseInitial as string, compte.password as string)).toBe(true)
  })

  it('ne laisse jamais le mot de passe dans le journal d’audit', async () => {
    const resultat = await creerCompte()

    const traces = await prisma.audit_logs.findMany({
      // Même en lecture, le type accompagne l'identifiant : sans lui l'assertion porterait aussi
      // sur les lignes d'autres modèles partageant ce numéro.
      where: { auditable_type: MODEL_TYPE_USER, auditable_id: String(resultat.utilisateurId) },
      orderBy: { id: 'asc' },
      select: { new_values: true },
    })

    const serialise = JSON.stringify(traces)

    expect(serialise).not.toContain(resultat.motDePasseInitial as string)
    expect(serialise).not.toContain('password')
    expect(serialise).not.toContain('$2y$')
  })

  it('refuse une adresse e-mail déjà utilisée', async () => {
    const resultat = await creerCompte()
    const compte = await prisma.users.findUniqueOrThrow({
      where: { id: resultat.utilisateurId },
      select: { email: true },
    })
    const qui = await acteur()

    await expect(
      enregistrerUtilisateur(qui, {
        name: 'Doublon',
        email: compte.email,
        matricule: null,
        poste: null,
        directionId: null,
        siteId: null,
        responsableHierarchiqueId: null,
        actif: true,
        roles: [],
        parcours: [],
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})

describe('Attribution des rôles', () => {
  it('attribue, retire et trace les rôles séparément', async () => {
    const disponibles = await rolesDisponibles()
    const premier = disponibles[0].name
    const second = disponibles[1].name
    const qui = await acteur()

    const resultat = await creerCompte([premier])

    let compte = (await listerUtilisateurs()).find((c) => c.id === resultat.utilisateurId)
    expect(compte?.roles).toEqual([premier])

    await enregistrerUtilisateur(
      qui,
      {
        name: 'Compte de test',
        email: (await prisma.users.findUniqueOrThrow({ where: { id: resultat.utilisateurId } })).email,
        matricule: null,
        poste: null,
        directionId: null,
        siteId: null,
        responsableHierarchiqueId: null,
        actif: true,
        roles: [second],
        parcours: [],
      },
      resultat.utilisateurId
    )

    compte = (await listerUtilisateurs()).find((c) => c.id === resultat.utilisateurId)
    expect(compte?.roles).toEqual([second])

    // `model_has_roles` échappe au différentiel de colonnes : sans cette trace dédiée, un
    // changement de rôle serait invisible dans l'audit.
    const traces = await prisma.audit_logs.findMany({
      where: {
        action: 'user.roles_modifies',
        auditable_type: MODEL_TYPE_USER,
        auditable_id: String(resultat.utilisateurId),
      },
      orderBy: { id: 'asc' },
      select: { old_values: true, new_values: true },
    })

    expect(traces).toHaveLength(2)
    expect((traces[1].old_values as Record<string, unknown>).roles).toEqual([premier])
    expect((traces[1].new_values as Record<string, unknown>).roles).toEqual([second])
  })

  it('ignore un nom de rôle qui n’existe pas', async () => {
    const resultat = await creerCompte(['role_fabrique_de_toutes_pieces'])

    const compte = (await listerUtilisateurs()).find((c) => c.id === resultat.utilisateurId)

    expect(compte?.roles).toEqual([])
  })
})

describe('Garde-fous', () => {
  it('empêche un administrateur de désactiver son propre compte', async () => {
    const qui = await acteur()
    const compte = await prisma.users.findUniqueOrThrow({ where: { id: qui.id } })

    await expect(
      enregistrerUtilisateur(
        qui,
        {
          name: compte.name,
          email: compte.email,
          matricule: compte.matricule,
          poste: compte.poste,
          directionId: compte.direction_id,
          siteId: compte.site_id,
          responsableHierarchiqueId: compte.responsable_hierarchique_id,
          actif: false,
          roles: [],
          parcours: [],
        },
        qui.id
      )
    ).rejects.toThrow(/votre propre compte/i)

    // Et rien ne doit avoir été écrit malgré le refus.
    const apres = await prisma.users.findUniqueOrThrow({ where: { id: qui.id } })
    expect(apres.actif).toBe(true)
  })
})

describe('Réattribution de mot de passe', () => {
  it('produit un mot de passe utilisable et remplace l’ancien', async () => {
    const resultat = await creerCompte()
    const qui = await acteur()

    const avant = await prisma.users.findUniqueOrThrow({
      where: { id: resultat.utilisateurId },
      select: { password: true },
    })

    const nouveau = await regenererMotDePasse(qui, resultat.utilisateurId)

    const apres = await prisma.users.findUniqueOrThrow({
      where: { id: resultat.utilisateurId },
      select: { password: true },
    })

    expect(apres.password).not.toBe(avant.password)
    expect(apres.password?.startsWith('$2y$')).toBe(true)
    expect(await verifier(nouveau, apres.password as string)).toBe(true)

    // L'ancien mot de passe ne doit plus ouvrir la session.
    expect(await verifier(resultat.motDePasseInitial as string, apres.password as string)).toBe(false)
  })

  it('ne laisse ni la valeur ni son empreinte dans l’audit', async () => {
    const resultat = await creerCompte()
    const qui = await acteur()

    const nouveau = await regenererMotDePasse(qui, resultat.utilisateurId)

    const traces = await prisma.audit_logs.findMany({
      where: {
        action: 'user.mot_de_passe_regenere',
        auditable_type: MODEL_TYPE_USER,
        auditable_id: String(resultat.utilisateurId),
      },
      orderBy: { id: 'asc' },
      select: { new_values: true, user_id: true },
    })

    expect(traces).toHaveLength(1)
    expect(traces[0].user_id).toBe(qui.id)

    // `user_id` est un BigInt, que JSON.stringify refuse : seul le contenu audité est inspecté.
    const serialise = JSON.stringify(traces.map((t) => t.new_values))
    expect(serialise).not.toContain(nouveau)
    expect(serialise).not.toContain('$2y$')
  })

  it('refuse d’en attribuer un à un compte désactivé', async () => {
    const resultat = await creerCompte()
    const qui = await acteur()

    await prisma.users.update({ where: { id: resultat.utilisateurId }, data: { actif: false } })

    // Réattribuer un mot de passe à un compte coupé donnerait l'illusion d'un accès rétabli.
    await expect(regenererMotDePasse(qui, resultat.utilisateurId)).rejects.toBeInstanceOf(
      ErreurWorkflow
    )
  })
})
