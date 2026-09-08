import { randomInt } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hacherMotDePasse } from '@/server/auth/identifiants'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, attributsCrees, difference, journaliser, sansChangement } from '../audit/journal'

/**
 * Console des comptes — port de `App\Livewire\Administration\UtilisateursAdmin`.
 *
 * Aucune suppression de compte : un compte cité dans l'historique, l'audit ou une affectation ne
 * peut pas disparaître sans rendre ces traces illisibles. La désactivation (`actif`) coupe l'accès
 * immédiatement — les droits étant relus en base à chaque requête, la révocation est effective au
 * prochain appel, sans attendre l'expiration du jeton.
 */

const MODEL_TYPE_USER = String.raw`App\Models\User`

type Acteur = { id: bigint }

export type DonneesUtilisateur = {
  name: string
  email: string
  matricule: string | null
  poste: string | null
  directionId: bigint | null
  siteId: bigint | null
  responsableHierarchiqueId: bigint | null
  actif: boolean
  roles: string[]
}

export async function listerUtilisateurs(recherche = '') {
  const utilisateurs = await prisma.users.findMany({
    where:
      recherche.trim() === ''
        ? {}
        : {
            OR: [
              { name: { contains: recherche.trim(), mode: 'insensitive' } },
              { email: { contains: recherche.trim(), mode: 'insensitive' } },
            ],
          },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      matricule: true,
      poste: true,
      actif: true,
      direction_id: true,
      site_id: true,
      responsable_hierarchique_id: true,
    },
  })

  const roles = await rolesParUtilisateur(utilisateurs.map((u) => u.id))

  return utilisateurs.map((u) => ({ ...u, roles: roles.get(u.id) ?? [] }))
}

/** Une seule requête pour tous les comptes : une par ligne serait un N+1 sur la console. */
async function rolesParUtilisateur(ids: bigint[]): Promise<Map<bigint, string[]>> {
  if (ids.length === 0) return new Map()

  const associations = await prisma.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, model_id: { in: ids } },
    select: { model_id: true, roles: { select: { name: true } } },
  })

  const parUtilisateur = new Map<bigint, string[]>()

  for (const association of associations) {
    const liste = parUtilisateur.get(association.model_id) ?? []
    liste.push(association.roles.name)
    parUtilisateur.set(association.model_id, liste)
  }

  for (const liste of parUtilisateur.values()) liste.sort()

  return parUtilisateur
}

/**
 * Tous les rôles, actifs ou non.
 *
 * ⚠️ La liste n'est PAS filtrée sur `actif`, et ce n'est pas un oubli : elle sert aussi à valider
 * les rôles reçus du formulaire (`enregistrerUtilisateur`). La filtrer ici ferait silencieusement
 * tomber, à la première modification d'un compte, l'association vers un rôle désactivé — une
 * perte de donnée provoquée par l'enregistrement d'un champ sans rapport. L'écran, lui, distingue
 * les deux à l'affichage.
 */
export async function rolesDisponibles() {
  return prisma.roles.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, libelle: true, actif: true },
  })
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'

/** Mot de passe initial aléatoire — affiché une seule fois, jamais stocké en clair. */
function motDePasseInitial(longueur = 14): string {
  let resultat = ''

  for (let i = 0; i < longueur; i += 1) {
    resultat += ALPHABET[randomInt(ALPHABET.length)]
  }

  return resultat
}

export type ResultatEnregistrement = {
  utilisateurId: bigint
  /** Renseigné uniquement à la création : c'est la seule occasion de le montrer. */
  motDePasseInitial: string | null
}

