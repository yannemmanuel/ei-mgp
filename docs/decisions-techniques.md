# Journal des décisions techniques

Ce journal recense les décisions prises **là où le cahier des charges ne tranche pas** un point
technique, conformément à la règle : « les choix techniques peuvent être proposés, mais les règles
métier doivent rester conformes au CDC ». Chaque entrée indique la question, la décision, la
justification, et si elle reste réversible.

## DT-01 — Authentification employé et préparation SSO

**Question** : EX-DEC-04 exige une authentification conditionnelle de l'employé (compte pro si
identifié). Le CDC (§1.6 objectifs et §3) ne précise pas le mécanisme d'authentification actuel de
l'organisation.
**Décision** : utiliser Laravel Fortify pour l'authentification standard (email/mot de passe) en
Phase 3, avec une couche d'abstraction (`Illuminate\Auth` guard standard + interface
`SsoAuthenticatable` non implémentée) permettant de brancher un driver Microsoft Entra ID / SAML/OIDC
plus tard sans réécrire les contrôleurs. Aucun package SSO n'est installé en Phase 3.
**Réversible** : oui, sans impact sur le schéma de données (`users.sso_subject_id` déjà prévu,
nullable).

## DT-02 — Chevauchement Service MGP/DADD et Administrateur digital sur l'administration fonctionnelle

**Question** : CDC §3 attribue à la fois à « Service MGP / DADD » et à « Administrateur digital /
fonctionnel » un accès à l'« administration fonctionnelle », sans distinguer précisément le
périmètre de chacun.
**Décision** : scinder les permissions d'administration en deux catégories (cf. `acteurs.md` §3) :
- *Référentiels métier* (catégories, statuts affichés, modèles de notification, orientation
  « Autre ») → rôle `service_mgp`.
- *Paramétrage technique* (comptes, rôles/permissions, QR codes, canaux de captage) → rôle
  `administrateur_digital`.
**Justification** : cohérent avec la matrice RACI CDC §18.4, où l'Administrateur digital n'a de
responsabilité (« R ») que sur le pilotage technique, jamais sur le contenu métier des dossiers.
**Réversible** : oui, ajustement de permissions Spatie sans migration de schéma.

## DT-03 — Constat de l'environnement de développement local

