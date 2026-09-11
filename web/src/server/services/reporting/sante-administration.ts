import { prisma } from '@/lib/prisma'
import { ROLE_NAMES, etapesSansActeur, type Role } from '@/server/authz'

/** `String.raw` obligatoire : en littéral classique, `\M` et `\U` seraient supprimés. */
const MODEL_TYPE_USER = String.raw`App\Models\User`

/**
 * Ce qui appelle une décision d'administrateur, par opposition à ce qui se compte.
 *
 * Le tableau de bord accueille TOUS les comptes authentifiés (DT-31), mais il ne parlait que de
 * dossiers. Or l'administrateur digital n'en a aucun, et n'en aura jamais : DT-02 lui refuse tout
 * accès au contenu des déclarations, délibérément. Il arrivait donc chaque matin sur
 * « Aucun dossier ne vous est affecté — ceux qui vous seront confiés apparaîtront ici », une
 * promesse que son propre rôle interdit de tenir, et pas un mot de ce dont il répond réellement.
 *
 * Les contrôles ci-dessous sont ceux qu'on ne voit nulle part ailleurs : chaque console
 * d'administration montre son propre référentiel, aucune ne dit qu'un réglage en rend un autre
 * inopérant. Un délai non validé n'éteint pas une console, il éteint TOUTES les relances.
 *
 * ⚠️ Un contrôle ne remonte que s'il a quelque chose à dire. Une ligne qui annonce zéro tous les
 * jours cesse d'être lue, et fait passer pour vide un écran qui ne l'est pas.
 */

export type AlerteAdministration = {
  readonly cle: string
  readonly libelle: string
  readonly valeur: number
  /** Ce que le chiffre entraîne, en une phrase. Jamais un rappel de ce qu'il compte. */
  readonly consequence: string
  readonly href: string
  /** `true` quand la conséquence est un blocage, et non une simple négligence. */
  readonly bloquant: boolean
}

