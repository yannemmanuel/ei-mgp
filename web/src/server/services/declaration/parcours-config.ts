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
  readonly referentiel?: 'directions'
  /** Colonne cible dans `declaration_identites` ou `dossiers`. */
  readonly colonne?: string
}

export type ParcoursConfig = {
  readonly code: ParcoursCode
  readonly libelle: string
  readonly titre: string
  readonly accroche: string
  readonly champs: readonly Champ[]
}

const CANAUX_RETOUR = [
  { valeur: 'email', libelle: 'E-mail' },
  { valeur: 'telephone', libelle: 'Téléphone' },
  { valeur: 'entretien', libelle: 'Entretien' },
  { valeur: 'page_de_suivi', libelle: 'Page de suivi' },
] as const

/** Champs d'identité communs aux parcours qui les partagent. */
const CONTACT = [
  { nom: 'contactEmail', libelle: 'Adresse e-mail', type: 'email', etape: 1, max: 255, identite: true, colonne: 'contactEmail' },
  { nom: 'contactTelephone', libelle: 'Téléphone', type: 'tel', etape: 1, max: 50, identite: true, colonne: 'contactTelephone' },
] as const satisfies readonly Champ[]

export const PARCOURS: Record<ParcoursCode, ParcoursConfig> = {
  ei_employe: {
    code: 'ei_employe',
    libelle: 'Événement indésirable — Employé',
    titre: 'Déclarer un évènement indésirable',
    accroche: 'Signalez un incident, un presque-accident ou une situation dangereuse.',
    champs: [
      { nom: 'nomPrenom', libelle: 'Nom et prénom', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'nomPrenom' },
      { nom: 'matricule', libelle: 'Matricule', type: 'texte', etape: 1, max: 100, identite: true, colonne: 'matricule' },
      { nom: 'posteOccupe', libelle: 'Poste occupé', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'fonction' },
      {
        nom: 'directionId',
        libelle: 'Direction',
        type: 'select',
        etape: 1,
        obligatoire: 'siIdentifie',
        referentiel: 'directions',
        identite: true,
      },
      ...CONTACT,
      { nom: 'dateSurvenance', libelle: 'Date des faits', type: 'date', etape: 2, obligatoire: true },
      { nom: 'lieu', libelle: 'Lieu', type: 'texte', etape: 2, obligatoire: true, max: 255 },
      {
        nom: 'propositionMesureCorrective',
        libelle: 'Proposition de mesure corrective',
        type: 'zone',
        etape: 3,
        max: 2000,
        aide: 'Facultatif — si vous voyez une action qui éviterait que cela se reproduise.',
      },
    ],
  },

  grief_employe: {
    code: 'grief_employe',
    libelle: 'Grief — Employé',
    titre: 'Déposer un grief',
    accroche: 'Signalez une situation professionnelle que vous jugez préjudiciable.',
    champs: [
      { nom: 'nomPrenom', libelle: 'Nom et prénom', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'nomPrenom' },
      { nom: 'matricule', libelle: 'Matricule', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'matricule' },
      { nom: 'posteOccupe', libelle: 'Poste occupé', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'fonction' },
      { nom: 'ancienneteAnnees', libelle: 'Ancienneté (années)', type: 'nombre', etape: 1, min: 0, max: 60, identite: true, colonne: 'ancienneteAnnees' },
      ...CONTACT,
      { nom: 'dateHeureFaits', libelle: 'Date et heure des faits', type: 'datetime', etape: 2, obligatoire: true },
      { nom: 'lieu', libelle: 'Lieu', type: 'texte', etape: 2, obligatoire: true, max: 255 },
      {
        nom: 'caractereRepetitif',
        libelle: 'Caractère répétitif',
        type: 'select',
        etape: 2,
        obligatoire: true,
        options: [
          { valeur: 'premiere_fois', libelle: 'Première fois' },
          { valeur: 'deja_signale', libelle: 'Déjà signalé' },
          { valeur: 'recurrent', libelle: 'Récurrent' },
        ],
      },
      { nom: 'personnesImpliquees', libelle: 'Personnes impliquées', type: 'zone', etape: 3, max: 2000, identite: true, colonne: 'personnesImpliquees' },
      { nom: 'temoinsEventuels', libelle: 'Témoins éventuels', type: 'zone', etape: 3, max: 2000, identite: true, colonne: 'temoins' },
      { nom: 'souhaitEtreRecontacte', libelle: 'Je souhaite être recontacté', type: 'case', etape: 3, identite: true, colonne: 'souhaitRecontact' },
      { nom: 'preferenceCanalRetour', libelle: 'Canal de retour préféré', type: 'select', etape: 3, options: CANAUX_RETOUR, identite: true, colonne: 'canalRetourPrefere' },
    ],
  },

  grief_sous_traitant: {
    code: 'grief_sous_traitant',
    libelle: 'Grief — Sous-traitant',
    titre: 'Déposer un grief',
    accroche: 'Signalez une difficulté rencontrée dans le cadre de votre prestation.',
    champs: [
      { nom: 'nomPrenom', libelle: 'Nom et prénom', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'nomPrenom' },
      { nom: 'entreprise', libelle: 'Entreprise', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'entreprise' },
      { nom: 'fonction', libelle: 'Fonction', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'fonction' },
      ...CONTACT,
      {
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
      { nom: 'dateHeureFaits', libelle: 'Date et heure des faits', type: 'datetime', etape: 2, obligatoire: true },
      { nom: 'lieuSite', libelle: 'Lieu / site', type: 'texte', etape: 2, obligatoire: true, max: 255 },
      { nom: 'personnesOuServicesImpliques', libelle: 'Personnes ou services impliqués', type: 'zone', etape: 3, max: 2000, identite: true, colonne: 'personnesImpliquees' },
      { nom: 'temoinsEventuels', libelle: 'Témoins éventuels', type: 'zone', etape: 3, max: 2000, identite: true, colonne: 'temoins' },
      { nom: 'souhaitEtreInforme', libelle: 'Je souhaite être informé des suites', type: 'case', etape: 3, identite: true, colonne: 'souhaitRecontact' },
      { nom: 'canalRetourSouhaite', libelle: 'Canal de retour souhaité', type: 'select', etape: 3, options: CANAUX_RETOUR, identite: true, colonne: 'canalRetourPrefere' },
    ],
  },

  grief_communaute: {
    code: 'grief_communaute',
    libelle: 'Grief — Communauté',
    titre: 'Déposer une plainte',
    accroche: 'Signalez une nuisance ou un préjudice lié au service de l’eau.',
    champs: [
      { nom: 'nomPrenom', libelle: 'Nom et prénom', type: 'texte', etape: 1, max: 255, identite: true, colonne: 'nomPrenom' },
      { nom: 'localite', libelle: 'Localité', type: 'texte', etape: 1, obligatoire: 'siIdentifie', max: 255, identite: true, colonne: 'localite' },
      ...CONTACT,
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
      { nom: 'lieu', libelle: 'Lieu', type: 'texte', etape: 2, obligatoire: true, max: 255 },
      { nom: 'personnesBiensAffectes', libelle: 'Personnes ou biens affectés', type: 'zone', etape: 3, max: 2000 },
      { nom: 'solutionSouhaitee', libelle: 'Solution souhaitée', type: 'zone', etape: 3, max: 2000 },
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
 */
const IDENTITE_CONSERVEE_EN_ANONYME = new Set(['statutPlaignant'])

/** Champs réellement affichés, une fois l'anonymat pris en compte (RGI-03). */
export function champsVisibles(config: ParcoursConfig, anonyme: boolean): Champ[] {
  return config.champs.filter(
    (c) => !anonyme || !c.identite || IDENTITE_CONSERVEE_EN_ANONYME.has(c.nom)
  )
}
