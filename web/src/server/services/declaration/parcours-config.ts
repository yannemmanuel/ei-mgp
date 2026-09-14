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
  /**
   * Champ retiré en anonymat SANS être une donnée d'identité.
   *
   * ⚠️ Distinct de `identite`, et il faut que les deux le restent. `identite` commande aussi le
   * STOCKAGE : le champ part dans `declaration_identites`, table qui n'est pas créée pour une
   * déclaration anonyme. Un champ rangé sur `dossiers` mais marqué `identite` serait affiché
   * puis perdu sans le moindre signal — le piège déjà rencontré sur l'entreprise et la ville.
   *
   * Ce drapeau ne dit qu'une chose : ne pas le demander quand on ne se nomme pas. Le seul cas
   * aujourd'hui est le poste, sur les deux parcours de salariés — associé à la direction, il
   * resserre trop pour être demandé sous couvert d'anonymat.
   */
  readonly masqueSiAnonyme?: boolean
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
  /**
   * Champ de saisie libre révélé quand ce champ prend une valeur donnée — « Autre ».
   *
   * « Autre » sans précision ne dit rien : on apprend que la personne n'entre dans aucune case,
   * jamais dans laquelle elle se trouve. La réponse libre est donc rendue sous la liste, sous le
   * nom `<champ>Precision`, et exigée dès qu'elle apparaît — la laisser facultative reviendrait
   * à proposer « Autre » pour ne rien en tirer.
   *
   * ⚠️ Décrit ICI, dans la configuration, et non codé en dur dans le formulaire. La catégorie
   * « Autre » l'est encore — elle vient des lignes `categories.is_autre` et précède ce
   * mécanisme. Toute NOUVELLE liste offrant « Autre » passe par ce drapeau : une troisième
   * exception écrite à la main aurait garanti qu'une quatrième soit oubliée.
   */
  /**
   * Champ affiché SEULEMENT quand une case à cocher est dans l'état attendu.
   *
   * Le seul cas aujourd'hui est le rattachement du déclarant, demandé lorsqu'il n'est PAS la
   * personne concernée. Un témoin parle d'une autre direction que celle des faits ; le lui
   * demander quand il parle de lui-même serait poser deux fois la même question.
   *
   * ⚠️ Le serveur ne se contente pas de ne pas AFFICHER : il JETTE ce qui lui parvient alors que
   * la condition n'est pas remplie. Un navigateur peut avoir gardé une saisie faite avant que la
   * case ne soit cochée, et une requête forgée peut l'envoyer délibérément — enregistrer une
   * direction de déclarant sur un dossier où le déclarant EST la victime produirait un dossier
   * qui se contredit.
   */
  readonly afficherSi?: {
    /** Nom de la case dont dépend l'affichage. */
    readonly champ: string
    /** État attendu de cette case. */
    readonly vaut: boolean
  }
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
 * « Êtes-vous la personne concernée ? », sur les quatre parcours.
 *
 * Une déclaration est souvent déposée POUR quelqu'un d'autre : un témoin, un collègue, un agent
 * relais, un chef coutumier pour un riverain. Rien ne le disait, et le traitement ne pouvait donc
 * pas savoir à qui il s'adressait — ce qui change ce qu'on peut écrire en retour sans exposer la
 * situation d'un tiers à un intermédiaire.
 *
 * Posé en étape 1, à côté de l'anonymat : les deux relèvent de la même décision préalable — qui
 * parle, et pour qui.
 *
 * ⚠️ Pas marqué `identite`. La question se pose AUSSI en anonyme, où elle est même la plus utile :
 * savoir qu'un signalement anonyme émane d'un témoin plutôt que de la personne concernée oriente
 * l'instruction sans rien révéler de l'un ni de l'autre. Stocké sur `dossiers`, donc, jamais dans
 * `declaration_identites`.
 *
 * ⚠️ Facultatif, et sans valeur par défaut en base : `declarant_est_victime` reste NULL tant que
 * la case n'a pas été vue. Une case non cochée ne vaut pas « non » — elle vaut « pas répondu », et
 * les 37 dossiers antérieurs à ce champ doivent rester distinguables de ceux qui ont dit non.
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
  L'adresse e-mail n'est plus collectée nulle part. Le NOM et le TÉLÉPHONE, eux, subsistent — mais
  chacun sur les seuls parcours où il sert.

  Le nom et le prénom restent demandés au sous-traitant et au riverain. Ces deux-là ne figurent
  dans aucun fichier du personnel : ni matricule, ni direction pour les désigner. S'ils
  choisissent de se nommer, leur nom est le seul point de reprise dont dispose le traitement. Les
  salariés, eux, ont leur matricule — le nom n'y ajoutait rien qu'une donnée de plus à protéger.

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

