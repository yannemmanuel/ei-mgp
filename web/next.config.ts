import path from 'node:path'
import type { NextConfig } from 'next'
import { entetesSecurite } from './src/lib/entetes-securite'

const nextConfig: NextConfig = {
  /**
   * En-têtes de sécurité, sur TOUTES les réponses.
   *
   * ⚠️ L'application n'en renvoyait AUCUN avant le 2026-09-22 : elle était encadrable en iframe,
   * donc exposée au détournement de clic, et sans aucune défense en profondeur contre
   * l'injection. La politique et son raisonnement vivent dans `src/lib/entetes-securite.ts` —
   * ici, seul le branchement.
   *
   * ⚠️ `source: '/:chemin*'` couvre aussi `/`. Le motif `/:chemin+` l'aurait laissée nue, ce qui
   * est précisément la page qu'on encadrerait.
   */
  async headers() {
    return [
      {
        source: '/:chemin*',
        headers: [...entetesSecurite(process.env.NODE_ENV === 'production')],
      },
    ]
  },
  // Répertoire de build, surchargeable par `NEXT_DIST_DIR`.
  //
  // Sert à lancer une seconde instance sans toucher au `.next` de celle qui tourne déjà. Le cas
  // se présente à chaque `prisma generate` : le serveur en cours garde son ancien client, ignore
  // les colonnes qui viennent d'apparaître et répond 500 jusqu'à son redémarrage. Vérifier sur
  // une instance à part évite d'avoir à interrompre celle de la personne qui travaille.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  experimental: {
    /*
     * Le corps d'une Server Action est plafonné à 1 Mo par défaut, soit moins que les pièces
     * jointes qu'annonce le formulaire. Le déclarant joignait une photo et recevait « Body
     * exceeded 1 MB limit ».
     *
     * La marge au-dessus des 5 Mo métier couvre l'encodage multipart et les champs du
     * formulaire : la borne qui fait foi reste celle de `@/lib/limites-pieces-jointes`, vérifiée
     * dans le navigateur puis au serveur, et c'est elle qui doit refuser un lot trop lourd — pas
     * ce plafond de transport, dont le rejet ne produit aucun message exploitable.
     *
     * ⚠️ Sur Netlify, cible actuelle de `netlify.toml`, les fonctions rejettent toute requête
     * au-delà de 6 Mo, et ce plafond N'EST PAS relevable — il vient d'AWS Lambda. Les 5 Mo
     * autorisés depuis le 11/09 en approchent sans y tenir tout à fait : 5 Mo de binaires pèsent
     * environ 6,7 Mo une fois encodés. Un lot au plafond exact reste donc refusé en production
     * tant que les fichiers transitent par la Server Action ; l'écart était de dix contre un
     * auparavant, il n'est plus que de quelques centaines de kilo-octets.
     */
    serverActions: { bodySizeLimit: '8mb' },
  },
  turbopack: {
    // L'application Next.js vit dans un sous-dossier du dépôt Laravel, qui possède son propre
    // package-lock.json (Vite/Tailwind). Sans cette ligne, Turbopack remonte au dépôt racine et
    // choisit le lockfile de Laravel comme racine du workspace.
    root: path.resolve(import.meta.dirname),
  },
}

export default nextConfig
