# Modèle de données relationnel (PostgreSQL)

Ce modèle traduit les entités identifiées en `cahier-des-charges-analyse.md` §II et les règles de
`regles-metier.md`. Il sera implémenté en Phase 2 sous forme de migrations Laravel. Ce document est
la **proposition** soumise à validation avant tout codage.

## 1. Conventions

- **Clés primaires** : `ULID` (26 caractères, triable, non séquentiel) pour toute entité
  potentiellement référencée dans une URL ou un export (`dossiers`, `investigations`,
  `actions_correctives`, `pieces_jointes`, `messages`, `qr_codes`). `bigserial` pour les tables de
  référence purement internes (catégories, statuts, sites…) et pour `users`/`audit_logs` qui ne sont
  pas exposées comme identifiants publics devinables (accès toujours derrière authentification +
  policy).
- **Horodatage** : `created_at`/`updated_at` (Laravel timestamps) partout sauf `audit_logs` (`created_at`
  seul, table append-only).
- **Suppression** : pas de `deleted_at` sur `dossiers` (RG-03 interdit la suppression). Les
  référentiels d'administration utilisent un champ `actif boolean` plutôt qu'un soft-delete
  Eloquent, pour rester explicites dans les requêtes de filtre (cf. prompt §22).
- **Contraintes d'intégrité** : toutes les FK `RESTRICT` par défaut (pas de `CASCADE` destructeur sur
  l'historique) ; seules les tables strictement dépendantes d'un dossier (pièces jointes,
  affectations, historique) suivent le dossier en cas de scénario de purge RGPD contrôlée par job,
  jamais par un `ON DELETE CASCADE` implicite (la purge est un processus métier explicite, pas une
  suppression SQL en cascade non maîtrisée).

## 2. Authentification et RBAC

```
users
├── id                  bigserial PK
├── name                varchar
├── email               varchar unique nullable   (nullable : sous-traitant/communauté n'ont jamais de compte,
│                                                    seul le personnel interne et l'employé identifié en ont un)
├── password             varchar nullable          (nullable en prévision SSO Entra ID)
├── matricule            varchar nullable
├── poste                varchar nullable
├── direction_id         FK -> directions nullable
├── site_id              FK -> sites nullable
├── sso_subject_id       varchar nullable unique   (préparation SSO, non utilisé en Phase 3)
├── actif                boolean default true
├── email_verified_at    timestamp nullable
├── created_at / updated_at

roles, permissions, model_has_roles, model_has_permissions, role_has_permissions
    -> générées par la migration standard spatie/laravel-permission, non redéfinies ici.
```

## 3. Référentiels (administrables — Module 14)

```
parcours
├── id            bigserial PK
├── code          varchar unique   (ei_employe | grief_employe | grief_sous_traitant | grief_communaute)
├── libelle       varchar
├── actif         boolean default true
└── ordre         smallint

categories
├── id            bigserial PK
├── parcours_id   FK -> parcours
├── code          varchar
├── libelle       varchar
├── is_autre      boolean default false   (marque la catégorie "Autre" — RG-09)
├── actif         boolean default true
├── ordre         smallint
└── UNIQUE(parcours_id, code)

niveaux_gravite
├── id             bigserial PK
├── niveau         smallint unique CHECK (niveau BETWEEN 1 AND 4)
├── code           varchar unique   (faible | modere | eleve | critique)
├── libelle        varchar
├── effet_circuit  varchar          (standard | priorisation | accelere)   -- §11.1
├── couleur        varchar nullable (pour badges UI)
└── actif          boolean default true

statuts_dossier
├── id                bigserial PK
├── code              varchar unique   (recu | affecte | en_analyse | en_investigation |
│                                        en_attente_information | action_corrective_en_cours |
│                                        resolu | cloture | reouvert | rejete)
├── libelle_interne   varchar
├── libelle_affiche   varchar          (une des 5 valeurs §7.2)
├── is_terminal       boolean default false
└── ordre             smallint

sites
├── id        bigserial PK
├── code      varchar unique
├── libelle   varchar
└── actif     boolean default true

directions
├── id        bigserial PK
├── code      varchar unique
├── libelle   varchar
└── actif     boolean default true

canaux_captage
├── id        bigserial PK
├── code      varchar unique   (qr_code | ligne_verte | boite_suggestions | agent_local)
├── libelle   varchar
└── actif     boolean default true

qr_codes
├── id              ulid PK
├── parcours_id     FK -> parcours
├── token           varchar unique    (segment d'URL publique)
├── url_cible       text
├── actif           boolean default true
├── genere_par      FK -> users nullable
├── genere_le       timestamp
├── desactive_le    timestamp nullable
└── created_at / updated_at

sla_delais
├── id                  bigserial PK
├── parcours_id         FK -> parcours
├── etape_code          varchar    (captage | analyse_preliminaire | traitement_enquete |
│                                    retour_information | mise_en_oeuvre_mesures |
│                                    retour_resolution | cloture)
├── valeur              integer
├── unite               varchar    (heures | jours_ouvres | mois)
├── est_valide_metier   boolean default false   -- cf. point d'arbitrage CDC §1.8 n°4
├── notes               text nullable
└── UNIQUE(parcours_id, etape_code)

notification_templates
├── id              bigserial PK
├── evenement_code  varchar     (cf. exigences-fonctionnelles.md Module 5)
├── parcours_id     FK -> parcours nullable   (null = tous parcours)
├── canal           varchar     (outil | email)
├── objet           varchar
├── corps           text
├── actif           boolean default true
└── created_at / updated_at
```

