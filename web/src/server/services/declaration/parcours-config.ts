import type { ParcoursCode } from '@/server/authz'

/**
 * Description déclarative des 4 formulaires de déclaration (CDC §9).
 *
 * Une SEULE source pour le rendu du formulaire et pour la validation serveur : décrire les
 * champs deux fois — une fois en React, une fois en Zod — reviendrait à garantir qu'ils
 * divergeront. Le portage direct des 4 composants Livewire aurait dupliqué quatre fois la même
 * mécanique de wizard, d'anti-spam et de téléversement.
 */

export type TypeChamp =
  | 'texte'
  | 'zone'
  | 'date'
  | 'datetime'
  | 'email'
  | 'tel'
  | 'nombre'
  | 'select'
  | 'case'

/** Étape du wizard : 1 identité · 2 contexte · 3 nature · 4 pièces jointes. */
export type EtapeFormulaire = 1 | 2 | 3

export type Champ = {
  readonly nom: string
  readonly libelle: string
  readonly type: TypeChamp
  readonly etape: EtapeFormulaire
  /** `true` = toujours ; `'siIdentifie'` = uniquement si l'anonymat n'est pas coché. */
  readonly obligatoire?: boolean | 'siIdentifie'
  readonly max?: number
  readonly min?: number
  readonly options?: readonly { readonly valeur: string; readonly libelle: string }[]
  readonly aide?: string
  /** Champ d'identité : jamais rendu ni collecté si l'anonymat est coché (RG-06, RGI-03). */
  readonly identite?: boolean
  /** Référentiel à charger côté serveur pour alimenter les options. */
  readonly referentiel?: 'directions' | 'postes' | 'lieux' | 'villes' | 'tranchesAnciennete'
  /**
   * Ce champ ne se remplit qu'une fois `dependDe` renseigné, et ses options en dépendent.
   *
   * Le seul cas aujourd'hui est Poste → Direction : les postes proposés sont ceux rattachés à la
   * direction choisie. Tant qu'aucune direction n'est retenue, la liste reste vide et désactivée
   * plutôt que de proposer les postes de toute l'entreprise.
   */
  readonly dependDe?: string
  /** Colonne cible dans `declaration_identites` ou `dossiers`. */
  readonly colonne?: string
}

export type ParcoursConfig = {
  readonly code: ParcoursCode
  readonly libelle: string
  readonly titre: string
  readonly accroche: string
  readonly champs: readonly Champ[]
  /**
   * Le déclarant choisit-il lui-même la gravité ?
   *
   * Non pour l'évènement indésirable depuis le retour métier du 11/09 : elle y est qualifiée au
   * TRAITEMENT, par quelqu'un qui connaît l'échelle. ⚠️ Le circuit accéléré (RG-08) se déclenche
   * alors à ce moment-là et non plus à la création — voir `qualifierGravite()`.
   */
  readonly graviteSaisieParLeDeclarant: boolean
  /** Le bloc « Vos attentes » est propre aux griefs ; l'EI ne le porte pas. */
  readonly attentesDeclarant: boolean
}

/*
  L'e-mail a quitté cette liste avec le champ qui l'alimentait.

  Le proposer comme canal de retour alors qu'aucune adresse n'est plus collectée aurait recréé, à
  un choix près, le défaut que le retour du téléphone corrige : une promesse sans moyen de la
  tenir.
*/
const CANAUX_RETOUR = [
  { valeur: 'telephone', libelle: 'Téléphone' },
  { valeur: 'entretien', libelle: 'Entretien' },
  { valeur: 'page_de_suivi', libelle: 'Page de suivi' },
] as const

/** Retour métier : mêmes trois valeurs pour l'EI et le grief employé. */
const CARACTERE_REPETITIF = [
  { valeur: 'premiere_fois', libelle: 'Première fois' },
  { valeur: 'deja_signale', libelle: 'Déjà signalé' },
  { valeur: 'recurrent', libelle: 'Récurrent' },
] as const

