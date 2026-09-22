import { prisma } from '@/lib/prisma'
import { ROLE_NAMES, etapesSansActeur, matriceDesEtapes } from '@/server/authz'
import { configurationSmtp } from '../notification/transport'
import { STATUTS } from '../dossier/statuts'
import { MODELES } from '@/server/modeles'

/** `String.raw` obligatoire : en littéral classique, `\M` et `\U` seraient supprimés. */
const MODEL_TYPE_USER = MODELES.utilisateur

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
    statutsEnBase,
    matrice,
  ] = await Promise.all([
    // Tant qu'un délai n'est pas validé, AUCUNE échéance n'est calculée pour cette étape : ni
    // relance à J-3, ni escalade. C'est le réglage le plus silencieusement bloquant du dispositif.
    prisma.sla_delais.count({ where: { est_valide_metier: false } }),

    /*
      ⚠️ SANS SITE **ET** SANS PERSONNE HABILITÉE DESSUS.

      Cette alerte comptait toutes les directions sans site, en affirmant que leurs déclarations
      n'atteignaient personne. Ce n'est plus vrai : depuis qu'on peut habiliter un compte
      directement sur une direction, celle-ci achemine ses déclarations sans passer par un site.
      C'est même le cas observé en production — une direction sans site, avec son chargé de
      sécurité, qui fonctionne.

      Maintenue telle quelle, l'alerte aurait signalé comme bloquant un paramétrage correct. Une
      alerte fausse est ce qui finit par faire ignorer les vraies.
    */
    prisma.directions.count({
      where: { actif: true, site_id: null, users: { none: { actif: true } } },
    }),

    // Un mot de passe posé par un tiers et jamais remplacé : le compte reste ouvert à qui l'a
    // fixé, et son porteur ne peut rien faire d'autre que le changer.
    prisma.users.count({ where: { actif: true, doit_changer_mot_de_passe: true } }),

    prisma.postes.count({ where: { actif: true } }),
    prisma.lieux.count({ where: { actif: true } }),
    prisma.villes.count({ where: { actif: true } }),

    prisma.roles.findMany({
      where: { actif: true },
      select: { id: true, name: true, libelle: true },
    }),
    prisma.model_has_roles.findMany({
      where: { model_type: MODEL_TYPE_USER },
      // Le NOM et l'activation du rôle en plus de son identifiant : un rôle désactivé ne confère
      // plus rien, il ne compte donc comme preneur d'aucune étape.
      select: { role_id: true, model_id: true, roles: { select: { name: true, actif: true } } },
    }),
    prisma.users.findMany({ where: { actif: true }, select: { id: true } }),

    // Les états que le workflow nomme, confrontés à ce que la base porte réellement.
    prisma.statuts_dossier.findMany({ select: { code: true, actif: true } }),

    /*
      La grille « qui fait avancer quoi », telle qu'elle est cochée.

      ⚠️ ELLE SE DÉCOCHE DEPUIS L'INTERFACE depuis le 2026-09-21. Tant qu'elle vivait dans le
      code, une case vide voulait dire « ouverte à tous » et ne bloquait rien. Elle interdit
      maintenant : une ligne décochée par mégarde arrête le circuit sans message et sans
      recours, et c'est ici que l'administrateur doit l'apprendre.
    */
    matriceDesEtapes(),
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
  const rolesPortes = new Set<string>(
    associations.filter((l) => actifs.has(l.model_id) && l.roles.actif).map((l) => l.roles.name)
  )
  /*
    ⚠️ SEULS LES STATUTS ACTIFS sont examinés (D2, 2026-09-22).

    Un statut désactivé n'est proposé comme destination par aucune transition : aucun dossier ne
    peut l'atteindre, et le compter parmi les « étapes que personne ne peut franchir » annoncerait
    un blocage inexistant. `en_attente_information` est dans ce cas aujourd'hui.
  */
  const atteignables = new Set(statutsEnBase.filter((s) => s.actif).map((s) => s.code))

  const orphelines = etapesSansActeur(matrice, rolesPortes, atteignables)

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

  /*
    Un état du circuit ABSENT de la base.

    Le plus coûteux des réglages manquants, et le plus muet. `creerDeclaration()` cherche
    « recu » par son code à chaque dépôt : sans cette ligne, plus aucune déclaration ne peut
    être enregistrée, et le déclarant ne lit qu'un « merci de réessayer ». Les autres états
    immobilisent les dossiers qui devraient les atteindre.
    
    La suppression d'un statut est autorisée — décision métier — et n'est donc plus barrée en
    amont. Elle est barrée en AVAL : ce contrôle nomme ce qui manque, et `npm run seed` le
    restaure à l'identique depuis `referentiels.json`.
  */
  const codesEnBase = new Set(statutsEnBase.map((s) => s.code))
  const etatsManquants = STATUTS.filter((code) => !codesEnBase.has(code))

  const alertes: AlerteAdministration[] = [
    {
      cle: 'statuts-manquants',
      libelle: 'États du circuit absents de la base',
      valeur: etatsManquants.length,
      consequence:
        etatsManquants.includes('recu')
          ? 'Plus AUCUNE déclaration ne peut être enregistrée. « npm run seed » les restaure.'
          : 'Les dossiers qui devraient les atteindre resteront bloqués. « npm run seed » les restaure.',
      href: '/administration/statuts',
      bloquant: true,
    },
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
      libelle: 'Directions sans site ni titulaire',
      valeur: directionsSansSite,
      consequence:
        'Leurs déclarations n’atteignent personne : ni par le site, qu’elles n’ont pas, ni par une habilitation directe sur la direction.',
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
      /*
        Une messagerie éteinte ne se voit NULLE PART ailleurs.

        Sans `MAIL_HOST` ni `MAIL_FROM`, l'application journalise au lieu d'expédier : elle
        fonctionne, n'affiche aucune erreur, et pas un message ne sort. Les identifiants d'un
        compte neuf ne partent pas, les relances d'échéance non plus, ni le circuit critique.
        C'est le pendant exact du délai non validé : un réglage absent qui éteint une fonction
        entière sans rien casser de visible.

        Le renvoi pointe vers les modèles de notification : c'est là qu'on vient quand on
        s'interroge sur les envois, même si la correction elle-même est dans l'environnement du
        serveur — aucun écran ne règle une variable d'environnement.
      */
      cle: 'messagerie',
      libelle: 'Messagerie non configurée',
      valeur: configurationSmtp() === null ? 1 : 0,
      consequence:
        'Aucun e-mail ne part : ni identifiants de compte, ni relance de retard, ni alerte critique.',
      href: '/administration/notifications',
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