## 4. Cœur métier — dossiers

```
dossiers
├── id                          ulid PK
├── reference                   varchar unique       (RG-01, ex. EI-2026-000001)
├── parcours_id                 FK -> parcours
├── categorie_id                FK -> categories
├── niveau_gravite_id           FK -> niveaux_gravite
├── statut_id                   FK -> statuts_dossier
├── canal_captage_id            FK -> canaux_captage
├── is_anonymous                boolean
├── access_code_hash            varchar nullable      (RG-02 — uniquement si is_anonymous = true)
├── site_id                     FK -> sites nullable
├── direction_id                FK -> directions nullable
├── declarant_user_id           FK -> users nullable   (uniquement employé identifié, jamais si anonyme)
├── description                 text
├── lieu                        varchar nullable
├── date_survenance             timestamp nullable     (RGI-01 : jamais postérieure à created_at)
├── attentes_declarant          varchar nullable        (résultat souhaité — formulaire Grief Employé §9.2)
├── synthese_resolution         text nullable           (EX-GES-05)
├── motif_reouverture           text nullable           (RG-07)
├── motif_rejet                 text nullable
├── date_cloture                timestamp nullable
└── created_at / updated_at     (created_at = date de réception, aucune colonne "date_reception" séparée)

declaration_identites            -- créée UNIQUEMENT si dossiers.is_anonymous = false (RG-06)
├── id                    bigserial PK
├── dossier_id            FK -> dossiers UNIQUE
├── nom_prenom            varchar nullable
├── matricule             varchar nullable
├── entreprise            varchar nullable        (parcours sous-traitant)
├── fonction              varchar nullable
├── anciennete_annees     smallint nullable       (parcours grief employé)
├── localite              varchar nullable        (parcours communauté)
├── statut_plaignant      varchar nullable        (riverain | chef_coutumier | association | ong | autre)
├── contact_email         varchar nullable
├── contact_telephone     varchar nullable
├── souhait_recontact     boolean nullable
├── canal_retour_prefere  varchar nullable
├── personnes_impliquees  text nullable
├── temoins               text nullable
├── consentement_rgpd     boolean nullable         (RG-15 — obligatoire si parcours = sous-traitant)
└── created_at / updated_at

pieces_jointes                   -- polymorphe : dossiers | investigations | actions_correctives
├── id                    ulid PK
├── attachable_type       varchar
├── attachable_id         ulid
├── disque                varchar         (local | s3 — configurable par environnement)
├── chemin                varchar
├── nom_original          varchar
├── mime_type             varchar
├── taille_octets          bigint
├── checksum_sha256       varchar
├── televerse_par         FK -> users nullable
└── created_at

dossier_affectations
├── id             bigserial PK
├── dossier_id     FK -> dossiers
├── user_id        FK -> users
├── affecte_par    FK -> users nullable   (null = affectation automatique système)
├── motif          text nullable           (obligatoire en appli si type = reaffectation)
├── type           varchar                 (automatique | manuelle | reaffectation)
├── actif          boolean default true
├── affecte_le     timestamp
└── desaffecte_le  timestamp nullable

historique_statuts
├── id                    bigserial PK
├── dossier_id            FK -> dossiers
├── statut_precedent_id   FK -> statuts_dossier nullable
├── statut_suivant_id     FK -> statuts_dossier
├── commentaire           text nullable
├── effectue_par          FK -> users nullable   (null = automatique système)
└── created_at

messages                          -- messagerie sécurisée (EX-NOT-07)
├── id                   ulid PK
├── dossier_id           FK -> dossiers
├── expediteur_type      varchar     (declarant | agent)
├── expediteur_user_id   FK -> users nullable   (jamais renseigné côté déclarant anonyme — RG-06)
├── corps                text
├── lu_le                timestamp nullable
└── created_at
```

## 5. Investigations et actions correctives

