import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const doubles = vi.hoisted(() => {
  return {
    journaliser: vi.fn(),
    effacer: vi.fn(),
  };
});

vi.mock("@/server/services/audit/journal", () => ({
  journaliser: doubles.journaliser,
}));

vi.mock("@/server/services/rgpd/effacement", () => ({
  effacerDonneesPersonnelles: doubles.effacer,
}));

const {
  enregistrerPolitiqueSuppression,
  lirePolitiqueSuppression,
  retirerDeclaration,
} = await import("../politique-suppression");

describe("Politique de suppression des déclarations", () => {
  const queryRaw = vi.spyOn(prisma, "$queryRaw");
  const transaction = vi.spyOn(prisma, "$transaction");
  const dossier = vi.spyOn(prisma.dossiers, "findUnique");
  const executeRaw = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    executeRaw.mockResolvedValue(1);
    transaction.mockImplementation(async (operation) =>
      typeof operation === "function"
        ? operation({ $executeRaw: executeRaw } as never)
        : Promise.all(operation),
    );
    doubles.journaliser.mockResolvedValue(undefined);
  });

  it("reste fermée et ne fait pas tomber la page lorsque la migration manque", async () => {
    queryRaw.mockRejectedValueOnce(new Error("table inexistante"));
    const avertissement = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await expect(lirePolitiqueSuppression()).resolves.toEqual({
      autorisee: false,
      delaiJours: 30,
    });
    expect(avertissement).toHaveBeenCalledOnce();
    avertissement.mockRestore();
  });

  it("lit les valeurs persistées et convertit leurs types", async () => {
    queryRaw.mockResolvedValueOnce([
      { cle: "declarations.suppression_autorisee", valeur: "true" },
      { cle: "declarations.delai_suppression_jours", valeur: "45" },
    ]);

    await expect(lirePolitiqueSuppression()).resolves.toEqual({
      autorisee: true,
      delaiJours: 45,
    });
  });

  it("enregistre les deux paramètres dans une seule transaction et journalise", async () => {
    await enregistrerPolitiqueSuppression(
      { id: 12n },
      { autorisee: true, delaiJours: 90 },
    );

    expect(transaction).toHaveBeenCalledOnce();
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(doubles.journaliser).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "politique_suppression.modifiee",
        acteurId: 12n,
        nouvelles: { autorisee: true, delaiJours: 90 },
      }),
    );
  });

  it.each([-1, 1.5, 3651])(
    "refuse le délai invalide %s",
    async (delaiJours) => {
      await expect(
        enregistrerPolitiqueSuppression(
          { id: 12n },
          { autorisee: true, delaiJours },
        ),
      ).rejects.toThrow("compris entre 0 et 3 650 jours");
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it("n’efface rien lorsque la politique est désactivée", async () => {
    queryRaw.mockResolvedValueOnce([
      { cle: "declarations.suppression_autorisee", valeur: "false" },
      { cle: "declarations.delai_suppression_jours", valeur: "0" },
    ]);
    dossier.mockResolvedValueOnce({
      id: "dossier-1",
      reference: "DEC-001",
      created_at: new Date("2026-01-01"),
      archive_le: null,
    } as never);

    await expect(retirerDeclaration({ id: 12n }, "dossier-1")).rejects.toThrow(
      "désactivée",
    );
    expect(doubles.effacer).not.toHaveBeenCalled();
  });
});
