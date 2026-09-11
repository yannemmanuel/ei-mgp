import { z } from 'zod'

/**
 * Validation des formulaires de déclaration — port des règles Laravel
 * (`App\Livewire\Declaration\*`) et des règles implicites du CDC recensées dans
 * `docs/regles-metier.md` §B.
 *
 * Ces schémas sont exécutés CÔTÉ SERVEUR dans les Server Actions. Une validation côté client
 * n'est qu'un confort d'ergonomie : elle ne remplace jamais celle-ci.
 */

/**
 * Description factuelle : OBLIGATOIRE, 200 caractères au plus.
 *
 * Deux arbitrages successifs, qu'il faut lire ensemble pour ne pas défaire l'un en appliquant
 * l'autre :
 *
 * - 08/09/2026 — RGI-02 exigeait « obligatoire, 20 caractères minimum ». Le PLANCHER a été levé :
 *   il écartait des signalements légitimes tenant en trois mots (« Fuite gaz zone B » : 16
 *   caractères). Le plafond de 200 a été posé, parce qu'au-delà de deux ou trois phrases
 *   l'essentiel se dilue, et que la messagerie du dossier existe pour le détail.
 * - 08/09/2026 (postérieur) — le champ redevient OBLIGATOIRE. Un dossier sans aucun récit des
 *   faits n'est pas traitable : ni qualifiable, ni affectable.
 *
 * Le champ est donc exigé, mais SANS plancher de longueur : « Fuite gaz zone B » reste accepté.
 * Rétablir un minimum de caractères reviendrait à réintroduire ce que le premier arbitrage a
 * écarté pour de bonnes raisons.
 *
 * Exporté : `formulaire-parcours.ts` réutilise ce schéma plutôt que d'en décrire un second. Les
 * deux ont déjà existé côte à côte, et deux définitions d'une même règle finissent par diverger.
 */
/**
 * Borne technique, invisible pour le déclarant (G1).
 *
 * Le retour métier du 11/09 supprime toute limite de caractères : ni plafond affiché, ni
 * compteur, ni `maxlength`. Une borne demeure néanmoins côté serveur, très au-delà de ce qu'un
 * humain écrit — cent mille signes, soit une cinquantaine de pages. Elle ne dit rien à personne
 * et ne refuse rien de légitime ; elle empêche seulement qu'une requête forgée fasse grossir la
 * base sans limite. La supprimer tout à fait aurait été confondre « pas de limite pour
 * l'utilisateur » et « pas de garde-fou ».
 */
export const BORNE_TECHNIQUE = 100_000
export const MESSAGE_BORNE_TECHNIQUE = 'Ce texte est anormalement long.'

export const description = z
  .string()
  .trim()
  .min(1, 'Merci de décrire les faits.')
  .max(BORNE_TECHNIQUE, MESSAGE_BORNE_TECHNIQUE)

/**
 * RGI-01 : la date des faits ne peut jamais être postérieure à la date de soumission.
 * La borne est la FIN de la journée courante : une déclaration faite le jour même des faits est
 * légitime (cas majoritaire), seule une date future est refusée.
 */
const dateSurvenance = z.coerce
  .date({ message: 'Merci d’indiquer une date valide.' })
  .refine((valeur) => {
    const finDeJournee = new Date()
    finDeJournee.setHours(23, 59, 59, 999)
    return valeur <= finDeJournee
  }, 'La date des faits ne peut pas être postérieure à aujourd’hui.')

const identifiantReferentiel = z
  .string()
  .min(1, 'Ce champ est obligatoire.')
  .regex(/^\d+$/, 'Valeur invalide.')

/** Socle commun aux 4 parcours (CDC §9). */
export const socleDeclaration = z.object({
  anonymat: z.boolean(),
  categorieId: identifiantReferentiel,
  categorieAutrePrecision: z.string().trim().max(500).optional(),
  niveauGraviteId: identifiantReferentiel,
  description,
  lieu: z.string().trim().max(255).optional(),
  dateSurvenance,
  attentesDeclarant: z.string().trim().max(255).optional(),
  // Anti-spam (DT-14) : champ invisible qu'un humain ne remplit jamais, et horodatage
  // d'affichage permettant d'exiger un délai minimal de remplissage.
  piegeAraignee: z.string().max(0, 'Soumission refusée.').optional(),
  horodatageAffichage: z.coerce.number().int().nonnegative(),
})

/**
 * RGI-03 : si l'anonymat est coché, aucun champ d'identification n'est collecté — le schéma
 * d'identité n'est même pas appliqué. Les champs d'identité sont donc déclarés séparément et
 * n'entrent en jeu que pour une déclaration identifiée.
 */
export const identiteEmploye = z.object({
  nomPrenom: z.string().trim().min(1, 'Merci d’indiquer vos nom et prénom.').max(255),
  matricule: z.string().trim().max(255).optional(),
  fonction: z.string().trim().max(255).optional(),
  contactEmail: z.email('Adresse e-mail invalide.').optional().or(z.literal('')),
  contactTelephone: z.string().trim().max(255).optional(),
  directionId: identifiantReferentiel,
})

export const identiteSousTraitant = z.object({
  nomPrenom: z.string().trim().min(1, 'Merci d’indiquer vos nom et prénom.').max(255),
  entreprise: z.string().trim().min(1, 'Merci d’indiquer votre entreprise.').max(255),
  fonction: z.string().trim().max(255).optional(),
  contactEmail: z.email('Adresse e-mail invalide.').optional().or(z.literal('')),
  contactTelephone: z.string().trim().max(255).optional(),
  // RG-15 : consentement RGPD explicite, exigé UNIQUEMENT pour ce parcours (CDC §9.3).
  consentementRgpd: z.literal(true, {
    message:
      'Vous devez accepter le traitement de vos données pour envoyer une déclaration identifiée.',
  }),
})

export const identiteCommunaute = z.object({
  nomPrenom: z.string().trim().min(1, 'Merci d’indiquer vos nom et prénom.').max(255),
  localite: z.string().trim().min(1, 'Merci d’indiquer votre localité.').max(255),
  statutPlaignant: z.string().trim().max(255).optional(),
  contactEmail: z.email('Adresse e-mail invalide.').optional().or(z.literal('')),
  contactTelephone: z.string().trim().max(255).optional(),
})

export type SocleDeclaration = z.infer<typeof socleDeclaration>

/**
 * Délai minimal entre l'affichage du formulaire et sa soumission (DT-14). Un bot répond en
 * quelques centaines de millisecondes ; aucun humain ne remplit ce formulaire en moins de 3 s.
 */
export const DELAI_MINIMAL_REMPLISSAGE_SECONDES = 3

export function soumissionTropRapide(horodatageAffichage: number, maintenant: number = Date.now()): boolean {
  const ecoule = Math.floor(maintenant / 1000) - horodatageAffichage
  return ecoule < DELAI_MINIMAL_REMPLISSAGE_SECONDES
}

/**
 * La précision est obligatoire dès que la catégorie choisie est « Autre » (RG-09) : elle ne peut
 * pas être vérifiée par le schéma seul, qui ne connaît pas le référentiel.
 */
export function precisionAutreManquante(estCategorieAutre: boolean, precision: string | undefined): boolean {
  return estCategorieAutre && (precision ?? '').trim() === ''
}
