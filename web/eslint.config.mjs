import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Répertoires de build des instances de vérification (NEXT_DIST_DIR) : du code généré, que
    // le linter n'a pas à juger — et qui noierait les vrais avertissements sous des milliers.
    ".next-*/**",
  ]),
]);

export default eslintConfig;
