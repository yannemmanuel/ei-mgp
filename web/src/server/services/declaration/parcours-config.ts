import type { ParcoursCode } from '@/server/authz'

/**
 * Description déclarative des 4 formulaires de déclaration (CDC §9).
 *
 * Une SEULE source pour le rendu du formulaire et pour la validation serveur : décrire les
 * champs deux fois — une fois en React, une fois en Zod — reviendrait à garantir qu'ils
 * divergeront. Décrire les 4 formulaires un par un aurait dupliqué quatre fois la même
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
  /**
   * Champ retiré en anonymat SANS être une donnée d'identité.
   *
   * ⚠️ À ne pas confondre avec `identite`, qui commande aussi le STOCKAGE : un champ rangé sur
   * `dossiers` mais marqué `identite` serait affiché puis perdu sans signal. Ce drapeau ne dit
   * que « ne pas le demander quand on ne se nomme pas ».
   */
  readonly masqueSiAnonyme?: boolean
  /** Référentiel à charger côté serveur pour alimenter les options. */
  readonly referentiel?: 'directions' | 'postes' | 'lieux' | 'villes'
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
  /**
   * Champ affiché SEULEMENT quand une case à cocher est dans l'état attendu.
   *
   * ⚠️ Le serveur ne se contente pas de masquer : il JETTE ce qui lui parvient alors que la
   * condition n'est pas remplie. Un navigateur peut avoir gardé une saisie antérieure, et une
   * requête forgée peut l'envoyer — enregistrer une direction de déclarant sur un dossier où le
   * déclarant EST la victime produirait un dossier qui se contredit.
   */
  readonly afficherSi?: {
    /** Nom de la case dont dépend l'affichage. */
    readonly champ: string
    /** État attendu de cette case. */
    readonly vaut: boolean
  }
  /**
   * Saisie libre révélée quand ce champ vaut « Autre », sous le nom `<champ>Precision`.
   *
   * Exigée dès qu'elle apparaît : « Autre » sans précision apprend seulement que la personne
   * n'entre dans aucune case, jamais dans laquelle elle se trouve.
   */
  readonly precisionSi?: {
    /** La valeur qui déclenche la saisie libre, telle qu'elle figure dans `options`. */
    readonly valeur: string
    readonly libelle: string
    /** Colonne cible de la précision, sur la même table que le champ qu'elle complète. */
    readonly colonne: string
  }
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

/**
 * « Êtes-vous la personne concernée ? » — parcours EMPLOYÉ seulement.
 *
 * Une déclaration est souvent déposée pour quelqu'un d'autre, et le traitement doit le savoir :
 * cela change ce qu'on peut écrire en retour sans exposer un tiers à un intermédiaire. Retirée
 * des parcours externes (décision du 2026-09-21), où la réponse était toujours « oui ».
 *
 * ⚠️ Pas marqué `identite` : la question se pose aussi en anonyme, où elle est la plus utile.
 * Stocké sur `dossiers`, jamais dans `declaration_identites`.
 *
 * ⚠️ Facultatif et sans défaut : `declarant_est_victime` reste NULL tant que la case n'a pas été
 * vue. Non cochée ne vaut pas « non » mais « pas répondu ».
 */
const DECLARANT_VICTIME = {
  nom: 'declarantEstVictime',
  libelle: 'Je suis la personne concernée par les faits',
  type: 'case',
  etape: 1,
  colonne: 'declarantEstVictime',
  aide: 'Laissez décoché si vous déclarez pour quelqu’un d’autre.',
} as const satisfies Champ

/** Retour métier : mêmes trois valeurs pour l'EI et le grief employé. */
const CARACTERE_REPETITIF = [
  { valeur: 'premiere_fois', libelle: 'Première fois' },
  { valeur: 'deja_signale', libelle: 'Déjà signalé' },
  { valeur: 'recurrent', libelle: 'Récurrent' },
] as const

/*
  Le téléphone n'est demandé que sur les deux parcours qui proposent un rappel : ailleurs, il
  promettrait un retour que rien ne permet d'honorer. L'adresse e-mail n'est plus collectée.

  Les colonnes retirées restent en base : c'est la collecte qui cesse, pas l'historique.
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

/**
 * Direction et poste, communs aux deux parcours de salariés.
 *
 * ⚠️ Aucun des deux n'est marqué `identite`, et ce n'est pas un oubli.
 *
 * La DIRECTION détermine le site, donc qui recevra le signalement : marquée `identite`, elle
 * disparaîtrait des déclarations anonymes, qui deviendraient des dossiers que personne ne voit.
 * Elle compte des centaines de personnes et n'identifie donc personne.
 *
 * Le POSTE n'est pas demandé en anonymat — direction et poste réunis suffisent à reconnaître
 * quelqu'un dans un effectif restreint. Le masquage passe par `masqueSiAnonyme` et non par
 * `identite` : le poste est sur `dossiers.poste`, et le marquer `identite` l'aurait aussi perdu
 * sur les déclarations identifiées. Il reste facultatif, pour la même raison de resserrement.
 */
