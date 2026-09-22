# Journal des décisions techniques

> ⚠️ **JOURNAL HISTORIQUE — plusieurs décisions ci-dessous ont été PRISES EN LARAVEL, puis
> remplacées par le portage en Next.js (2026-09-22).**
>
> Elles ne sont pas corrigées : une décision est un fait daté, et réécrire le journal effacerait
> le raisonnement qu'il sert à conserver. Ce qui a changé depuis est consigné dans le code
> lui-même, où chaque garde non évidente porte le défaut qu'elle empêche. Lire donc ces entrées
> comme « ce qui a été décidé, et pourquoi », jamais comme « ce qu'il faut faire aujourd'hui ».


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

## DT-25 — Perte de type générique Larastan à travers une relation Eloquent chaînée

**Constat (Phase 6, étendu Phase 7)** : dans `DelaiService::dateDebutEtape()`, la chaîne
`$dossier->historiqueStatuts()->whereHas(...)->latest(...)->first()` faisait perdre à Larastan
(niveau 5) le type générique du modèle relié (`HistoriqueStatut`), le résultat retombant sur le type
générique `Illuminate\Database\Eloquent\Model` (erreur `property.notFound` sur `created_at`) — alors
que la même séquence amorcée depuis un modèle statique (`SlaDelai::query()->where(...)->first()`,
présent dans le même fichier) préserve correctement son type. **Extension (Phase 7)** : le même
symptôme est réapparu dans `InvestigationPanel::getInvestigationsProperty()` sur une chaîne
`$this->dossier->investigations()->with(...)->orderByDesc(...)->get()` — **sans** `whereHas()` cette
fois. Le facteur commun n'est donc pas `whereHas()` spécifiquement, mais plus largement : une
relation `HasMany` accédée comme méthode (`$parent->relation()`) puis prolongée par un ou plusieurs
appels de constructeur de requête, perd son paramètre générique pour Larastan niveau 5, alors qu'une
requête amorcée directement depuis un modèle statique (`Modele::query()->where(...)`) le conserve
systématiquement. **Décision** : remplacer partout ce schéma par une requête statique équivalente
(`HistoriqueStatut::query()->where('dossier_id', $dossier->id)`,
`Investigation::query()->where('dossier_id', $this->dossier->id)`). Comportement fonctionnel
strictement identique (tests toujours au vert après chaque changement) ; aucune suppression
d'erreur (`@phpstan-ignore` ou `@var` de contournement) utilisée — extension du principe de DT-19
(préférer une structure de requête que Larastan comprend nativement plutôt qu'une annotation de
contournement).
**À retenir pour les phases suivantes** : dès qu'un résultat issu d'une relation `HasMany`/`HasOne`
chaînée à `with()`/`where()`/`orderBy()`/`whereHas()`/etc. doit être manipulé comme instance ou
collection typée (accès à un attribut, passage à une méthode typée), amorcer la requête avec
`Modele::query()->where('cle_etrangere', $parent->id)` plutôt que `$parent->relation()`.

## DT-26 — Périmètre du module Investigations (Phase 7)

**Question 1 — qui est l'enquêteur ?** Le CDC (EX-INV-01) désigne l'acteur de l'ouverture d'une
fiche comme « Correspondant MGP / Enquêteur » — un seul et même rôle applicatif (`correspondant_mgp`,
cf. `acteurs.md`), pas deux comptes distincts. **Décision** : `enqueteur_id` est toujours l'auteur de
l'ouverture (`Auth::user()`) — aucune étape d'« assignation d'un enquêteur » distincte n'est
implémentée, le CDC n'en décrivant aucune. Réversible sans migration si un futur besoin d'assignation
séparée apparaissait (il suffirait d'ajouter un paramètre explicite à `InvestigationService::ouvrir()`).

**Question 2 — date de recevabilité (RGI-05).** Le CDC ne définit nulle part un champ ou un
événement explicitement nommé « date de recevabilité » sur le dossier. **Décision** : l'interpréter
comme la date de l'entrée la plus récente du dossier dans le statut interne « En investigation »
(cohérent avec `workflows.md` §1, où c'est la transition qui suit la décision de recevabilité prise
lors de l'étape « En analyse »). Réutilise `DelaiService::dateDebutEtape()` (Phase 6) plutôt que de
dupliquer la requête — signalé explicitement comme interprétation, pas une donnée du CDC.

**Question 3 — gating de l'ouverture.** Une fiche ne peut être ouverte que sur un dossier
actuellement au statut « En investigation » (pas « Réouvert », qui doit d'abord retransitionner vers
« En investigation » via le graphe déjà existant, Phase 6). Cohérent avec `workflows.md` §1, où
l'acteur de la ligne « En investigation » est justement « Enquêteur / Correspondant MGP ».

**Question 4 — plusieurs investigations par dossier.** Le schéma (Phase 2) n'impose aucune
contrainte d'unicité `dossier_id` sur `investigations` (relation `hasMany`, pas `hasOne`).
**Décision** : ne pas ajouter de restriction non demandée par le CDC — un dossier réouvert peut ainsi
donner lieu à un second cycle d'investigation, chaque fiche restant indépendamment traçable.

**Question 5 — pas de flux de rejet de validation.** Le CDC décrit une validation hiérarchique
(EX-INV-05) mais aucun mécanisme de renvoi/rejet avec commentaire vers l'enquêteur. **Décision** :
la validation reste binaire (`en_attente_validation` → `validee` uniquement) ; tout échange nécessaire
avant validation passe par la messagerie sécurisée déjà existante (Phase 4), pas par un état
supplémentaire inventé. Signalé ici comme limite de périmètre assumée, pas une règle métier cachée.

## DT-27 — Périmètre du module Actions correctives (Phase 8)

**Question 1 — la transition automatique « Action corrective en cours » → « Résolu ».**
`workflows.md` §1 attribue cette transition à « Système (EX-ACT-05, quand toutes les actions sont
vérifiées efficaces) », mais ne précise pas l'événement déclencheur exact. **Décision** : la
déclencher en réaction directe à la clôture de la **dernière** action encore ouverte du dossier
(`ActionCorrectiveService::cloturer()` → `avancerDossierSiToutesActionsClosees()`), jamais par une
tâche planifiée indépendante — cohérent avec RG-10, qui exige que chaque action soit à la fois
**close** (`date_cloture` renseignée) et **vérifiée efficace**, pas seulement vérifiée. Un dossier
« Action corrective en cours » sans aucune action ne déclenche jamais cette transition automatique
(rien à clôturer) ; l'acteur habilité conserve la transition manuelle déjà ouverte par
`DossierWorkflowService` (Phase 6) pour ce cas. La transition est tracée dans `historique_statuts`
au nom de l'acteur qui a clôturé la dernière action (même convention que l'affectation automatique
de la Phase 5), pas au nom d'un compte « système » fictif.

**Question 2 — gating de la création (EX-ACT-01).** Une action corrective ne peut être créée que sur
un dossier au statut « Action corrective en cours », par symétrie avec le gating retenu pour les
investigations (DT-26 Q3) : c'est la seule ligne des tableaux de processus par parcours (§6) où
l'étape « Mise en œuvre des mesures » est associée à ce statut interne.

**Question 3 — action liée à une investigation non validée.** EX-ACT-01 dit littéralement « depuis
recommandations validées ». **Décision** : `investigation_id` reste nullable (le schéma de la
Phase 2 le permettait déjà, pour les dossiers sans investigation formelle), mais si renseigné,
l'investigation référencée doit être `validee`, revérifié côté service (pas seulement côté
formulaire).