/**
 * Direction et poste, communs aux deux parcours de salariés.
 *
 * ⚠️ AUCUN des deux n'est une donnée d'IDENTITÉ au sens de la table, et ce n'est pas un oubli.
 *
 * La direction détermine le site, donc le secrétaire qui recevra le signalement. Marquée
 * `identite`, elle disparaîtrait de toute déclaration anonyme — qui deviendrait alors un dossier
 * que personne ne voit, l'inverse exact de ce que l'anonymat sert à obtenir. Une direction compte
 * des centaines de personnes : la connaître n'identifie personne, pas plus que le lieu, déjà
 * obligatoire et collecté anonymement.
 *
 * Le POSTE, lui, n'est PAS demandé en anonymat — sur aucun des deux parcours. Direction et poste
 * réunis resserrent assez pour reconnaître quelqu'un dans un effectif restreint, et l'anonymat
 * n'aurait alors plus de sens. Il reste demandé à qui se nomme, où il ne coûte rien.
 *
 * ⚠️ Le masquage passe par `masqueSiAnonyme` et NON par `identite`, bien que le résultat à
 * l'écran soit le même. `identite` commande aussi le STOCKAGE : le champ partirait dans
 * `declaration_identites`, table qui n'est pas créée pour une déclaration anonyme. Le poste est
 * sur `dossiers.poste` ; l'y marquer `identite` l'aurait perdu également sur les déclarations
 * IDENTIFIÉES, où il est toujours attendu.
 *
 * ⚠️ Il reste FACULTATIF. Dans une direction restreinte, un poste unique désigne une seule
 * personne : l'exiger reviendrait à demander à quelqu'un de se resserrer jusqu'à devenir
 * reconnaissable, y compris quand il accepte de se nommer.
 */
const DIRECTION = {
  nom: 'directionId',
  libelle: 'Direction concernée',
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
  // Nommé explicitement depuis qu'un second poste existe : celui du déclarant, quand il n'est
  // pas la personne concernée. « Poste » tout court ne disait plus duquel il s'agissait.
  libelle: 'Poste de la personne concernée',
  type: 'select',
  etape: 1,
  referentiel: 'postes',
  dependDe: 'directionId',
  // Retiré dès que l'anonymat est coché, sur les DEUX parcours qui le portent.
  masqueSiAnonyme: true,
  precisionSi: { valeur: 'Autre', libelle: 'Précisez votre poste', colonne: 'postePrecision' },
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
  libelle: 'Votre direction',
  type: 'select',
  etape: 1,
  referentiel: 'directions',
  afficherSi: { champ: 'declarantEstVictime', vaut: false },
  aide: 'La vôtre, et non celle où les faits se sont produits.',
} as const satisfies Champ

const POSTE_DECLARANT = {
  nom: 'posteDeclarant',
  libelle: 'Votre poste',
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
    libelle: 'Précisez votre poste',
    colonne: 'posteDeclarantPrecision',
  },
  aide: 'Facultatif. « Autre » si le vôtre n’y figure pas.',
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
      DECLARANT_VICTIME,
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
      DECLARANT_VICTIME,
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
        /*
          ⚠️ STOCKÉ SUR `dossiers`, et plus dans `declaration_identites`.

          Il y était, marqué `identite`, tout en restant affiché sous anonymat — il qualifie la
          plainte, pas la personne. Or `declaration_identites` n'est PAS créée pour une
          déclaration anonyme : la réponse était donc exigée à l'écran puis jetée en silence.
          Cinq des six plaintes riveraines en base n'avaient aucun statut pour cette seule raison.

          Il rejoint l'entreprise du sous-traitant et la ville du riverain, déplacées plus tôt
          pour ce motif exact. La colonne d'origine est conservée et porte toujours ce que les
          plaintes identifiées y ont écrit.
        */
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
        Un SEUL champ « Solution souhaitée » ici, et c'est celui d'origine.

        La plainte riveraine portait les deux : « Solution souhaitée » et « Mesure immédiate ».
        Le retour métier demande de renommer la seconde en « Solution souhaitée » sur les autres
        parcours et de la retirer d'ici — sans quoi ce formulaire aurait posé deux fois la même
        question sous le même intitulé.

        La colonne `proposition_mesure_corrective` reste en base et porte ce que les plaintes
        déjà déposées y ont écrit : c'est la collecte qui cesse, pas l'historique qui s'efface.
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
 * ⚠️ CETTE EXCEPTION EST VIDE, et elle doit le rester.
 *
 * `statutPlaignant` y figurait : marqué `identite` pour le stockage, mais réintégré ici pour
 * rester affiché en anonymat. Le montage tenait à l'écran et échouait en base —
 * `declaration_identites` n'est pas créée pour une déclaration anonyme, si bien que la réponse
 * était exigée puis jetée. Le champ est désormais sur `dossiers`, et n'a plus besoin d'exception.
 *
 * Un champ exigé en anonymat ne se marque donc PAS `identite` : il se range sur `dossiers`. Cette
 * liste n'existe plus que pour documenter pourquoi on n'y ajoute rien.
 *
 * ⚠️ L'entreprise du sous-traitant et la ville du riverain, elles aussi exigées en anonyme, ne
 * passent PAS par cette exception : elles ne sont plus marquées `identite` du tout, et sont
 * stockées sur `dossiers`. La différence compte — `declaration_identites` n'est pas créée pour
 * une déclaration anonyme, si bien qu'un champ resté `identite` est affiché puis perdu.
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
