import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { creerDeclaration } from "../../declaration/creer-declaration";
import {
  categoriePour,
  graviteParNiveau,
  nettoyerAudit,
  nettoyerDossiers,
} from "../../declaration/__tests__/aide-base";
import { envoyerNotification } from "../notification";
import {
  configurationSmtp,
  definirTransportEmail,
  reinitialiserTransportEmail,
  TransportJournal,
  transportEmail,
  type MessageEmail,
} from "../transport";
import { MODELES } from "@/server/modeles";

/**
 * Transport e-mail.
 *
 * Le choix du transport appartient à la CONFIGURATION : un environnement qui croit expédier alors
 * qu'il journalise est aussi dangereux qu'un fournisseur imposé dans le code.
 */
const MODEL_TYPE_DOSSIER = MODELES.dossier;
const dossiersCrees: string[] = [];
const gabaritsCrees: bigint[] = [];

const variables = [
  "RESEND_API_KEY",
  "RESEND_FROM",
  "MAIL_HOST",
  "MAIL_FROM",
  "MAIL_PORT",
  "MAIL_SECURE",
] as const;
const initial = Object.fromEntries(variables.map((v) => [v, process.env[v]]));

function restaurerEnvironnement() {
  for (const v of variables) {
    if (initial[v] === undefined) delete process.env[v];
    else process.env[v] = initial[v];
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  restaurerEnvironnement();
  reinitialiserTransportEmail();
  definirTransportEmail(new TransportJournal());

  if (gabaritsCrees.length > 0) {
    await prisma.notification_templates.deleteMany({
      where: { id: { in: gabaritsCrees } },
    });
    gabaritsCrees.length = 0;
  }
  await nettoyerAudit(MODEL_TYPE_DOSSIER, dossiersCrees);
  await nettoyerDossiers(dossiersCrees);
  dossiersCrees.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Choix du transport", () => {
  it("se replie sur le journal quand SMTP n’est pas configuré", () => {
    delete process.env.MAIL_HOST;
    delete process.env.MAIL_FROM;
    reinitialiserTransportEmail();

    expect(configurationSmtp()).toBeNull();
    expect(transportEmail()).toBeInstanceOf(TransportJournal);
  });

  it("échoue fermé en production quand SMTP n’est pas configuré", () => {
    delete process.env.MAIL_HOST;
    delete process.env.MAIL_FROM;
    vi.stubEnv("NODE_ENV", "production");
    reinitialiserTransportEmail();

    expect(() => transportEmail()).toThrow(
      "Configuration e-mail absente en production",
    );
  });

  it("ne journalise ni le corps ni l’adresse complète", async () => {
    const journal = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const transport = new TransportJournal();

    await transport.envoyer({
      destinataire: "personne.sensible@example.test",
      objet: "Votre accès",
      corps: "https://example.test/premiere-connexion/jeton-secret",
    });

    const sortie = String(journal.mock.calls[0]?.[0] ?? "");
    expect(sortie).not.toContain("personne.sensible@example.test");
    expect(sortie).not.toContain("jeton-secret");
    expect(sortie).toContain("p***@example.test");
  });

  it("exige l’hôte ET l’adresse d’expédition", () => {
    // Une configuration à moitié renseignée échouerait à chaque envoi : mieux vaut un repli net.
    process.env.MAIL_HOST = "smtp.exemple.test";
    delete process.env.MAIL_FROM;
    expect(configurationSmtp()).toBeNull();

    delete process.env.MAIL_HOST;
    process.env.MAIL_FROM = "mgp@exemple.test";
    expect(configurationSmtp()).toBeNull();
  });

  it("utilise Resend en priorité quand sa clé et son expéditeur sont configurés", () => {
    process.env.RESEND_API_KEY = "re_cle_de_test";
    process.env.RESEND_FROM = "Plateforme EI/MGP <notifications@example.test>";
    process.env.MAIL_HOST = "smtp.autre.test";
    process.env.MAIL_FROM = "autre@example.test";

    expect(configurationSmtp()).toEqual({
      fournisseur: "resend",
      hote: "smtp.resend.com",
      port: 465,
      securise: true,
      utilisateur: "resend",
      motDePasse: "re_cle_de_test",
      expediteur: "Plateforme EI/MGP <notifications@example.test>",
    });
  });

  it("déduit le chiffrement implicite du port 465", () => {
    process.env.MAIL_HOST = "smtp.exemple.test";
    process.env.MAIL_FROM = "mgp@exemple.test";

    process.env.MAIL_PORT = "465";
    expect(configurationSmtp()?.securise).toBe(true);

    // 587 négocie STARTTLS : `secure` doit rester faux, sinon la connexion échoue.
    process.env.MAIL_PORT = "587";
    expect(configurationSmtp()?.securise).toBe(false);
  });

  it("retient 587 pour un port illisible plutôt que d’échouer", () => {
    process.env.MAIL_HOST = "smtp.exemple.test";
    process.env.MAIL_FROM = "mgp@exemple.test";
    process.env.MAIL_PORT = "pas-un-nombre";

    expect(configurationSmtp()?.port).toBe(587);
  });
});