**Question 4 — « job de recalcul du retard » (EX-ACT-03).** Contrairement au reste du calcul de
délais (Phase 6, DelaiService, purement calculé à la volée), EX-ACT-03 exige littéralement un enum
`statut` incluant `en_retard` comme **valeur stockée**, pas une propriété dérivée à l'affichage.
**Décision** : commande Artisan dédiée (`ei-mgp:recalculer-retard-actions-correctives`) planifiée
quotidiennement (`routes/console.php`, cadence non spécifiée par le CDC — retenue par cohérence avec
la granularité "jour" de la colonne `echeance`), qui bascule `non_demarree`/`en_cours` vers
`en_retard` dès que l'échéance est dépassée. Ce job ne fait jamais le chemin inverse : une reprise
(`en_retard` → `en_cours`) est toujours une décision explicite de l'acteur via
`ActionCorrectiveService::changerStatut()`.

**Question 5 — qui est le « Responsable de l'action » (EX-ACT-03) ?** `responsable_id` référence
`users` génériquement (pas de rôle `acteurs.md` dédié « responsable d'action »), et le formulaire de
création liste tous les utilisateurs actifs, comme le fait déjà `DossierDetailPage` pour la
réaffectation — le module ne filtre pas la liste par permission `actions.update`. **Limite assumée,
signalée explicitement** : si un `responsable_id` est un utilisateur sans permission `actions.*`
(ex. un employé sans rôle de gestion), il ne pourra pas lui-même faire progresser son action dans
l'application ; un gestionnaire (`correspondant_mgp`, `rqse`, etc.) devra le faire pour lui. Le CDC
ne définissant aucun rôle « responsable d'action » distinct des rôles de gestion existants, cette
limite n'est pas comblée par l'invention d'un rôle ou d'une permission supplémentaire.

## DT-28 — Périmètre du module Notifications (Phase 9)

**Infrastructure retenue.** Le système de notifications natif de Laravel (`Illuminate\Notifications`,
`User` déjà `Notifiable` depuis le squelette initial) plutôt qu'une implémentation maison : canal
« outil » = canal `database` (table technique standard `notifications`, nom conservé en anglais
comme les autres tables d'infrastructure du framework, DT-10), canal « email » = canal `mail`.
Une seule classe `App\Notifications\DossierEvenementNotification`, pilotée entièrement par un
gabarit `notification_templates` résolu par `App\Services\Notification\NotificationService` — le
contenu n'est jamais codé en dur dans une classe de notification par évènement.

**Question 1 — « N+1 » (EX-NOT-04).** Le CDC exige d'alerter le supérieur hiérarchique du
responsable actuel du dossier, une notion absente du schéma (Phase 2) et de `acteurs.md` (qui ne
définit aucun rôle « responsable hiérarchique »). **Décision** : ajout d'une colonne nullable
`users.responsable_hierarchique_id` (auto-référence). Nullable délibérément : un utilisateur sans
supérieur renseigné ne déclenche simplement aucune alerte N+1 le concernant — absence de donnée,
pas une déduction silencieuse ni une alerte fictive. Ajout de schéma minimal justifié par une
exigence explicitement nommée (« N+1 »), pas une règle métier inventée.

**Question 2 — destinataires hors RBAC du circuit accéléré (EX-NOT-05).** Prolonge DT-07 : « Service
Prévention » (EI Employé) et « toutes les Directions » (Grief Communauté) n'ont ni rôle applicatif
ni utilisateur identifiable. **Décision** : colonne `notification_templates.destinataires_email_supplementaires`
(JSON, adresses email statiques), utilisée uniquement pour le canal `email` (jamais pour le canal
`outil`, qui suppose un compte applicatif). Valeurs actuelles (`prevention@example.test`,
`directions@example.test`) **indicatives**, à remplacer par les vraies adresses de diffusion avant
mise en production (même statut que les délais « à valider » de DT-04). « Président CSST » reste
résolu via `poste = 'Directeur de structure'` (DT-07) ; « SST/DR/Commanditaire » (Grief
Sous-traitant) via le rôle `captage_grief_soustraitant` déjà présent dans `acteurs.md`.

**Question 3 — quand notifier le déclarant (EX-NOT-02, RGI-10).** Le CDC parle de changement de
statut « majeur ». **Décision** : ne notifier que lorsque le **libellé affiché** change
(`statuts_dossier.libelle_affiche`), pas à chaque transition interne — plusieurs statuts internes
partagent le même libellé affiché (ex. « En investigation » et « En attente d'information » →
« En traitement »), et notifier à chacun spammerait le déclarant de messages qu'il ne peut pas
distinguer. Découle directement de RGI-10, pas une invention.

**Question 4 — page de suivi et code d'accès pour les dossiers non anonymes (EX-NOT-06).** Deux
formulations du CDC (extraites en Phase 0) divergent : RGI-12 dit « référence et, **si anonyme**, un
code secondaire » (lecture conditionnelle), tandis que `exigences-securite.md` §4 dit « `/suivi`
accessible **uniquement** via `reference + code_secondaire` » (sans condition). **Décision** :
retenir la lecture la plus sûre (exigences-securite.md, document de sécurité dédié) — un code
d'accès est désormais généré pour **tous** les dossiers, anonymes ou non (`DeclarationService::creer()`,
avant Phase 9 réservé au cas anonyme). Écart assumé et documenté par rapport au comportement de
Phase 4 ; aucune régression fonctionnelle (le code était déjà retourné/affiché à l'accusé de
réception, seul son universalité change).

**Question 5 — débit et verrouillage sur `/suivi`.** `exigences-securite.md` §4 exige un
« verrouillage temporaire après N tentatives échouées **sur une même référence** », en plus du
rate limiting par IP général. **Décision** : deux compteurs `RateLimiter` indépendants
(`suivi-lookup-ip:{ip}`, 10/10 min ; `suivi-lookup-ref:{reference}`, 5/15 min), tous deux comptant
uniquement les échecs (jamais les succès) — cohérent avec la formulation « tentatives échouées ».
Contrôlé dans `SuiviDossier::rechercher()`, pas par un middleware de route (même raison que DT-14 :
les actions Livewire transitent par un endpoint AJAX partagé). Message d'erreur volontairement
générique (« Aucun dossier ne correspond à ces informations ») que ce soit la référence ou le code
qui soit invalide, pour ne jamais révéler lequel des deux est en cause.

**Question 6 — paliers d'escalade répétés, sans déduplication (EX-NOT-04).** Le CDC ne précise pas
si une alerte de retard doit être envoyée une seule fois ou répétée tant que le dossier reste en
retard. **Décision** : `dossiers:detecter-retards` revérifie et ré-envoie à chaque exécution
(quotidienne) tant que le retard persiste — cohérent avec la nature d'une alerte d'escalade
(contrairement à `dossiers:relancer-echeances`, qui est un rappel ponctuel déclenché une seule fois
à J-3 exactement). Aucune table de déduplication ajoutée, non demandée par le CDC. Les deux paliers
(N+1 + Service MGP à >0 %, Direction à partir de +50 %) sont **additifs** : le premier reste actif
même une fois le second atteint.

**Question 7 — mode de la messagerie partagée (EX-NOT-07).** `App\Livewire\Messagerie\MessagerieDossier`
sert à la fois la vue interne (`DossierDetailPage`, acteur authentifié) et la vue publique
(`SuiviDossier`, déclarant). **Décision** : le mode est déterminé par `Auth::check()` plutôt que par
un paramètre explicite — un déclarant, anonyme ou non, n'est par construction jamais authentifié sur
ce composant (RG-06, `MessagePolicy` ne s'applique qu'aux acteurs). Côté déclarant, l'autorisation
d'envoi est revérifiée via la marque de session posée par `SuiviDossier::rechercher()`
(`suivi_verifie_{id}`), jamais en faisant confiance au seul fait que le composant a été monté depuis
une vue supposée autorisée.

## DT-29 — Périmètre du module Administration (Phase 10)

**Constat** : contrairement aux Modules 1 à 6, le CDC ne définit aucun bloc `EX-ADM-*` dédié à
l'administration (`docs/exigences-fonctionnelles.md` passe directement du Module 5 au Module 6) —
l'« administration fonctionnelle » n'apparaît que comme un attribut d'accès de deux acteurs
(`service_mgp`, `administrateur_digital`) dans la matrice §3, déjà résolu en DT-02 : référentiels
métier (catégories, statuts affichés, sites, modèles de notification) pour `service_mgp` ;
paramétrage technique (comptes, rôles, QR codes, canaux) pour `administrateur_digital`. Le périmètre
de cette phase est donc directement dérivé de DT-02 et du catalogue de permissions déjà seedé en
Phase 2 (`RolePermissionSeeder`), pas d'une exigence fonctionnelle numérotée.

**Question 1 — quels référentiels sont librement créables ?** Distinction faite entre référentiels
dont le `code` est **contraint par un enum PHP** consommé par la logique métier
(`canaux_captage.code` → `CanalCaptageCode`, consommé par `DeclarationService`/`ReferenceGeneratorService` ;
`statuts_dossier.code` → `StatutDossierCode`, pivot du graphe `DossierWorkflowService`) et ceux dont
le `code` est un identifiant métier libre sans contrepartie dans le code PHP (`categories.code`,
`sites.code`, `notification_templates.evenement_code` — une simple clé de recherche pour
`NotificationService`). **Décision** : `CanauxAdmin`/`StatutsAdmin` n'exposent que l'édition du
libellé/ordre/statut des lignes déjà seedées (créer une ligne `canaux_captage` sans cas `enum`
correspondant, ou une ligne `statuts_dossier` sans transition dans `TRANSITIONS_AUTORISEES`, la
rendrait invisible au moteur de règles — pas une simple donnée orpheline mais une incohérence
structurelle) ; `CategoriesAdmin`/`SitesAdmin`/`NotificationTemplatesAdmin` permettent la création
libre.

**Question 2 — pas de suppression, seulement une désactivation.** Aucun écran d'administration ne
propose de suppression, uniquement un bascule `actif` (ou, pour les QR codes, `desactive_le`) — par
analogie avec RG-03 (pas de suppression d'un dossier validé) étendue par prudence aux référentiels
qu'il référence : supprimer une catégorie ou un site déjà utilisé par un dossier casserait
l'intégrité historique de ce dossier. Décision technique, pas une règle métier du CDC.

**Question 3 — `roles.manage` n'ouvre pas d'écran de création de rôle/permission.** Le catalogue de
15 rôles / 34 permissions est **fixé par `RolePermissionSeeder`** (Phase 2) et directement consommé
par les Policies (`RoleParcoursScope`, chaque `*Policy::create/update/...`) : ajouter un rôle ou une
permission via une console d'administration sans toucher au code des Policies ne les rendrait
opérants nulle part. **Décision** : `roles.manage` est couvert par la capacité d'**assigner les
rôles existants** à un utilisateur (`UtilisateursAdmin`), pas par la création de nouveaux
rôles/permissions — cohérent avec `acteurs.md` §1 (« aucun rôle ne bénéficie d'un bypass implicite,
même `administrateur_digital` reçoit des permissions explicites, listées et testables »), qui décrit
un catalogue fermé, pas un système RBAC dynamique.

**Question 4 — mot de passe initial d'un compte créé par un administrateur.** Le CDC ne décrit pas
de flux d'invitation par email. **Décision** : mot de passe aléatoire de 12 caractères
(`Str::password()`) généré à la création, affiché **une seule fois** à l'administrateur (même
schéma d'affichage éphémère que le code d'accès des déclarations anonymes, Phase 4/9) à charge pour
lui de le communiquer ; l'utilisateur le change ensuite via le parcours Fortify « mot de passe
oublié » déjà en place (Phase 3). Pas de flux d'email transactionnel ajouté, non demandé par le CDC.

**Question 5 — garde-fou anti-auto-verrouillage.** `UtilisateursAdmin::enregistrer()` refuse
qu'un administrateur désactive son propre compte. Ce n'est pas une règle du CDC mais une protection
technique évidente (éviter qu'une console d'administration puisse verrouiller son seul opérateur
hors du système) — signalée ici plutôt qu'ajoutée silencieusement, même principe que DT-06/DT-08.

**Question 6 — middleware `permission:` au niveau des routes.** `docs/exigences-securite.md` §2
exige explicitement le middleware Spatie `permission:` « sur toutes les routes back-office ».
**Décision** : appliqué ici pour la première fois (`bootstrap/app.php` : alias `permission` ajouté),
car les écrans d'administration sont les premiers de l'application à n'avoir **aucun** cloisonnement
par parcours — un simple contrôle de permission suffit, contrairement aux dossiers/investigations/
actions correctives, où seule une Policy (permission **+** `RoleParcoursScope`) est correcte et où
un middleware `permission:` seul serait insuffisant (et donc n'a jamais été utilisé dans les phases
précédentes). Chaque composant revérifie néanmoins la permission dans `mount()`
(`abort_unless(Auth::user()->can(...), 403)`), défense en profondeur si jamais un composant était un
jour monté hors de sa route dédiée.

## DT-30 — Mise en place effective du journal d'audit (Phase 11)

**Contexte.** `AuditLog` (modèle append-only) et `AuditLogPolicy` existent depuis la Phase 2, mais
rien n'écrivait dans `audit_logs` jusqu'ici. `docs/exigences-audit.md`, déjà très précis depuis la
Phase 0, a été suivi au pied de la lettre plutôt que réinterprété.

**Architecture retenue.** `App\Services\Audit\AuditLogger::enregistrer()` reste l'unique point
d'écriture (`INSERT` pur). Deux mécanismes l'alimentent :
- `App\Observers\AuditObserver`, **générique**, attaché via l'attribut PHP `#[ObservedBy(...)]`
  (colocalisé sur chaque modèle plutôt qu'une longue liste dans un ServiceProvider) à tous les
  modèles concernés n'ayant pas de règle spécifique : `DossierAffectation`, `PieceJointe`,
  `Investigation`, `ActionCorrective`, `Categorie`, `Site`, `StatutDossier`, `CanalCaptage`,
  `NotificationTemplate`, `NiveauGravite`, `QrCode`, `User`. Exclut systématiquement les colonnes
  listées dans `$model->getHidden()` (jamais `password`/`remember_token` dans un champ JSON d'audit,
  même haché) — réutilise une métadonnée de modèle déjà correcte plutôt qu'une liste d'exclusion
  propre à l'audit.
- Appels explicites là où l'action n'a pas de modèle dédié ou échappe au cycle de vie Eloquent
  standard : notification envoyée (`NotificationService`), connexion/déconnexion
  (`Illuminate\Auth\Events\Login/Logout`), changement de rôles (`UtilisateursAdmin`, la table pivot
  `model_has_roles` n'étant pas un attribut du modèle `User`).

**Question 1 — `Dossier` : éviter le doublon avec `historique_statuts`.** `docs/exigences-audit.md`
§1 demande `audit_logs` **en plus** de `historique_statuts`, pas à sa place. `App\Observers\DossierObserver`
ignore les modifications ne portant que sur `statut_id` (déjà couvertes, avec un contexte plus riche,
par un nouveau listener `EnregistrerAuditStatutChange` sur `App\Events\StatutDossierChange`, Phase 9).
Cette classe **compose** `AuditObserver` plutôt que d'en hériter : une méthode `updated(Dossier
$dossier)` surchargeant `updated(Model $model)` violerait la covariance des paramètres (LSP),
relevée par Larastan comme erreur non ignorable.

**Question 2 — redaction du contenu des notifications pour un dossier anonyme.**
`docs/exigences-audit.md` §2/§5 : jamais le contenu (objet/corps) d'une notification concernant un
dossier anonyme, seulement type/canal/destinataire. Implémenté directement dans
`NotificationService::envoyerA()` (clé `objet` absente du tableau audité si `$dossier->is_anonymous`),
pas par un filtre a posteriori.

**Question 3 — connexions/déconnexions : tous les comptes, pas seulement les « privilégiés ».**
DT-08 parlait des « comptes à privilèges ». **Décision** : journaliser toutes les connexions/
déconnexions sans distinction de rôle — le CDC/DT-08 ne fournissant aucune définition opérationnelle
de « privilégié », classifier finement aurait été une invention plus risquée qu'une couverture
large ; un sur-ensemble strict de ce qui était demandé, jamais un sous-ensemble.

**Question 4 — pièce jointe « supprimée logiquement ».** `docs/exigences-audit.md` §2 liste l'ajout
**et** la « suppression logique » d'une pièce jointe parmi les actions à auditer. **Constat** :
aucune fonctionnalité de suppression de pièce jointe n'existe nulle part dans l'application (le
modèle `PieceJointe` n'a même pas de colonne `updated_at`, cf. son commentaire de Phase 2 : « une
pièce jointe n'est jamais modifiée après téléversement »). Seule la création est donc auditée
(`AuditObserver::created`) ; la suppression logique n'a rien à auditer tant qu'elle n'existe pas —
signalé ici plutôt que de construire une fonctionnalité de suppression non demandée juste pour avoir
quelque chose à auditer.

**Question 5 — lacune corrigée : `service_mgp` n'avait pas `audit.view`.** `docs/exigences-audit.md`
§4 liste explicitement `service_mgp` comme ayant un accès lecture seule à `audit_logs` (« pilotage »),
au même titre qu'`auditeur`/`dpo` — mais `RolePermissionSeeder` (Phase 2) avait omis cette ligne.
Corrigé ici (`RolePermissionSeeder`), découvert par le test de la Policy déjà existante confrontée à
la spécification déjà existante : aucune des deux n'était fausse en soi, seul le seeder était
incomplet par rapport à sa propre documentation.

**Question 6 — durcissement PostgreSQL non réalisé (point ouvert).**
`docs/exigences-audit.md` §3 point 4 envisageait un rôle PostgreSQL applicatif distinct, limité à
`INSERT`/`SELECT` sur `audit_logs` (defense in depth au niveau base de données, en plus des couches
application/Policy/modèle déjà en place). **Non réalisé** : nécessiterait des identifiants
superutilisateur PostgreSQL (comme la création initiale de la base, Phase 1) et une décision sur
l'hébergement cible, hors de portée d'une phase applicative. Les trois autres couches (aucune
route/contrôleur d'update-delete, `AuditLogPolicy` sans méthode `update`/`delete`, exceptions dans
`AuditLog::update()`/`delete()`) restent en place et déjà testées. Point laissé ouvert et signalé
plutôt que traité par une décision technique substituant l'absence d'accès DB.

## DT-31 — Module Reporting (Phase 12)

**Question 1 — `/dashboard` comme page d'atterrissage universelle.** EX-REP-01 réserve le tableau
de bord consolidé à « Service MGP/DADD, Direction » (en pratique, tout rôle porteur de
`reporting.view` : `service_mgp`, `dg`, `auditeur`, tous transversaux). Mais `/dashboard` est aussi
la page d'atterrissage post-connexion de **tous** les utilisateurs authentifiés
(`routes/web.php`, `Route::get('/')`). **Décision** : ne jamais faire un 403 sur cette route — le
composant `DashboardConsolide` se ramifie en interne selon `reporting.view` : le tableau de bord
consolidé complet pour les rôles habilités, un résumé personnel (nombre de dossiers actuellement
affectés) pour les autres. Remplace l'ancienne vue statique `resources/views/dashboard.blade.php`
(placeholder de Phase 3, supprimée : son contenu vit maintenant dans la branche « résumé personnel »
du composant).

**Question 2 — définition de « taux de résolution » et « taux de clôture » (EX-REP-03).** Le CDC
nomme ces deux indicateurs sans formule. **Décision** : les traiter comme deux mesures distinctes,
pas des synonymes — « taux de résolution » = part des dossiers ayant atteint `Résolu` **ou**
`Clôturé` (le problème est réglé, indépendamment de la formalité administrative de clôture) ;
« taux de clôture » = part des dossiers dans un statut **terminal** (`is_terminal`, donc `Clôturé`
**ou** `Rejeté`, cohérent avec RGI-11 qui assimile déjà les deux côté déclarant) — l'avancement
administratif, indépendamment de l'issue. Un dossier `Rejeté` compte donc dans le taux de clôture
mais jamais dans le taux de résolution (il n'a jamais été « résolu » au sens propre).

**Question 3 — `délai moyen` mesuré uniquement sur les dossiers clôturés.** `dossiers.date_cloture`
n'est renseigné que par `DossierWorkflowService::cloturer()` (jamais par `rejeter()`) : la moyenne
SQL (`AVG(EXTRACT(EPOCH FROM (date_cloture - created_at)) / 86400)`, filtrée `whereNotNull`) exclut
donc naturellement les dossiers rejetés et ceux encore en cours, sans condition supplémentaire à
écrire — cohérent avec le sens usuel de « délai de traitement moyen » (mesuré sur les dossiers
effectivement menés à terme).

**Question 4 — `ExportPolicy` sans modèle Eloquent porteur.** Contrairement à `DossierPolicy`,
`InvestigationPolicy`, etc., aucun modèle `Export` n'existe pour que la résolution de Policy par
convention (`App\Models\X` → `App\Policies\XPolicy`) s'applique. **Décision** : enregistrement
explicite via `Gate::define('export-rapports', [ExportPolicy::class, 'export'])` (et
`'export-rapports-nominatif'`) dans `AppServiceProvider::boot()` — la seule fois dans ce projet
qu'une Policy n'est pas résolue par la convention standard, documenté pour ne pas surprendre en
cherchant en vain un modèle `Export`.

**Question 5 — `StatistiqueMensuelleService` n'utilise jamais `updateOrCreate()`.** Cohérent avec le
commentaire déjà présent sur `App\Models\StatistiqueMensuelle` depuis la Phase 2 (« jamais modifiée
après coup ») : `calculerPour()` vérifie l'existence de chaque ligne (`periode` × `parcours_id` ×
`categorie_id` × `niveau_gravite_id`) avant `create()` et ignore silencieusement (retourne 0) toute
combinaison déjà archivée — un recalcul accidentel du même mois ne peut jamais réécrire une valeur
déjà publiée. Si une correction devenait un jour nécessaire, elle passerait par une nouvelle ligne
ou une purge manuelle explicite, jamais par ce service.

**Question 6 — le rendu PDF (dompdf) n'est pas testable au travers du harnais de test Livewire.**
`Excel::download()` dispose d'un faux officiel (`Excel::fake()`), pas `Pdf::download()`
(barryvdh/laravel-dompdf) : appeler l'action réelle depuis `Livewire::test()->call('exporterPdf')`
génère un vrai binaire PDF que le harnais de test tente de sérialiser en JSON, ce qui échoue
(« Malformed UTF-8 characters »). **Décision** : tester le contenu de la vue `exports.dossiers-pdf`
directement (`view(...)->render()`), et couvrir l'autorisation (refus sans `reporting.export`)
séparément via `Livewire::test()`, sans jamais déclencher un rendu PDF réel dans les tests
d'autorisation. La logique métier (filtre, redaction nominative) est de toute façon déjà partagée et
testée via `IndicateurService`/`DossiersExport`/`ReportingFilter`, communs aux deux formats d'export.

## DT-32 — Phase 13 : audit de traçabilité et politique de conservation (RG-11)

**Méthodologie de l'audit.** Extraction par grep de tous les identifiants `EX-*`/`RG-*`/`RGI-*`
cités dans `docs/exigences-fonctionnelles.md` et `docs/regles-metier.md`, recoupée avec une
recherche des mêmes identifiants littéraux dans `tests/`. Chaque « absence » a ensuite été triée
manuellement en trois catégories : (a) faux négatif — comportement déjà couvert mais sous un titre
de test qui ne cite pas l'identifiant à l'identique (ex. `EX-REP-02/03` ne matche pas un grep sur
`EX-REP-03` seul — corrigé par relecture, aucune action de code) ; (b) comportement réellement non
testé ; (c) comportement réellement non implémenté. Deux lacunes réelles ont été trouvées par cette
méthode, absentes de toute recherche par mots-clés fonctionnels classique car aucun code ne les
mentionnait déjà :

**RG-09 — Déclaration « Autre » non routée vers le Service MGP/DADD.** `DeclarationService::
affecterAutomatiquement()` routait toute déclaration selon son parcours (`ROLES_AFFECTATION_
AUTOMATIQUE`), sans jamais distinguer la catégorie « Autre » (`categories.is_autre`) — alors que
RG-09 exige explicitement ce routage par défaut. **Décision** : une branche minimale sur
`$dossier->categorie->is_autre` route vers `['service_mgp']` avant la résolution habituelle par
parcours ; aucune autre structure existante modifiée. RGI-13 (le délai de l'« Autre » suit le délai
du parcours d'origine, pas un délai dédié) était en revanche déjà satisfait sans code
supplémentaire : `DelaiService` indexe `sla_delais` uniquement par `parcours_id`, jamais par
catégorie — seul un commentaire a été ajouté pour l'expliciter.

**RG-11 — Politique de conservation des données, absente à 100 %.** Aucune trace (`archiver`,
`anonymiser`, rétention, `contentieux`) n'existait nulle part dans `app/` avant cette phase. Le CDC
laisse plusieurs points d'interprétation ouverts, tranchés comme suit :

- **Périmètre : uniquement `date_cloture IS NOT NULL`.** RG-11 parle de dossiers « clôturés ». Un
  dossier `Rejeté` n'a pas de `date_cloture` (seul `DossierWorkflowService::cloturer()` la renseigne,
  jamais `rejeter()`) et n'entre donc jamais dans le périmètre d'archivage/anonymisation — cohérent
  avec DT-31 Question 3, qui exclut déjà les rejetés du « délai moyen de traitement » pour la même
  raison. Étendre le périmètre aux dossiers rejetés aurait nécessité de modifier `rejeter()` pour lui
  donner une date de référence, une extension non demandée par le CDC.
- **« Anonymisation » plutôt que « suppression ».** Le CDC évoque un cycle de vie se terminant par
  une suppression des données personnelles, jamais par la suppression du dossier lui-même (RG-03 :
  aucune suppression possible ; RG-12 : les statistiques agrégées doivent rester calculables sans
  limite de durée). **Décision** : seule la ligne `declaration_identites` est supprimée (`->delete()`
  sur la relation `identite`) ; la ligne `dossiers` survit indéfiniment, marquée `anonymise_le`.
- **Borne haute de la fourchette CDC (« 5 à 10 ans ») retenue pour l'anonymisation.** Choix identique
  au précédent établi en DT-23 pour les délais maximaux ambigus : en cas de fourchette, la
  borne la plus protectrice pour les droits du déclarant (ici, conserver plus longtemps avant
  suppression) est retenue par défaut, à charge pour la DPO de resserrer si besoin via configuration
  future.
- **`contentieux` : nouveau champ booléen, seul mécanisme d'exception « sauf contentieux » du CDC.**
  Aucune structure existante ne permettait d'honorer cette exception explicitement requise par RG-11.
  Ajout minimal (`dossiers.contentieux`, défaut `false`) plutôt qu'une table séparée : un seul bit
  d'état, jamais historisé au-delà de ce que le journal d'audit (Phase 11) capture déjà automatiquement
  via `DossierObserver` (aucun code d'audit dédié nécessaire — la colonne est un champ `dossiers`
  comme un autre pour l'observer générique).
- **Seul le rôle `dpo` peut poser/lever ce blocage.** Permission `rgpd.conservation.manage`, déjà
  présente dans `RolePermissionSeeder` depuis la Phase 2 (prévue mais jamais consommée par aucune UI
  jusqu'à cette phase) — confirmé qu'aucun autre rôle ne la porte avant d'exposer le contrôle dans
  `DossierDetailPage`.
- **Cadence mensuelle de la commande planifiée** (`dossiers:appliquer-politique-conservation`, le 1er
  de chaque mois à 02h00, `routes/console.php`) : les seuils se comptant en mois/années, une
  vérification quotidienne n'apporterait aucune réactivité utile — cohérent avec le raisonnement déjà
  appliqué à `CalculerStatistiquesMensuelles` (DT-28).

## DT-33 — Phase 14 : audit de sécurité, mêmes méthodes que DT-32

Même démarche qu'en Phase 13, appliquée cette fois à `docs/exigences-securite.md` et
`docs/exigences-audit.md` plutôt qu'aux exigences fonctionnelles : relecture systématique de
chaque contrôle listé, vérification de sa présence effective dans le code. La majorité des
contrôles étaient déjà en place, construits au fil des phases précédentes plutôt que reportés à
une phase dédiée (rate limiting des déclarations et de `/suivi` dès la Phase 4/9, validation
`finfo` des pièces jointes dès la Phase 5, `ExportPolicy` en Phase 12, etc. — cf. DT-14, DT-28).
Quatre lacunes réelles ont été trouvées et corrigées :

**1. DT-06 (interdiction de l'auto-affectation) documentée en Phase 6 mais jamais codée.**
`AffectationService::reaffecter()` n'appliquait aucune vérification empêchant de désigner le
déclarant identifié du dossier comme son propre traitant — la règle existait uniquement en
commentaire d'intention dans `decisions-techniques.md`. **Décision** : garde-fou ajouté
uniquement dans `reaffecter()` (la désignation manuelle et délibérée d'une personne précise),
pas dans `DeclarationService::affecterAutomatiquement()` (qui notifie l'ensemble des détenteurs
d'un rôle, un mécanisme de portée différente — l'exclure risquerait de laisser un dossier sans
aucun affecté automatique si le déclarant est l'unique détenteur actif de ce rôle, une régression
non demandée par DT-06). Le déclarant est également retiré de la liste déroulante
`DossierDetailPage::utilisateursDisponibles` pour ne pas présenter une option qui échouerait de
toute façon côté serveur.

**2. Messagerie sécurisée publique non soumise à un débit contrôlé.** `exigences-securite.md` §4
liste explicitement « envoi de message via la messagerie sécurisée » parmi les actions publiques à
throttler, au même titre que la soumission de déclaration et `/suivi` — seules ces deux dernières
l'étaient. **Décision** : même mécanisme que DT-14 (`RateLimiter` interne au composant, car les
interactions Livewire transitent par un endpoint partagé que le throttling de route ne peut pas
cibler), appliqué uniquement à la branche non authentifiée de `MessagerieDossier::envoyer()` — un
agent interne authentifié, déjà soumis à `MessagePolicy`, n'a pas besoin de cette limite
supplémentaire.

**3. Adresse IP du journal d'audit visible par `service_mgp`, contrairement à `exigences-audit.md`
§5.** Ce document restreint explicitement la consultation de l'IP/user-agent de soumission au
DPO/Auditeur, « jamais visible par les rôles de traitement métier » — mais `AuditLogViewer`
affichait `ip_address` à quiconque porte `audit.view`, ce qui inclut `service_mgp`. **Décision** :
nouvelle méthode `peutVoirAdresseIp` (via `hasAnyRole(['dpo', 'auditeur'])`) conditionnant
l'affichage dans la vue — le reste du journal (action, modèle, valeurs) reste visible à
`service_mgp` comme prévu par `exigences-audit.md` §4, seule l'IP est concernée par cette
restriction plus étroite.

**4. Tentatives échouées sur `/suivi` non journalisées.** `exigences-securite.md` §4 exige que le
verrouillage après N échecs soit « journalisé pour l'auditeur/DPO » — le `RateLimiter` bloquait
déjà les tentatives excessives, mais aucune ligne `audit_logs` n'était créée. **Décision** : chaque
échec (pas seulement le déclenchement du verrouillage) écrit une ligne `suivi.tentative_echouee`
via `AuditLogger`, contenant uniquement la référence tentée — jamais le code d'accès saisi, qui
resterait exploitable par un attaquant relisant le journal. L'IP est déjà capturée automatiquement
par `AuditLogger::enregistrer()` pour toute ligne créée hors console, et reste soumise à la même
restriction de consultation que le point 3 ci-dessus.

**Durcissement additionnel (hors lacune identifiée, standard OWASP générique).** Un middleware
global `SetSecurityHeaders` ajoute `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` et
`Referrer-Policy: strict-origin-when-cross-origin` à toute réponse — aucun de ces en-têtes n'est
spécifique à une règle métier du CDC (`exigences-securite.md` §5 renvoie génériquement à l'OWASP
Top 10 sans lister d'en-têtes précis), il s'agit d'un contrôle technique de référence largement
consensuel plutôt que d'une règle métier inventée.

## DT-34 — Phase 15 : performance & optimisation

Le plan à 17 phases (prompt original) n'étant plus accessible en contexte à ce stade (compaction de
session) et ne figurant dans aucun fichier du dépôt, le contenu exact de cette phase a été confirmé
avec l'utilisateur plutôt que deviné : Performance & Optimisation.

**1. Index manquants sur `investigations.dossier_id` et `actions_correctives.dossier_id`.**
PostgreSQL, contrairement à MySQL/InnoDB, n'indexe jamais automatiquement une colonne de clé
étrangère — seule la contrainte `REFERENCES` est créée par `foreignUlid()->constrained()`. Les
tables sœurs (`historique_statuts`, `messages`, `dossier_affectations`) ont toutes un index
explicite sur `dossier_id` depuis leur création (Phase 2) ; ces deux-là l'avaient omis, alors
qu'elles sont interrogées par `dossier_id` à chaque chargement de la fiche dossier
(`InvestigationPanel`, `ActionCorrectivePanel`). Migration additive dédiée plutôt que modification
des migrations d'origine (déjà exécutées en production potentielle, cf. discipline établie depuis
la Phase 2 de ne jamais réécrire une migration déjà livrée).

**2. `DelaiService` : cache mémoire de `sla_delais`, service enregistré en singleton.**
`DossierListPage::joursRestants()` appelle `DelaiService::joursRestants()` une fois par ligne de
la page (jusqu'à 20 dossiers), chaque appel interrogeant `sla_delais` via `delaiConfigure()` — un
N+1 direct. **Décision** : `sla_delais` n'est modifiable par aucune interface d'administration
(seedée une fois, jamais exposée en CRUD, contrairement aux autres référentiels de la Phase 10) —
un cache mémoire de la table entière (une vingtaine de lignes) pour la durée de vie du service est
donc sans risque de désynchronisation. Pour que ce cache survive entre les appels
`app(DelaiService::class)` répétés (un nouveau `app()` recrée normalement une instance à chaque
appel), le service est enregistré en singleton dans `AppServiceProvider::register()` — sans
conséquence indésirable puisque `DelaiService` ne porte aucun autre état mutable dépendant d'une
requête particulière.

**3. Cache à courte durée (5 min) des référentiels du formulaire public de déclaration.**
`Categorie`/`NiveauGravite` sont interrogées à chaque chargement de `DeclarationFormBase` — la
page la plus exposée de l'application (publique, sans authentification, potentiellement le plus
fort trafic de tout le dispositif, CDC §9). Contrairement à `sla_delais`, ces tables **sont**
modifiables via l'administration (Phase 10, `CategoriesAdmin`) : une invalidation explicite câblée
dans chaque action d'écriture aurait été plus précise, mais aurait dispersé la responsabilité du
cache dans un fichier d'une autre phase pour un gain marginal. **Décision** : fenêtre de 5 minutes
(`Cache::remember`, store configuré par `CACHE_STORE`) plutôt qu'une invalidation explicite — un
ajout/retrait de catégorie met au plus 5 minutes à apparaître sur le formulaire public, un
compromis jugé largement acceptable pour des référentiels qui changent au rythme de
l'administration, pas de la session utilisateur. Le code ne présume d'aucun store particulier : le
gain croît avec un store dédié (Redis/Memcached) en production sans changement de code, le store
`database` par défaut restant déjà un net progrès face à une jointure Eloquent répétée.

**Périmètre volontairement exclu.** `DelaiService::dateDebutEtape()` interroge `historique_statuts`
une fois par dossier affiché sur `DossierListPage` (jusqu'à 20 requêtes/page) — un N+1 réel mais
plus modeste : chaque requête cible une colonne indexée (`dossier_id` + `created_at`, Phase 2) et
un dossier n'accumule typiquement que quelques transitions. Un préchargement en lot aurait exigé de
restructurer l'API de `DelaiService` (accepter une collection de dossiers plutôt qu'un dossier
unique) pour un gain marginal aux volumes attendus — reporté plutôt que construit par précaution
(cf. consigne générale de ne pas concevoir pour des besoins hypothétiques).