```
investigations
├── id                    ulid PK
├── dossier_id            FK -> dossiers
├── enqueteur_id          FK -> users
├── date_ouverture        date            (RGI-05 : >= date de recevabilité du dossier)
├── faits_constates       text
├── personnes_rencontrees text nullable
├── cause_immediate       text nullable
├── causes_racines        text nullable
├── recommandations       text
├── statut                varchar         (en_cours | en_attente_validation | validee)
├── valide_par            FK -> users nullable   (RGI-06 : jamais == enqueteur_id)
├── valide_le             timestamp nullable
└── created_at / updated_at

actions_correctives
├── id                        ulid PK
├── dossier_id                FK -> dossiers
├── investigation_id          FK -> investigations nullable
├── intitule                  varchar
├── description                text
├── responsable_id            FK -> users
├── echeance                  date            (RGI-07 : > created_at)
├── statut                    varchar         (non_demarree | en_cours | realisee | en_retard)
├── verification_efficacite   boolean nullable
├── verification_commentaire  text nullable   (RGI-08 : obligatoire si verification_efficacite = true)
├── date_cloture              timestamp nullable   (RGI-09 : uniquement si vérif. efficacité positive)
└── created_at / updated_at
```

## 6. Reporting et audit

```
statistiques_mensuelles          -- RG-12 : conservées sans limitation de durée, données agrégées anonymisées
├── id                  bigserial PK
├── periode             date       (premier jour du mois)
├── parcours_id         FK -> parcours nullable    (null = tous parcours confondus)
├── categorie_id        FK -> categories nullable
├── niveau_gravite_id   FK -> niveaux_gravite nullable
├── nb_declarations     integer
├── nb_resolues         integer
├── nb_cloturees        integer
├── delai_moyen_jours   numeric(6,2)
├── taux_resolution     numeric(5,2)
├── taux_cloture        numeric(5,2)
└── created_at

audit_logs                        -- append-only, aucune route update/delete (voir exigences-audit.md)
├── id              bigserial PK
├── user_id         FK -> users nullable
├── action          varchar
├── auditable_type  varchar
├── auditable_id    varchar        (accueille aussi bien un ULID qu'un bigint)
├── old_values      jsonb nullable
├── new_values      jsonb nullable
├── ip_address      varchar nullable
├── user_agent      varchar nullable
├── url             varchar nullable
└── created_at
```

## 7. Index principaux prévus (Phase 2, affinés à l'implémentation)

- `dossiers` : `UNIQUE(reference)`, `INDEX(parcours_id, statut_id)`, `INDEX(niveau_gravite_id)`,
  `INDEX(created_at)`, `INDEX(declarant_user_id)`.
- `dossier_affectations` : `INDEX(dossier_id, actif)`, `INDEX(user_id, actif)`.
- `historique_statuts` : `INDEX(dossier_id, created_at)`.
- `actions_correctives` : `INDEX(echeance, statut)` (détection des retards, EX-ACT-03).
- `audit_logs` : `INDEX(auditable_type, auditable_id)`, `INDEX(created_at)`, `INDEX(user_id)`.
- `pieces_jointes` : `INDEX(attachable_type, attachable_id)`.
- `messages` : `INDEX(dossier_id, created_at)`.

## 8. Schéma relationnel simplifié

```
parcours 1───n categories
parcours 1───n sla_delais
parcours 1───n qr_codes
parcours 1───n notification_templates (nullable)
parcours 1───n dossiers

dossiers n───1 categories
dossiers n───1 niveaux_gravite
dossiers n───1 statuts_dossier
dossiers n───1 canaux_captage
dossiers n───1 sites (nullable)
dossiers n───1 directions (nullable)
dossiers n───1 users (declarant_user_id, nullable)
dossiers 1───0..1 declaration_identites
dossiers 1───n pieces_jointes (polymorphe)
dossiers 1───n dossier_affectations n───1 users
dossiers 1───n historique_statuts
dossiers 1───n messages
dossiers 1───n investigations n───1 users (enqueteur_id)
dossiers 1───n actions_correctives n───1 users (responsable_id)
investigations 1───n actions_correctives (nullable)
investigations 1───n pieces_jointes (polymorphe)
actions_correctives 1───n pieces_jointes (polymorphe)

users n───n roles (spatie)
roles n───n permissions (spatie)
users n───n permissions directes (spatie, optionnel)

audit_logs n───1 users (nullable)
audit_logs n───1 * (polymorphe, tout modèle métier)
```

## 9. Points laissés ouverts pour la Phase 2 (à ne pas trancher silencieusement)

- Choix définitif `ULID` vs `UUIDv4` pour `dossiers.id` (voir `decisions-techniques.md` DT-09) :
  ULID retenu par défaut pour ses avantages d'indexation, à reconsidérer si le besoin
  d'imprévisibilité totale de l'heure de création est jugé sensible par le métier.
- Le champ `dossiers.declarant_user_id` doit-il aussi enregistrer les affectations du RACI où
  l'acteur de captage est lui-même identifié (RGP, DP, SST/DR) ? Non : ce champ est réservé au
  **déclarant**, pas à l'acteur de captage — l'acteur de captage apparaît dans
  `dossier_affectations`.
- Représentation du champ CDC « Autre » nécessitant un texte libre (catégorie « Autre » avec
  précision saisie par le déclarant) : ajouter `dossiers.categorie_autre_precision varchar
  nullable`, alimenté uniquement quand `categories.is_autre = true` — ajouté à la liste de colonnes
  ci-dessus lors de l'implémentation des migrations (non oublié, à ne pas perdre en Phase 2).
