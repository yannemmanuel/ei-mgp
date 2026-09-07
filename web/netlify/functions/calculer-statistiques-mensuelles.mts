import { declencher } from './_declencher.mts'

/** Fonction programmée — l'horaire est déclaré dans `netlify.toml`. */
export default async function handler(): Promise<Response> {
  return declencher('calculer-statistiques-mensuelles')
}