**Question** : le prompt utilisateur impose PHP 8.3+, Laravel 12, PostgreSQL. L'environnement local
observé lors de la Phase 0 (`C:\Users\DELL`) contient :
- PHP **8.2.12** (XAMPP, `C:\xampp\php\php.exe`) — en dessous de la cible 8.3.
- **Composer non installé** (aucun binaire trouvé sur le PATH ni dans XAMPP).
- **PostgreSQL 18** installé (`C:\Program Files\PostgreSQL\18`), conforme voire supérieur au besoin.
- **Node.js 22 / npm 11** disponibles (suffisant pour la compilation Tailwind/Vite).
- **Git 2.51** disponible.
**Décision (validée par l'utilisateur le 27/08/2026)** : installer un binaire **PHP 8.3+ autonome,
dédié à ce projet**, sans modifier l'installation XAMPP existante (utilisée par d'autres projets sur
cette machine). Actions prévues en début de Phase 1 : (a) télécharger/installer PHP 8.3+ (ou
supérieur stable) dans un répertoire dédié (ex. `C:\php\php8.3\`), (b) l'utiliser explicitement pour
ce projet (alias/PATH scoping, ou invocation par chemin complet dans les scripts du projet) sans
toucher au PHP par défaut de XAMPP, (c) installer Composer et le lier à ce PHP dédié, (d) vérifier la
présence des extensions PHP requises par Laravel 12 (`pdo_pgsql`, `mbstring`, `openssl`,
`tokenizer`, `xml`, `ctype`, `bcmath`, `curl`, `fileinfo`). Aucune ligne de code n'est écrite avant
que cette base soit fonctionnelle.
**Réversible** : sans objet (prérequis, pas un choix d'architecture).

## DT-04 — Délais « à valider » (point d'arbitrage CDC §1.8 n°4)

**Question** : 3×4 cellules du tableau de délais (§11.2) sont marquées « à valider » (analyse
préliminaire EI, traitement/enquête EI, mise en œuvre des mesures — tous parcours).
**Décision** : stocker ces délais dans la table `sla_delais` avec un booléen
`est_valide_metier = false` par défaut sur ces lignes précises. Le job de détection de dépassement
(EX-NOT-04) **ignore** toute étape dont `est_valide_metier = false` — c'est-à-dire qu'aucune fausse
alerte n'est générée sur une valeur provisoire, mais le délai est déjà présent en base (valeur
indicative reprise du CDC) pour ne pas bloquer le développement du moteur de règles. Dès que le
métier valide une valeur (bascule du booléen via la console d'administration, hors échéancier
Phase 0), les alertes s'activent automatiquement pour cette étape sans déploiement de code.
**Réversible** : oui, purement une donnée de configuration.

## DT-05 — Statuts « Brouillon » et « Soumis » non persistés en base

**Question** : CDC §7.1 décrit un cycle de vie incluant `Brouillon` et `Soumis` avant `Reçu`.
**Décision** : ces deux états sont traités comme des états **transitoires côté formulaire**
(Livewire), la ligne `dossiers` n'étant créée qu'au moment de la soumission réussie, directement au
statut `Reçu`. Voir détail et justification dans `workflows.md` §1.
**Réversible** : oui — si un futur besoin de sauvegarde de brouillon inter-session apparaît
(actuellement non exigé par le CDC), une table `brouillons_declaration` pourra être ajoutée sans
toucher au modèle `Dossier`.

## DT-06 — Interdiction de l'auto-affectation

**Question** : non explicitée littéralement dans le CDC, mais implicite dans le principe de
séparation des rôles (recevabilité/instruction distincte du déclarant, EX-INV-05 « jamais par
l'enquêteur lui-même » pour la validation hiérarchique).
**Décision** : étendre ce principe, par analogie et prudence raisonnable (pas une invention de règle
métier de fond, mais une garde-fou technique), à l'affectation : un utilisateur ne peut jamais être
affecté comme traitant de son propre dossier lorsqu'il en est le déclarant identifié.
**Statut** : à confirmer avec le métier lors de la revue de cette analyse — signalé explicitement
plutôt qu'imposé silencieusement comme règle définitive.

## DT-07 — Destinataires de notification non listés comme acteurs à part entière

**Question** : la matrice du circuit accéléré (§6.5) cite « Président CSST », « Service Prévention »
et « toutes les Directions » comme destinataires, alors que ces libellés n'apparaissent pas dans la
liste des acteurs détaillée (§3).
**Décision** : ces libellés sont traités comme des **destinataires de notification** (adresses/rôles
de diffusion), pas comme des rôles applicatifs avec accès dossier. « Président CSST » sera résolu à
l'utilisateur portant l'attribut `poste = Directeur de structure` (le CDC lui-même les assimile :
« Président CSST (Directeur de structure) ») ; « Service Prévention » et « toutes les Directions »
seront des groupes de diffusion configurables dans `notification_templates`/canal email, sans
création de rôle RBAC dédié.
**Réversible** : oui.

## DT-08 — Journalisation des connexions/déconnexions des comptes à privilèges

**Question** : non listée mot pour mot dans CDC §15, mais cohérente avec l'exigence générale de
traçabilité d'un système gérant des données sensibles/personnelles.
**Décision** : ajouter la connexion/déconnexion des comptes à `audit_logs`, comme extension
raisonnable — signalé explicitement ici pour respecter la consigne « ne pas inventer silencieusement
une règle métier ». Ceci est un renforcement de sécurité technique, pas une règle métier
(aucun impact sur les workflows, statuts, délais ou formulaires du CDC).

## DT-09 — ULID vs UUIDv4 pour les identifiants exposés publiquement

**Question** : le prompt utilisateur demande « UUID ou ULID lorsque pertinent ».
**Décision** : ULID par défaut (tri lexicographique = tri chronologique, meilleure performance
d'index B-tree que UUIDv4 aléatoire). Le seul UUID exposé publiquement dans une URL sans
authentification est le `token` des QR codes et la `reference` métier des dossiers (qui n'est de
toute façon pas l'ID technique). L'ID technique `dossiers.id` (ULID) n'apparaît que dans les URLs
back-office protégées par authentification + Policy.
**Réversible** : oui avant la première migration exécutée en production ; coûteux après (changement
de type de colonne).

## DT-10 — Langue des noms de tables/colonnes : français

**Question** : Laravel promeut des conventions en anglais (`created_at`, noms de tables au pluriel
anglais). Le domaine métier de ce projet est intégralement en français (CDC, formulaires, rôles).
**Décision** : noms de tables et de colonnes **métier** en français (`dossiers`, `declarants`,
`niveaux_gravite`…), conventions Laravel techniques conservées en anglais quand elles sont
structurelles (`created_at`, `updated_at`, `id`, tables spatie `roles`/`permissions` non renommées
car générées par le package). Objectif : traçabilité directe entre un champ de base de données et le
paragraphe du CDC qui le définit, pour faciliter la recette fonctionnelle (§16 du CDC) par des
personnes non développeuses.
**Réversible** : difficilement après la Phase 2 — décision à valider avant la première migration.

## DT-11 — Framework de tests : Pest

**Décision** : Pest (construit sur PHPUnit, syntaxe expressive, standard actuel de l'écosystème
Laravel) plutôt que PHPUnit pur, conformément à l'option laissée ouverte par le prompt (« PHPUnit /
Pest selon le choix cohérent avec Laravel »). Les noms de tests référenceront les ID `EX-*`/`RG-*`
du CDC pour la traçabilité (ex. `it('EX-DEC-03 masque les champs d'identité si anonymat', ...)`).

## DT-12 — Drivers queue / cache / session

**Décision (par défaut, ajustable en Phase 1)** : driver `database` pour queue/cache/session en
développement (aucune dépendance Redis installée constatée lors de l'inspection de l'environnement,
DT-03) ; `.env.example` documentera comment basculer vers Redis en production si disponible. Aucun
job Module 5 n'est conçu de façon à dépendre spécifiquement de Redis (pas de fonctionnalité type
pub/sub temps réel exigée par le CDC).

## DT-13 — Stockage des pièces jointes

**Décision** : disque `local` (dossier `storage/app/private`, hors `public/`) en développement, avec
configuration `filesystems.php` prête pour un disque S3-compatible en production (variable
d'environnement, non codé en dur). Aucune pièce jointe de dossier sensible n'est servie par une URL
publique statique (cf. `exigences-securite.md` §3).

## DT-14 — Anti-spam sur les formulaires publics

**Question** : le CDC ne mentionne pas de CAPTCHA ni de mécanisme anti-bot précis pour les 4
formulaires publics.
**Décision** : ne pas imposer de CAPTCHA (non demandé, et un CAPTCHA mal choisi peut nuire à
l'accessibilité pour les déclarants communautaires en zone de connectivité faible — considération de
terrain, pas seulement technique). Se limiter à : rate limiting par IP, un champ honeypot invisible,
et un délai minimum de remplissage. Un CAPTCHA pourra être ajouté ultérieurement si des abus réels
sont constatés — décision explicitement laissée ouverte, pas tranchée définitivement.

## DT-15 — Non-construction d'un moteur d'internationalisation

**Rappel** : le multilinguisme est explicitement hors périmètre (CDC §1.8 point 7, confirmé §2).
**Décision** : ne pas installer de package i18n, ne pas dupliquer les vues par langue. Seule
précaution : les libellés des référentiels (catégories, statuts, niveaux de gravité) sont stockés en
base plutôt que codés en dur dans les fichiers de langue Laravel, ce qui limite (sans l'éliminer) le
coût d'une future extension multilingue, sans construire cette extension maintenant.

## DT-17 — Version de Livewire réellement installée : v4

**Constat** : `composer require livewire/livewire` a résolu la version **4.4** (et non 3.x comme
anticipé lors de l'analyse). Le prompt utilisateur demande « Livewire 3+ » : la v4 est donc
conforme. À surveiller en Phase 4+ : la v4 peut introduire des différences d'API mineures par
rapport à la documentation Livewire 3 largement diffusée (composants single-file, découverte des
composants) — vérifier la documentation officielle v4 au moment d'écrire les premiers composants
plutôt que de se fier uniquement à des exemples v3.

## DT-18 — Base de données dédiée aux tests automatisés (PostgreSQL, pas SQLite)

**Question** : le squelette Laravel par défaut configure `phpunit.xml` sur SQLite en mémoire.
**Décision** : basculer les tests sur une base PostgreSQL dédiée `ei_mgp_test` (même rôle
`ei_mgp_app`), plutôt que SQLite. Justification : le schéma utilise des fonctionnalités
propres à PostgreSQL (colonnes `jsonb`, contrainte `CHECK` sur `niveaux_gravite.niveau`, ULID
comme clé primaire) qui ne se comportent pas de façon identique — voire pas du tout — sous
SQLite. Tester sur SQLite aurait donné une fausse confiance (tests verts localement, échecs
potentiels en production PostgreSQL). Le rôle applicatif `ei_mgp_app` a reçu l'attribut
`CREATEDB` (validé par l'utilisateur le 27/08/2026) pour permettre la recréation autonome de
cette base à chaque phase sans solliciter à nouveau les identifiants superutilisateur.
**Réversible** : oui, retour à SQLite possible en modifiant uniquement `phpunit.xml` si un besoin
de rapidité d'exécution (CI) devait primer sur le réalisme — non recommandé pour ce projet compte
tenu des garanties structurelles (RG-06, CHECK constraint) qui doivent être testées contre le
moteur cible réel.

## DT-19 — Annotations `@property` explicites pour les attributs castés en enum PHP

**Constat** : Larastan (niveau 5) ne parvient pas systématiquement à inférer qu'un attribut
Eloquent casté vers un enum PHP natif (`casts()` retournant `'colonne' => MonEnum::class`) est
bien de type `MonEnum` lorsqu'il est comparé (`===`) à l'intérieur de la classe du modèle
elle-même (ex. `NiveauGravite::isCritique()`), et retombe sur le type `string` de la colonne SQL
sous-jacente. **Décision** : ajouter des annotations `@property NomEnum $colonne` explicites sur
les modèles concernés, en plus (pas à la place) de `casts()` — ce n'est pas une suppression
d'erreur (aucun `@phpstan-ignore` utilisé) mais une déclaration correcte et standard du type réel
de l'attribut, qui documente en même temps le modèle pour les développeurs. À appliquer
systématiquement dès qu'un modèle expose un attribut casté en enum utilisé dans une comparaison
stricte au sein de sa propre classe.

## DT-20 — Emplacement et initialisation du projet

Le CDC source a été localisé à
`C:\Users\DELL\Documents\Formulaire SST\Cahier_des_Charges_Fonctionnel_Digitalisation_EI_MGP.pdf`
(et `.docx`). Aucun projet Laravel existant n'a été trouvé sur la machine. Le projet est initialisé
à `C:\Users\DELL\Projets\ei-mgp\`, qui deviendra la racine du dépôt Git en Phase 1 (`git init`,
premier commit `feat: initialize laravel project`, en respectant strictement les règles de sécurité
Git du prompt — jamais de `.env`, secrets ou credentials committés).
