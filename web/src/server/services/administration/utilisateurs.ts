import { randomInt } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hacherMotDePasse } from '@/server/auth/identifiants'
import { PARCOURS_CODES, type ParcoursCode } from '@/server/authz'
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
  /**
   * Codes des parcours confiés à cette personne.
   *
   * Stockés TELS QUELS, sans être rabotés par ce que ses rôles ouvrent aujourd'hui. Le croisement
   * se fait à la lecture (`parcoursAutorises`), pour la même raison que `model_has_roles` survit à
   * la désactivation d'un rôle : retirer un rôle ne doit pas effacer en silence une habilitation
   * qu'il faudrait ressaisir si on le rendait. Une attribution hors du champ des rôles n'ouvre
   * rien en attendant — l'écran le signale plutôt que de la supprimer.
   */
  parcours: string[]
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
      // Rattachement lisible, et site de la direction : leur désaccord se voit ainsi sans
      // requête supplémentaire, et l'écran peut le signaler.
      sites: { select: { libelle: true } },
      directions: { select: { libelle: true, site_id: true, sites: { select: { libelle: true } } } },
    },
  })

  const ids = utilisateurs.map((u) => u.id)
  const [roles, parcours] = await Promise.all([
    rolesParUtilisateur(ids),
    parcoursParUtilisateur(ids),
  ])

  return utilisateurs.map((u) => ({
    ...u,
    roles: roles.get(u.id) ?? [],
    parcours: parcours.get(u.id) ?? [],
  }))
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

