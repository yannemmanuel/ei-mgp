import { z } from 'zod'
import type { Champ, ParcoursConfig } from '@/server/services/declaration/parcours-config'
import { champsVisibles } from '@/server/services/declaration/parcours-config'

/**
 * Construit le schéma de validation d'un parcours à partir de sa configuration de champs.
 *
 * Dérivé de la MÊME source que le rendu (`parcours-config.ts`) : décrire les champs deux fois
 * garantirait qu'ils finissent par diverger. Exécuté côté serveur — la validation du navigateur
 * n'est qu'un confort.
 */

/** RGI-01 : jamais postérieure à aujourd'hui ; le jour même reste accepté. */
function dateNonFuture(message: string) {
  return z.coerce.date({ message: 'Merci d’indiquer une date valide.' }).refine((valeur) => {
    const limite = new Date()
    limite.setHours(23, 59, 59, 999)
    return valeur <= limite
  }, message)
}

function schemaChamp(champ: Champ, anonyme: boolean): z.ZodTypeAny {
  const requis = champ.obligatoire === true || (champ.obligatoire === 'siIdentifie' && !anonyme)

  switch (champ.type) {
    case 'case': {
      // Une case obligatoire doit être COCHÉE (équivalent de la règle `accepted` de Laravel),
      // pas simplement présente — c'est le cas du consentement RGPD (RG-15).
      return requis
        ? z.literal(true, { message: `« ${champ.libelle} » est obligatoire.` })
        : z.boolean().optional().default(false)
    }

    case 'nombre': {
      const base = z.coerce
        .number({ message: 'Valeur numérique attendue.' })
        .int()
        .min(champ.min ?? 0)
        .max(champ.max ?? Number.MAX_SAFE_INTEGER)
      return requis ? base : base.optional()
    }

    case 'date':
    case 'datetime': {
      const base = dateNonFuture('La date des faits ne peut pas être postérieure à aujourd’hui.')
      return requis ? base : base.optional()
    }

    case 'email': {
      const base = z.email('Adresse e-mail invalide.').max(champ.max ?? 255)
      return requis ? base : base.or(z.literal('')).optional()
    }

    case 'select': {
      const valeurs = champ.options?.map((o) => o.valeur)
      const base =
        valeurs && valeurs.length > 0
          ? z.enum(valeurs as [string, ...string[]], { message: 'Valeur invalide.' })
          : z.string().regex(/^\d+$/, 'Valeur invalide.')
      return requis ? base : base.or(z.literal('')).optional()
    }

    default: {
      const base = z.string().trim().max(champ.max ?? 255)
      return requis
        ? base.min(1, `« ${champ.libelle} » est obligatoire.`)
        : base.optional()
    }
  }
}

/**
 * Schéma complet d'un parcours : socle commun + champs spécifiques, l'anonymat conditionnant
 * à la fois la présence des champs d'identité (RGI-03) et le caractère obligatoire de certains.
 */
export function schemaParcours(config: ParcoursConfig, anonyme: boolean) {
  const specifiques: Record<string, z.ZodTypeAny> = {}

  for (const champ of champsVisibles(config, anonyme)) {
    specifiques[champ.nom] = schemaChamp(champ, anonyme)
  }

  return z.object({
    anonymat: z.boolean(),
    categorieId: z.string().regex(/^\d+$/, 'Merci de sélectionner une catégorie.'),
    categorieAutrePrecision: z.string().trim().max(500).optional(),
    niveauGraviteId: z.string().regex(/^\d+$/, 'Merci de sélectionner un niveau de gravité.'),
    // RGI-02 : description factuelle, 20 caractères minimum.
    description: z.string().trim().min(20, 'La description doit contenir au moins 20 caractères.'),
    attentesDeclarant: z.string().trim().max(255).optional(),
    // Anti-spam (DT-14).
    piegeAraignee: z.string().max(0, 'Soumission refusée.').optional(),
    horodatageAffichage: z.coerce.number().int().nonnegative(),
    ...specifiques,
  })
}

export type DonneesFormulaire = Record<string, unknown>
