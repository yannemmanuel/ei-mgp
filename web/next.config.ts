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
  turbopack: {
    // L'application Next.js vit dans un sous-dossier du dépôt Laravel, qui possède son propre
    // package-lock.json (Vite/Tailwind). Sans cette ligne, Turbopack remonte au dépôt racine et
    // choisit le lockfile de Laravel comme racine du workspace.
    root: path.resolve(import.meta.dirname),
  },
}

export default nextConfig