const DIRECTION = {
  nom: 'directionId',
  libelle: 'Direction de la victime',
  type: 'select',
  etape: 1,
  obligatoire: true,
  referentiel: 'directions',
  aide: 'Sert à transmettre le signalement au site compétent. Ne permet pas de vous identifier.',
} as const satisfies Champ

const POSTE = {
  // Le poste vient APRÈS la direction, et en dépend : ses options sont les postes rattachés à la
  // direction choisie. L'ordre n'est pas cosmétique — une cascade dont le déclencheur vient après
  // la liste qu'il remplit se lit à l'envers.
  nom: 'posteOccupe',
  // Nommé explicitement depuis qu'existe un second poste, celui du déclarant. « Victime » est le
  // mot retenu par le métier pour ces libellés, alors que la case parle de « personne concernée ».
  libelle: 'Poste de la victime',
  type: 'select',
  etape: 1,
  referentiel: 'postes',
  dependDe: 'directionId',
  // Retiré dès que l'anonymat est coché, sur les DEUX parcours qui le portent.
  masqueSiAnonyme: true,
  precisionSi: { valeur: 'Autre', libelle: 'Précisez le poste de la victime', colonne: 'postePrecision' },
  aide: 'Facultatif. « Autre » s’il n’y figure pas.',
} as const satisfies Champ

/**
 * Le rattachement du DÉCLARANT, demandé seulement s'il n'est pas la personne concernée.
 *
 * Un témoin ou un collègue parle depuis une autre direction que celle où les faits se sont
 * produits. Le dossier ne portait qu'un rattachement, et l'on ignorait donc d'où parlait celui
 * qui signalait — impossible de le recontacter par la bonne voie.
 *
 * ⚠️ Ces deux champs ne déterminent PAS le site du dossier. C'est `directionId`, la direction
 * CONCERNÉE, qui l'établit : router sur la direction du témoin enverrait le signalement au
 * service complètement étranger aux faits.
 */
const DIRECTION_DECLARANT = {
  nom: 'directionDeclarant',
  libelle: 'Direction du déclarant',
  type: 'select',
  etape: 1,
  referentiel: 'directions',
  afficherSi: { champ: 'declarantEstVictime', vaut: false },
  aide: 'Celle du déclarant, et non celle où les faits se sont produits.',
} as const satisfies Champ

const POSTE_DECLARANT = {
  nom: 'posteDeclarant',
  libelle: 'Poste du déclarant',
  type: 'select',
  etape: 1,
  referentiel: 'postes',
  dependDe: 'directionDeclarant',
  afficherSi: { champ: 'declarantEstVictime', vaut: false },
  // Même règle que le poste de la personne concernée : associé à une direction, il resserre trop
  // pour être demandé sous couvert d'anonymat — et il désigne ici le déclarant lui-même.
  masqueSiAnonyme: true,
  precisionSi: {
    valeur: 'Autre',
    libelle: 'Précisez le poste du déclarant',
    colonne: 'posteDeclarantPrecision',
  },
  aide: 'Facultatif. « Autre » s’il n’y figure pas.',
} as const satisfies Champ

/**
 * Paliers d'ancienneté, figés ici plutôt qu'administrables (décision du 2026-09-22).
 *
 * Des paliers d'années ne dépendent de rien qui varie. Le gain est dans la validation : une liste
 * figée devient une énumération Zod refusée à la porte, là où une liste administrable se vérifie
 * après coup contre la base.
 *
 * ⚠️ Libellés repris à l'identique : les griefs déposés stockent le libellé en clair dans
 * `declaration_identites.anciennete_tranche`, et en changer un rendrait des réponses illisibles.
 */
const TRANCHES_ANCIENNETE = [
  { valeur: "Moins d'1 an", libelle: "Moins d'1 an" },
  { valeur: '1 à 3 ans', libelle: '1 à 3 ans' },
  { valeur: '3 à 5 ans', libelle: '3 à 5 ans' },
  { valeur: '5 à 10 ans', libelle: '5 à 10 ans' },
  { valeur: 'Plus de 10 ans', libelle: 'Plus de 10 ans' },
] as const satisfies readonly { valeur: string; libelle: string }[]

