import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    // L'application Next.js vit dans un sous-dossier du dépôt Laravel, qui possède son propre
    // package-lock.json (Vite/Tailwind). Sans cette ligne, Turbopack remonte au dépôt racine et
    // choisit le lockfile de Laravel comme racine du workspace.
    root: path.resolve(import.meta.dirname),
  },
}

export default nextConfig