export async function santeAdministration(): Promise<AlerteAdministration[]> {
  const [
    delaisNonValides,
    directionsSansSite,
    motsDePasseATransmettre,
    postesActifs,
    lieuxActifs,
    villesActives,
    rolesEnBase,
    associations,
    comptesActifs,
  ] = await Promise.all([
    // Tant qu'un délai n'est pas validé, AUCUNE échéance n'est calculée pour cette étape : ni
    // relance à J-3, ni escalade. C'est le réglage le plus silencieusement bloquant du dispositif.
    prisma.sla_delais.count({ where: { est_valide_metier: false } }),

    // La direction porte le rattachement au site, donc l'acheminement vers le secrétaire
    // compétent. Sans site, les dossiers de cette direction n'atteignent personne d'habilité.
    prisma.directions.count({ where: { actif: true, site_id: null } }),

    // Un mot de passe posé par un tiers et jamais remplacé : le compte reste ouvert à qui l'a
    // fixé, et son porteur ne peut rien faire d'autre que le changer.
    prisma.users.count({ where: { actif: true, doit_changer_mot_de_passe: true } }),

    prisma.postes.count({ where: { actif: true } }),
    prisma.lieux.count({ where: { actif: true } }),
    prisma.villes.count({ where: { actif: true } }),

    prisma.roles.findMany({
      where: { guard_name: 'web', actif: true },
      select: { id: true, name: true, libelle: true },
    }),
    prisma.model_has_roles.findMany({
      where: { model_type: MODEL_TYPE_USER },
      // Le NOM et l'activation du rôle en plus de son identifiant : un rôle désactivé ne confère
      // plus rien, il ne compte donc comme preneur d'aucune étape.
      select: { role_id: true, model_id: true, roles: { select: { name: true, actif: true } } },
    }),
    prisma.users.findMany({ where: { actif: true }, select: { id: true } }),
  ])

  const actifs = new Set(comptesActifs.map((u) => u.id))
  const porteursParRole = new Map<bigint, number>()
  const rolesParCompte = new Map<bigint, number>()

  for (const lien of associations) {
    if (!actifs.has(lien.model_id)) continue
    porteursParRole.set(lien.role_id, (porteursParRole.get(lien.role_id) ?? 0) + 1)
    rolesParCompte.set(lien.model_id, (rolesParCompte.get(lien.model_id) ?? 0) + 1)
  }

  const sansRole = comptesActifs.filter((u) => !rolesParCompte.has(u.id)).length

  /*
    Les étapes que plus personne ne peut franchir.

    Le trou le plus coûteux du dispositif, et le plus silencieux : le dossier n'affiche aucune
    erreur, il n'avance simplement jamais. Il s'ouvre mécaniquement dès qu'on réorganise les
    rôles avant d'avoir réattribué les comptes — ce qui vient de se produire.
  */
  const rolesPortes = new Set<Role>(
    associations
      .filter((l) => actifs.has(l.model_id) && l.roles.actif)
      .map((l) => l.roles.name as Role)
  )
  const orphelines = etapesSansActeur(rolesPortes)

  /*
    Un rôle actif que personne ne porte n'est pas qu'une curiosité de configuration.

    `agent_relais` dans ce cas, et la saisie relais devient inaccessible à tout le monde ; un rôle
    de captage dans ce cas, et l'affectation automatique n'a personne à qui confier la déclaration
    — elle reste « Reçu », sans destinataire. C'est le genre de trou qui ne se voit que le jour où
    quelqu'un cherche pourquoi rien n'arrive.
  */
  const rolesSansPorteur = rolesEnBase.filter(
    (r) => (ROLE_NAMES as readonly string[]).includes(r.name) && !porteursParRole.has(r.id)
  ).length

  const alertes: AlerteAdministration[] = [
    {
      cle: 'delais',
      libelle: 'Délais non validés',
      valeur: delaisNonValides,
      consequence: 'Aucune relance ni escalade n’est calculée sur ces étapes.',
      href: '/administration/delais',
      bloquant: true,
    },
    {
      cle: 'directions',
      libelle: 'Directions sans site',
      valeur: directionsSansSite,
      consequence: 'Leurs déclarations n’atteignent aucun secrétaire habilité.',
      href: '/administration/organisation',
      bloquant: true,
    },
    {
      cle: 'roles-vides',
      libelle: 'Rôles que personne ne porte',
      valeur: rolesSansPorteur,
      consequence: 'Les écrans et les affectations qui en dépendent restent hors d’atteinte.',
      href: '/administration/habilitations',
      bloquant: true,
    },
    {
      cle: 'etapes-orphelines',
      libelle: 'Étapes que personne ne peut franchir',
      valeur: orphelines.length,
      consequence: 'Les dossiers qui y parviennent s’arrêtent définitivement, sans message.',
      href: '/administration/utilisateurs',
      bloquant: true,
    },
    {
      cle: 'comptes-sans-role',
      libelle: 'Comptes sans aucun rôle',
      valeur: sansRole,
      consequence: 'Ces personnes se connectent sans rien pouvoir faire.',
      href: '/administration/utilisateurs',
      bloquant: false,
    },
    {
      cle: 'mots-de-passe',
      libelle: 'Mots de passe à remplacer',
      valeur: motsDePasseATransmettre,
      consequence: 'Fixés par un tiers, ils restent connus de lui tant qu’ils ne sont pas changés.',
      href: '/administration/utilisateurs',
      bloquant: false,
    },
    {
      cle: 'postes',
      libelle: 'Aucun poste renseigné',
      valeur: postesActifs === 0 ? 1 : 0,
      consequence: 'La liste des postes reste vide dans le formulaire de déclaration.',
      href: '/administration/postes',
      bloquant: false,
    },
    {
      cle: 'lieux',
      libelle: 'Aucun lieu renseigné',
      valeur: lieuxActifs === 0 ? 1 : 0,
      consequence: 'Le lieu est obligatoire : sans liste, aucune déclaration ne peut être envoyée.',
      href: '/administration/listes-formulaires',
      bloquant: true,
    },
    {
      cle: 'villes',
      libelle: 'Aucune ville renseignée',
      valeur: villesActives === 0 ? 1 : 0,
      consequence: 'La ville est obligatoire : les riverains ne peuvent plus déclarer.',
      href: '/administration/listes-formulaires',
      bloquant: true,
    },
  ]

  return alertes.filter((a) => a.valeur > 0)
}
