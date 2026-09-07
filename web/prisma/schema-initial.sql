-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "actions_correctives" (
    "id" CHAR(26) NOT NULL,
    "dossier_id" CHAR(26) NOT NULL,
    "investigation_id" CHAR(26),
    "intitule" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "responsable_id" BIGINT NOT NULL,
    "echeance" DATE NOT NULL,
    "statut" VARCHAR(255) NOT NULL,
    "verification_efficacite" BOOLEAN,
    "verification_commentaire" TEXT,
    "date_cloture" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "actions_correctives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "action" VARCHAR(255) NOT NULL,
    "auditable_type" VARCHAR(255),
    "auditable_id" VARCHAR(255),
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" VARCHAR(255),
    "user_agent" VARCHAR(255),
    "url" VARCHAR(255),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache" (
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "expiration" INTEGER NOT NULL,

    CONSTRAINT "cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "cache_locks" (
    "key" VARCHAR(255) NOT NULL,
    "owner" VARCHAR(255) NOT NULL,
    "expiration" INTEGER NOT NULL,

    CONSTRAINT "cache_locks_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "canaux_captage" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "canaux_captage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGSERIAL NOT NULL,
    "parcours_id" BIGINT NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "is_autre" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_identites" (
    "id" BIGSERIAL NOT NULL,
    "dossier_id" CHAR(26) NOT NULL,
    "nom_prenom" VARCHAR(255),
    "matricule" VARCHAR(255),
    "entreprise" VARCHAR(255),
    "fonction" VARCHAR(255),
    "anciennete_annees" SMALLINT,
    "localite" VARCHAR(255),
    "statut_plaignant" VARCHAR(255),
    "contact_email" VARCHAR(255),
    "contact_telephone" VARCHAR(255),
    "souhait_recontact" BOOLEAN,
    "canal_retour_prefere" VARCHAR(255),
    "personnes_impliquees" TEXT,
    "temoins" TEXT,
    "consentement_rgpd" BOOLEAN,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "declaration_identites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directions" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "directions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_affectations" (
    "id" BIGSERIAL NOT NULL,
    "dossier_id" CHAR(26) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "affecte_par" BIGINT,
    "motif" TEXT,
    "type" VARCHAR(255) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "affecte_le" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desaffecte_le" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "dossier_affectations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossiers" (
    "id" CHAR(26) NOT NULL,
    "reference" VARCHAR(255) NOT NULL,
    "parcours_id" BIGINT NOT NULL,
    "categorie_id" BIGINT NOT NULL,
    "categorie_autre_precision" VARCHAR(255),
    "niveau_gravite_id" BIGINT NOT NULL,
    "statut_id" BIGINT NOT NULL,
    "canal_captage_id" BIGINT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL,
    "access_code_hash" VARCHAR(255),
    "site_id" BIGINT,
    "direction_id" BIGINT,
    "declarant_user_id" BIGINT,
    "description" TEXT NOT NULL,
    "lieu" VARCHAR(255),
    "date_survenance" TIMESTAMP(0),
    "attentes_declarant" VARCHAR(255),
    "synthese_resolution" TEXT,
    "motif_reouverture" TEXT,
    "motif_rejet" TEXT,
    "date_cloture" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "caractere_repetitif" VARCHAR(255),
    "proposition_mesure_corrective" TEXT,
    "contentieux" BOOLEAN NOT NULL DEFAULT false,
    "archive_le" TIMESTAMP(0),
    "anonymise_le" TIMESTAMP(0),

    CONSTRAINT "dossiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_jobs" (
    "id" BIGSERIAL NOT NULL,
    "uuid" VARCHAR(255) NOT NULL,
    "connection" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "exception" TEXT NOT NULL,
    "failed_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historique_statuts" (
    "id" BIGSERIAL NOT NULL,
    "dossier_id" CHAR(26) NOT NULL,
    "statut_precedent_id" BIGINT,
    "statut_suivant_id" BIGINT NOT NULL,
    "commentaire" TEXT,
    "effectue_par" BIGINT,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historique_statuts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigations" (
    "id" CHAR(26) NOT NULL,
    "dossier_id" CHAR(26) NOT NULL,
    "enqueteur_id" BIGINT NOT NULL,
    "date_ouverture" DATE NOT NULL,
    "faits_constates" TEXT NOT NULL,
    "personnes_rencontrees" TEXT,
    "cause_immediate" TEXT,
    "causes_racines" TEXT,
    "recommandations" TEXT NOT NULL,
    "statut" VARCHAR(255) NOT NULL,
    "valide_par" BIGINT,
    "valide_le" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "investigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_batches" (
    "id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "total_jobs" INTEGER NOT NULL,
    "pending_jobs" INTEGER NOT NULL,
    "failed_jobs" INTEGER NOT NULL,
    "failed_job_ids" TEXT NOT NULL,
    "options" TEXT,
    "cancelled_at" INTEGER,
    "created_at" INTEGER NOT NULL,
    "finished_at" INTEGER,

    CONSTRAINT "job_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" BIGSERIAL NOT NULL,
    "queue" VARCHAR(255) NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" SMALLINT NOT NULL,
    "reserved_at" INTEGER,
    "available_at" INTEGER NOT NULL,
    "created_at" INTEGER NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" CHAR(26) NOT NULL,
    "dossier_id" CHAR(26) NOT NULL,
    "expediteur_type" VARCHAR(255) NOT NULL,
    "expediteur_user_id" BIGINT,
    "corps" TEXT NOT NULL,
    "lu_le" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migrations" (
    "id" SERIAL NOT NULL,
    "migration" VARCHAR(255) NOT NULL,
    "batch" INTEGER NOT NULL,

    CONSTRAINT "migrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_has_permissions" (
    "permission_id" BIGINT NOT NULL,
    "model_type" VARCHAR(255) NOT NULL,
    "model_id" BIGINT NOT NULL,

    CONSTRAINT "model_has_permissions_pkey" PRIMARY KEY ("permission_id","model_id","model_type")
);

-- CreateTable
CREATE TABLE "model_has_roles" (
    "role_id" BIGINT NOT NULL,
    "model_type" VARCHAR(255) NOT NULL,
    "model_id" BIGINT NOT NULL,

    CONSTRAINT "model_has_roles_pkey" PRIMARY KEY ("role_id","model_id","model_type")
);

-- CreateTable
CREATE TABLE "niveaux_gravite" (
    "id" BIGSERIAL NOT NULL,
    "niveau" SMALLINT NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "effet_circuit" VARCHAR(255) NOT NULL,
    "couleur" VARCHAR(255),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "niveaux_gravite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" BIGSERIAL NOT NULL,
    "evenement_code" VARCHAR(255) NOT NULL,
    "parcours_id" BIGINT,
    "canal" VARCHAR(255) NOT NULL,
    "objet" VARCHAR(255) NOT NULL,
    "corps" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "destinataires_email_supplementaires" JSON,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "notifiable_type" VARCHAR(255) NOT NULL,
    "notifiable_id" BIGINT NOT NULL,
    "data" TEXT NOT NULL,
    "read_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcours" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "parcours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(0),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "guard_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces_jointes" (
    "id" CHAR(26) NOT NULL,
    "attachable_type" VARCHAR(255) NOT NULL,
    "attachable_id" CHAR(26) NOT NULL,
    "disque" VARCHAR(255) NOT NULL,
    "chemin" VARCHAR(255) NOT NULL,
    "nom_original" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "taille_octets" BIGINT NOT NULL,
    "checksum_sha256" VARCHAR(255) NOT NULL,
    "televerse_par" BIGINT,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_jointes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" CHAR(26) NOT NULL,
    "parcours_id" BIGINT NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "url_cible" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "genere_par" BIGINT,
    "genere_le" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desactive_le" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_has_permissions" (
    "permission_id" BIGINT NOT NULL,
    "role_id" BIGINT NOT NULL,

    CONSTRAINT "role_has_permissions_pkey" PRIMARY KEY ("permission_id","role_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "guard_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(255) NOT NULL,
    "user_id" BIGINT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "payload" TEXT NOT NULL,
    "last_activity" INTEGER NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_delais" (
    "id" BIGSERIAL NOT NULL,
    "parcours_id" BIGINT NOT NULL,
    "etape_code" VARCHAR(255) NOT NULL,
    "valeur" INTEGER NOT NULL,
    "unite" VARCHAR(255) NOT NULL,
    "est_valide_metier" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "sla_delais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statistiques_mensuelles" (
    "id" BIGSERIAL NOT NULL,
    "periode" DATE NOT NULL,
    "parcours_id" BIGINT,
    "categorie_id" BIGINT,
    "niveau_gravite_id" BIGINT,
    "nb_declarations" INTEGER NOT NULL DEFAULT 0,
    "nb_resolues" INTEGER NOT NULL DEFAULT 0,
    "nb_cloturees" INTEGER NOT NULL DEFAULT 0,
    "delai_moyen_jours" DECIMAL(6,2),
    "taux_resolution" DECIMAL(5,2),
    "taux_cloture" DECIMAL(5,2),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statistiques_mensuelles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statuts_dossier" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "libelle_interne" VARCHAR(255) NOT NULL,
    "libelle_affiche" VARCHAR(255) NOT NULL,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "ordre" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "statuts_dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified_at" TIMESTAMP(0),
    "password" VARCHAR(255),
    "remember_token" VARCHAR(100),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "matricule" VARCHAR(255),
    "poste" VARCHAR(255),
    "direction_id" BIGINT,
    "site_id" BIGINT,
    "sso_subject_id" VARCHAR(255),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "responsable_hierarchique_id" BIGINT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actions_correctives_dossier_id_index" ON "actions_correctives"("dossier_id");

-- CreateIndex
CREATE INDEX "actions_correctives_echeance_statut_index" ON "actions_correctives"("echeance", "statut");

-- CreateIndex
CREATE INDEX "audit_logs_auditable_type_auditable_id_index" ON "audit_logs"("auditable_type", "auditable_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_index" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "cache_expiration_index" ON "cache"("expiration");

-- CreateIndex
CREATE INDEX "cache_locks_expiration_index" ON "cache_locks"("expiration");

-- CreateIndex
CREATE UNIQUE INDEX "canaux_captage_code_unique" ON "canaux_captage"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_parcours_id_code_unique" ON "categories"("parcours_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "declaration_identites_dossier_id_unique" ON "declaration_identites"("dossier_id");

-- CreateIndex
CREATE UNIQUE INDEX "directions_code_unique" ON "directions"("code");

-- CreateIndex
CREATE INDEX "dossier_affectations_dossier_id_actif_index" ON "dossier_affectations"("dossier_id", "actif");

-- CreateIndex
CREATE INDEX "dossier_affectations_user_id_actif_index" ON "dossier_affectations"("user_id", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_reference_unique" ON "dossiers"("reference");

-- CreateIndex
CREATE INDEX "dossiers_created_at_index" ON "dossiers"("created_at");

-- CreateIndex
CREATE INDEX "dossiers_niveau_gravite_id_index" ON "dossiers"("niveau_gravite_id");

-- CreateIndex
CREATE INDEX "dossiers_parcours_id_statut_id_index" ON "dossiers"("parcours_id", "statut_id");

-- CreateIndex
CREATE UNIQUE INDEX "failed_jobs_uuid_unique" ON "failed_jobs"("uuid");

-- CreateIndex
CREATE INDEX "historique_statuts_dossier_id_created_at_index" ON "historique_statuts"("dossier_id", "created_at");

-- CreateIndex
CREATE INDEX "investigations_dossier_id_index" ON "investigations"("dossier_id");

-- CreateIndex
CREATE INDEX "jobs_queue_index" ON "jobs"("queue");

-- CreateIndex
CREATE INDEX "messages_dossier_id_created_at_index" ON "messages"("dossier_id", "created_at");

-- CreateIndex
CREATE INDEX "model_has_permissions_model_id_model_type_index" ON "model_has_permissions"("model_id", "model_type");

-- CreateIndex
CREATE INDEX "model_has_roles_model_id_model_type_index" ON "model_has_roles"("model_id", "model_type");

-- CreateIndex
CREATE UNIQUE INDEX "niveaux_gravite_niveau_unique" ON "niveaux_gravite"("niveau");

-- CreateIndex
CREATE UNIQUE INDEX "niveaux_gravite_code_unique" ON "niveaux_gravite"("code");

-- CreateIndex
CREATE INDEX "notifications_notifiable_type_notifiable_id_index" ON "notifications"("notifiable_type", "notifiable_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcours_code_unique" ON "parcours"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_guard_name_unique" ON "permissions"("name", "guard_name");

-- CreateIndex
CREATE INDEX "pieces_jointes_attachable_type_attachable_id_index" ON "pieces_jointes"("attachable_type", "attachable_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_token_unique" ON "qr_codes"("token");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_guard_name_unique" ON "roles"("name", "guard_name");

-- CreateIndex
CREATE INDEX "sessions_last_activity_index" ON "sessions"("last_activity");

-- CreateIndex
CREATE INDEX "sessions_user_id_index" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_code_unique" ON "sites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sla_delais_parcours_id_etape_code_unique" ON "sla_delais"("parcours_id", "etape_code");

-- CreateIndex
CREATE UNIQUE INDEX "statuts_dossier_code_unique" ON "statuts_dossier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_unique" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_sso_subject_id_unique" ON "users"("sso_subject_id");

-- AddForeignKey
ALTER TABLE "actions_correctives" ADD CONSTRAINT "actions_correctives_dossier_id_foreign" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "actions_correctives" ADD CONSTRAINT "actions_correctives_investigation_id_foreign" FOREIGN KEY ("investigation_id") REFERENCES "investigations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "actions_correctives" ADD CONSTRAINT "actions_correctives_responsable_id_foreign" FOREIGN KEY ("responsable_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "declaration_identites" ADD CONSTRAINT "declaration_identites_dossier_id_foreign" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossier_affectations" ADD CONSTRAINT "dossier_affectations_affecte_par_foreign" FOREIGN KEY ("affecte_par") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossier_affectations" ADD CONSTRAINT "dossier_affectations_dossier_id_foreign" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossier_affectations" ADD CONSTRAINT "dossier_affectations_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_canal_captage_id_foreign" FOREIGN KEY ("canal_captage_id") REFERENCES "canaux_captage"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_categorie_id_foreign" FOREIGN KEY ("categorie_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_declarant_user_id_foreign" FOREIGN KEY ("declarant_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_direction_id_foreign" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_niveau_gravite_id_foreign" FOREIGN KEY ("niveau_gravite_id") REFERENCES "niveaux_gravite"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_site_id_foreign" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_statut_id_foreign" FOREIGN KEY ("statut_id") REFERENCES "statuts_dossier"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "historique_statuts" ADD CONSTRAINT "historique_statuts_dossier_id_foreign" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "historique_statuts" ADD CONSTRAINT "historique_statuts_effectue_par_foreign" FOREIGN KEY ("effectue_par") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "historique_statuts" ADD CONSTRAINT "historique_statuts_statut_precedent_id_foreign" FOREIGN KEY ("statut_precedent_id") REFERENCES "statuts_dossier"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "historique_statuts" ADD CONSTRAINT "historique_statuts_statut_suivant_id_foreign" FOREIGN KEY ("statut_suivant_id") REFERENCES "statuts_dossier"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_dossier_id_foreign" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_enqueteur_id_foreign" FOREIGN KEY ("enqueteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_valide_par_foreign" FOREIGN KEY ("valide_par") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_dossier_id_foreign" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_expediteur_user_id_foreign" FOREIGN KEY ("expediteur_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_has_permissions" ADD CONSTRAINT "model_has_permissions_permission_id_foreign" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_has_roles" ADD CONSTRAINT "model_has_roles_role_id_foreign" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pieces_jointes" ADD CONSTRAINT "pieces_jointes_televerse_par_foreign" FOREIGN KEY ("televerse_par") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_genere_par_foreign" FOREIGN KEY ("genere_par") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_has_permissions" ADD CONSTRAINT "role_has_permissions_permission_id_foreign" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_has_permissions" ADD CONSTRAINT "role_has_permissions_role_id_foreign" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_delais" ADD CONSTRAINT "sla_delais_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "statistiques_mensuelles" ADD CONSTRAINT "statistiques_mensuelles_categorie_id_foreign" FOREIGN KEY ("categorie_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "statistiques_mensuelles" ADD CONSTRAINT "statistiques_mensuelles_niveau_gravite_id_foreign" FOREIGN KEY ("niveau_gravite_id") REFERENCES "niveaux_gravite"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "statistiques_mensuelles" ADD CONSTRAINT "statistiques_mensuelles_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_direction_id_foreign" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_responsable_hierarchique_id_foreign" FOREIGN KEY ("responsable_hierarchique_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_site_id_foreign" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- ------------------------------------------------------------------------------------------
-- Contraintes CHECK
--
-- Prisma ne les modélise pas : elles sont absentes du schéma introspecté et donc de la DDL
-- générée ci-dessus. Sans cet ajout, une base recréée à partir de ce fichier accepterait des
-- valeurs que la base d'origine refuse — l'échelle de gravité perdrait ses bornes.
-- ------------------------------------------------------------------------------------------

ALTER TABLE "niveaux_gravite"
  ADD CONSTRAINT "niveaux_gravite_niveau_check" CHECK ((niveau >= 1) AND (niveau <= 4));
