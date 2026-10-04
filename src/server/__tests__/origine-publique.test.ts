import { afterEach, describe, expect, it, vi } from "vitest";
import { originePublique } from "../origine-publique";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Origine publique", () => {
  it("utilise localhost uniquement hors production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_URL", "");

    expect(originePublique()).toBe("http://localhost:3000");
  });

  it("échoue fermée en production sans AUTH_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "");

    expect(() => originePublique()).toThrow("AUTH_URL est obligatoire");
  });

  it("normalise la barre finale d'une URL valide", () => {
    vi.stubEnv("AUTH_URL", "https://signalement.example.test/");

    expect(originePublique()).toBe("https://signalement.example.test");
  });

  it("refuse les protocoles et identifiants dangereux", () => {
    vi.stubEnv("AUTH_URL", "javascript:alert(1)");
    expect(() => originePublique()).toThrow(/HTTP/);

    vi.stubEnv("AUTH_URL", "https://admin:secret@example.test");
    expect(() => originePublique()).toThrow(/identifiant/);
  });
});
