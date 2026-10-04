import { prisma } from "@/lib/prisma";
import { MODELES } from "@/server/modeles";
import { journaliser } from "@/server/services/audit/journal";
import { effacerDonneesPersonnelles } from "@/server/services/rgpd/effacement";
import { ErreurWorkflow } from "@/server/services/dossier/workflow";

const CLE_AUTORISEE = "declarations.suppression_autorisee";
const CLE_DELAI = "declarations.delai_suppression_jours";

export type PolitiqueSuppression = {
  autorisee: boolean;
  delaiJours: number;
};

export async function lirePolitiqueSuppression(): Promise<PolitiqueSuppression> {
  // Requête brute volontaire : en développement, le singleton Prisma peut survivre à un
  // `prisma generate` et ne pas exposer immédiatement le delegate du nouveau modèle. Les
  // méthodes `$queryRaw` existent, elles, sur toutes les versions du client déjà chargées.
  let lignes: Array<{ cle: string; valeur: string }>;

  try {
    lignes = await prisma.$queryRaw<Array<{ cle: string; valeur: string }>>`
      SELECT "cle", "valeur"
      FROM "parametres_application"
      WHERE "cle" IN (${CLE_AUTORISEE}, ${CLE_DELAI})
    `;
  } catch (erreur) {
    // Déploiement progressif : l'interface ne doit pas tomber si le code arrive avant sa
    // migration. La politique reste fermée par défaut, donc aucune suppression n'est ouverte.
    console.warn(
      "Politique de suppression indisponible : appliquez la migration 2026-10-03.",
      erreur,
    );
    return { autorisee: false, delaiJours: 30 };
  }
  const valeurs = new Map(lignes.map((ligne) => [ligne.cle, ligne.valeur]));
  const delai = Number(valeurs.get(CLE_DELAI) ?? "30");

  return {
    autorisee: valeurs.get(CLE_AUTORISEE) === "true",
    delaiJours: Number.isInteger(delai) && delai >= 0 ? delai : 30,
  };
}

export async function enregistrerPolitiqueSuppression(
  acteur: { id: bigint },
  politique: PolitiqueSuppression,
): Promise<void> {
  if (
    !Number.isInteger(politique.delaiJours) ||
    politique.delaiJours < 0 ||
    politique.delaiJours > 3650
  ) {
    throw new ErreurWorkflow(
      "Le délai doit être compris entre 0 et 3 650 jours.",
    );
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO "parametres_application" ("cle", "valeur", "updated_by")
      VALUES (${CLE_AUTORISEE}, ${String(politique.autorisee)}, ${acteur.id})
      ON CONFLICT ("cle") DO UPDATE SET
        "valeur" = EXCLUDED."valeur",
        "updated_by" = EXCLUDED."updated_by",
        "updated_at" = CURRENT_TIMESTAMP
    `;
    await transaction.$executeRaw`
      INSERT INTO "parametres_application" ("cle", "valeur", "updated_by")
      VALUES (${CLE_DELAI}, ${String(politique.delaiJours)}, ${acteur.id})
      ON CONFLICT ("cle") DO UPDATE SET
        "valeur" = EXCLUDED."valeur",
        "updated_by" = EXCLUDED."updated_by",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  });

  await journaliser({
    action: "politique_suppression.modifiee",
    acteurId: acteur.id,
    auditableType: MODELES.parametreApplication,
    auditableId: CLE_AUTORISEE,
    nouvelles: politique,
  });
}

export async function retirerDeclaration(
  acteur: { id: bigint },
  dossierId: string,
): Promise<void> {
  const [politique, dossier] = await Promise.all([
    lirePolitiqueSuppression(),
    prisma.dossiers.findUnique({
      where: { id: dossierId },
      select: { id: true, reference: true, created_at: true, archive_le: true },
    }),
  ]);

  if (!politique.autorisee)
    throw new ErreurWorkflow("La suppression des déclarations est désactivée.");
  if (!dossier || dossier.archive_le)
    throw new ErreurWorkflow(
      "Cette déclaration est introuvable ou déjà retirée.",
    );

  const eligibleLe = new Date(
    (dossier.created_at ?? new Date()).getTime() +
      politique.delaiJours * 86_400_000,
  );
  if (eligibleLe > new Date()) {
    throw new ErreurWorkflow(
      `Cette déclaration ne pourra être retirée qu’après le délai de ${politique.delaiJours} jours.`,
    );
  }

  const resultat = await effacerDonneesPersonnelles(dossier.id);
  await prisma.dossiers.update({
    where: { id: dossier.id },
    data: {
      archive_le: new Date(),
      anonymise_le: new Date(),
      access_code_hash: null,
      declarant_user_id: null,
    },
  });
  await journaliser({
    action: "dossier.retire",
    acteurId: acteur.id,
    auditableType: MODELES.dossier,
    auditableId: dossier.id,
    anciennes: { reference: dossier.reference, archive_le: null },
    nouvelles: { archive_le: new Date(), ...resultat },
  });
}
