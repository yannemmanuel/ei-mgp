import { isIP } from "node:net";

function premiereAdresse(valeur: string | null): string | null {
  const candidate = valeur?.split(",")[0]?.trim() ?? "";
  return isIP(candidate) > 0 ? candidate : null;
}

/**
 * Résout l'adresse du client sans accorder par défaut sa confiance à un en-tête forgeable.
 *
 * Netlify reconstruit son en-tête dédié à la périphérie. Pour un autre reverse proxy, la lecture
 * de `X-Forwarded-For` doit être activée explicitement après avoir vérifié qu'il écrase la valeur
 * reçue du navigateur.
 */
export function adresseClient(entetes: Pick<Headers, "get">): string | null {
  if (process.env.NETLIFY === "true") {
    const netlify = premiereAdresse(entetes.get("x-nf-client-connection-ip"));
    if (netlify) return netlify;
  }

  if (process.env.TRUST_PROXY_HEADERS !== "true") return null;

  return (
    premiereAdresse(entetes.get("x-forwarded-for")) ??
    premiereAdresse(entetes.get("x-real-ip"))
  );
}
