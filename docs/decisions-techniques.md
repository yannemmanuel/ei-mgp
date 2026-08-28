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

**Extension (Phase 3)** : le même besoin d'annotation explicite se manifeste pour les relations
`belongsTo()` chaînées (ex. `$dossier->parcours->code` dans les Policies) : Larastan niveau 5 ne
résout pas toujours le type de retour d'une relation accédée comme propriété magique depuis une
classe externe au modèle (ici, `app/Policies/*.php`). Solution identique : annotation
`@property Parcours $parcours` sur le modèle porteur de la relation, en plus (pas à la place) de
la méthode de relation elle-même.

## DT-21 — Composants Livewire en mode classe traditionnelle, pas en fichier unique (SFC)

**Constat (Phase 4)** : Livewire 4 (réellement installé, DT-17) change la génération par défaut de
`make:livewire` vers des composants **single-file** (`resources/views/components/{nom}.blade.php`,
préfixés d'un emoji ⚡, classe anonyme inline). C'est une nouveauté par rapport à Livewire 3.
**Décision** : utiliser systématiquement `php artisan make:livewire NomComposant --class`, qui
génère la paire classique `App\Livewire\...\NomComposant` (classe PHP nommée) +
`resources/views/livewire/.../nom-composant.blade.php` — toujours supportée en v4. Justification :
les formulaires de déclaration partagent une logique commune via une classe abstraite
(`DeclarationFormBase`), ce qui est nettement plus lisible et testable avec des classes PHP
nommées qu'avec des classes anonymes en ligne dans un fichier Blade. Le mode SFC n'est pas
utilisé dans ce projet.
**Réversible** : oui, sans impact sur le schéma ou les autres modules — un choix de convention de
fichiers, pas d'architecture de données.

## DT-22 — Layout de secours `resources/views/layouts/app.blade.php` requis par Livewire 4

**Constat (Phase 4)** : tout composant Livewire utilisé directement comme cible de route
(`Route::get('/declarer/ei-employe', EiEmployeForm::class)`, nos 4 formulaires publics) est
automatiquement enveloppé par Livewire 4 dans un layout de page, dont la valeur par défaut
(`config('livewire.component_layout')`) est `layouts::app` — c'est-à-dire le fichier
`resources/views/layouts/app.blade.php` (registre de namespace propre à Livewire, distinct des
composants Blade anonymes `<x-layouts.*>` utilisés par le reste du projet). Sans ce fichier,
toute route pointant directement vers un composant Livewire échoue avec
`No hint path defined for [layouts]`.
**Décision** : créer `resources/views/layouts/app.blade.php` comme simple passe-plat
(`{{ $slot }}`), puisque nos vues de composants produisent déjà un document HTML complet via
`<x-layouts.guest>`/`<x-layouts.app>`. Aucune double-imbrication de document HTML n'en résulte.
**À retenir pour les phases suivantes** : tout nouveau composant Livewire utilisé comme route
directe (`Route::get(..., MonComposant::class)`) bénéficiera automatiquement de ce passe-plat —
aucune action supplémentaire n'est nécessaire tant que la vue du composant reste responsable de
son propre document complet.

## DT-20 — Emplacement et initialisation du projet

Le CDC source a été localisé à
`C:\Users\DELL\Documents\Formulaire SST\Cahier_des_Charges_Fonctionnel_Digitalisation_EI_MGP.pdf`
(et `.docx`). Aucun projet Laravel existant n'a été trouvé sur la machine. Le projet est initialisé
à `C:\Users\DELL\Projets\ei-mgp\`, qui deviendra la racine du dépôt Git en Phase 1 (`git init`,
premier commit `feat: initialize laravel project`, en respectant strictement les règles de sécurité
Git du prompt — jamais de `.env`, secrets ou credentials committés).

## DT-23 — Périmètre du moteur de délais (Phase 6) et écart de granularité CDC §6 / §7.1

**Constat (Phase 6)** : le Phase 5 a déjà livré le graphe de transitions (`DossierWorkflowService`).
Phase 6 se concentre donc sur le calcul des échéances/retards (CDC §11.2), pas sur l'envoi des
relances/alertes (EX-NOT-03/04, différé à la Phase 9 qui réutilisera `DelaiService` tel quel).
Par ailleurs, les tableaux de processus par parcours (§6) citent une étape « Retour d'information au
plaignant » dont le statut résultant affiché est « En traitement », mais l'énumération des statuts
internes (§7.1) n'a pas de statut dédié à cette granularité (elle se produit en réalité pendant
`En investigation`, sans transition propre). **Décision** : ne pas inventer un statut interne
artificiel pour cette étape — elle reste enregistrée dans `sla_delais` à titre de référence
(traçabilité CDC complète) mais n'est pas suivie comme échéance autonome avec compte à rebours.
« Clôture, suivi et évaluation » est en revanche traitée comme un délai global mesuré depuis la
création du dossier (`dateLimiteGlobale`), pas comme une sous-étape déclenchée par un statut.
Enfin, pour les délais exprimés en CDC sous forme d'intervalle (ex. « 3 à 6 mois »), la borne
**supérieure** est retenue systématiquement, cohérent avec le titre même de la section CDC §11.2
(« délais maximaux »).
**Réversible** : oui, ce sont des choix de configuration/lecture du CDC, sans impact de schéma.

## DT-24 — Ajout de l'unité `semaines` à `UniteDelai`

**Constat (Phase 6)** : le CDC §11.2 exprime littéralement certains délais en « 2 semaines »
(traitement/enquête, Grief Sous-traitant et Grief Communauté), une granularité absente de l'énum
`UniteDelai` initiale (Heures/JoursOuvres/Mois, définie en Phase 2). **Décision** : ajouter un cas
`Semaines` plutôt que de convertir de force en jours ouvrés (ce qui aurait exigé un arbitrage non
demandé par le CDC sur le nombre de jours ouvrés par semaine). Le calcul (`addWeeks`) est fait en
jours calendaires, cohérent avec le fait que le CDC ne qualifie pas cette unité de « ouvrée ».
**Réversible** : oui, ajout d'un cas d'énum sans migration de schéma (`unite` reste une colonne
`string` castée).

## DT-25 — Perte de type générique Larastan à travers une relation Eloquent chaînée à `whereHas()`

**Constat (Phase 6)** : dans `DelaiService::dateDebutEtape()`, la chaîne
`$dossier->historiqueStatuts()->whereHas(...)->latest(...)->first()` faisait perdre à Larastan
(niveau 5) le type générique du modèle relié (`HistoriqueStatut`), le résultat retombant sur le type
générique `Illuminate\Database\Eloquent\Model` (erreur `property.notFound` sur `created_at`) — alors
que la même séquence amorcée depuis un modèle statique (`SlaDelai::query()->where(...)->first()`,
présent dans le même fichier) préserve correctement son type. **Décision** : remplacer l'amorce
`$dossier->historiqueStatuts()` (relation) par `HistoriqueStatut::query()->where('dossier_id',
$dossier->id)` (requête statique équivalente), qui contourne la perte de générique observée à
travers `whereHas()` sur une relation. Comportement fonctionnel strictement identique (mêmes tests
Phase 6 toujours au vert après le changement) ; aucune suppression d'erreur (`@phpstan-ignore` ou
`@var` de contournement) utilisée — extension du principe de DT-19 (préférer une déclaration/
structure de requête que Larastan comprend nativement plutôt qu'une annotation de contournement).
**À retenir** : privilégier `Modele::query()` à `$parent->relation()` lorsqu'un résultat unique
(`->first()`) issu d'une chaîne avec `whereHas()` doit être ensuite manipulé comme instance typée.
