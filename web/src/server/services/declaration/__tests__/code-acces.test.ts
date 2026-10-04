import { describe, expect, it } from "vitest";
import { genererCodeAcces } from "../code-acces";

describe("Code d'accès au suivi", () => {
  it("produit toujours six chiffres", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(genererCodeAcces()).toMatch(/^\d{6}$/);
    }
  });

  it("utilise randomInt sans réduction modulo biaisée", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      "src/server/services/declaration/code-acces.ts",
      "utf8",
    );

    expect(source).toContain("randomInt(max)");
    expect(source).not.toMatch(/getRandomValues[\s\S]*%\s*max/);
  });
});
