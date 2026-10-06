"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifierCodeAcces } from "@/server/services/declaration/code-acces";
import {
  autoriserTentative,
  cleThrottle,
  reinitialiserTentatives,
} from "@/server/auth/throttle";
import {
  fermerSessionSuivi,
  ouvrirSessionSuivi,
} from "@/server/auth/session-suivi";
import { adresseClient } from "@/lib/adresse-client";
import {
  etapesAVenir,
  historiquePublic,
  parcoursPublicType,
} from "@/server/services/declaration/suivi-public";

/**
 * EX-NOT-06 : consultation publique d'un dossier par référence + code d'accès.
 *
 * RGI-12 : c'est la SEULE clé de consultation — jamais l'e-mail ni le téléphone, qui peuvent
 * être absents d'un dossier anonyme.
 *
 * Un code à 6 chiffres n'a qu'un million de combinaisons : le verrouillage ci-dessous est la
 * seule chose qui empêche de l'énumérer (docs/exigences-securite.md §4).
 */

export type EtatSuivi = {
  erreur?: string;
  dossier?: {
    reference: string;
    statutAffiche: string;
    parcours: string;
    deposeLe: string;
    misAJourLe: string;
    /**
     * Étapes successives, en LIBELLÉS AFFICHÉS uniquement (RGI-10) et sans les commentaires
     * internes : le déclarant voit où en est son dossier, jamais comment il est instruit.
     */
    historique: { libelle: string; le: string }[];
    /** Étapes encore à franchir, montrées grisées : on sait ce qui reste, pas seulement où l'on est. */
    aVenir: string[];
    /** Ce que le déclarant a lui-même déclaré — rien qui vienne du traitement. */
    recapitulatif: {
      categorie: string;
      dateFaits: string | null;
      lieu: string | null;
      description: string;
    };
  };
  /** Le panneau de messagerie ne reçoit jamais l'identifiant : il relit la session signée. */
  messagerieOuverte?: boolean;
};

/** Message unique quel que soit le motif : ne jamais révéler si la référence existe. */
const MESSAGE_ECHEC = "Aucun dossier ne correspond à ces informations.";
const MESSAGE_BLOQUE = "Trop de tentatives. Merci de réessayer plus tard.";

async function adresseIp(): Promise<string> {
  return adresseClient(await headers()) ?? "inconnue";
}

export async function rechercherDossier(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const reference = String(donnees.get("reference") ?? "")
    .trim()
    .toUpperCase();
  const codeAcces = String(donnees.get("codeAcces") ?? "").trim();

  if (reference === "" || codeAcces === "") {
    return { erreur: MESSAGE_ECHEC };
  }

  const cleIp = cleThrottle("suivi-ip", await adresseIp());
  // Verrou également sur la RÉFÉRENCE visée : sans lui, un attaquant distribué contournerait la
  // limite par IP en frappant une même référence depuis plusieurs adresses.
  const cleReference = cleThrottle("suivi-ref", reference);

  if (
    !(await autoriserTentative(cleIp)) ||
    !(await autoriserTentative(cleReference))
  ) {
    return { erreur: MESSAGE_BLOQUE };
  }

  const dossier = await prisma.dossiers.findFirst({
    where: { reference },
    select: {
      id: true,
      reference: true,
      access_code_hash: true,
      created_at: true,
      updated_at: true,
      description: true,
      date_survenance: true,
      lieu: true,
      ville: true,
      precision_localisation: true,
      categorie_autre_precision: true,
      categories: { select: { libelle: true } },
      parcours: { select: { libelle: true } },
      historique_statuts: {
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: {
          created_at: true,
          statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: {
            select: { libelle_affiche: true },
          },
        },
      },
      // RGI-10 : le déclarant ne voit JAMAIS le statut interne, seulement sa projection
      // simplifiée. RGI-11 : un dossier « Rejeté » s'affiche comme « Clôturé ».
      statuts_dossier: { select: { libelle_affiche: true, is_terminal: true } },
    },
  });

  const codeValide =
    dossier?.access_code_hash != null &&
    (await verifierCodeAcces(codeAcces, dossier.access_code_hash));

  if (!dossier || !codeValide) {
    // Journalisé pour l'auditeur/DPO (piste d'un éventuel brute-force). Seule la référence
    // tentée est enregistrée — jamais le code saisi, qui resterait exploitable en relisant le
    // journal.
    await prisma.audit_logs.create({
      data: {
        user_id: null,
        action: "suivi.tentative_echouee",
        new_values: { reference_tentee: reference },
        ip_address: await adresseIp(),
        created_at: new Date(),
      },
    });

    return { erreur: MESSAGE_ECHEC };
  }

  await reinitialiserTentatives(cleReference);

  // La référence ET le code viennent d'être prouvés : c'est le seul endroit du code autorisé à
  // ouvrir une session de suivi. Elle donne accès à la messagerie de CE dossier (EX-NOT-07).
  await ouvrirSessionSuivi(dossier.id);

  const deposeLe = dossier.created_at ?? new Date();
  const statuts = await prisma.statuts_dossier.findMany({
    select: { libelle_affiche: true, ordre: true, actif: true },
  });

  return {
    dossier: {
      historique: historiquePublic(
        deposeLe,
        dossier.historique_statuts.map((h) => ({
          libelle:
            h.statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier
              .libelle_affiche,
          le: h.created_at ?? deposeLe,
        })),
        dossier.statuts_dossier.libelle_affiche,
      ),
      aVenir: etapesAVenir(
        dossier.statuts_dossier.libelle_affiche,
        parcoursPublicType(statuts),
        dossier.statuts_dossier.is_terminal,
      ),
      recapitulatif: {
        categorie: dossier.categorie_autre_precision
          ? `${dossier.categories.libelle} — ${dossier.categorie_autre_precision}`
          : dossier.categories.libelle,
        dateFaits: dossier.date_survenance?.toISOString() ?? null,
        lieu:
          [dossier.lieu, dossier.ville, dossier.precision_localisation]
            .filter((v): v is string => Boolean(v && v.trim()))
            .join(" · ") || null,
        description: dossier.description,
      },
      reference: dossier.reference,
      statutAffiche: dossier.statuts_dossier.libelle_affiche,
      parcours: dossier.parcours.libelle,
      deposeLe: (dossier.created_at ?? new Date()).toISOString(),
      misAJourLe: (
        dossier.updated_at ??
        dossier.created_at ??
        new Date()
      ).toISOString(),
    },
    messagerieOuverte: true,
  };
}

/**
 * Ferme la session de suivi.
 *
 * `fermerSessionSuivi()` existait, exportée, et n'était appelée nulle part : la session vivait
 * ses trente minutes sans qu'on puisse l'interrompre. Sur un poste partagé — cybercafé, poste
 * d'accueil, téléphone prêté, tous ordinaires pour un plaignant communauté — la personne suivante
 * lisait le dossier et sa messagerie.
 *
 * Aucune vérification d'accès à faire : effacer son propre cookie n'expose personne, et refuser
 * de le faire n'aurait aucun sens.
 */
export async function quitterLeSuivi(): Promise<void> {
  await fermerSessionSuivi();
  redirect("/suivi");
}