/*
  Nom, prénom et adresse e-mail ne sont plus collectés nulle part. Le TÉLÉPHONE, lui, subsiste —
  mais uniquement là où un rappel est proposé.

  Les retirer tous les quatre laissait « Je souhaite être recontacté » et « Canal de retour
  préféré » promettre un rappel que plus rien ne permettait d'honorer : un écran qui demande
  comment joindre quelqu'un sans jamais lui demander où. Le téléphone revient donc sur les deux
  parcours qui posent la question, et sur eux seuls — l'évènement indésirable et la plainte
  riveraine n'offrent pas de rappel et n'en ont pas besoin.

  Les colonnes retirées restent en base et portent ce qui a déjà été déclaré : c'est la collecte
  qui cesse, pas l'historique qui s'efface.
*/
const TELEPHONE = {
  nom: 'contactTelephone',
  libelle: 'Téléphone',
  type: 'tel',
  etape: 1,
  max: 50,
  identite: true,
  colonne: 'contactTelephone',
  aide: 'Pour être rappelé. Laissé vide, le suivi se fait avec votre référence et votre code d’accès.',
} as const satisfies Champ

export const PARCOURS: Record<ParcoursCode, ParcoursConfig> = {
  ei_employe: {
    code: 'ei_employe',
    libelle: 'Événement indésirable — Employé',
    titre: 'Déclarer un évènement indésirable',
    accroche: 'Signalez un incident, un presque-accident ou une situation dangereuse.',
    graviteSaisieParLeDeclarant: false,
    attentesDeclarant: false,
    champs: [
      /*
        Retour métier du 11/09/2026 : nom, prénom, téléphone et e-mail ne sont plus demandés.

        Le matricule reste le seul point d'identification, et la colonne des trois autres reste en
        base — vingt-trois dossiers les renseignent. On cesse de collecter, on n'efface rien.
      */
      {
        // RGI-14. `'siIdentifie'` et non `true` : le matricule est une donnée d'IDENTITÉ. Exigé sans
        // condition, il rendrait toute déclaration anonyme impossible — or l'anonymat est une
        // exigence critique (RG-06, RGI-03), et le champ n'est même pas rendu quand il est
        // coché. Obligatoire donc pour qui se nomme, inexistant pour qui ne se nomme pas.
        nom: 'matricule',
        libelle: 'Matricule',
        type: 'texte',
        etape: 1,
        obligatoire: 'siIdentifie',
        max: 100,
        identite: true,
        colonne: 'matricule',
      },
      {
        // La direction N'EST PAS une donnée d'identité, et le devenir a des conséquences : elle
        // détermine le site, donc le secrétaire CSST qui recevra le signalement. Nulle pour une
        // déclaration anonyme, elle ferait de chaque signalement anonyme un dossier que personne
        // ne voit — l'inverse exact de ce que l'anonymat sert à obtenir.
        //
        // Une direction compte des centaines de personnes : la connaître n'identifie personne,
        // pas plus que le lieu, déjà obligatoire et collecté anonymement. Elle est stockée sur
        // `dossiers.direction_id`, jamais dans `declaration_identites`.
        nom: 'directionId',
        libelle: 'Direction concernée',
        type: 'select',
        etape: 1,
        obligatoire: true,
        referentiel: 'directions',
        aide: 'Sert à transmettre le signalement au site compétent. Ne permet pas de vous identifier.',
      },
      {
        // Le poste vient APRÈS la direction, et en dépend : ses options sont les postes rattachés
        // à la direction choisie. L'ordre n'est pas cosmétique — une cascade dont le déclencheur
        // vient après la liste qu'il remplit se lit à l'envers.
        nom: 'posteOccupe',
        libelle: 'Poste',
        type: 'select',
        etape: 1,
        referentiel: 'postes',
        dependDe: 'directionId',
        identite: true,
        colonne: 'fonction',
      },
      { nom: 'dateSurvenance', libelle: 'Date des faits', type: 'date', etape: 2, obligatoire: true },
      { nom: 'lieu', libelle: 'Lieu', type: 'select', etape: 2, obligatoire: true, referentiel: 'lieux' },
      {
        nom: 'caractereRepetitif',
        libelle: 'Caractère répétitif',
        type: 'select',
        etape: 2,
        obligatoire: true,
        options: CARACTERE_REPETITIF,
      },
      {
        // Renommé « Mesure immédiate » (retour métier) : ce qui a été fait sur le moment, et non
        // une suggestion pour plus tard. Reste facultatif.
        nom: 'propositionMesureCorrective',
        libelle: 'Mesure immédiate',
        type: 'zone',
        etape: 3,
        aide: 'Facultatif — ce qui a été fait immédiatement, s’il y a lieu.',
      },
    ],
  },

  grief_employe: {
    code: 'grief_employe',
    libelle: 'Grief — Employé',
    titre: 'Déposer un grief',
    accroche: 'Signalez une situation professionnelle que vous jugez préjudiciable.',
    graviteSaisieParLeDeclarant: false,
    attentesDeclarant: false,
    champs: [
      {
        // RGI-14. `'siIdentifie'` et non `true` : le matricule est une donnée d'IDENTITÉ. Exigé sans
        // condition, il rendrait toute déclaration anonyme impossible — or l'anonymat est une
        // exigence critique (RG-06, RGI-03), et le champ n'est même pas rendu quand il est
        // coché. Obligatoire donc pour qui se nomme, inexistant pour qui ne se nomme pas.
        nom: 'matricule',
        libelle: 'Matricule',
        type: 'texte',
        etape: 1,
        obligatoire: 'siIdentifie',
        max: 255,
        identite: true,
        colonne: 'matricule',
      },
      { nom: 'posteOccupe', libelle: 'Poste occupé', type: 'texte', etape: 1, identite: true, colonne: 'fonction' },
      {
        // Une tranche plutôt qu'un nombre d'années : le métier raisonne par paliers, et une
        // ancienneté exacte rapproche d'une personne identifiable dans un petit effectif.
        // `anciennete_annees` reste en base pour les griefs déjà déposés.
        nom: 'ancienneteTranche',
        libelle: 'Ancienneté',
        type: 'select',
        etape: 1,
        referentiel: 'tranchesAnciennete',
        identite: true,
        colonne: 'ancienneteTranche',
      },
      TELEPHONE,
      { nom: 'dateHeureFaits', libelle: 'Date et heure des faits', type: 'datetime', etape: 2, obligatoire: true },
      { nom: 'lieu', libelle: 'Lieu', type: 'select', etape: 2, obligatoire: true, referentiel: 'lieux' },
      {
        nom: 'caractereRepetitif',
        libelle: 'Caractère répétitif',
        type: 'select',
        etape: 2,
        obligatoire: true,
        options: CARACTERE_REPETITIF,
      },
      { nom: 'personnesImpliquees', libelle: 'Personnes impliquées', type: 'zone', etape: 3, identite: true, colonne: 'personnesImpliquees' },
      { nom: 'temoinsEventuels', libelle: 'Témoins éventuels', type: 'zone', etape: 3, identite: true, colonne: 'temoins' },
      { nom: 'souhaitEtreRecontacte', libelle: 'Je souhaite être recontacté', type: 'case', etape: 3, identite: true, colonne: 'souhaitRecontact' },
      { nom: 'preferenceCanalRetour', libelle: 'Canal de retour préféré', type: 'select', etape: 3, options: CANAUX_RETOUR, identite: true, colonne: 'canalRetourPrefere' },
      {
        // Même champ et même libellé que sur l'évènement indésirable : ce qui a été fait sur le
        // moment, et non une suggestion pour plus tard.
        nom: 'propositionMesureCorrective',
        libelle: 'Mesure immédiate',
        type: 'zone',
        etape: 3,
        aide: 'Facultatif — ce qui a été fait immédiatement, s’il y a lieu.',
      },
    ],
  },

  grief_sous_traitant: {
    code: 'grief_sous_traitant',
    libelle: 'Grief — Sous-traitant',
    titre: 'Déposer un grief',
    accroche: 'Signalez une difficulté rencontrée dans le cadre de votre prestation.',
    graviteSaisieParLeDeclarant: false,
    attentesDeclarant: false,
    champs: [
      {
        // Placé EN TÊTE, donc juste sous la case d'anonymat que le formulaire rend avant les
        // champs de l'étape 1 (retour métier) : on décide d'abord de se nommer ou non, puis on
        // consent — l'ordre inverse faisait consentir avant de savoir à quoi.
        nom: 'consentementRgpd',
        libelle: 'Je consens au traitement de mes données personnelles',
        type: 'case',
        etape: 1,
        // RG-15 : consentement explicite exigé pour CE parcours uniquement (CDC §9.3).
        obligatoire: 'siIdentifie',
        identite: true,
        colonne: 'consentementRgpd',
        aide: 'Obligatoire pour une déclaration identifiée. Cochez l’anonymat si vous préférez ne pas y consentir.',
      },
      {
        /*
          L'entreprise est demandée MÊME EN ANONYME, et elle est obligatoire.

          L'anonymat protège la personne, pas la société pour laquelle elle travaille : sans le
          nom de l'entreprise, un grief de sous-traitant ne peut être instruit par personne. Elle
          n'est donc plus marquée `identite` — sans quoi elle aurait disparu de l'écran dès la
          case cochée — et elle est stockée sur `dossiers.entreprise`, car
          `declaration_identites` n'est pas créée pour une déclaration anonyme : l'y ranger
          l'aurait perdue silencieusement à chaque fois.
        */
        nom: 'entreprise',
        libelle: 'Entreprise sous-traitante',
        type: 'texte',
        etape: 1,
        obligatoire: true,
      },
      { nom: 'fonction', libelle: 'Fonction', type: 'texte', etape: 1, identite: true, colonne: 'fonction' },
      TELEPHONE,
      { nom: 'dateHeureFaits', libelle: 'Date et heure des faits', type: 'datetime', etape: 2, obligatoire: true },
      { nom: 'lieuSite', libelle: 'Lieu / site', type: 'select', etape: 2, obligatoire: true, referentiel: 'lieux' },
      {
        nom: 'caractereRepetitif',
        libelle: 'Caractère répétitif',
        type: 'select',
        etape: 2,
        obligatoire: true,
        options: CARACTERE_REPETITIF,
      },
      { nom: 'personnesOuServicesImpliques', libelle: 'Personnes ou services impliqués', type: 'zone', etape: 3, identite: true, colonne: 'personnesImpliquees' },
      { nom: 'temoinsEventuels', libelle: 'Témoins éventuels', type: 'zone', etape: 3, identite: true, colonne: 'temoins' },
      { nom: 'souhaitEtreInforme', libelle: 'Je souhaite être informé des suites', type: 'case', etape: 3, identite: true, colonne: 'souhaitRecontact' },
      { nom: 'canalRetourSouhaite', libelle: 'Canal de retour souhaité', type: 'select', etape: 3, options: CANAUX_RETOUR, identite: true, colonne: 'canalRetourPrefere' },
      {
        // Même champ et même libellé que sur l'évènement indésirable : ce qui a été fait sur le
        // moment, et non une suggestion pour plus tard.
        nom: 'propositionMesureCorrective',
        libelle: 'Mesure immédiate',
        type: 'zone',
        etape: 3,
        aide: 'Facultatif — ce qui a été fait immédiatement, s’il y a lieu.',
      },
    ],
  },

  grief_communaute: {
    code: 'grief_communaute',
    libelle: 'Grief — Communauté',
    titre: 'Déposer une plainte',
    accroche: 'Signalez une nuisance ou un préjudice lié au service de l’eau.',
    graviteSaisieParLeDeclarant: false,
    attentesDeclarant: false,
    champs: [
      {
        /*
          « Ville », obligatoire, en remplacement de la localité libre et facultative.

          Comme l'entreprise du sous-traitant : elle n'est pas marquée `identite`, sinon elle
          disparaîtrait en anonyme alors qu'elle est exigée, et elle est stockée sur
          `dossiers.ville`. Une plainte de riverain sans localisation ne peut être rattachée à
          aucun site.
        */
        nom: 'ville',
        libelle: 'Ville',
        type: 'select',
        etape: 1,
        obligatoire: true,
        referentiel: 'villes',
      },
      {
        nom: 'precisionLocalisation',
        libelle: 'Précision de localisation',
        type: 'texte',
        etape: 1,
        aide: 'Facultatif — quartier, campement, point de repère.',
      },
      {
        nom: 'statutPlaignant',
        libelle: 'Vous êtes',
        type: 'select',
        etape: 1,
        obligatoire: true,
        identite: true,
        colonne: 'statutPlaignant',
        options: [
          { valeur: 'riverain', libelle: 'Riverain' },
          { valeur: 'chef_coutumier', libelle: 'Chef coutumier' },
          { valeur: 'association', libelle: 'Association' },
          { valeur: 'ong', libelle: 'ONG' },
          { valeur: 'autre', libelle: 'Autre' },
        ],
      },
      { nom: 'dateSurvenance', libelle: 'Date des faits', type: 'date', etape: 2, obligatoire: true },
      { nom: 'lieu', libelle: 'Lieu', type: 'select', etape: 2, obligatoire: true, referentiel: 'lieux' },
      {
        nom: 'caractereRepetitif',
        libelle: 'Caractère répétitif',
        type: 'select',
        etape: 2,
        obligatoire: true,
        options: CARACTERE_REPETITIF,
      },
      { nom: 'solutionSouhaitee', libelle: 'Solution souhaitée', type: 'zone', etape: 3 },
      {
        // Même champ et même libellé que sur l'évènement indésirable : ce qui a été fait sur le
        // moment, et non une suggestion pour plus tard.
        nom: 'propositionMesureCorrective',
        libelle: 'Mesure immédiate',
        type: 'zone',
        etape: 3,
        aide: 'Facultatif — ce qui a été fait immédiatement, s’il y a lieu.',
      },
    ],
  },
}