/** Idem pour les parcours confiés : une seule requête pour toute la console. */
async function parcoursParUtilisateur(ids: bigint[]): Promise<Map<bigint, string[]>> {
  if (ids.length === 0) return new Map()

  const attributions = await prisma.utilisateur_parcours.findMany({
    where: { user_id: { in: ids } },
    select: { user_id: true, parcours: { select: { code: true } } },
    orderBy: { parcours: { ordre: 'asc' } },
  })

  const parUtilisateur = new Map<bigint, string[]>()

  for (const attribution of attributions) {
    const liste = parUtilisateur.get(attribution.user_id) ?? []
    liste.push(attribution.parcours.code)
    parUtilisateur.set(attribution.user_id, liste)
  }

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

export type OptionsEnregistrement = {
  /**
   * Créer le compte SANS mot de passe, pour une ouverture par lien d'invitation.
   *
   * ⚠️ `users.password` reste alors à NULL. Ce n'est pas un compte ouvert à tous les vents :
   * `verifierIdentifiants()` refuse tout mot de passe sur un compte sans empreinte, et le fait
   * déjà en temps constant. Le lien devient la seule porte — c'est l'intérêt du procédé : aucun
   * secret ne transite par le courriel, et l'administrateur lui-même n'en connaît aucun.
   *
   * L'appelant qui pose cette option DOIT émettre l'invitation dans la foulée. Sans elle, le
   * compte n'a aucun moyen d'être ouvert — il faudrait lui réattribuer un mot de passe.
   */
  readonly sansMotDePasse?: boolean
}

export type ResultatEnregistrement = {
  utilisateurId: bigint
  /** Renseigné uniquement à la création : c'est la seule occasion de le montrer. */
  motDePasseInitial: string | null
}

export async function enregistrerUtilisateur(
  acteur: Acteur,
  donnees: DonneesUtilisateur,
  utilisateurId?: bigint,
  options: OptionsEnregistrement = {}
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

  // Les parcours sont un référentiel fermé (4 codes, CDC §2.1) : tout ce qui n'en fait pas partie
  // vient d'un formulaire trafiqué et se jette ici, côté serveur.
  const parcoursDemandes = [...new Set(donnees.parcours)]
    .filter((code): code is ParcoursCode => (PARCOURS_CODES as readonly string[]).includes(code))
    .sort()

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
  let parcoursAvant: string[] = []

  if (utilisateurId === undefined) {
    /*
      Deux ouvertures possibles, et une seule à la fois.

      Par LIEN : aucun mot de passe n'est créé, donc aucun secret à transmettre ni à protéger.
      La personne choisira le sien, que personne d'autre n'aura connu.

      Par MOT DE PASSE : la valeur est générée, montrée une fois à l'administrateur, et le compte
      porte `doit_changer_mot_de_passe` — elle est connue d'un tiers jusqu'à son remplacement, et
      l'application l'y oblige. C'est la voie de repli quand aucune messagerie n'est branchée.
    */
    motDePasse = options.sansMotDePasse ? null : motDePasseInitial()

    const cree = await prisma.users.create({
      data: {
        ...valeurs,
        password: motDePasse === null ? null : await hacherMotDePasse(motDePasse),
        // Sans objet quand la personne choisit elle-même sa valeur : il n'y a rien à lui imposer
        // de remplacer.
        doit_changer_mot_de_passe: motDePasse !== null,
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
    parcoursAvant = ((await parcoursParUtilisateur([utilisateurId])).get(utilisateurId) ?? []).sort()

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
  await synchroniserParcours(cible, parcoursDemandes)

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

  // Même traitement pour les parcours, et pour la même raison : c'est une habilitation, et une
  // habilitation qui change sans laisser de trace est exactement ce que l'audit doit empêcher.
  // Un parcours retiré coupe l'accès à tout un type de dossier — il faut pouvoir dire qui l'a fait.
  if (JSON.stringify(parcoursAvant) !== JSON.stringify(parcoursDemandes)) {
    await journaliser({
      action: 'user.parcours_modifies',
      acteurId: acteur.id,
      auditableType: MODELES.utilisateur,
      auditableId: String(cible),
      anciennes: { parcours: parcoursAvant },
      nouvelles: { parcours: parcoursDemandes },
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

/** Même principe que `synchroniserRoles` : ajoute ce qui manque, retire ce qui n'est plus voulu. */
async function synchroniserParcours(utilisateurId: bigint, codes: string[]): Promise<void> {
  const disponibles = await prisma.parcours.findMany({ select: { id: true, code: true } })
  const parCode = new Map(disponibles.map((p) => [p.code, p.id]))

  const voulus = new Set(codes.map((code) => parCode.get(code)).filter((id): id is bigint => id != null))

  const actuels = await prisma.utilisateur_parcours.findMany({
    where: { user_id: utilisateurId },
    select: { parcours_id: true },
  })
  const existants = new Set(actuels.map((a) => a.parcours_id))

  const aRetirer = [...existants].filter((id) => !voulus.has(id))
  const aAjouter = [...voulus].filter((id) => !existants.has(id))

  if (aRetirer.length > 0) {
    await prisma.utilisateur_parcours.deleteMany({
      where: { user_id: utilisateurId, parcours_id: { in: aRetirer } },
    })
  }

  if (aAjouter.length > 0) {
    await prisma.utilisateur_parcours.createMany({
      data: aAjouter.map((parcours_id) => ({
        parcours_id,
        user_id: utilisateurId,
        created_at: new Date(),
        updated_at: new Date(),
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
  const maintenant = new Date()

  /*
    ⚠️ Toute invitation en attente est COUPÉE.

    Sans cela, le compte aurait DEUX portes : ce mot de passe, et un lien de première connexion
    encore valable qui traîne dans une boîte de réception. Or on n'attribue un nouveau mot de
    passe que lorsque l'autre voie a échoué ou que l'accès est perdu — dans les deux cas, le lien
    doit cesser de valoir.

    Une seconde en arrière, et non « maintenant » : `expire_le` est un `TIMESTAMP(0)`, que
    Postgres arrondit à la seconde la plus proche. Écrire l'instant courant pouvait le ranger
    une demi-seconde dans le FUTUR, laissant le lien valide juste un peu trop longtemps.
  */
  await prisma.invitations_connexion.updateMany({
    where: { user_id: utilisateurId, utilise_le: null, expire_le: { gt: maintenant } },
    data: { expire_le: new Date(maintenant.getTime() - 1000), updated_at: maintenant },
  })

  await prisma.users.update({
    where: { id: utilisateurId },
    data: {
      password: await hacherMotDePasse(motDePasse),
      // La valeur est connue de l'administrateur qui vient de la lire : elle n'est provisoire que
      // si son porteur est tenu de la remplacer.
      doit_changer_mot_de_passe: true,
      updated_at: maintenant,
    },
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
