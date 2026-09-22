import { z } from 'zod'
import { BORNE_TECHNIQUE, MESSAGE_BORNE_TECHNIQUE, description } from './declaration'
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
      // Une case obligatoire doit être COCHÉE, pas seulement présente :
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

      /*
        Trois formes de select, et elles ne se valident pas pareil.

        - liste figée dans la configuration : la valeur appartient à l'énumération ;
        - référentiel `directions` : la valeur est un IDENTIFIANT, la direction étant une clé
          étrangère ;
        - référentiels ajoutés le 11/09 (postes, lieux, villes, tranches) : la valeur est le
          LIBELLÉ, conservé tel quel sur le dossier pour que renommer le référentiel ne réécrive
          pas l'historique.

        ⚠️ Une chaîne libre ne prouve rien : `verifierReferentiels()` confronte ensuite ces
        libellés au référentiel réel, côté serveur. Ce schéma vérifie la forme, pas l'existence.
      */
      const base =
        valeurs && valeurs.length > 0
          ? z.enum(valeurs as [string, ...string[]], { message: 'Valeur invalide.' })
          : champ.referentiel === 'directions'
            ? z.string().regex(/^\d+$/, 'Valeur invalide.')
            : z.string().trim().min(1, `« ${champ.libelle} » est obligatoire.`)

      return requis ? base : base.or(z.literal('')).optional()
    }

    default: {
      // `champ.max` ne subsiste que sur les champs courts adossés à une colonne VARCHAR — un
      // matricule, une entreprise. Le texte libre, lui, n'a plus de plafond (G1) : seule la
      // borne technique s'applique, et elle ne se voit pas.
      const base = z.string().trim().max(champ.max ?? BORNE_TECHNIQUE, MESSAGE_BORNE_TECHNIQUE)
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

  const precisions: { nom: string; parent: string; declencheur: string; libelle: string }[] = []

  for (const champ of champsVisibles(config, anonyme)) {
    specifiques[champ.nom] = schemaChamp(champ, anonyme)

    if (champ.precisionSi) {
      const nom = `${champ.nom}Precision`

      // Optionnelle dans le SCHÉMA, exigée par le `superRefine` ci-dessous quand la liste vaut
      // « Autre ». La rendre obligatoire ici la réclamerait même pour les autres valeurs, où le
      // champ n'est même pas affiché.
      specifiques[nom] = z
        .string()
        .trim()
        .max(BORNE_TECHNIQUE, MESSAGE_BORNE_TECHNIQUE)
        .optional()

      precisions.push({
        nom,
        parent: champ.nom,
        declencheur: champ.precisionSi.valeur,
        libelle: champ.precisionSi.libelle,
      })
    }
  }

  const base = z.object({
    anonymat: z.boolean(),
    categorieId: z.string().regex(/^\d+$/, 'Merci de sélectionner une catégorie.'),
    categorieAutrePrecision: z.string().trim().max(BORNE_TECHNIQUE, MESSAGE_BORNE_TECHNIQUE).optional(),
    /*
      La gravité n'est demandée qu'aux parcours qui la font saisir par le déclarant.

      L'évènement indésirable ne la demande plus : elle y est qualifiée au traitement (EI8). Le
      schéma doit suivre le formulaire, sans quoi une déclaration EI parfaitement valide serait
      refusée pour un champ que l'écran ne propose même pas.
    */
    ...(config.graviteSaisieParLeDeclarant
      ? {
          niveauGraviteId: z
            .string()
            .regex(/^\d+$/, 'Merci de sélectionner un niveau de gravité.'),
        }
      : {}),
    // Obligatoire, sans plancher ni plafond visibles. La règle et ses arbitrages successifs sont
    // énoncés là où le schéma est défini — ici on le RÉUTILISE, on ne le redécrit pas : les deux
    // définitions ont déjà coexisté, et une règle écrite deux fois finit par diverger.
    description,
    attentesDeclarant: z.string().trim().max(BORNE_TECHNIQUE, MESSAGE_BORNE_TECHNIQUE).optional(),
    // Anti-spam (DT-14).
    piegeAraignee: z.string().max(0, 'Soumission refusée.').optional(),
    /*
      ⚠️ `horodatageAffichage` N'EST PLUS VALIDÉ ICI, et ce n'est pas un oubli.

      Le champ portait un nombre de secondes posé par le navigateur, que ce schéma coerçait. Il
      porte désormais une valeur SIGNÉE — « secondes.signature » —, vérifiée par
      `verifierHorodatage()` avant même que ce schéma ne soit appliqué.

      L'y laisser en `z.coerce.number()` rejetterait TOUTE déclaration légitime : `Number()` d'une
      chaîne signée vaut `NaN`, et l'échec porterait sur un champ caché que le déclarant ne peut ni
      voir ni corriger. Le défaut a été pris à la vérification de bout en bout, pas par les cas
      unitaires — d'où celui qui exerce maintenant la soumission entière.
    */
    ...specifiques,
  })

  if (precisions.length === 0) return base

  /*
    « Autre » oblige à préciser, et seulement « Autre ».

    La règle est conditionnelle : elle ne peut pas s'exprimer dans le schéma d'un champ, qui ne
    voit pas la valeur des autres. Elle est donc posée sur l'objet entier, après coup — seul
    endroit d'où l'on voit à la fois la liste et sa précision.

    ⚠️ L'erreur est rattachée au champ de PRÉCISION (`path`), pas à la liste : c'est là que
    l'œil la cherche, et c'est le champ à remplir.
  */
  return base.superRefine((valeurs, contexte) => {
    for (const p of precisions) {
      const choisi = (valeurs as Record<string, unknown>)[p.parent]
      if (String(choisi ?? '') !== p.declencheur) continue

      const saisie = String((valeurs as Record<string, unknown>)[p.nom] ?? '').trim()

      if (saisie === '') {
        contexte.addIssue({
          code: 'custom',
          path: [p.nom],
          message: `« ${p.libelle} » est obligatoire dès que vous choisissez « Autre ».`,
        })
      }
    }
  })
}

export type DonneesFormulaire = Record<string, unknown>