export const CODES_PARCOURS = Object.keys(PARCOURS) as ParcoursCode[]

export function estParcoursValide(code: string): code is ParcoursCode {
  return code in PARCOURS
}

/**
 * `statutPlaignant` du parcours Communauté est un champ d'identité au sens de la table, mais il
 * reste obligatoire même en anonyme : il qualifie la plainte, pas la personne. Il est donc
 * exclu du masquage appliqué aux autres champs d'identité.
 *
 * ⚠️ L'entreprise du sous-traitant et la ville du riverain, elles aussi exigées en anonyme, ne
 * passent PAS par cette exception : elles ne sont plus marquées `identite` du tout, et sont
 * stockées sur `dossiers`. La différence compte — `declaration_identites` n'est pas créée pour
 * une déclaration anonyme, si bien qu'un champ resté `identite` est affiché puis perdu.
 */
const IDENTITE_CONSERVEE_EN_ANONYME = new Set(['statutPlaignant'])

/** Champs réellement affichés, une fois l'anonymat pris en compte (RGI-03). */
export function champsVisibles(config: ParcoursConfig, anonyme: boolean): Champ[] {
  return config.champs.filter(
    (c) => !anonyme || !c.identite || IDENTITE_CONSERVEE_EN_ANONYME.has(c.nom)
  )
}
