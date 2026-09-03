import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Résolution native des chemins `@/*` de tsconfig.json (Vite ≥ 7 : le plugin
  // vite-tsconfig-paths n'est plus nécessaire).
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.mts'],
    include: ['src/**/*.test.ts'],
    // Les tests de parité interrogent la base réelle en lecture seule : les exécuter en série
    // évite d'ouvrir plusieurs pools de connexions PostgreSQL simultanés.
    fileParallelism: false,
    // Les tests de creation ecrivent reellement en base (transaction + verrou + bcrypt) :
    // le defaut de 5 s est trop court pour un cas qui cree plusieurs declarations.
    testTimeout: 30_000,
  },
})
