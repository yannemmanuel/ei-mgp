CREATE TABLE "parametres_application" (
    "cle" VARCHAR(100) NOT NULL,
    "valeur" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" BIGINT,
    CONSTRAINT "parametres_application_pkey" PRIMARY KEY ("cle")
);

CREATE INDEX "parametres_application_updated_by_index"
    ON "parametres_application"("updated_by");

INSERT INTO "parametres_application" ("cle", "valeur", "description") VALUES
('declarations.suppression_autorisee', 'false', 'Autorise le retrait fonctionnel des déclarations depuis le backoffice'),
('declarations.delai_suppression_jours', '30', 'Délai minimal avant qu’une déclaration puisse être retirée');