export const PARCOURS: Record<ParcoursCode, ParcoursConfig> = {
  ei_employe: {
    code: 'ei_employe',
    libelle: 'Événement indésirable — Employé',
    titre: 'Déclarer un évènement indésirable',
    accroche: 'Signalez un incident, un presque-accident ou une situation dangereuse.',
    graviteSaisieParLeDeclarant: false,
    attentesDeclarant: false,
    champs: [
      DECLARANT_VICTIME,
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
      DIRECTION,
      POSTE,
      DIRECTION_DECLARANT,
      POSTE_DECLARANT,
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
        libelle: 'Solution souhaitée',
        type: 'zone',
        etape: 3,
        aide: 'Facultatif — ce que vous attendez comme suite.',
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
      DECLARANT_VICTIME,
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
      DIRECTION,
      POSTE,
      DIRECTION_DECLARANT,
      POSTE_DECLARANT,
      {
        // Une tranche plutôt qu'un nombre d'années : le métier raisonne par paliers, et une
        // ancienneté exacte rapproche d'une personne identifiable dans un petit effectif.
        // `anciennete_annees` reste en base pour les griefs déjà déposés.
        nom: 'ancienneteTranche',
        libelle: 'Ancienneté',
        type: 'select',
        etape: 1,
        options: TRANCHES_ANCIENNETE,
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
        libelle: 'Solution souhaitée',
        type: 'zone',
        etape: 3,
        aide: 'Facultatif — ce que vous attendez comme suite.',
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
        // Demandée même en anonyme, et obligatoire : l'anonymat protège la personne, pas la
        // société. Donc ni `identite`, ni `declaration_identites` — voir EXCEPTIONS_ANONYMAT.
        nom: 'entreprise',
        libelle: 'Entreprise sous-traitante',
        type: 'texte',
        etape: 1,
        obligatoire: true,
      },
      { nom: 'nomPrenom', libelle: 'Nom et prénom', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'nomPrenom' },
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
        libelle: 'Solution souhaitée',
        type: 'zone',
        etape: 3,
        aide: 'Facultatif — ce que vous attendez comme suite.',
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
      { nom: 'nomPrenom', libelle: 'Nom et prénom', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'nomPrenom' },
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
        // Qualifie la plainte, pas la personne : stocké sur `dossiers`. Marqué `identite`, il
        // était exigé à l'écran puis jeté en silence sur toute déclaration anonyme.
        nom: 'statutPlaignant',
        libelle: 'Vous êtes',
        type: 'select',
        etape: 1,
        obligatoire: true,
        precisionSi: {
          valeur: 'autre',
          libelle: 'Précisez votre qualité',
          colonne: 'statutPlaignantPrecision',
        },
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
      /*
        Un seul champ « Solution souhaitée » ici : la plainte riveraine portait les deux, et le
        renommage métier de la seconde aurait posé deux fois la même question.

        La colonne `proposition_mesure_corrective` reste en base et porte l'historique.
      */
      { nom: 'solutionSouhaitee', libelle: 'Solution souhaitée', type: 'zone', etape: 3 },
    ],
  },
}

export const CODES_PARCOURS = Object.keys(PARCOURS) as ParcoursCode[]

export function estParcoursValide(code: string): code is ParcoursCode {
  return code in PARCOURS
}

/**
 * ⚠️ Cette exception est vide, et doit le rester.
 *
 * Un champ exigé en anonymat ne se marque PAS `identite` : il se range sur `dossiers`.
 * `declaration_identites` n'étant pas créée pour une déclaration anonyme, un champ resté
 * `identite` serait affiché puis perdu — le piège déjà rencontré sur `statutPlaignant`.
 */
const IDENTITE_CONSERVEE_EN_ANONYME = new Set<string>()

/**
 * Champs réellement affichés, une fois l'anonymat pris en compte (RGI-03).
 *
 * ⚠️ Règle UNIQUE, appelée aussi bien par le rendu du formulaire que par la validation serveur.
 * Elle vivait en double — une copie dans le composant client — jusqu'à ce qu'un second motif de
 * masquage apparaisse : deux filtres à tenir en phase, dont l'un décide de ce qui est rendu et
 * l'autre de ce qui est accepté, finissent par diverger, et l'écart se lit alors comme un champ
 * affiché puis refusé, ou pire, refusé puis accepté.
 */
export function champsVisibles(config: ParcoursConfig, anonyme: boolean): Champ[] {
  return config.champs.filter((c) => {
    if (!anonyme) return true
    if (c.masqueSiAnonyme) return false

    return !c.identite || IDENTITE_CONSERVEE_EN_ANONYME.has(c.nom)
  })
}

/**
 * Le libellé lisible d'une valeur stockée sous forme de code.
 *
 * `caractere_repetitif` vaut « premiere_fois » en base, `statut_plaignant` vaut « chef_coutumier ».
 * La fiche affichait ces codes tels quels — lisibles pour qui a écrit le formulaire, obscurs pour
 * qui traite un dossier six mois plus tard.
 *
 * Lue dans la même configuration que celle qui a produit le formulaire, pour qu'elles ne
 * divergent pas.
 *
 * Rend la valeur INCHANGÉE si aucune option ne correspond : un code inconnu — option retirée
 * depuis, mais encore portée par d'anciens dossiers — doit rester visible.
 */
export function libelleValeur(
  parcours: ParcoursCode,
  nomChamp: string,
  valeur: string | null
): string | null {
  if (valeur === null || valeur === '') return null

  const champ = PARCOURS[parcours].champs.find((c) => c.nom === nomChamp)

  return champ?.options?.find((o) => o.valeur === valeur)?.libelle ?? valeur
}
