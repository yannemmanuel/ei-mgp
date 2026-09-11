import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Répertoire de build, surchargeable par `NEXT_DIST_DIR`.
  //
  // Sert à lancer une seconde instance sans toucher au `.next` de celle qui tourne déjà. Le cas
  // se présente à chaque `prisma generate` : le serveur en cours garde son ancien client, ignore
  // les colonnes qui viennent d'apparaître et répond 500 jusqu'à son redémarrage. Vérifier sur
  // une instance à part évite d'avoir à interrompre celle de la personne qui travaille.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  experimental: {
    /*
     * Le corps d'une Server Action est plafonné à 1 Mo par défaut — soit vingt fois moins que les
     * 50 Mo de pièces jointes qu'exigent EX-DEC-06 / RGI-04, et que le formulaire annonce. Le
     * déclarant joignait une photo et recevait « Body exceeded 1 MB limit ».
     *
     * La marge au-dessus de 50 Mo couvre l'encodage multipart et les champs du formulaire : la
     * borne métier reste celle de `@/lib/limites-pieces-jointes`, vérifiée dans le navigateur puis
     * au serveur, et c'est elle qui doit refuser un lot trop lourd — pas ce plafond de transport,
     * dont le rejet ne produit aucun message exploitable.
     *
     * ⚠️ Cette valeur ne vaut que pour un hébergement sans plafond propre. Sur Netlify, cible
     * actuelle de `netlify.toml`, les fonctions rejettent toute requête au-delà de 6 Mo (≈ 4,5 Mo
     * une fois les binaires encodés en base64), et ce plafond N'EST PAS relevable — il vient
     * d'AWS Lambda. Tenir les 50 Mo en production suppose donc de ne plus faire transiter les
     * fichiers par la Server Action (téléversement direct vers le magasin de blobs, la déclaration
     * ne portant plus que leurs références). Tant que ce n'est pas fait, le plafond réel en
     * production est celui de l'hébergeur, pas celui-ci.
     */
    serverActions: { bodySizeLimit: '52mb' },
  },
  turbopack: {
    // L'application Next.js vit dans un sous-dossier du dépôt Laravel, qui possède son propre
    // package-lock.json (Vite/Tailwind). Sans cette ligne, Turbopack remonte au dépôt racine et
    // choisit le lockfile de Laravel comme racine du workspace.
    root: path.resolve(import.meta.dirname),
  },
}

export default nextConfig
