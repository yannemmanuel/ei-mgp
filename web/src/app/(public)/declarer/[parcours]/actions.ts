'use server'

import {
  traiterSoumission,
  type EtatSoumission,
} from '@/server/services/declaration/soumission'

export type { EtatSoumission }

/**
 * Soumission d'une déclaration par le formulaire PUBLIC.
 *
 * Toute la logique vit dans `traiterSoumission` : la saisie relais (EX-DEC-10) partage la même,
 * pour que RG-13 — « même workflow qu'une déclaration directe » — soit vrai par construction et
 * non par vigilance.
 */
export async function soumettreDeclaration(
  _precedent: EtatSoumission,
  donnees: FormData
): Promise<EtatSoumission> {
  return traiterSoumission(donnees, { viaRelais: false })
}
