import { afterEach, describe, expect, it, vi } from "vitest";
import { adresseClient } from "../adresse-client";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Résolution de l'adresse client", () => {
  it("ignore par défaut les en-têtes génériques forgeables", () => {
    const entetes = new Headers({
      "x-forwarded-for": "198.51.100.25",
      "x-real-ip": "198.51.100.26",
    });

    expect(adresseClient(entetes)).toBeNull();
  });

  it("accepte le premier relais lorsque le proxy est explicitement fiable", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const entetes = new Headers({
      "x-forwarded-for": "198.51.100.25, 10.0.0.2",
    });

    expect(adresseClient(entetes)).toBe("198.51.100.25");
  });

  it("refuse une valeur qui n'est pas une adresse IP", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const entetes = new Headers({ "x-forwarded-for": "adresse-forgee" });

    expect(adresseClient(entetes)).toBeNull();
  });

  it("préfère l'en-tête dédié et validé de Netlify", () => {
    vi.stubEnv("NETLIFY", "true");
    const entetes = new Headers({
      "x-nf-client-connection-ip": "2001:db8::8",
      "x-forwarded-for": "198.51.100.99",
    });

    expect(adresseClient(entetes)).toBe("2001:db8::8");
  });
});
