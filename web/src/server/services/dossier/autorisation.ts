import { prisma } from "@/lib/prisma";
import type { UtilisateurAutorise } from "@/server/authz";
import type { DossierPourAutorisation } from "@/server/authz/policies/dossier";
import type { ParcoursCode } from "@/server/authz/parcours";
import type { StatutCode } from "./statuts";

/**
 * Charge l'unique contexte complet utilisé par les policies d'un dossier et de ses sous-ressources.
 *
 * Ne jamais réduire ce contexte au seul parcours : le site, la direction et l'affectation sont
 * précisément ce qui empêche une action directe sur un dossier que l'utilisateur ne peut ouvrir.
 */
export async function chargerDossierPourAutorisation(
  dossierId: string,
  lecteur: Pick<UtilisateurAutorise, "id">,
): Promise<DossierPourAutorisation | null> {
  const dossier = await prisma.dossiers.findUnique({
    where: { id: dossierId },
    select: {
      is_anonymous: true,
      declarant_user_id: true,
      site_id: true,
      direction_id: true,
      parcours: { select: { code: true } },
      statuts_dossier: { select: { code: true } },
      dossier_affectations: {
        where: { user_id: lecteur.id, actif: true },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!dossier) return null;

  return {
    parcoursCode: dossier.parcours.code as ParcoursCode,
    statutCode: dossier.statuts_dossier.code as StatutCode,
    isAnonymous: dossier.is_anonymous,
    declarantUserId: dossier.declarant_user_id,
    siteId: dossier.site_id,
    directionId: dossier.direction_id,
    estAffecteAuLecteur: dossier.dossier_affectations.length > 0,
  };
}