export async function enregistrerUtilisateur(
  acteur: Acteur,
  donnees: DonneesUtilisateur,
  utilisateurId?: bigint
): Promise<ResultatEnregistrement> {
  const doublon = await prisma.users.findFirst({
    where: { email: donnees.email, ...(utilisateurId ? { NOT: { id: utilisateurId } } : {}) },
    select: { id: true },
  })

  if (doublon) {
    throw new ErreurWorkflow('Cette adresse e-mail est déjà utilisée.')
  }

  // Garde-fou : un administrateur ne doit pas pouvoir se verrouiller hors de la console en
  // désactivant son propre compte par inadvertance.
  if (utilisateurId !== undefined && utilisateurId === acteur.id && !donnees.actif) {
    throw new ErreurWorkflow('Vous ne pouvez pas désactiver votre propre compte.')
  }

  const rolesConnus = new Set((await rolesDisponibles()).map((r) => r.name))
  const rolesDemandes = [...new Set(donnees.roles)].filter((r) => rolesConnus.has(r)).sort()

  const valeurs = {
    name: donnees.name,
    email: donnees.email,
    matricule: donnees.matricule,
    poste: donnees.poste,
    direction_id: donnees.directionId,
    site_id: donnees.siteId,
    responsable_hierarchique_id: donnees.responsableHierarchiqueId,
    actif: donnees.actif,
  }

  let cible: bigint
  let motDePasse: string | null = null
  let rolesAvant: string[] = []

  if (utilisateurId === undefined) {
    motDePasse = motDePasseInitial()

    const cree = await prisma.users.create({
      data: {
        ...valeurs,
        password: await hacherMotDePasse(motDePasse),
        email_verified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true },
    })

    cible = cree.id

    await journaliser({
      action: 'user.cree',
      acteurId: acteur.id,
      auditableType: MODELES.utilisateur,
      auditableId: String(cible),
      // `attributsCrees` retire `password` : jamais d'empreinte de mot de passe dans l'audit.
      nouvelles: attributsCrees(valeurs),
    })
  } else {
    const avant = await prisma.users.findUniqueOrThrow({ where: { id: utilisateurId } })
    rolesAvant = (await rolesParUtilisateur([utilisateurId])).get(utilisateurId) ?? []

    await prisma.users.update({
      where: { id: utilisateurId },
      data: { ...valeurs, updated_at: new Date() },
    })

    cible = utilisateurId

    const ecart = difference(avant as unknown as Record<string, unknown>, valeurs)

    if (!sansChangement(ecart)) {
      await journaliser({
        action: 'user.modifie',
        acteurId: acteur.id,
        auditableType: MODELES.utilisateur,
        auditableId: String(cible),
        anciennes: ecart.anciennes,
        nouvelles: ecart.nouvelles,
      })
    }
  }

  await synchroniserRoles(cible, rolesDemandes)

  // La table pivot `model_has_roles` échappe au différentiel des colonnes : elle est auditée à
  // part, comme le fait Laravel (docs/exigences-audit.md §2 — « modification des permissions et
  // des rôles utilisateurs »).
  if (JSON.stringify(rolesAvant) !== JSON.stringify(rolesDemandes)) {
    await journaliser({
      action: 'user.roles_modifies',
      acteurId: acteur.id,
      auditableType: MODELES.utilisateur,
      auditableId: String(cible),
      anciennes: { roles: rolesAvant },
      nouvelles: { roles: rolesDemandes },
    })
  }

  return { utilisateurId: cible, motDePasseInitial: motDePasse }
}

/** Équivalent de `syncRoles()` : ajoute ce qui manque, retire ce qui n'est plus demandé. */
async function synchroniserRoles(utilisateurId: bigint, roles: string[]): Promise<void> {
  const disponibles = await prisma.roles.findMany({ select: { id: true, name: true } })
  const parNom = new Map(disponibles.map((r) => [r.name, r.id]));

  const voulus = new Set(roles.map((nom) => parNom.get(nom)).filter((id): id is bigint => id != null))

  const actuels = await prisma.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, model_id: utilisateurId },
    select: { role_id: true },
  })
  const existants = new Set(actuels.map((a) => a.role_id))

  const aRetirer = [...existants].filter((id) => !voulus.has(id))
  const aAjouter = [...voulus].filter((id) => !existants.has(id))

  if (aRetirer.length > 0) {
    await prisma.model_has_roles.deleteMany({
      where: { model_type: MODEL_TYPE_USER, model_id: utilisateurId, role_id: { in: aRetirer } },
    })
  }

  if (aAjouter.length > 0) {
    await prisma.model_has_roles.createMany({
      data: aAjouter.map((role_id) => ({
        role_id,
        model_type: MODEL_TYPE_USER,
        model_id: utilisateurId,
      })),
    })
  }
}

export async function referentielsComptes() {
  const [directions, sites] = await Promise.all([
    prisma.directions.findMany({ orderBy: { libelle: 'asc' }, select: { id: true, libelle: true } }),
    prisma.sites.findMany({ orderBy: { libelle: 'asc' }, select: { id: true, libelle: true } }),
  ])

  return { directions, sites }
}

/**
 * Régénère le mot de passe d'un compte et renvoie la valeur en clair UNE fois.
 *
 * Comble un manque de la baseline : les routes Fortify de réinitialisation y sont bien
 * enregistrées, mais aucune vue ne l'est (`Fortify::requestPasswordResetLinkView` absent) et la
 * page de connexion n'y renvoie pas — la fonctionnalité est donc inatteignable. Sans transport
 * e-mail branché, un envoi de lien serait de toute façon inopérant : la remise en main propre par
 * un administrateur est la seule voie qui fonctionne aujourd'hui.
 *
 * Le mot de passe n'est jamais persisté en clair, ni journalisé. L'audit consigne l'évènement,
 * pas la valeur.
 */
export async function regenererMotDePasse(
  acteur: Acteur,
  utilisateurId: bigint
): Promise<string> {
  const cible = await prisma.users.findUniqueOrThrow({
    where: { id: utilisateurId },
    select: { id: true, actif: true },
  })

  if (!cible.actif) {
    throw new ErreurWorkflow('Réactivez le compte avant de lui attribuer un nouveau mot de passe.')
  }

  const motDePasse = motDePasseInitial()

  await prisma.users.update({
    where: { id: utilisateurId },
    data: { password: await hacherMotDePasse(motDePasse), updated_at: new Date() },
  })

  await journaliser({
    action: 'user.mot_de_passe_regenere',
    acteurId: acteur.id,
    auditableType: MODELES.utilisateur,
    auditableId: String(utilisateurId),
    // Ni la valeur, ni son empreinte : seul le fait que l'opération a eu lieu, et par qui.
    nouvelles: { mot_de_passe_regenere: true },
  })

  return motDePasse
}