describe("Résilience des envois", () => {
  class TransportDefaillant {
    public tentatives: MessageEmail[] = [];

    async envoyer(message: MessageEmail): Promise<void> {
      this.tentatives.push(message);
      throw new Error("Serveur SMTP injoignable");
    }
  }

  it("n’interrompt pas la boucle et n’audite pas un envoi qui a échoué", async () => {
    const categorie = await categoriePour("ei_employe");
    const gravite = await graviteParNiveau(1);

    const { dossierId } = await creerDeclaration({
      parcours: "ei_employe",
      canalCaptageCode: "qr_code",
      anonyme: true,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: gravite.id,
        description: "Description factuelle de test suffisamment longue.",
      },
    });
    dossiersCrees.push(dossierId);

    const gabarit = await prisma.notification_templates.create({
      data: {
        evenement_code: "test_transport",
        parcours_id: null,
        canal: "email",
        objet: "Objet de test",
        corps: "Corps de test.",
        actif: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true },
    });
    gabaritsCrees.push(gabarit.id);

    /*
      ⚠️ MESURÉ EN ÉCART, et non en absolu.

      Créer la déclaration notifie désormais ses titulaires (EX-NOT-01) — l'appel n'est plus
      conditionné à une affectation, qui n'existe plus. Ces envois-là réussissent et laissent leur
      trace : attendre zéro ligne au total mesurait donc autre chose que ce que ce cas vérifie,
      à savoir qu'un envoi ÉCHOUÉ n'en laisse aucune.
    */
    const tracesAvant = await prisma.audit_logs.count({
      where: {
        auditable_type: MODEL_TYPE_DOSSIER,
        auditable_id: dossierId,
        action: "notification.envoyee",
      },
    });

    const defaillant = new TransportDefaillant();
    definirTransportEmail(defaillant);

    const envoyees = await envoyerNotification({
      evenementCode: "test_transport",
      dossierId,
      destinataires: [
        { type: "email", adresse: "un@exemple.test" },
        { type: "email", adresse: "deux@exemple.test" },
      ],
    });

    // Les deux destinataires ont été tentés : un échec sur le premier ne doit pas priver le
    // second de sa notification. Les tâches planifiées parcourent tous les dossiers actifs.
    expect(defaillant.tentatives).toHaveLength(2);
    expect(envoyees).toBe(0);

    // Rien n'a été expédié : rien ne doit être consigné comme expédié.
    const traces = await prisma.audit_logs.count({
      where: {
        auditable_type: MODEL_TYPE_DOSSIER,
        auditable_id: dossierId,
        action: "notification.envoyee",
      },
    });
    expect(
      traces - tracesAvant,
      "un envoi en échec a été consigné comme expédié",
    ).toBe(0);
  });
});
