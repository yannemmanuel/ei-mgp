/** Origine canonique utilisée dans les liens envoyés ou encodés hors du navigateur. */
export function originePublique(): string {
  const configuree = process.env.AUTH_URL?.trim();

  if (!configuree) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_URL est obligatoire en production pour générer des liens publics.",
      );
    }
    return "http://localhost:3000";
  }

  let url: URL;
  try {
    url = new URL(configuree);
  } catch {
    throw new Error("AUTH_URL doit être une URL absolue valide.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "AUTH_URL doit utiliser HTTP(S) et ne contenir aucun identifiant.",
    );
  }

  return configuree.replace(/\/+$/, "");
}
