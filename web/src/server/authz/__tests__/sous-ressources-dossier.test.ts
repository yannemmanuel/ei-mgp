import { describe, expect, it } from "vitest";
import {
  peutCreerAction,
  peutCreerInvestigation,
  peutEnvoyerMessage,
  type DossierPourAutorisation,
  type Permission,
} from "..";
import { utilisateurAvecRoles } from "./aide";

const dossier = (siteId: bigint): DossierPourAutorisation => ({
  parcoursCode: "ei_employe",
  statutCode: "en_analyse",
  isAnonymous: true,
  declarantUserId: null,
  siteId,
  directionId: null,
  estAffecteAuLecteur: false,
});

function utilisateurCloisonne(permissions: readonly Permission[]) {
  const base = utilisateurAvecRoles("rqse");

  return {
    ...base,
    siteId: 10n,
    directionId: null,
    cloisonneParRattachement: true,
    permissions: new Set([...base.permissions, ...permissions]),
  };
}

describe("Policies des sous-ressources — même périmètre que le dossier", () => {
  it("refuse de créer une action sur un dossier d'un autre site", () => {
    const utilisateur = utilisateurCloisonne(["actions.create"]);

    expect(peutCreerAction(utilisateur, dossier(10n))).toBe(true);
    expect(peutCreerAction(utilisateur, dossier(20n))).toBe(false);
  });

  it("refuse d'ouvrir une investigation sur un dossier d'un autre site", () => {
    const utilisateur = utilisateurCloisonne(["investigations.create"]);

    expect(
      peutCreerInvestigation(utilisateur, {
        ...dossier(10n),
        enqueteurId: utilisateur.id,
      }),
    ).toBe(true);
    expect(
      peutCreerInvestigation(utilisateur, {
        ...dossier(20n),
        enqueteurId: utilisateur.id,
      }),
    ).toBe(false);
  });

  it("refuse d'envoyer un message sur un dossier d'un autre site", () => {
    const utilisateur = utilisateurCloisonne(["messagerie.send"]);

    expect(peutEnvoyerMessage(utilisateur, dossier(10n))).toBe(true);
    expect(peutEnvoyerMessage(utilisateur, dossier(20n))).toBe(false);
  });
});
