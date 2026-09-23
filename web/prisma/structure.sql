-- Structure complète de la base — RÉGÉNÉRÉE, jamais écrite à la main.
--
--     npm run db:structure
--
-- ⚠️ CE FICHIER REMPLACE `schema-initial.sql`, qui avait pourri sans bruit : présenté comme
-- « structure complète » et seul chemin documenté de recréation, il lui manquait 8 tables et
-- 16 colonnes au 2026-09-23. Une base recréée à partir de lui n'aurait su ni autoriser un geste,
-- ni recevoir une déclaration.
--
-- ⚠️ IL N'EST PAS « INITIAL » : il décrit la base TELLE QU'ELLE EST, pas son point de départ.
-- L'historique des changements vit dans `prisma/evolutions/`, et ces fichiers-là ne servent qu'à
-- faire évoluer une base EXISTANTE. Pour en créer une neuve, c'est ce fichier — et lui seul.
--
-- ⚠️ NE PAS LE MODIFIER À LA MAIN. Toute correction faite ici serait effacée à la régénération
-- suivante, sans avertissement. Ce qui manque se corrige en base, puis se récupère par
-- `npm run db:pull` suivi de `npm run db:structure`.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "actions_correctives" (
    "id" CHAR(26) NOT NULL,
    "dossier_id" CHAR(26) NOT NULL,
    "investigation_id" CHAR(26),
    "intitule" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "responsable_id" BIGINT,
    "echeance" DATE NOT NULL,
    "statut" VARCHAR(255) NOT NULL,
    "verification_efficacite" BOOLEAN,
    "verification_commentaire" TEXT,
    "date_cloture" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "responsable_nom" VARCHAR(255),

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
    "fonction" TEXT,
    "anciennete_annees" SMALLINT,
    "localite" TEXT,
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
    "anciennete_tranche" TEXT,

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
    "site_id" BIGINT,

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
    "categorie_autre_precision" TEXT,
    "niveau_gravite_id" BIGINT,
    "statut_id" BIGINT NOT NULL,
    "canal_captage_id" BIGINT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL,
    "access_code_hash" VARCHAR(255),
    "site_id" BIGINT,
    "direction_id" BIGINT,
    "declarant_user_id" BIGINT,
    "description" TEXT NOT NULL,
    "lieu" TEXT,
    "date_survenance" TIMESTAMP(0),
    "attentes_declarant" TEXT,
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
    "ville" TEXT,
    "precision_localisation" TEXT,
    "entreprise" TEXT,
    "poste" TEXT,
    "declarant_est_victime" BOOLEAN,
    "poste_precision" TEXT,
    "statut_plaignant" VARCHAR(255),
    "statut_plaignant_precision" TEXT,
    "direction_declarant_id" BIGINT,
    "poste_declarant" VARCHAR(255),
    "poste_declarant_precision" TEXT,
    "famille_risque_id" BIGINT,

    CONSTRAINT "dossiers_pkey" PRIMARY KEY ("id")
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
    "familles_risque_actives" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "parcours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
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
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "libelle" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "traite_dossiers" BOOLEAN NOT NULL DEFAULT false,
    "cloisonne_par_rattachement" BOOLEAN NOT NULL DEFAULT false,
    "voit_seulement_ses_declarations" BOOLEAN NOT NULL DEFAULT false,
    "voit_identite_declarant" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
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
    "actif" BOOLEAN NOT NULL DEFAULT true,

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
    "doit_changer_mot_de_passe" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lieux" (
    "id" BIGSERIAL NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "lieux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postes" (
    "id" BIGSERIAL NOT NULL,
    "direction_id" BIGINT NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "postes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "villes" (
    "id" BIGSERIAL NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "villes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur_parcours" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "parcours_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "utilisateur_parcours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations_connexion" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expire_le" TIMESTAMP(0) NOT NULL,
    "utilise_le" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "invitations_connexion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_parcours" (
    "id" BIGSERIAL NOT NULL,
    "role_id" BIGINT NOT NULL,
    "parcours_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "alerte_circuit_critique" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_parcours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "familles_risque" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "parcours_id" BIGINT,

    CONSTRAINT "familles_risque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_etapes" (
    "id" BIGSERIAL NOT NULL,
    "role_id" BIGINT NOT NULL,
    "parcours_id" BIGINT NOT NULL,
    "statut_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "role_etapes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolutions_appliquees" (
    "fichier" VARCHAR(255) NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "applique_le" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rang" INTEGER NOT NULL,

    CONSTRAINT "evolutions_appliquees_pkey" PRIMARY KEY ("fichier")
);

-- CreateIndex
CREATE INDEX "actions_correctives_dossier_id_index" ON "actions_correctives"("dossier_id");

-- CreateIndex
CREATE INDEX "actions_correctives_echeance_statut_index" ON "actions_correctives"("echeance", "statut");

-- CreateIndex
CREATE INDEX "actions_correctives_investigation_id_index" ON "actions_correctives"("investigation_id");

-- CreateIndex
CREATE INDEX "actions_correctives_responsable_id_index" ON "actions_correctives"("responsable_id");

-- CreateIndex
CREATE INDEX "audit_logs_auditable_type_auditable_id_index" ON "audit_logs"("auditable_type", "auditable_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_index" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_index" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "cache_expiration_index" ON "cache"("expiration");

-- CreateIndex
CREATE UNIQUE INDEX "canaux_captage_code_unique" ON "canaux_captage"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_parcours_id_code_unique" ON "categories"("parcours_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "declaration_identites_dossier_id_unique" ON "declaration_identites"("dossier_id");

-- CreateIndex
CREATE UNIQUE INDEX "directions_code_unique" ON "directions"("code");

-- CreateIndex
CREATE INDEX "directions_site_id_index" ON "directions"("site_id");

-- CreateIndex
CREATE INDEX "dossier_affectations_dossier_id_actif_index" ON "dossier_affectations"("dossier_id", "actif");

-- CreateIndex
CREATE INDEX "dossier_affectations_user_id_actif_index" ON "dossier_affectations"("user_id", "actif");

-- CreateIndex
CREATE INDEX "dossier_affectations_affecte_par_index" ON "dossier_affectations"("affecte_par");

-- CreateIndex
CREATE UNIQUE INDEX "dossiers_reference_unique" ON "dossiers"("reference");

-- CreateIndex
CREATE INDEX "dossiers_created_at_index" ON "dossiers"("created_at");

-- CreateIndex
CREATE INDEX "dossiers_niveau_gravite_id_index" ON "dossiers"("niveau_gravite_id");

-- CreateIndex
CREATE INDEX "dossiers_parcours_id_statut_id_index" ON "dossiers"("parcours_id", "statut_id");

-- CreateIndex
CREATE INDEX "dossiers_direction_declarant_id_index" ON "dossiers"("direction_declarant_id");

-- CreateIndex
CREATE INDEX "dossiers_famille_risque_id_index" ON "dossiers"("famille_risque_id");

-- CreateIndex
CREATE INDEX "dossiers_canal_captage_id_index" ON "dossiers"("canal_captage_id");

-- CreateIndex
CREATE INDEX "dossiers_categorie_id_index" ON "dossiers"("categorie_id");

-- CreateIndex
CREATE INDEX "dossiers_declarant_user_id_index" ON "dossiers"("declarant_user_id");

-- CreateIndex
CREATE INDEX "dossiers_direction_id_index" ON "dossiers"("direction_id");

-- CreateIndex
CREATE INDEX "dossiers_site_id_index" ON "dossiers"("site_id");

-- CreateIndex
CREATE INDEX "dossiers_statut_id_index" ON "dossiers"("statut_id");

-- CreateIndex
CREATE INDEX "historique_statuts_dossier_id_created_at_index" ON "historique_statuts"("dossier_id", "created_at");

-- CreateIndex
CREATE INDEX "historique_statuts_effectue_par_index" ON "historique_statuts"("effectue_par");

-- CreateIndex
CREATE INDEX "historique_statuts_statut_precedent_id_index" ON "historique_statuts"("statut_precedent_id");

-- CreateIndex
CREATE INDEX "historique_statuts_statut_suivant_id_index" ON "historique_statuts"("statut_suivant_id");

-- CreateIndex
CREATE INDEX "investigations_dossier_id_index" ON "investigations"("dossier_id");

-- CreateIndex
CREATE INDEX "investigations_enqueteur_id_index" ON "investigations"("enqueteur_id");

-- CreateIndex
CREATE INDEX "investigations_valide_par_index" ON "investigations"("valide_par");

-- CreateIndex
CREATE INDEX "messages_dossier_id_created_at_index" ON "messages"("dossier_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_expediteur_user_id_index" ON "messages"("expediteur_user_id");

-- CreateIndex
CREATE INDEX "model_has_permissions_model_id_model_type_index" ON "model_has_permissions"("model_id", "model_type");

-- CreateIndex
CREATE INDEX "model_has_roles_model_id_model_type_index" ON "model_has_roles"("model_id", "model_type");

-- CreateIndex
CREATE UNIQUE INDEX "niveaux_gravite_niveau_unique" ON "niveaux_gravite"("niveau");

-- CreateIndex
CREATE UNIQUE INDEX "niveaux_gravite_code_unique" ON "niveaux_gravite"("code");

-- CreateIndex
CREATE INDEX "notification_templates_parcours_id_index" ON "notification_templates"("parcours_id");

-- CreateIndex
CREATE INDEX "notifications_notifiable_type_notifiable_id_index" ON "notifications"("notifiable_type", "notifiable_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcours_code_unique" ON "parcours"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_unique" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "pieces_jointes_attachable_type_attachable_id_index" ON "pieces_jointes"("attachable_type", "attachable_id");

-- CreateIndex
CREATE INDEX "pieces_jointes_televerse_par_index" ON "pieces_jointes"("televerse_par");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_token_unique" ON "qr_codes"("token");

-- CreateIndex
CREATE INDEX "qr_codes_genere_par_index" ON "qr_codes"("genere_par");

-- CreateIndex
CREATE INDEX "qr_codes_parcours_id_index" ON "qr_codes"("parcours_id");

-- CreateIndex
CREATE INDEX "role_has_permissions_role_id_index" ON "role_has_permissions"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_unique" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sites_code_unique" ON "sites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sla_delais_parcours_id_etape_code_unique" ON "sla_delais"("parcours_id", "etape_code");

-- CreateIndex
CREATE INDEX "statistiques_mensuelles_categorie_id_index" ON "statistiques_mensuelles"("categorie_id");

-- CreateIndex
CREATE INDEX "statistiques_mensuelles_niveau_gravite_id_index" ON "statistiques_mensuelles"("niveau_gravite_id");

-- CreateIndex
CREATE INDEX "statistiques_mensuelles_parcours_id_index" ON "statistiques_mensuelles"("parcours_id");

-- CreateIndex
CREATE UNIQUE INDEX "statuts_dossier_code_unique" ON "statuts_dossier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_unique" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_sso_subject_id_unique" ON "users"("sso_subject_id");

-- CreateIndex
CREATE INDEX "users_direction_id_index" ON "users"("direction_id");

-- CreateIndex
CREATE INDEX "users_responsable_hierarchique_id_index" ON "users"("responsable_hierarchique_id");

-- CreateIndex
CREATE INDEX "users_site_id_index" ON "users"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "lieux_libelle_unique" ON "lieux"("libelle");

-- CreateIndex
CREATE INDEX "postes_direction_id_index" ON "postes"("direction_id");

-- CreateIndex
CREATE UNIQUE INDEX "postes_direction_libelle_unique" ON "postes"("direction_id", "libelle");

-- CreateIndex
CREATE UNIQUE INDEX "villes_libelle_unique" ON "villes"("libelle");

-- CreateIndex
CREATE INDEX "utilisateur_parcours_user_id_index" ON "utilisateur_parcours"("user_id");

-- CreateIndex
CREATE INDEX "utilisateur_parcours_parcours_id_index" ON "utilisateur_parcours"("parcours_id");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_parcours_unique" ON "utilisateur_parcours"("user_id", "parcours_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_connexion_token_hash_unique" ON "invitations_connexion"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_connexion_user_id_index" ON "invitations_connexion"("user_id");

-- CreateIndex
CREATE INDEX "role_parcours_role_id_index" ON "role_parcours"("role_id");

-- CreateIndex
CREATE INDEX "role_parcours_parcours_id_index" ON "role_parcours"("parcours_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_parcours_unique" ON "role_parcours"("role_id", "parcours_id");

-- CreateIndex
CREATE UNIQUE INDEX "familles_risque_code_unique" ON "familles_risque"("code");

-- CreateIndex
CREATE INDEX "familles_risque_parcours_id_index" ON "familles_risque"("parcours_id");

-- CreateIndex
CREATE INDEX "role_etapes_role_id_index" ON "role_etapes"("role_id");

-- CreateIndex
CREATE INDEX "role_etapes_parcours_id_index" ON "role_etapes"("parcours_id");

-- CreateIndex
CREATE INDEX "role_etapes_statut_id_index" ON "role_etapes"("statut_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_etapes_unique" ON "role_etapes"("role_id", "parcours_id", "statut_id");

-- CreateIndex
CREATE UNIQUE INDEX "evolutions_appliquees_rang_unique" ON "evolutions_appliquees"("rang");

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
ALTER TABLE "directions" ADD CONSTRAINT "directions_site_id_foreign" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

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
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_direction_declarant_id_foreign" FOREIGN KEY ("direction_declarant_id") REFERENCES "directions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_direction_id_foreign" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_famille_risque_id_foreign" FOREIGN KEY ("famille_risque_id") REFERENCES "familles_risque"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

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

-- AddForeignKey
ALTER TABLE "postes" ADD CONSTRAINT "postes_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "utilisateur_parcours" ADD CONSTRAINT "utilisateur_parcours_parcours_id_fkey" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "utilisateur_parcours" ADD CONSTRAINT "utilisateur_parcours_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invitations_connexion" ADD CONSTRAINT "invitations_connexion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_parcours" ADD CONSTRAINT "role_parcours_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_parcours" ADD CONSTRAINT "role_parcours_role_id_foreign" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "familles_risque" ADD CONSTRAINT "familles_risque_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_etapes" ADD CONSTRAINT "role_etapes_parcours_id_foreign" FOREIGN KEY ("parcours_id") REFERENCES "parcours"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_etapes" ADD CONSTRAINT "role_etapes_role_id_foreign" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_etapes" ADD CONSTRAINT "role_etapes_statut_id_foreign" FOREIGN KEY ("statut_id") REFERENCES "statuts_dossier"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------------
-- Contraintes CHECK
--
-- ⚠️ PRISMA NE LES MODÉLISE PAS : sans cette section, une base recréée accepterait une
-- gravité hors de l’échelle 1-4, et rien ne le dirait avant la première statistique fausse.
-- ---------------------------------------------------------------------------------

ALTER TABLE "niveaux_gravite" ADD CONSTRAINT "niveaux_gravite_niveau_check" CHECK (((niveau >= 1) AND (niveau <= 4)));

-- ---------------------------------------------------------------------------------
-- Commentaires de colonne
--
-- Posés par les évolutions successives, ils portent la RAISON de colonnes dont le nom ne
-- suffit pas. Prisma ne les régénère pas ; les perdre reviendrait à recréer une base
-- muette sur ses propres choix.
-- ---------------------------------------------------------------------------------

COMMENT ON COLUMN "actions_correctives"."responsable_id" IS 'Compte responsable, quand il en existe un. Hérité du choix dans une liste ; la saisie se fait désormais par `responsable_nom`.';
COMMENT ON COLUMN "actions_correctives"."responsable_nom" IS 'Responsable saisi à la main : il n''a pas forcément de compte sur la plateforme.';
COMMENT ON COLUMN "declaration_identites"."anciennete_tranche" IS 'Tranche choisie dans le référentiel « tranches_anciennete ». Remplace anciennete_annees, qui reste pour l''historique.';
COMMENT ON COLUMN "dossiers"."declarant_est_victime" IS 'Le déclarant déclare-t-il pour lui-même ? NULL = question non posée (déclarations antérieures au 11/09/2026).';
COMMENT ON COLUMN "dossiers"."direction_declarant_id" IS 'Direction du DÉCLARANT, quand il n''est pas la personne concernée. NULL sinon. ⚠️ Ne détermine PAS le site : c''est `direction_id`, la direction concernée par les faits, qui l''établit.';
COMMENT ON COLUMN "dossiers"."entreprise" IS 'Parcours Sous-traitant — entreprise, collectée même en anonyme.';
COMMENT ON COLUMN "dossiers"."famille_risque_id" IS 'Famille de risque posée au traitement. NULL tant qu''aucun traitant ne l''a qualifiée.';
COMMENT ON COLUMN "dossiers"."poste" IS 'Poste choisi dans le référentiel « postes », rattaché à la direction du dossier. Collecté même en anonyme.';
COMMENT ON COLUMN "dossiers"."poste_declarant" IS 'Poste du déclarant, quand il n''est pas la personne concernée. Jamais collecté en anonymat.';
COMMENT ON COLUMN "dossiers"."poste_declarant_precision" IS 'Poste du déclarant saisi à la main quand « Autre » est retenu. NULL sinon.';
COMMENT ON COLUMN "dossiers"."poste_precision" IS 'Poste saisi à la main quand « Autre » est retenu. NULL sinon.';
COMMENT ON COLUMN "dossiers"."precision_localisation" IS 'Complément libre de localisation : quartier, campement, point de repère.';
COMMENT ON COLUMN "dossiers"."statut_plaignant" IS 'Qualité du plaignant. Sur `dossiers` et non `declaration_identites` : la question est posée même en anonymat, et cette table n''est pas créée dans ce cas.';
COMMENT ON COLUMN "dossiers"."statut_plaignant_precision" IS 'Qualité saisie à la main quand « autre » est retenu. NULL sinon.';
COMMENT ON COLUMN "dossiers"."ville" IS 'Parcours Communauté — ville choisie dans le référentiel « villes », conservée en clair.';
COMMENT ON COLUMN "familles_risque"."actif" IS 'Désactivée : plus proposée au traitement, mais les dossiers qui la portent la gardent.';
COMMENT ON COLUMN "familles_risque"."parcours_id" IS 'Type de déclaration auquel cette famille est réservée. NULL = proposée sur tous les types.';
COMMENT ON COLUMN "investigations"."statut" IS 'Vestige du workflow de validation, supprimé le 2026-09-18. Valeur unique : en_cours.';
COMMENT ON COLUMN "investigations"."valide_par" IS 'Trace historique : qui avait validé la fiche avant la suppression de l''étape de validation.';
COMMENT ON COLUMN "invitations_connexion"."utilise_le" IS 'Horodatage de consommation. NULL = jamais utilisé. La ligne est conservée après usage pour distinguer un lien consommé d''un lien inconnu.';
COMMENT ON COLUMN "parcours"."familles_risque_actives" IS 'Les traitants de ce type de déclaration qualifient-ils une famille de risque ? Décoché, la carte disparaît de la fiche et le type sort de la répartition du tableau de bord — les familles déjà posées sont conservées.';
COMMENT ON COLUMN "role_parcours"."alerte_circuit_critique" IS 'RG-08 / CDC §6.5 : ce rôle est alerté immédiatement quand une déclaration de CE type, dans son périmètre, est qualifiée critique.';
COMMENT ON COLUMN "role_parcours"."role_id" IS 'Supprimer le rôle emporte ses habilitations de parcours : elles n''ont de sens qu''avec lui.';
COMMENT ON COLUMN "roles"."cloisonne_par_rattachement" IS 'Ses porteurs ne voient que les dossiers de leur site ou de leur direction. Remplace ROLES_CLOISONNES_PAR_SITE.';
COMMENT ON COLUMN "roles"."traite_dossiers" IS 'Ce rôle a la CHARGE des dossiers de son périmètre : il apparaît comme titulaire et les voit dans « vos dossiers à traiter ». Distinct de dossiers.status.update, qui dit seulement qu''il peut les faire avancer.';
COMMENT ON COLUMN "roles"."voit_identite_declarant" IS 'Faux pour un accès « sans données nominatives » : il voit les dossiers, jamais qui a déclaré.';
COMMENT ON COLUMN "roles"."voit_seulement_ses_declarations" IS 'Ne voit que les déclarations qu''il a lui-même déposées, et jamais les anonymes (RG-06).';
COMMENT ON COLUMN "statuts_dossier"."actif" IS 'Faux = plus proposé comme destination d''une transition manuelle. Les dossiers déjà dans cet état y restent.';
