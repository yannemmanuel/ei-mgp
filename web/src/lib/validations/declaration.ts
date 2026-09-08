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
 * Description factuelle : facultative, 200 caractères au plus.
 *
 * Arbitrage métier du 08/09/2026, qui remplace RGI-02 (« obligatoire, 20 caractères minimum »).
 * Le plancher écartait des signalements légitimes tenant en une phrase — « Extincteur vide,
 * atelier 3 » fait 27 caractères, mais « Fuite gaz zone B » n'en fait que 16. Le plafond tient à
 * la lecture : au-delà de deux ou trois phrases, l'essentiel se dilue, et la messagerie du
 * dossier existe pour le détail.
 *
 * ⚠️ Conséquence assumée : un dossier peut désormais être créé SANS description. La colonne
 * `dossiers.description` est `TEXT NOT NULL` — c'est une chaîne vide qui y est écrite, jamais
 * NULL, et les écrans de traitement doivent rester lisibles dans ce cas.
 */
const description = z
  .string()
  .trim()
  .max(200, 'La description ne peut pas dépasser 200 caractères.')
  .optional()
  .default('')

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
