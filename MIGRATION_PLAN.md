# Plan de migration — EI-MGP : Laravel 12 → Next.js

Document de référence de la migration. **À maintenir à jour à chaque étape** : il est la seule
mémoire durable du projet de migration (les décisions prises en conversation se perdent).

---

## 1. Principe directeur

L'application Laravel **reste en service et fait autorité** jusqu'à la bascule finale. Elle n'est
pas seulement un point de départ : c'est la **spécification exécutable** de la cible.

Baseline figée : commit `f371aae`, tag **`baseline-laravel`** — 295 tests verts (670 assertions),
Larastan niveau 5 sans erreur, Pint propre.

> Toute divergence de comportement constatée pendant la migration se tranche en faveur du
> comportement Laravel de cette baseline, sauf décision explicite documentée ici.

---

## 2. Architecture actuelle (source)

Laravel 12 / PHP 8.4 · PostgreSQL 18 · Livewire 4 · Tailwind 4 · Pest 3 · Larastan L5

Application de **Mécanisme de Gestion des Plaintes** : déclaration et traitement d'Événements
Indésirables et de griefs sur **4 parcours** (EI Employé, Grief Employé, Grief Sous-traitant,
Grief Communauté).

| Élément | Nombre |
|---|---|
| Fichiers PHP applicatifs | 107 |
| Composants Livewire | 20 |
| Services métier | 13 |
| Policies | 6 (+1 via `Gate::define`) |
| Enums PHP backed | 12 |
| Events / Listeners | 4 / 6 |
| Commandes planifiées | 5 |
| Tables métier / total | 27 / 35 |
| Rôles / permissions | 15 / 34 |
| Tests | 295 (61 fichiers) |

**Aucun Controller CRUD, aucune API REST.** Tout passe par des composants Livewire *stateful*
côté serveur : les ~60 opérations métier sont des méthodes de composants, pas des routes HTTP.

Couches strictes, respectées sans exception :

```
Composant Livewire (UI + état)  →  jamais de logique métier
Service applicatif (13)         →  point d'entrée UNIQUE de chaque opération
Policy                          →  autorisation, toujours revérifiée serveur
Eloquent / PostgreSQL
```

---

## 3. Architecture cible

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui ·
React Hook Form + Zod · Prisma 7 · PostgreSQL (**la même base**)

L'application Next.js vit dans **`web/`**, sous-dossier du dépôt Laravel, afin de conserver la
référence exécutable en parallèle. Le `package.json` racine reste celui de Vite/Laravel.

```
web/src/
├── app/{(public),(auth),(app)}/     # App Router
├── server/
│   ├── services/                    # portage 1:1 des 13 services Laravel
│   └── authz/                       # permissions, rôles, scope parcours, policies
├── actions/                         # Server Actions (≈60)
├── lib/{prisma.ts,validations/}
├── components/{ui,forms,tables,layout}/
└── types/
web/prisma/schema.prisma             # introspecté, jamais migré
jobs/                                # 5 tâches planifiées (worker externe)
```

---

## 4. Mapping des concepts

| Laravel | Next.js |
|---|---|
| `routes/web.php` | App Router (arborescence `app/`) |
| Composant Livewire (état serveur) | React Server/Client Component + Server Action |
| Action Livewire (`submit()`…) | Server Action |
| Service applicatif | `server/services/*` (portage direct) |
| Policy | `server/authz/policies/*` |
| Permission Spatie | `server/authz/permissions.ts` |
| Middleware `auth`/`permission:` | `proxy.ts` (redirection seule) + vérification serveur dans chaque page/action |
| Form Request / `$this->validate()` | Schéma Zod |
| Eloquent | Prisma Client |
| Migration Laravel | **Aucune** — schéma introspecté depuis la base existante |
| Observer Eloquent | Extension Prisma / appel explicite en service |
| Event + Listener | Appel direct en service (ou file d'attente) |
| Scheduler + Queue | Worker externe (cron système / Vercel Cron) |
| Blade | React + Tailwind + shadcn/ui |
| Enum PHP backed | Union TypeScript / enum Prisma |

---

## 5. Règles métier à préserver — non négociables

Source : `docs/regles-metier.md` (RG-01→15, RGI-01→13), `docs/exigences-*.md`,
`docs/decisions-techniques.md` (DT-01→34).

Les plus critiques, à vérifier explicitement à chaque module :

| Règle | Exigence |
|---|---|
| **RG-06** | Anonymat total : aucune donnée d'identité collectée, stockée ou affichée. Garantie **structurelle** (la ligne `declaration_identites` n'existe pas), pas seulement applicative. |
| **RG-03** | Aucune suppression de dossier. Toutes les FK métier sont en `RESTRICT`, aucun `deleted_at` nulle part. |
| **RG-04** | Historique et journal d'audit **inaltérables** (append-only, aucune voie d'update/delete). |
| **RG-07** | Réouverture réservée à `service_mgp` / `dg`, motif obligatoire. |
| **RG-08** | Circuit accéléré (gravité Critique) déclenché **en synchrone**, jamais via une file. |
| **RG-10** | Clôture bloquée tant qu'une action corrective est ouverte ou son efficacité non vérifiée. |
| **RG-14** | Données nominatives restreintes par rôle ; exports non nominatifs **par défaut**. |
| **DT-02** | `administrateur_digital` n'a **aucun** accès aux dossiers. |
| **acteurs.md** | `comite_ethique` voit les dossiers **sans données nominatives**. |
| **DT-06** | Un utilisateur ne peut jamais être affecté traitant de son propre dossier. |

> ⚠️ **RG-06 est une propriété de sûreté, pas une fonctionnalité.** Il s'agit d'un dispositif de
> signalement : une réidentification expose des personnes réelles à des représailles. Une
> régression ici ne produit pas un bug visible mais une fuite silencieuse.

---

## 6. Journal des étapes

### ✅ Étape 0 — Stabilisation de l'existant (commit `f371aae`, tag `baseline-laravel`)

- Refonte UI produite hors session intégrée à la baseline (documentée dans
  `docs/page-redesign-map.md`, `docs/design-system-v2.md`, `docs/uiux-redesign.md`).
- **Défaut corrigé** : `DashboardConsolide::updated()` accédait aux *computed properties* Livewire
  depuis l'intérieur de la classe. Le correctif a révélé le vrai défaut sous-jacent — les lignes de
  `selectRaw()+groupBy()` ne sont pas des modèles et leurs colonnes agrégées n'existent sur aucun
  modèle. Introduction du DTO typé `App\Support\LigneHistoriqueMensuel`.
- **Test corrigé** : le test de cache DT-34 dépendait implicitement du rendu du formulaire complet ;
  le wizard ne rendant plus que l'étape courante, il mesurait un premier chargement au lieu du cache.
  Le cache lui-même était correct — aucune régression de production.
- Résultat : 295/295 tests, Larastan vert, Pint vert, arbre git propre.

### ✅ Étape 1 — Socle Next.js + Prisma introspecté

- Next.js 16.3.4 · React 19.2.8 · Tailwind 4 · TypeScript 5, dans `web/`.
- **Prisma épinglé en 7.10.0 (stable)** : `npm install prisma` installait `8.0.0-rc.12`, publiée
  sous le tag `latest` alors que **7.10.0 est la ligne stable** (tag `prev`). L'installation était
  en outre incohérente (client 7 stable / CLI 8 RC). Les deux sont désormais épinglés en `7.10.0`.
- Introspection **non destructive** (`prisma db pull`) de la base réelle : **35 modèles**.
- Vérification en lecture seule contre la base réelle : relations traversées correctement, ULID
  26 caractères préservés, RBAC conforme au seeder Laravel (15 rôles, 34 permissions, 84
  associations).
- `next build`, `tsc --noEmit` et `eslint` verts.

#### Changements de rupture Prisma 7 rencontrés

| Rupture | Résolution |
|---|---|
| `datasource.url` refusé dans `schema.prisma` | URL déplacée dans `prisma.config.ts` |
| `.env` plus chargé automatiquement | `process.loadEnvFile()` (natif Node ≥ 20.12) |
| `PrismaClient` exige un *driver adapter* | `@prisma/adapter-pg` + `new PrismaPg({ connectionString })` |

### ✅ Étape 2 — Couche d'autorisation

Port de la couche d'autorisation en fonctions pures et testables, sous `web/src/server/authz/` :
34 permissions, 15 rôles, cloisonnement par parcours (`RoleParcoursScope`) et les 6 policies.
19 tests verts, dont un **test de parité qui compare le portage au contenu réel de la base**
(permissions, rôles, associations rôle × permission).

**Décision — authentification : Auth.js v5, Credentials + stratégie JWT.**
Un adaptateur base de données exigerait des tables `Session`/`Account`/`VerificationToken`
inexistantes, ce qu'interdit la règle « ne jamais migrer cette base » ; Lucia est abandonné
depuis 2025. La stratégie JWT n'exige aucune table nouvelle.
**Le jeton ne portera que l'identité** : rôles et permissions sont résolus depuis la base à
chaque vérification (`chargerUtilisateurAutorise`), exactement comme spatie/laravel-permission.
Un changement de rôle ou une désactivation prend donc effet immédiatement, sans attendre
l'expiration du jeton.

**Décision — les tests d'autorisation sont écrits à l'étape 2, pas reportés à l'étape 13.**
L'authz est le chemin critique : tous les modules s'appuient dessus. Empiler du code non vérifié
dessus reviendrait à propager une erreur d'autorisation dans toute l'application.

#### Deux constats de sécurité

**1. La base de dev avait dérivé du seeder (corrigé).** Le test de parité a détecté 84
associations en base contre 86 dans `RolePermissionSeeder` : `service_mgp` n'avait pas
`audit.view` (ajouté en Phase 11) et `auditeur` n'avait pas `dossiers.view.all`. Le seeder fait
autorité (couvert par `RolePermissionSeedingTest`, vert) — la base n'avait simplement pas été
re-seedée. Corrigé par `php artisan db:seed --class=RolePermissionSeeder` (idempotent :
`firstOrCreate` + `syncPermissions`, n'affecte ni les dossiers ni `model_has_roles`).
→ **Conséquence : dans l'application Laravel de dev, l'auditeur ne voyait pas tous les dossiers.**

**2. `users.actif` ne bloque RIEN dans Laravel (divergence assumée).** Il n'existe aucune
personnalisation d'authentification (`Fortify::authenticateUsing` absent) : `actif` ne sert qu'à
filtrer les *destinataires* d'affectation et de notification. **Un utilisateur désactivé peut
donc toujours se connecter et conserve l'intégralité de ses droits.**
→ Le portage Next.js **refusera la connexion et l'autorisation** si `actif = false`. Divergence
délibérée par rapport à la baseline, consignée ici : reproduire un contournement de désactivation
sur un dispositif de signalement serait indéfendable. `UtilisateurAutorise` porte déjà le champ
`actif` à cette fin ; l'application effective se fera à l'étape 3 (authentification).

### ✅ Étape 3 — Authentification

Auth.js v5 (Credentials + JWT), vérification bcrypt contre les hachages Laravel existants,
limitation de débit, page de connexion, déconnexion, et pont session → autorisation.
**31 tests verts.**

Vérifié de bout en bout sur le serveur réel : trois comptes existants se connectent **sans
réinitialisation de mot de passe**, et leurs droits sont résolus correctement —
`administrateur_digital` obtient 4 permissions et **aucun parcours** (DT-02 respecté),
`auditeur` les 4 parcours, `service_mgp` ses 23 permissions. Un mauvais mot de passe ne crée
aucune session ; `/dashboard` et `/` redirigent vers `/login` sans session.

| Point | Décision |
|---|---|
| `middleware.ts` **déprécié en Next.js 16** | Renommé `src/proxy.ts`. Il ne fait qu'une redirection de confort : **aucun accès base**, la doc précisant qu'il peut être déployé en CDN. L'autorisation réelle est refaite dans chaque page/action. |
| `unauthorized()` / `forbidden()` | **Écartés** : encore expérimentaux en 16 (`experimental.authInterrupts`). La couche de sécurité ne doit pas dépendre d'une API instable. `redirect('/login')` (stable) reproduit d'ailleurs exactement le comportement Laravel pour un invité ; un 403 lève `ErreurAutorisation`, dont le rendu sera traité à l'étape 4. |
| `AUTH_URL` obligatoire | Auth.js v5 rejette les hôtes non déclarés (`UntrustedHost`, protection contre l'injection d'en-tête `Host`). Configuré explicitement plutôt que de désactiver le contrôle via `trustHost`. |
| Réinitialisation de mot de passe | **Non encore portée** — nécessite une décision sur l'envoi d'e-mails. La table `password_reset_tokens` existe déjà. À traiter avant la bascule (fonctionnalité Laravel existante, donc à ne pas perdre). |

#### Défaut corrigé : les rôles n'étaient jamais résolus

`const MODEL_TYPE_USER = 'App\Models\User'` (antislashs simples) vaut en réalité
**`AppModelsUser`** en JavaScript : `\M` et `\U` ne sont pas des séquences d'échappement
valides, et les antislashs sont supprimés **silencieusement**, sans la moindre erreur. La
comparaison avec `model_has_roles.model_type` échouait donc toujours : **tout utilisateur se
retrouvait sans aucun rôle ni permission** — l'application était intégralement verrouillée, de
la façon la plus discrète possible.

Les tests de policy ne l'avaient pas vu : ils utilisent une fabrique en mémoire et
n'atteignent jamais la base. Seule la connexion réelle l'a révélé. Corrigé par `String.raw`, et
couvert désormais par `chargement.test.ts`, qui charge un compte réel depuis la base.

> Leçon retenue pour la suite : tout portage d'une valeur littérale contenant des antislashs
> (noms de classes PHP, expressions régulières) doit passer par `String.raw` et être couvert par
> un test touchant la base — un test en mémoire ne peut pas détecter ce type d'erreur.

### ✅ Étape 4 — Design system et layouts

shadcn/ui installé, palette **SODECI** appliquée, coquille du back-office (barre latérale +
en-tête + tiroir mobile), frontières d'erreur, page de connexion reprise.

L'identité visuelle n'est pas réinventée : elle reprend `docs/visual-direction.md` et
`docs/design-system-v2.md` — **Option A** (vert SODECI `#00A651` primaire, navy secondaire,
orange accent), échelles complètes, échelle typographique nommée, Instrument Sans + Source Serif 4.
Ce qui est modernisé, c'est l'exécution : composants accessibles, icônes Lucide (Laravel
recopiait ses SVG à la main, limite relevée par `docs/audit-frontend-2026-08-29.md`).

**Pas de mode sombre**, conformément à la décision argumentée de `visual-direction.md`. Le bloc
`.dark` est retiré, mais `@custom-variant dark` est **conservé volontairement** : lié à une classe
jamais posée, il neutralise le `prefers-color-scheme` par défaut de Tailwind — sans lui, un
visiteur en mode sombre système recevrait les styles `dark:` des composants shadcn alors que les
tokens resteraient clairs.

Navigation portée fidèlement depuis `layouts/app.blade.php`, avec ses conditions d'affichage.
Vérifié sur le serveur réel : `administrateur_digital` ne voit **ni Dossiers ni Audit** (DT-02
respecté jusque dans l'interface), l'auditeur ni Investigations ni Actions, `service_mgp` tout.
Masquer un lien reste un confort — chaque page refera sa propre vérification serveur.

#### Défaut évité : le 403 n'aurait fonctionné qu'en développement

`exigerPermission()` levait `ErreurAutorisation`, que `error.tsx` reconnaissait par `error.name`.
Or **Next.js retire `name` et `message` des erreurs serveur en production** (pour éviter les
fuites) : la frontière aurait affiché « une erreur est survenue » au lieu de « accès refusé »,
uniquement en production — l'environnement où le défaut est le plus coûteux à diagnostiquer.
Corrigé : `exigerPermission()` redirige vers `/acces-refuse`, comportement identique en
développement et en production. `error.tsx` est recentré sur les pannes techniques.

> Divergence assumée : Laravel répond en HTTP 403, ici l'utilisateur est redirigé vers une page
> de refus explicite. L'accès est bloqué de la même façon ; seule la présentation diffère.

#### Note d'API

Cette version de shadcn/ui repose sur **Base UI**, pas Radix : la composition polymorphe s'écrit
`render={<Link />}` et non `asChild`. Vérifié empiriquement plutôt que supposé.

### ✅ Étape 5a — Module Déclaration : services métier et validations

Le module Déclaration est le plus vaste et le plus sensible du projet. Il est livré en deux
temps : **5a les services métier et les validations** (où vivent les règles), **5b les
formulaires** (4 parcours, wizard, page de suivi).

Portés dans `web/src/server/services/declaration/` : génération de référence (RG-01), code
d'accès (RG-02), pièces jointes (RGI-04), et l'orchestrateur `creerDeclaration()`. Schémas Zod
dans `web/src/lib/validations/declaration.ts`. **55 tests verts** (24 nouveaux).

| Règle | Vérification |
|---|---|
| **RG-01** | Format `{PRÉFIXE}-{ANNÉE}-{NNNNNN}`, un préfixe par parcours, séquence incrémentée indépendamment par parcours. |
| **RG-02** | Code à 6 chiffres vérifiable, **jamais stocké en clair** — seul le haché bcrypt est persisté. |
| **RG-06** | Aucune ligne `declaration_identites` créée si anonyme, **même lorsqu'une identité est fournie** ; aucun compte rattaché même si le déclarant était connecté. |
| **RG-04** | Entrée d'historique initiale systématique. |
| **RG-08** | Gravité Critique signalée pour déclenchement synchrone du circuit accéléré. |
| **RG-09** | Catégorie « Autre » orientée vers `service_mgp`, et **pas** vers les rôles de captage du parcours. |
| **RGI-01/02** | Date des faits jamais postérieure à aujourd'hui (le jour même reste accepté) ; description ≥ 20 caractères. |
| **RGI-04** | 5 fichiers / 50 Mo, type réel revérifié sur les octets d'en-tête. |
| **RG-15** | Consentement RGPD bloquant pour le seul parcours Sous-traitant. |
| **DT-14** | Champ piège et délai minimal de remplissage. |

#### Points d'implémentation

- **ULID en minuscules** : Laravel (`HasUlids`) produit des identifiants minuscules ; la
  bibliothèque `ulid` génère en majuscules. Sans conversion, les identifiants des deux
  applications auraient différé de casse dans la même colonne.
- **Verrou `FOR UPDATE`** : Prisma ne l'expose pas, la génération de référence passe donc par une
  requête brute. Sans ce verrou, deux déclarations simultanées sur un même parcours liraient la
  même dernière référence et tenteraient d'écrire le même numéro.
- **Type MIME réel** vérifié sur les octets d'en-tête (`file-type`), équivalent du `finfo` de PHP :
  le type annoncé par le navigateur n'est jamais une preuve suffisante.
- **Notifications non branchées** : `creerDeclaration()` retourne `estCritique` plutôt que
  d'émettre un évènement. Le module Notifications arrive à l'étape 9 — c'est une dépendance
  réelle, pas un raccourci.
- **Tests écrivant réellement en base** : seule façon de vérifier la transaction, le verrou de
  séquence et l'affectation automatique. Chaque dossier créé est supprimé en fin de test, et
  l'état de la base a été vérifié identique avant/après. La suppression n'existe QUE dans ces
  utilitaires de test — l'application n'expose aucune voie de suppression (RG-03).

### ✅ Étape 5b — Module Déclaration : formulaires publics et suivi

Les 4 formulaires publics (wizard en 4 étapes), le récépissé, la page de suivi `/suivi` et la
redirection QR `/q/[token]`. **69 tests verts** (14 nouveaux).

**Une configuration déclarative plutôt que 4 formulaires.** Les 4 parcours partagent la même
mécanique (wizard, anonymat, anti-spam, téléversement) et ne diffèrent que par leurs champs.
`parcours-config.ts` les décrit une seule fois, et cette même source alimente **le rendu ET la
validation Zod** : décrire les champs deux fois garantirait qu'ils divergent. Le portage littéral
des 4 composants Livewire aurait quadruplé la mécanique commune.

Vérifié sur serveur réel — chaque parcours rend bien ses champs propres : `directionId` pour
l'EI Employé, `ancienneteAnnees` pour le Grief Employé, `consentementRgpd` + `entreprise` pour le
seul Sous-traitant (RG-15), `localite` + `statutPlaignant` pour la Communauté.

**RGI-03** (masquage des champs d'identité en anonyme) est verrouillé par des tests couvrant les
4 parcours, en complément de la garantie structurelle côté service. Seule exception documentée :
`statutPlaignant` qualifie la plainte, pas la personne.

**Page de suivi (EX-NOT-06, RGI-12)** : référence + code d'accès uniquement. Verrouillage sur
l'IP **et** sur la référence visée — sans le second, un attaquant distribué contournerait la
limite par IP. Message d'échec unique quel qu'en soit le motif, et chaque échec journalisé pour
l'auditeur/DPO avec la seule référence tentée, jamais le code saisi. Le déclarant ne voit que le
statut **affiché** (RGI-10/11), jamais le statut interne.

#### Trois corrections en cours de route

- **Pages pré-rendues en statique.** `generateStaticParams` figeait catégories et niveaux de
  gravité — pourtant administrables — ainsi que l'horodatage anti-robot, à la compilation. Rendu
  dynamique forcé, comme Laravel qui lit ces référentiels à chaque requête.
- **Horodatage anti-robot impur.** `Date.now()` pendant le rendu d'un composant serveur viole la
  règle de pureté React. Déplacé au montage côté client : cela mesure d'ailleurs plus fidèlement
  le temps d'ouverture réel du formulaire. Contrepartie assumée — la valeur devient forgeable,
  mais le champ piège et la limitation de débit restent vérifiés côté serveur.
- **Coût bcrypt en test.** Un test créant 4 déclarations dépassait le délai imparti : bcrypt au
  coût 12 est volontairement lent. `BCRYPT_ROUNDS` est désormais configurable et abaissé à 4 en
  test **uniquement** — exactement ce que fait le `phpunit.xml` de Laravel. La suite est passée de
  42 s à 6,6 s, sans rien affaiblir en production (défaut inchangé à 12).

#### Contrôle ajouté par rapport à Laravel

La Server Action vérifie que la **catégorie soumise appartient bien au parcours** de la
déclaration. Sans ce contrôle, un identifiant forgé rattacherait une déclaration à la catégorie
d'un autre parcours. Le formulaire Livewire ne présentait que les catégories du parcours, mais ne
revalidait pas cette appartenance à la soumission.

### ✅ Étape 6a — Module Dossiers : workflow, affectation et délais

Portés dans `web/src/server/services/dossier/` : machine à états (`workflow.ts`), réaffectation
(`affectation.ts`), suivi des délais (`delais.ts`). **80 tests verts** (11 nouveaux).

| Règle | Vérification |
|---|---|
| **EX-GES-04** | Graphe de transitions respecté ; toute transition hors graphe refusée. |
| **RG-04** | Entrée d'historique pour chaque transition, avec son auteur et son commentaire. |
| **RG-10** | Clôture bloquée tant qu'une action corrective est ouverte **ou** son efficacité non vérifiée ; possible dès que les deux conditions sont levées. |
| **RG-07** | Réouverture possible uniquement depuis « Clôturé », motif obligatoire. |
| **EX-GES-03** | Réaffectation : motif obligatoire, titulaire précédent désactivé, type tracé. |
| **DT-06** | Le déclarant identifié ne peut pas être affecté à son propre dossier — et n'est pas proposé dans la liste. |
| **DT-04** | Un délai non validé par le métier ne produit aucune échéance. |

#### 🔴 Défaut majeur trouvé dans la baseline Laravel — corrigé (commit `d38368c`)

`DossierWorkflowService::cloturer()` **ne renseignait jamais `dossiers.date_cloture`**, alors que
DT-31 affirme explicitement le contraire. Trois fonctionnalités en dépendent et étaient donc
silencieusement inopérantes :

1. `IndicateurService::delaiMoyenJours()` — délai moyen de traitement toujours nul.
2. `StatistiqueMensuelleService` — délais archivés toujours nuls.
3. **`PolitiqueConservationService` (RG-11)** — archivage et anonymisation ne se seraient
   **jamais** déclenchés : la politique de conservation des données personnelles était
   entièrement inerte.

Le défaut était latent (aucune clôture n'a encore eu lieu en base) et **invisible pour les 295
tests** : chacun de ceux qui ont besoin de `date_cloture` la posait lui-même par `update()`,
si bien qu'aucun n'exerçait le chemin de production. C'est l'angle mort classique d'un test qui
fabrique son entrée au lieu de la faire produire par le code testé.

> Leçon : lorsqu'un champ est écrit par un service et lu par un autre, au moins un test doit
> traverser les deux — un test qui pose la valeur à la main ne prouve rien sur son producteur.

#### Observation annexe

`historique_statuts.created_at` est en `timestamp(0)` — précision à la seconde. Trier
l'historique par cette seule colonne (ce que fait `DossierDetailPage` côté Laravel) départage
arbitrairement des entrées créées dans la même seconde. Sans conséquence fonctionnelle, mais
l'ordre d'affichage de la frise peut varier ; le portage trie par `id`, strictement croissant.

### ✅ Étape 6b — Module Dossiers : liste filtrable et fiche

Liste `/dossiers` (filtres, pagination), fiche `/dossiers/[id]` et ses 5 actions de gestion.
**87 tests verts** (7 nouveaux).

#### Le test qui compte : périmètre de liste ≡ policy

Le périmètre de la liste (clause SQL) et `peutVoirDossier()` (prédicat) sont **deux
implémentations de la même règle**. Rien ne les empêche structurellement de diverger — et une
divergence signifierait qu'une liste affiche un dossier que la fiche refuse, ou l'inverse. Un
test les croise donc sur des dossiers réels, pour six rôles différents.

Vérifié en conditions réelles, sur le même dossier Grief Communauté :

| Compte | Liste | Accès direct |
|---|---|---|
| `service_mgp` (transversal) | 10 dossiers, 4 parcours | **200** |
| `secretaire_csst` (EI seul) | 7 dossiers, **EI uniquement** | **404** |
| `administrateur_digital` | **redirigé** (DT-02) | **404** |

**404 et non 403, délibérément** : sur un dispositif de signalement, distinguer « interdit » de
« inexistant » révèle l'existence d'un dossier. `chargerFiche()` retourne `null` dans les deux
cas.

#### Autres points

- **L'identité n'est pas chargée** pour un rôle qui n'y a pas droit (`comite_ethique`), elle
  n'est pas seulement masquée à l'affichage : ce qui n'atteint jamais le composant ne peut pas
  fuiter par un oubli de condition.
- **Chaque Server Action revérifie l'autorisation** au moment de l'exécution, même quand
  l'interface a déjà masqué la commande.
- **Validation réelle du statut soumis** au lieu d'un cast : TypeScript a signalé qu'un
  `as StatutCode` sur une valeur de formulaire était un mensonge — une chaîne forgée serait
  passée jusqu'au service.
- **État des filtres dans l'URL**, pas dans le composant : un filtre appliqué reste partageable
  et survit à un rechargement.

### ✅ Étape 7 — Module Investigations

Service `web/src/server/services/investigation/` (ouverture, mise à jour, soumission,
validation) et panneau intégré à la fiche dossier. **95 tests verts** (8 nouveaux).

| Règle | Vérification |
|---|---|
| **EX-INV-01** | Ouverture possible uniquement sur un dossier « En investigation ». |
| **RGI-05** | Date d'ouverture jamais antérieure à la recevabilité du dossier. |
| **EX-INV-02/03/04** | Constats, causes et recommandations, modifiables tant que « en cours ». |
| **EX-INV-04** | Soumission refusée sans recommandations — elles sont la source des actions correctives. |
| **RGI-06 / EX-INV-05** | La validation ne peut **jamais** être faite par l'enquêteur lui-même. |

#### Deux points de conception

- **La date de recevabilité réutilise `dateDebutEtape()`** du module Délais plutôt que d'être
  recalculée. Deux définitions de la même date finiraient par diverger, et RGI-05 dépend
  entièrement de cette définition.
- **Les policies s'évaluent côté serveur**, et le composant client ne reçoit que des booléens
  déjà calculés (`peutModifier`, `peutValider`). Il ne dispose jamais de quoi les recalculer —
  en particulier RGI-06, dont la vérification exige de comparer l'enquêteur à l'utilisateur
  courant.

Le test d'ouverture amène le dossier à « En investigation » par de **vraies transitions** et non
par un statut forcé en base : RGI-05 s'appuie sur `historique_statuts`, qu'un raccourci laisserait
vide — le test passerait alors sans rien prouver.

### ✅ Étape 8 — Module Actions correctives

Service `web/src/server/services/action-corrective/` et panneau intégré à la fiche dossier.
**106 tests verts** (11 nouveaux).

| Règle | Vérification |
|---|---|
| **EX-ACT-01** | Création seulement sur dossier « Action corrective en cours » ; rattachement possible aux seules investigations **validées**. |
| **EX-ACT-02** | Responsable et échéance obligatoires. |
| **EX-ACT-03** | Graphe d'avancement respecté ; recalcul des retards. |
| **EX-ACT-04** | Vérification d'efficacité seulement une fois l'action réalisée. |
| **RGI-07** | Échéance strictement postérieure à la date de création. |
| **RGI-08** | Commentaire obligatoire pour une vérification **positive** — pas pour une négative. |
| **RGI-09** | Clôture seulement après vérification positive. |
| **EX-ACT-05 / DT-27** | Le dossier avance automatiquement à « Résolu » quand la **dernière** action est close — déclenché ici, jamais par une tâche planifiée. |

#### Points de vigilance traités

- **Le recalcul des retards ne touche jamais une action « réalisée »** : son échéance est
  derrière elle, mais le travail est fait — la marquer en retard serait faux. Un test le vérifie
  explicitement.
- **Rattachement d'investigation filtré sur le dossier parent** : sans ce filtre, un identifiant
  forgé rattacherait une action à l'investigation d'un autre dossier.
- **Défaut évité à la relecture** : la liste des responsables réutilisait les utilisateurs
  chargés pour la *réaffectation*, qui n'est peuplée que si l'utilisateur détient
  `dossiers.reassign`. Un rôle pouvant créer une action sans ce droit aurait obtenu une liste
  vide. Les deux listes sont désormais chargées indépendamment, chacune selon sa propre
  permission.
- La transition automatique vers « Résolu » est testée sur **deux** actions : la première
  clôture ne doit rien déclencher, la seconde doit faire avancer le dossier.

### ✅ Étape 9a — Notifications : service, destinataires et évènements

Service piloté par gabarit, résolution des destinataires, et branchement des trois évènements
métier. **114 tests verts** (8 nouveaux).

| Règle | Vérification |
|---|---|
| **EX-NOT-01** | Notification aux titulaires à l'affectation. |
| **EX-NOT-02 / RGI-10** | Notification au déclarant **identifié** à chaque changement de statut, avec le libellé **affiché** — jamais le libellé interne. |
| **RG-08 / EX-NOT-05** | Circuit accéléré déclenché **en synchrone** à la soumission d'une déclaration Critique, avec la matrice de destinataires du CDC §6.5. |
| **audit §2** | Chaque envoi audité : évènement, canal, destinataire. |
| **audit §5 / RG-06** | Le **contenu n'est jamais journalisé** pour un dossier anonyme — le journal ne doit pas devenir une voie de réidentification. |
| **DT-28** | Destinataires e-mail supplémentaires du gabarit (hors RBAC). |

#### Décisions de portage

- **Le déclenchement vit dans les SERVICES, pas dans les Server Actions.** Une notification
  oubliée dans une action passerait inaperçue ; RG-08 exige une garantie, pas une convention.
  C'est l'équivalent des évènements Eloquent émis dans les services Laravel.
- **Notification après commit, jamais dedans.** Notifier à l'intérieur de la transaction
  enverrait des messages pour une opération qui peut encore être annulée. `appliquerTransition()`
  **retourne** le libellé affiché plutôt que de le stocker dans un état de module — première
  version écartée car un état mutable partagé est fragile en concurrence.
- **Envoi « best effort »** : un échec de notification ne doit jamais annuler l'opération métier.
  Perdre une notification est regrettable ; perdre une déclaration ne l'est pas.
- **Lignes `notifications` au format Laravel** (`type`, `notifiable_type`, `data` JSON) : les deux
  applications restent capables de lire la même boîte pendant la migration.
- **Transport e-mail abstrait, journal par défaut** — la baseline Laravel tourne en
  `MAIL_MAILER=log`. ⚠️ Aucun e-mail ne quitte le serveur tant qu'un transport réel n'est pas
  branché (risque ouvert n° 12).

Les tests créent **leurs propres gabarits** : la base de développement n'en contient aucun, et
dépendre d'un jeu de données préexistant les rendrait muets sans le signaler.

---

### ✅ Étape 9b — Messagerie sécurisée, tâches planifiées et centre de notifications

**Livré** — 133 tests, `typecheck`, `lint` et `build` au vert ; base de développement
strictement identique avant/après (10 dossiers, 32 historique, 161 audit_logs, 0 notification,
0 message ; séquence de références rétablie à `EI-2026-000007`).

| Fichier | Rôle |
|---|---|
| `server/services/messagerie/messagerie.ts` | Envoi, liste, marquage lu (EX-NOT-07) |
| `server/services/notification/taches-planifiees.ts` | Relance J-3, escalade (EX-NOT-03/04) |
| `server/services/notification/boite.ts` | Boîte de réception « outil » |
| `server/auth/session-suivi.ts` | Authentification du déclarant par cookie signé |
| `(public)/suivi/{messagerie-actions,panneau-messagerie}` | Messagerie déclarant |
| `(app)/dossiers/[id]/{messagerie-actions,panneau-messagerie}` | Messagerie acteur |
| `components/layout/cloche-notifications.tsx` | Centre de notifications (en-tête) |

#### La session de suivi : ce qui remplace la session Laravel

Laravel s'appuyait sur `session('suivi_verifie_'.$id)`. Next.js n'a pas de session serveur : le
jeton est donc un **cookie signé HMAC** portant uniquement l'identifiant du dossier prouvé et une
date d'expiration (30 min), `httpOnly`, jamais lu ni écrit par le client.

Trois propriétés, chacune couverte par un test :

- **Aucun compte n'y figure.** Un déclarant anonyme dialogue sans que son identité existe nulle
  part (RG-06). Y attacher un `user_id` « par commodité » détruirait la garantie.
- **Il est infalsifiable.** Sans signature, remplacer l'identifiant dans le cookie ouvrirait la
  messagerie de n'importe quel dossier sans en connaître le code d'accès.
- **Il ouvre UN dossier**, celui dont la référence et le code viennent d'être prouvés.

Le portillon a été vérifié **en requête HTTP réelle** contre le serveur de développement, pas
seulement en test unitaire : sans cookie, avec un cookie falsifié et avec un cookie expiré,
l'accès est refusé ; avec un cookie légitime, la conversation est renvoyée.

⚠️ **Non vérifié de bout en bout** : le chemin d'**envoi** d'un message déclarant n'a pas pu être
appelé en HTTP direct (l'encodage multipart de `useActionState` embarque l'état précédent et
n'est pas reproductible à la main sans navigateur). Il partage exactement le même portillon
`dossierDeLaSessionSuivi()` que le chemin de lecture, qui lui est prouvé, et la propriété RG-06
— `expediteur_user_id` forcé à NULL — est prouvée par test contre la base réelle. Une passe
manuelle au navigateur reste à faire avant bascule.

#### 🔴 Troisième défaut latent dans la baseline Laravel : `notification_templates` était VIDE

Après `sla_delais` (étape 9a) et `date_cloture` (étape 6a), voici la troisième occurrence du même
angle mort — et la plus grave. La table `notification_templates` ne contenait **aucune ligne**.

Conséquence dans l'application Laravel en service : `NotificationService` ne trouvait jamais de
gabarit actif, et **aucune notification n'était jamais émise**, sur aucun canal. Ni l'e-mail
d'affectation, ni la mise à jour de statut au déclarant, ni la relance J-3, ni l'escalade, ni
l'alerte du circuit critique (RG-08). Le centre de notifications de Laravel était par
construction toujours vide. EX-NOT-01 à 05 étaient intégralement inopérants.

`NotificationTemplateSeeder` n'utilise que `updateOrCreate` — aucune suppression, aucun
`truncate` : il a été exécuté sans risque pour les données. **17 gabarits** (7 « outil »,
10 « email »), 7 évènements couverts.

#### Le même angle mort, trois fois : les tests qui fabriquent leurs propres données

> *Un test qui fabrique son entrée ne teste jamais le producteur de cette entrée.*

`date_cloture` (chaque test posait la date lui-même), `sla_delais` (`seedReferentiels()` par
test), `notification_templates` (les tests créent leurs gabarits). À chaque fois, la suite est
verte et la donnée de référence peut manquer indéfiniment en base sans que rien ne le signale.

**Contre-mesure retenue** : `chargement.test.ts` et `parite-laravel.test.ts` valident déjà l'état
réel de la base, pas seulement le comportement du code. À étendre à chaque table de référentiel
à l'étape 11.

#### Effet de bord du peuplement : hygiène des tests renforcée

Une fois les gabarits présents, toute déclaration ou tout changement de statut effectué par un
test émet de **vraies** notifications. Deux conséquences traitées :

1. **Assertions rendues spécifiques.** Compter les lignes `notification.envoyee` d'un dossier ne
   distinguait plus la relance des notifications d'affectation : les tests filtrent maintenant
   par `evenement_code`.
2. **Nettoyage global ajouté** (`vitest.setup.mts`). Les lignes `notifications` (non rattachées à
   un dossier) et `audit_logs` (append-only, sans clé étrangère vers `dossiers`) survivaient à la
   suppression des dossiers de test et désignaient des dossiers inexistants. Un repère pris avant
   chaque fichier délimite ce que la campagne produit ; seul cela est supprimé — le journal
   d'audit réel n'est jamais touché.

   ⚠️ **10 lignes `notification.envoyee` orphelines** subsistent d'une exécution antérieure à ce
   correctif. Elles référencent des dossiers de test supprimés. Non supprimées : effacer des
   lignes d'audit relève d'une décision explicite.

#### Test de relance J-3 : la prémisse était fausse, pas le code

Le premier test affirmait qu'un dossier fraîchement affecté n'est pas relancé. Une fois
`sla_delais` peuplée, il a échoué : `grief_employe`/`analyse_preliminaire` vaut **3 jours
ouvrés**, donc un tel dossier est légitimement à J-3 et la relance part — correctement.

Le délai étant en jours **ouvrés**, sa conversion en jours calendaires dépend du jour de la
semaine : coder une valeur en dur rendrait le test vert ou rouge selon la date d'exécution. Le
test mesure donc le reste réel puis assère l'**invariant** — `relance ⟺ restants === 3` — et un
second cas couvre le sens inverse sur une échéance largement dépassée.

---

### ✅ Étape 10 — Reporting, indicateurs et exports

**Livré** — 159 tests, `typecheck`, `lint` et `build` au vert ; base de développement identique
avant/après.

| Fichier | Rôle |
|---|---|
| `server/services/reporting/filtre.ts` | Filtre unique du module (EX-REP-02) |
| `server/services/reporting/indicateurs.ts` | 7 indicateurs agrégés en SQL (EX-REP-03) |
| `server/services/reporting/statistiques-mensuelles.ts` | Archivage mensuel + historique (EX-REP-05) |
| `server/services/reporting/export.ts` | Lignes d'export et colonnes (EX-REP-04/06) |
| `server/services/reporting/classeur.ts` | Classeur `.xlsx` (exceljs) |
| `server/services/reporting/document-pdf.tsx` | Rapport PDF (@react-pdf/renderer) |
| `app/api/exports/dossiers/route.ts` | Téléchargement, autorisations revérifiées |
| `(app)/dashboard/{page,filtres,boutons-export}` | Tableau de bord consolidé (EX-REP-01) |

#### Parité vérifiée chiffre par chiffre contre Laravel

Les deux implémentations ont été exécutées sur la **même base**, et comparées :

```
total 10 · résolution 10 % · clôture 0 % · délai —
parcours  EI(7) Communauté(1) Employé(1) Sous-traitant(1)
statut    Affecté(6) En investigation(1) En attente(2) Résolu(1)
gravité   Faible(3) Modéré(2) Élevé(2) Critique(3)
```

Sortie **identique** des deux côtés sur les 7 indicateurs. C'est la vérification la plus directe
possible d'un port de calcul : pas une relecture du code, une confrontation des résultats.

`délai moyen = —` parce qu'aucun dossier de la base ne porte de `date_cloture` : conséquence
directe du défaut corrigé à l'étape 6a, aucun dossier n'ayant été clôturé depuis.

#### RG-14 / EX-REP-06 vérifié en HTTP réel, pas seulement en test

`docs/exigences-securite.md` §6 exige qu'« aucun paramètre d'URL ne permette de forcer
l'inclusion de données nominatives sans revérification côté serveur ». Vérifié avec trois comptes
réels contre le serveur de développement :

| Compte | Requête | Résultat |
|---|---|---|
| aucun | `?format=xlsx` | 307 vers `/login` (proxy) |
| cookie de session contrefait | `?format=xlsx` | **401** — la garde de la route, que le proxy ne peut pas rendre |
| `correspondant_mgp` | `?format=xlsx` | **403** |
| `service_mgp` | `?format=xlsx` | 200, 8 colonnes |
| `service_mgp` | `?nominatif=1` | 200, **11 colonnes** |
| `dg` | `?nominatif=1` | 200, **8 colonnes** — le paramètre est ignoré |

Le fichier du DG est **strictement identique** à un export non nominatif : ni colonne, ni valeur.
La donnée n'est même pas lue — la jointure `declaration_identites` est conditionnée à
l'autorisation, si bien qu'un oubli d'affichage ne pourrait pas la divulguer.

#### Ajout par rapport à Laravel : traçabilité de l'export nominatif

La baseline ne journalise aucun export. Or c'est la seule voie par laquelle des données
personnelles quittent le système, et le DPO doit pouvoir savoir qui a extrait quoi.
`rapport.export_nominatif` est donc écrit dans `audit_logs` — **uniquement** pour un export
réellement nominatif : un export anonyme ne sort aucune identité. Les paramètres reçus y sont
consignés en entier, y compris ceux qui ont été refusés.

Non listé dans `docs/exigences-audit.md` §2 : ajout assumé, à valider.

#### Remplacements de bibliothèques

| Laravel | Next.js | Note |
|---|---|---|
| `maatwebsite/excel` | `exceljs` 4.4.0 | Vrai `.xlsx` (signature ZIP vérifiée en test), pas un CSV renommé |
| `barryvdh/laravel-dompdf` | `@react-pdf/renderer` 4.9.0 | Mise en page **réécrite** : dompdf part d'un gabarit Blade, react-pdf compose en React |
| Chart.js | CSS pur | Barres proportionnelles rendues côté serveur — même lecture, sans dépendance de graphique, lisible sans JavaScript et à l'impression |

`exceljs` introduit `uuid < 11.1.1` (avis modéré : contrôle de bornes manquant sur `buf` en
v3/v5/v6). **Non atteignable** : exceljs n'appelle que `uuid.v4()`, sans argument `buf`, dans un
seul module d'extension de mise en forme conditionnelle. Vérifié dans le code installé, pas
supposé. Même traitement que `mysql2` (risque n° 7).

#### Points d'implémentation

- **Le filtre est unique.** Tableau de bord, indicateurs et exports partagent le même objet : si
  l'export traduisait les filtres à sa façon, un rapport pourrait ne pas correspondre à l'écran
  et l'écart serait indétectable. Les liens d'export recopient les paramètres d'URL courants.
- **Borne de fin inclusive.** `whereDate(..., '<=', fin)` de Laravel compare des DATES : un `lte`
  sur un timestamp exclurait tout ce qui a été soumis après minuit. La borne est portée à
  23:59:59.999.
- **`Prisma.sql` pour la seule requête brute.** Aucune API d'agrégat de Prisma ne sait soustraire
  deux dates. Les valeurs du filtre passent en paramètres liés ; seuls les noms de colonnes sont
  des littéraux écrits dans le code.
- **Archivage mensuel non réinscriptible.** Un mois déjà archivé n'est jamais recalculé — un test
  ajoute un dossier après coup et vérifie que la valeur publiée ne bouge pas.
- **Pas de compteur « dossiers en retard » global** sur le tableau de bord : le calcul d'échéance
  interroge `historique_statuts` dossier par dossier, et l'exécuter sur tout le périmètre à
  chaque chargement de la page la plus visitée créerait un vrai N+1. Il faudrait une colonne
  recalculée, sur le modèle de `actions_correctives.statut`.

#### Observation : `statistiques_mensuelles` est vide

Zéro ligne en base. Contrairement aux trois cas précédents, ce n'est **pas** un défaut : cette
table est alimentée par une commande planifiée (`CalculerStatistiquesMensuelles`), et aucun
ordonnanceur n'a jamais été mis en place. L'historique mensuel du tableau de bord est donc
légitimement vide tant que l'étape 12 n'a pas branché les tâches planifiées.

---

### ✅ Étape 11 — Administration des référentiels

**Livré** — 186 tests, `typecheck`, `lint` et `build` au vert. Les 7 consoles de la baseline sont
portées : comptes, catégories, statuts, sites, canaux, gabarits de notification, QR codes.

| Fichier | Rôle |
|---|---|
| `server/services/audit/journal.ts` | Écriture d'audit, format Laravel (`modele.verbe` + différentiel) |
| `server/services/administration/referentiels.ts` | Catégories, statuts, sites, canaux, gabarits |
| `server/services/administration/qr-codes.ts` | Génération, retrait, rendu SVG |
| `server/services/administration/utilisateurs.ts` | Comptes, rôles, mot de passe initial |
| `(app)/administration/*` | 7 écrans + éditeur de référentiel commun |
| `server/auth/hachage.ts` | Hachage bcrypt compatible PHP |

#### 🔴 Défaut que j'avais introduit à l'étape 5a : le hachage bcrypt était illisible par Laravel

En voulant documenter que `bcryptjs` et PHP sont interchangeables, je l'ai vérifié — et c'était
**faux**.

```
Hash::check('...', '$2b$04$...')
→ RuntimeException: This password does not use the Bcrypt algorithm.
```

`bcryptjs` écrit `$2b$` ; PHP ne reconnaît que `$2y$`, et Laravel refuse tout le reste. Or
`AccessCodeService::verifier()` utilise `Hash::check`. Conséquence, tant que les deux
applications cohabitent :

- **tout code d'accès** produit par Next aurait été définitivement invérifiable côté Laravel —
  un déclarant n'aurait plus pu consulter son propre dossier depuis l'application en service ;
- **tout compte** créé depuis la console d'administration n'aurait pas pu s'y connecter.

L'algorithme et le coût sont pourtant identiques : seul l'en-tête de format diffère. Le hachage
passe désormais par `server/auth/hachage.ts`, qui réécrit le préfixe en `$2y$` — vérifié dans les
deux sens contre le PHP du projet, et figé par un test.

**Aucune donnée n'était corrompue** : les 10 dossiers et les 6 comptes de la base portent tous des
empreintes `$2y$` produites par Laravel. Le défaut était latent, il se serait manifesté à la
première déclaration réellement déposée via Next.

Ce que cet épisode montre : mes tests hachent et vérifient **du même côté**. Ils ne pouvaient pas
détecter une incompatibilité qui n'existe qu'au passage de la frontière entre les deux
applications. Même famille d'angle mort que les référentiels manquants (risque n° 15).

#### 🔴 Quatrième défaut latent de la baseline : `url_cible` n'est lu par rien

`QrCodesAdmin` propose de modifier l'URL cible d'un QR code, affiche « URL cible mise à jour », et
son docblock annonce que cela « permet de réorienter un QR physique déjà imprimé sans le
régénérer ».

Or `QrCodeRedirectController` ne lit jamais cette colonne : il recalcule la destination à partir
de `parcours.code`. **Modifier l'URL cible n'a donc aucun effet.** Le test Pest existant
(`QrCodesAdminTest`) n'assère que l'écriture en base, jamais la redirection — encore une fois, le
test vérifie l'écriture, pas le comportement.

Le portage **reproduit le comportement** (rien ne disparaît) mais **cesse de mentir** : l'écran
indique que la valeur est documentaire. Rendre la redirection effective serait un changement de
sémantique à part entière — et créerait une redirection ouverte pilotée depuis
l'administration : à décider explicitement, pas à glisser dans une migration.

#### ⚠️ Ma propre erreur : 17 lignes d'audit détruites

Le nettoyage de mes nouveaux tests supprimait des lignes d'`audit_logs` en filtrant sur le seul
`auditable_id`. Cette colonne est un texte **partagé par tous les modèles** : « 34 » y désigne
aussi bien une catégorie qu'une investigation. Les identifiants de mes catégories et comptes de
test ont donc collisionné avec de vraies lignes.

**17 lignes d'audit de la baseline ont été supprimées** (`audit_logs` : 161 → 144). Elles sont
**irrécupérables** : ni sauvegarde dans le projet, ni archivage WAL (`archive_mode = off`).

C'est une atteinte à une table que le cahier des charges désigne comme strictement en ajout seul,
causée par mon propre code de test — pas par l'application, dont aucun chemin ne supprime d'audit.

**Correctif structurel** : `nettoyerAudit(auditableType, ids)` dans `aide-base.ts` rend le type
obligatoire dans la signature ; un nettoyage non typé n'est plus exprimable. Vérifié : la suite
complète laisse désormais `audit_logs` à 144 avant et après.

#### Décisions de portage

- **Aucune suppression, nulle part.** Un test structurel échoue si une fonction dont le nom
  évoque une suppression apparaît un jour dans le module des référentiels.
- **Statuts et canaux en modification seule.** `code` est la colonne pivot du graphe de
  transitions (statuts) et une énumération du CDC §6.7 (canaux).
- **Éditeur de référentiel commun** aux cinq écrans de même forme : les écrire cinq fois
  multiplierait les endroits où l'absence de suppression peut diverger.
- **Journal d'audit au format Laravel** — `auditable_type` porte le nom de classe PHP, l'action
  suit `modele.verbe`, et seuls les champs réellement modifiés sont consignés. La console d'audit
  de Laravel lit donc ces lignes à l'identique.
- **`password` exclu de l'audit** au même titre que `remember_token` et `access_code_hash` :
  jamais d'empreinte dans un champ JSON, même hachée.
- **Mot de passe initial** généré aléatoirement, renvoyé une seule fois dans l'état de l'action,
  jamais persisté en clair ni journalisé.

#### DT-02 vérifié en HTTP réel

La séparation « paramétrage technique » / « référentiel métier » n'est pas seulement documentée :

| Compte | `/administration/utilisateurs` | `/administration/categories` |
|---|---|---|
| `administrateur_digital` | **200** | **307 → /acces-refuse** |
| `service_mgp` | **307 → /acces-refuse** | **200** |
| `correspondant_mgp` | 307 → /acces-refuse | 307 → /acces-refuse |

Le sommaire n'affiche que les entrées accessibles : comptes, canaux et QR codes pour
l'administrateur ; catégories, statuts, sites et gabarits pour le Service MGP ; aucune pour un
rôle de traitement.

#### Non porté, volontairement

`docs/exigences-audit.md` §2 cite les **niveaux de gravité** parmi les référentiels administrables,
mais la baseline n'a **aucun écran** pour eux (`NiveauGravite` est bien observé pour l'audit, sans
console associée). Rien n'est donc porté : inventer un écran absent du CDC sortirait du périmètre
d'une migration. À arbitrer.

---

### ✅ Étape 12 — Audit, RGPD et tâches planifiées

**Livré** — 204 tests, `typecheck`, `lint` et `build` au vert ; base de développement identique
avant/après (`audit_logs` : 144 → 144).

| Fichier | Rôle |
|---|---|
| `server/services/audit/consultation.ts` | Lecture du journal, pagination, filtres |
| `(app)/audit/{page,filtres}` | Console d'audit, lecture seule |
| `server/services/rgpd/conservation.ts` | Archivage, anonymisation, blocage contentieux (RG-11) |
| `server/services/taches/registre.ts` | Les 5 tâches planifiées |
| `app/api/taches/[tache]/route.ts` | Déclencheur externe protégé |

#### Le point dur : Next.js n'a pas d'ordonnanceur

Laravel déclare `Schedule::command(...)->daily()` dans `routes/console.php` et s'appuie sur un
`php artisan schedule:run` lancé par le cron système. Rien d'équivalent ici.

Les 5 tâches sont donc exposées par `POST /api/taches/{nom}`, appelé par un ordonnanceur
**externe** (cron système, Vercel Cron, ordonnanceur d'entreprise). C'est une différence
d'exploitation, pas de comportement — mais elle est structurante : **sans ce déclencheur câblé,
aucune relance ne part, aucun retard n'est détecté, aucune donnée n'est anonymisée.** À faire
avant la bascule.

RG-08 n'est pas concerné : le circuit critique est synchrone à la soumission.

#### Sécurité du déclencheur — vérifiée en HTTP réel

Cette route exécute des traitements de masse, dont l'anonymisation définitive de données
personnelles. Elle n'a pas de session utilisateur : sa seule protection est un secret partagé.

| Requête | Résultat |
|---|---|
| `GET` | **405** — un GET serait déclenchable par un préchargement ou un robot |
| `POST` sans jeton | **401** |
| `POST` jeton erroné | **401** |
| `POST` jeton correct, tâche inconnue | **404** |
| `POST` jeton correct | **200**, exécutée, tracée |

Et en test, les configurations dégradées : `TACHES_SECRET` absent → **503**, secret de moins de
32 caractères → **503**. La route **échoue fermée**, jamais ouverte. Un préfixe correct du secret
est refusé comme n'importe quel jeton faux (comparaison à temps constant).

`src/proxy.ts` a dû être ajusté : sans cela il redirigeait le cron vers `/login` avant que la
route ne soit atteinte. `/api/taches` y figure désormais — non parce qu'il serait public, mais
parce qu'il porte une authentification **plus stricte** que la présence d'un cookie.

#### RG-11 — ce que fait exactement l'anonymisation

- **La ligne `dossiers` n'est jamais supprimée.** Seule `declaration_identites` disparaît. RG-03
  interdit la suppression, RG-12 exige que les statistiques agrégées restent calculables sans
  limite de durée.
- **Périmètre `date_cloture IS NOT NULL`.** Un dossier rejeté n'y entre jamais (DT-32).
- **Le blocage « contentieux » n'expire pas.** Testé à vingt ans : le dossier reste intact, il est
  compté, jamais traité. Seul le DPO peut le lever.
- **Le journal ne recopie pas l'identité au moment de l'effacer** — seul le NOMBRE de lignes
  retirées y figure. Consigner la valeur reviendrait à la déplacer dans l'audit plutôt qu'à la
  supprimer, et l'audit se conserve plus longtemps que la donnée.

Le verrou « contentieux » manquait au portage : `fiche.ts` lisait la colonne, mais aucune commande
ne permettait de la basculer. Sans lui, la tâche RG-11 aurait anonymisé des dossiers que le DPO
entendait protéger. Ajouté sur la fiche dossier, réservé à `rgpd.conservation.manage`.

#### Audit §5 — restriction d'origine vérifiée dans le rendu

L'IP et le user-agent peuvent réidentifier un déclarant anonyme. `service_mgp` a `audit.view`
sans avoir droit à ces colonnes.

| Rôle | `/audit` | Colonne « Origine » | Adresse dans le HTML |
|---|---|---|---|
| `auditeur` | 200 | présente | présente |
| `service_mgp` | 200 | **absente** | **absente** |
| `correspondant_mgp` | 307 → /acces-refuse | — | — |

La donnée n'est pas masquée à l'affichage : elle n'est **pas lue** — le `select` Prisma est
conditionné à l'autorisation. Un oubli de rendu ne pourrait donc pas la divulguer.

#### Ajout par rapport à Laravel : traçabilité des exécutions

`tache.executee` et `tache.echouee` sont écrits dans `audit_logs` à chaque passage. La baseline
n'en garde aucune trace : une tâche qui échoue chaque nuit y est indiscernable d'une tâche qui
n'a rien à faire. Comme `rapport.export_nominatif` (risque n° 16), cet ajout n'est pas listé dans
`docs/exigences-audit.md` §2 — à valider.

---

### ✅ Étape 13 — Non-régression : les 67 exigences

**Livré** — 232 tests, `typecheck`, `lint` et `build` au vert ; base de développement identique
avant/après.

Méthode reprise de DT-32, que le projet a lui-même documentée : extraction des identifiants
`EX-*` / `RG-*` / `RGI-*` des documents d'exigences, recoupement automatique avec ce que citent
les tests et le code du portage, puis **tri manuel** de chaque absence.

**Point de départ : 25 identifiants sans test citant.** Point d'arrivée : **0**.

| Catégorie | Nombre | Traitement |
|---|---|---|
| Faux négatifs — comportement couvert, notation qui échappe à la recherche | 9 | Titre de test corrigé |
| Réellement non testés | 15 | Tests ajoutés |
| Réellement non implémentés | 1 | **Fonctionnalité portée** |

#### 🔴 Une fonctionnalité manquait au portage : la saisie relais

`EX-DEC-10` et `RG-13` ne référençaient rien, ni dans les tests ni dans le code : la route
`/relais/{parcours}` de Laravel n'avait **pas été portée**. C'est exactement ce que la consigne
« aucune fonctionnalité existante ne doit disparaître » interdit, et cela n'aurait été visible
qu'à l'usage — un agent relais n'aurait eu aucune entrée dans l'application.

Portée à l'identique : accès réservé à `dossiers.create`, canal d'origine obligatoire parmi
`ligne_verte` / `boite_suggestions` / `agent_local`, et l'agent tracé comme **téléverseur**,
jamais comme déclarant.

Le cœur de la soumission a été extrait dans `server/services/declaration/soumission.ts`, partagé
par les deux voies. Ce n'est pas une commodité : RG-13 exige que la déclaration relayée suive
**exactement** le même workflow. Deux implémentations finiraient par diverger, et la divergence
porterait sur des règles de sûreté. Seules deux choses diffèrent, et elles sont explicites — le
canal, et le fait que les protections anti-robot ne s'appliquent qu'au canal public (un agent
authentifié saisit parfois plusieurs déclarations d'affilée).

Vérifié en HTTP réel : sans session → `/login` ; `service_mgp` et `auditeur` → `/acces-refuse`
(aucun compte de démo ne porte `dossiers.create`) ; avec le rôle `agent_relais` attribué
temporairement → 200, sélecteur de canal rendu avec ses 3 options. Le rôle a été retiré ensuite,
`model_has_roles` revenu à 6.

#### Deux tests dont la prémisse était fausse

Même schéma qu'à l'étape 9b — le code avait raison, mon test avait tort :

- **EX-NOT-02** : j'attendais une notification de changement de statut sur un dossier anonyme.
  Il n'y a personne à qui écrire — `declarantIdentifie()` renvoie une liste vide. Le test assère
  désormais les deux sens, et le cas anonyme devient une **garantie d'anonymat vérifiée** plutôt
  qu'un échec.
- **EX-GES-05** : j'utilisais « trop court » comme synthèse invalide. La chaîne fait exactement
  10 caractères, soit la borne du service — le test aurait été vert sans rien prouver.

#### Un constat opérationnel : les délais d'EI Employé ne sont pas validés

Sur `ei_employe` — le parcours majoritaire (7 des 10 dossiers) — trois étapes sur quatre portent
`est_valide_metier = false` : `analyse_preliminaire`, `traitement_enquete`,
`mise_en_oeuvre_mesures`. Seule la clôture (6 mois) est validée.

Ce n'est **pas un défaut** : ce sont les cellules « à valider » du CDC (§1.8 point 4), et DT-04
prescrit qu'un délai provisoire ne déclenche aucune escalade. Mais la conséquence mérite d'être
dite : **sur ce parcours, aucune échéance n'est calculée, aucune relance J-3 ne part et aucune
escalade ne se produit** tant que le métier n'a pas arrêté ses valeurs. Un test fige désormais ce
comportement dans les deux sens, pour qu'il reste un choix et non une surprise.

#### Ce que « 0 identifiant restant » signifie — et ce que cela ne signifie pas

Les 67 exigences sont désormais citées par un test. C'est une traçabilité, **pas une preuve de
couverture fonctionnelle exhaustive** : 9 des identifiants ont été résolus en corrigeant un titre
de test, sans nouvelle assertion — parce que le comportement était réellement couvert sous un
autre nom, ce qui a été vérifié cas par cas avant d'annoter.

Trois exigences restent couvertes de façon **structurelle** plutôt que comportementale, faute de
pouvoir exécuter une Server Action hors requête HTTP : `EX-NOT-06` et `RGI-12` (la page de suivi
n'interroge que la référence, jamais l'e-mail ni le téléphone) et `EX-DEC-05` (liste des routes
publiques). Ces tests lisent le source plutôt que d'exercer le comportement — ils détectent une
régression d'écriture, pas une régression d'exécution. La passe manuelle au navigateur avant
bascule reste nécessaire (risque n° 14).

---

### 🟡 Étape 14 — Préparation de la bascule (le retrait de Laravel n'est PAS fait)

**Livré** — 235 tests, `typecheck`, `lint` et `build` au vert. Tout le pré-requis non destructif
de la bascule est en place. **Aucun fichier Laravel n'a été supprimé** : cela demande votre
validation explicite, et l'inventaire ci-dessous existe pour que vous puissiez la donner en
connaissance de cause.

#### 🔴 Cinquième défaut latent : la réinitialisation de mot de passe est inatteignable

`config/fortify.php` active `Features::resetPasswords()`, et `php artisan route:list` confirme les
quatre routes (`forgot-password`, `reset-password`). Mais :

- `FortifyServiceProvider` n'enregistre que `Fortify::loginView()` — ni
  `requestPasswordResetLinkView`, ni `resetPasswordView`. Les routes rendraient une vue nulle.
- `resources/views/auth/` ne contient que `login.blade.php`.
- La page de connexion ne comporte **aucun lien** « mot de passe oublié ».

La fonctionnalité est donc déclarée mais inutilisable. Il n'y avait rien à « ne pas faire
disparaître ».

**Traitement retenu.** Un parcours en libre-service serait de toute façon inopérant sans transport
e-mail (risque n° 12). Le manque est comblé là où il fonctionne aujourd'hui : la console des
comptes permet de **réattribuer un mot de passe**, affiché une seule fois, jamais persisté en
clair ni journalisé — même schéma que la création de compte. Refusé sur un compte désactivé :
réattribuer un mot de passe à un accès coupé donnerait l'illusion d'un accès rétabli.

Le parcours en libre-service reste ouvert (risque n° 10), désormais conditionné au seul transport
e-mail.

#### Documentation livrée

`web/README.md` et `web/ARCHITECTURE.md`, demandés au §19 du cahier de migration et jamais écrits
jusqu'ici. Le README porte les avertissements d'exploitation (base partagée, tests écrivant en
base, tâches à câbler) ; ARCHITECTURE explique les principes — l'autorisation refaite côté
serveur, la donnée non autorisée jamais chargée, les contraintes héritées du schéma Laravel, et
les trois règles de test nées des défauts trouvés en chemin.

#### Ce que le retrait de Laravel supprimerait

| Dossier | Fichiers | Lignes PHP |
|---|---|---|
| `app/` | 113 | 7 608 |
| `resources/` | 63 | 3 647 |
| `tests/` (61 fichiers Pest) | 63 | 4 808 |
| `database/` | 65 | 2 543 |
| `config/` | 15 | 2 635 |
| `routes/`, `bootstrap/`, `public/` | 17 | 589 |
| `vendor/` | 66 paquets | — |

**Trois éléments méritent une décision séparée du reste :**

1. **`database/migrations/` (31 fichiers) est la SOURCE du schéma.** Prisma ne fait qu'introspecter
   la base ; il n'existe aujourd'hui aucune autre définition du schéma. Les supprimer laisserait
   une base sans historique de structure et sans moyen de la recréer. **Recommandation : les
   conserver, même après retrait du reste**, ou porter les migrations vers Prisma avant.
2. **`database/seeders/` (12 fichiers) est la SOURCE des référentiels.** Trois d'entre eux ont
   déjà servi à réparer des tables vides pendant cette migration. Aucun équivalent n'existe côté
   Next.
3. **`tests/` (61 fichiers, 4 808 lignes) encode des cas limites que les 235 tests du portage ne
   reproduisent pas tous.** Tant que Laravel tourne, ils restent exécutables et constituent un
   filet indépendant.

Le reste — `app/`, `resources/`, `config/`, `routes/`, `bootstrap/`, `public/`, `vendor/` — peut
être retiré une fois la bascule validée en production.

#### Conditions à remplir AVANT la bascule

| # | Condition | État |
|---|---|---|
| 1 | Ordonnanceur externe câblé sur `/api/taches/*` | ❌ Non fait — sans lui, aucune relance, aucune escalade, aucune anonymisation |
| 2 | `TACHES_SECRET` provisionné (32 caractères minimum) | ❌ À faire en production |
| 3 | Transport e-mail réel branché | ❌ Non fait — les envois sont journalisés, pas expédiés |
| 4 | Limitation de débit sur magasin partagé | ❌ En mémoire — contournable en multi-instances |
| 5 | Sauvegardes et archivage WAL | ❌ `archive_mode = off`, aucune sauvegarde |
| 6 | Délais métier arrêtés sur `ei_employe` | ❌ Trois étapes sur quatre non validées |
| 7 | Passe manuelle au navigateur (envoi de message déclarant, saisie relais complète) | ❌ À faire |
| 8 | Arbitrage sur `url_cible` des QR codes | ❌ En attente |
| 9 | Décision sur les niveaux de gravité administrables | ❌ En attente |
| 10 | Validation des trois ajouts d'audit hors CDC | ❌ En attente |

**Aucune de ces dix conditions n'est remplie à ce jour.** Les six premières sont bloquantes au
sens strict : sans elles, le portage fonctionne en démonstration mais pas en service.

---

### ✅ Étape 14b — Deux conditions de bascule levées

**Livré** — 245 tests, `typecheck`, `lint` et `build` au vert ; base identique avant/après.

Les six conditions bloquantes relevaient soit de l'infrastructure, soit du métier — sauf deux,
qui étaient du code. Elles sont traitées.

#### Condition n° 4 — la limitation de débit vit désormais en base

Le compteur était en mémoire de processus : sur un déploiement multi-instances, il suffisait de
frapper une autre instance pour repartir de zéro. Cela annulait la seule protection contre
l'énumération d'un code d'accès à 6 chiffres — un million de combinaisons, sans limite effective.

Les compteurs vivent maintenant dans la table `cache`, sous le préfixe `next:debit:` (Laravel
utilise `ei-mgp-cache-`, aucun croisement possible). L'incrément est fait par **un unique ordre
SQL** avec `ON CONFLICT` : un `SELECT` suivi d'un `UPDATE` laisserait exactement la fenêtre de
concurrence qu'un attaquant cherche.

Prouvé par un test : **dix incréments lancés simultanément, exactement cinq autorisés**, et le
compteur en base à 10.

⚠️ Les deux applications tiennent des compteurs **distincts** pendant la cohabitation : le
`RateLimiter` de Laravel sérialise en PHP et préfixe ses clés autrement. L'objectif était le
partage entre instances Next, pas l'interopérabilité — et la base contient bien, côté Laravel,
ses propres entrées `declaration-submit:127.0.0.1`.

**Régression que j'ai introduite au passage, et corrigée.** L'ancienne signature normalisait la
casse du PREMIER argument (l'e-mail) ; ma réécriture normalisait le second. Or les appels
existants n'ont pas tous le même ordre — `cleThrottle(email, ip)` à la connexion,
`cleThrottle('suivi-ref', reference)` au suivi. Une variation de casse de l'e-mail aurait suffi à
repartir de zéro. Les deux parties sont désormais normalisées, et le test couvre les deux
positions.

Une sixième tâche planifiée (`purger-compteurs-debit`) entretient la table : sans équivalent
Laravel, où le framework purge lui-même son cache.

#### Condition n° 3 — le transport e-mail est branché, il reste à le configurer

`TransportSmtp` (nodemailer) s'active dès que `MAIL_HOST` et `MAIL_FROM` sont renseignés ; sinon
le repli journalise, comme `MAIL_MAILER=log`. **Le démarrage annonce lequel des deux est actif** :
un environnement de production qui croit expédier alors qu'il journalise est aussi dangereux
qu'un fournisseur imposé dans le code.

Ce n'est plus une lacune de code mais un paramétrage. Deux détails ont été traités en chemin :

- **Isolation des échecs d'envoi.** Un serveur SMTP injoignable interrompait la boucle : les
  tâches planifiées parcourant tous les dossiers actifs, une seule adresse en erreur aurait privé
  tous les suivants de leur relance. Chaque envoi est désormais isolé, et **l'audit n'est écrit
  qu'en cas de succès** — consigner un envoi qui n'a pas eu lieu tromperait l'auditeur.
- **Avis GHSA-p6gq-j5cr-w38f** (haute gravité, nodemailer ≤ 9) introduit par l'installation.
  `next-auth` déclare une dépendance de pair `^7 || ^8`, mais ne charge nodemailer que pour son
  fournisseur Email — nous utilisons `Credentials`. Un `override` npm épingle donc la **10.0.1**,
  corrigée. L'audit revient aux 6 vulnérabilités préexistantes, sans nouvelle.
  `disableFileAccess` et `disableUrlAccess` sont activés en complément.

#### État des dix conditions

| # | Condition | État |
|---|---|---|
| 1 | Ordonnanceur externe câblé | ✅ Fonctions programmées Netlify livrées (étape 16) |
| 2 | `TACHES_SECRET` en production | ✅ Généré (`web/secrets-production.txt`) ; reste à saisir dans Netlify |
| 3 | Transport e-mail | ✅ **Branché** — reste à renseigner `MAIL_HOST` / `MAIL_FROM` |
| 4 | Limitation de débit partagée | ✅ **Fait** |
| 5 | Sauvegardes | ✅ Script de vidage livré (étape 16) ; reste à activer la rétention Neon et à planifier le vidage |
| 6 | Délais métier sur `ei_employe` | ❌ Décision métier |
| 7 | Passe manuelle au navigateur | ❌ À faire |
| 8 | Arbitrage `url_cible` des QR codes | ✅ Sans objet — point d'entrée unique (étape 15) |
| 9 | Niveaux de gravité administrables | ✅ Fait (étape 15) |
| 10 | Validation des ajouts d'audit hors CDC | ✅ Validés (étape 15) |

Il ne reste **aucune condition relevant du code**. Les huit restantes appellent une décision
d'infrastructure ou métier.

---

### ✅ Étape 15 — Décisions métier appliquées

**Livré** — 255 tests, `typecheck`, `lint` et `build` au vert ; base cohérente avant/après.

Quatre décisions ont été prises par le métier. Trois demandaient du code.

#### 1. Délai EI arbitré à 5 jours, et délais rendus paramétrables

`ei_employe / analyse_preliminaire` passe de **3 jours ouvrés « provisoire »** à **5 jours ouvrés
« validé »**. Le parcours majoritaire produit donc désormais une échéance, et avec elle les
relances J-3 et les escalades qui en dépendaient — elles étaient inertes jusqu'ici (risque n° 21,
levé).

La valeur est posée dans `SlaDelaiSeeder` (qui fait autorité) **et** appliquée en base : 17 délais
validés sur 22.

⚠️ **Les deux autres étapes d'EI Employé restent provisoires** — `traitement_enquete` (15 j) et
`mise_en_oeuvre_mesures` (30 j). Seul le délai nommé a été arbitré ; je n'ai pas étendu la
décision aux valeurs que vous n'avez pas citées. Elles se règlent maintenant depuis l'écran.

**Nouvel écran `/administration/delais`** : valeur, unité, note, et surtout le commutateur
« validé par le métier ». Un test vérifie le cycle complet — dévalider éteint l'échéance,
revalider la rétablit — parce que c'est exactement ce que DT-04 promet, et que le cache des
délais est purgé à l'enregistrement (sans quoi une correction resterait sans effet et
l'administrateur croirait avoir agi).

#### 2. Point d'entrée unique : un QR code, un lien, un choix

`/declarer` devient l'écran de choix : **évènement indésirable** ou **plainte** ; si plainte, à
quel titre (employé, sous-traitant, communauté). Tous les QR codes y mènent — `/q/{jeton}` ne
consulte plus le parcours du support.

Deux gains directs : un seul support à imprimer, et plus aucun risque qu'une affiche périmée
envoie vers le mauvais formulaire. Les quatre routes `/declarer/{parcours}` restent atteignables :
un lien déjà diffusé continue de fonctionner.

Le vocabulaire de l'écran est celui du déclarant — « ce qui vous est arrivé », pas « parcours » —
et il indique explicitement que le service réorientera un dossier mal classé sans qu'il faille le
redéposer. Quelqu'un qui hésite entre un incident et une plainte ne connaît pas notre
nomenclature.

`qr_codes.parcours_id` reste obligatoire en base : il ne documente plus que le contexte
d'émission du support, et l'écran d'administration le dit.

#### 3. Niveaux de gravité paramétrables

**Nouvel écran `/administration/gravites`** : libellé, couleur, effet de circuit, activation.
Comble le manque relevé au risque n° 18 — `exigences-audit.md` §2 les citait parmi les
référentiels administrables, sans écran dans la baseline.

Trois garde-fous, parce que ce référentiel commande des comportements :

- **`niveau` et `code` ne sont pas modifiables.** Ils ordonnent l'échelle et sont référencés par
  les dossiers déjà classés ; en changer la valeur les déplacerait silencieusement.
- **La couleur doit être hexadécimale.** Elle est injectée en style inline sur le tableau de
  bord : une valeur libre y serait un vecteur d'injection.
- **Le dernier niveau actif ne peut pas être désactivé.** Sans lui, plus aucune déclaration ne
  pourrait être déposée.

`effet_circuit` reste modifiable — c'est bien une décision métier — mais l'écran annonce ce qu'il
déclenche : l'alerte immédiate de la Direction (RG-08).

#### 4. Les trois ajouts d'audit sont validés

`rapport.export_nominatif`, `tache.executee` / `tache.echouee` et `user.mot_de_passe_regenere`
sont désormais inscrits dans `docs/exigences-audit.md` §2 comme évènements audités à part
entière, avec leur justification. Ils ne sont plus des ajouts « hors CDC ».

#### Deux permissions ajoutées, des deux côtés

`referentiels.delais.manage` et `referentiels.gravites.manage`, portées par `service_mgp`
(référentiels métier, DT-02). Ajoutées **au seeder Laravel** autant qu'au portage : le test de
parité compare la liste du code au contenu réel de la table et échoue à la moindre divergence.
36 permissions, 88 associations, les deux applications d'accord.

Vérifié en HTTP : `service_mgp` accède aux deux écrans, `administrateur_digital` en est refusé —
la séparation DT-02 tient sur les nouveaux écrans comme sur les anciens.

---

### ✅ Étape 16 — Cible Netlify + Neon, tous les délais paramétrables

**Livré** — 258 tests (stables sur deux exécutions consécutives), `typecheck`, `lint` et `build`
au vert.

#### 🔴 Bloquant de déploiement : les pièces jointes s'écrivent sur le disque

`services/declaration/pieces-jointes.ts` fait `mkdir` + `writeFile` sous `process.cwd()`. Sur
Netlify le système de fichiers est **en lecture seule** hors `/tmp`, lui-même éphémère :
**toute déclaration comportant une pièce jointe échouera en production**.

Ce n'est pas une dégradation, c'est un arrêt. Il faut un stockage objet — Netlify Blobs ou S3 —
en remplacement de `writeFile`. Le point de bascule est unique (`stockerFichiers`), donc
l'adaptation est circonscrite ; elle n'est pas faite ici parce qu'elle demande de choisir le
fournisseur et de porter aussi la lecture, aujourd'hui absente (aucune route de téléchargement
n'existe : les pièces sont écrites, jamais relues).

#### 🔴 Défaut trouvé par un test intermittent : `priorisation` manquait

Deux cas de l'écran des gravités échouaient une fois sur trois. La cause n'était pas le test mais
mon code : `EFFETS_CIRCUIT` ne listait que `standard` et `accelere`, alors que
`App\Enums\EffetCircuit` en compte **trois** — `priorisation`, que porte le niveau « Élevé ».

Conséquence : **l'écran refusait d'enregistrer ce niveau**, et un administrateur qui aurait choisi
l'une des deux valeurs proposées en aurait changé le comportement sans le vouloir.

L'intermittence venait d'un `findFirst` sans ordre : PostgreSQL renvoyait tantôt le niveau
« Élevé », tantôt un autre. Deux corrections, pas une :

- toutes les lectures de test portent désormais un `orderBy` explicite — une ligne arbitraire
  masque un défaut au lieu de le signaler ;
- trois tests de parité comparent les énumérations du code aux valeurs **réellement présentes en
  base** (effets de circuit, unités et étapes de délai). Une liste incomplète ne se voit pas tant
  qu'on ne tombe pas sur la bonne ligne : c'est la base qui doit trancher, pas la mémoire.

#### Tous les délais sont paramétrables

- **Les 5 derniers délais « provisoires » sont activés** : les 15 délais rattachés à un statut
  sont désormais suivis (contre 10). Plus aucune valeur volontairement inerte — puisqu'elles se
  règlent depuis l'application, la distinction n'avait plus d'objet.
- **Création possible** depuis l'écran : certains couples (parcours, étape) n'avaient aucune
  ligne. EI Employé n'a par exemple pas de délai pour « Retour après résolution » — un dossier EI
  passé à « Résolu » n'a donc aucune échéance. Cela se comble maintenant sans toucher à la base.

**7 délais sur 22 restent structurellement sans effet**, et l'écran le dit désormais par un badge
« Sans effet » :

| Étape | Lignes | Pourquoi |
|---|---|---|
| `retour_information` | 3 | Aucun statut ne s'y rattache dans `STATUT_VERS_ETAPE` |
| `cloture` | 4 | Porte le délai GLOBAL, lu par `estEnRetardGlobalement` — fonction que **rien n'appelle**, ni ici ni dans Laravel |

Les afficher comme réglables sans le dire aurait laissé croire à un suivi qui n'existe pas.

#### Déploiement Netlify + Neon

| Élément | Contenu |
|---|---|
| `netlify.toml` | Construction du seul dossier `web/`, six fonctions programmées avec leurs horaires |
| `web/netlify/functions/*.mts` | Chaque fonction appelle `/api/taches/{nom}` avec `TACHES_SECRET` — l'autorisation reste dans la route, un seul endroit à auditer |
| `tsconfig.json` | `netlify/` exclu : autre cible de compilation, qui exige des imports avec extension |
| `web/scripts/sauvegarde.mjs` | `pg_dump` avec rotation à 30 jours et garde-fou sur un vidage anormalement petit |
| `web/secrets-production.txt` | `TACHES_SECRET` et `AUTH_SECRET` générés, **ignoré par git** |

**Neon** : chaîne *pooled* obligatoire (hôte en `-pooler`) — chaque fonction serverless ouvre sa
propre connexion et le point d'entrée direct s'épuiserait. La rétention d'historique de Neon fait
office de sauvegarde continue ; le vidage logique protège de ce qu'elle ne couvre pas (perte du
compte, changement de fournisseur).

⚠️ Un vidage **contient des données personnelles** : mêmes obligations que la base, et surtout pas
dans un artefact de CI.

---

## 7. Risques ouverts

| # | Risque | Gravité | État |
|---|---|---|---|
| 1 | **Les 295 tests Pest ne se migrent pas.** 232 tests écrits côté Next couvrent les 67 exigences (39 EX + 15 RG + 13 RGI), mais restent moins nombreux que la suite Pest : la couverture des cas limites propres à Laravel n'est pas reproduite à l'identique. | 🟠 Moyen | Traité à l'étape 13 — écart de volume assumé et documenté |
| 2 | **RG-06 (anonymat)** : propriété de sûreté, régression silencieuse possible. | 🔴 Majeur | Ouvert — vérifié en 9b (messagerie : `expediteur_user_id` forcé NULL, session sans compte) ; à revérifier à chaque module |
| 3 | **Polymorphisme non supporté par Prisma.** `pieces_jointes` introspectée sans relation vers `dossiers`/`investigations`/`actions_correctives` : le lien n'existe que comme `attachable_type` + `attachable_id`. Idem `audit_logs`. | 🟠 Moyen | Confirmé à l'étape 1 — jointures à écrire manuellement |
| 4 | **Contrainte CHECK non représentée.** `niveaux_gravite_niveau_check` (échelle 1-4) reste appliquée par PostgreSQL mais est invisible du client Prisma : une écriture invalide échouera en erreur SQL brute au lieu d'être validée en amont. | 🟠 Moyen | Confirmé — à doubler par une validation Zod |
| 5 | **Livewire → React est une reconstruction**, pas une traduction. ~60 actions métier à recenser une par une (ce ne sont pas des routes). | 🔴 Majeur | Ouvert |
| 6 | **Pas de scheduler dans Next.js.** Les 5 tâches sont exposées par `POST /api/taches/{nom}`, protégé par secret partagé. **L'ordonnanceur externe reste à câbler** : sans lui, rien ne s'exécute. | 🔴 Majeur | Traité à l'étape 12 — câblage à faire avant bascule |
| 7 | `mysql2` (4 vulnérabilités hautes) entre transitivement via `prisma`. **Non exploitable ici** : la faille exige une connexion à un serveur MySQL, l'application ne parle qu'à PostgreSQL. Aucun correctif dans la ligne 7.x ; `audit fix --force` rétrograderait vers Prisma 6. | 🟢 Faible | Accepté et documenté — à revoir à chaque montée de version |
| 8 | Génération PDF : mise en page dompdf entièrement à refaire. | 🟠 Moyen | Traité à l'étape 10 (@react-pdf/renderer, mise en page réécrite) |
| 9 | **Limitation de débit en mémoire.** | 🟠 Moyen | ✅ Résolu à l'étape 14b — compteurs en base, incrément atomique, concurrence testée |
| 10 | **Pas de réinitialisation en libre-service.** La baseline la déclare sans la rendre atteignable (aucune vue Fortify enregistrée, aucun lien depuis la connexion). Comblé côté administration (réattribution par un administrateur) ; le libre-service reste conditionné au transport e-mail. | 🟠 Moyen | Partiellement traité à l'étape 14 |
| 12 | **Transport e-mail à configurer.** `TransportSmtp` s'active dès que `MAIL_HOST` et `MAIL_FROM` sont renseignés ; sinon repli journalisé, annoncé au démarrage. Ce n'est plus une lacune de code. | 🟠 Moyen | Traité à l'étape 14b — paramétrage à faire |
| 13 | **Notifications envoyées en synchrone, sans file.** Satisfait RG-08 a fortiori, mais allonge le temps de réponse des opérations qui en déclenchent. Une file serait souhaitable à fort volume pour les notifications non critiques — jamais pour le circuit accéléré. | 🟢 Faible | Accepté |
| 14 | **Envoi de message déclarant non vérifié au navigateur.** Le portillon de session est prouvé en HTTP réel sur le chemin de lecture ; l'écriture partage le même contrôle mais n'a pas été exercée de bout en bout. | 🟠 Moyen | Ouvert — passe manuelle avant bascule |
| 15 | **Référentiels manquants en base non détectés par la suite.** Trois occurrences (`date_cloture`, `sla_delais`, `notification_templates`). Les tests fabriquent leurs données de référence et ne signalent donc pas leur absence en production. | 🔴 Majeur | Partiellement traité — à étendre à chaque référentiel (étape 11) |
| 16 | **Ajouts d'audit hors CDC.** | 🟢 Faible | ✅ Validés par le métier à l'étape 15 — inscrits dans `docs/exigences-audit.md` §2 |
| 17 | **QR codes : `url_cible` sans effet.** L'écran l'annonce désormais explicitement. Avec le point d'entrée unique (étape 15), la question de la réorientation par support disparaît : tous mènent au même écran de choix. | 🟢 Faible | Traité — colonne documentaire assumée |
| 18 | **Niveaux de gravité non administrables.** | 🟢 Faible | ✅ Résolu à l'étape 15 — écran `/administration/gravites` |
| 19 | **17 lignes d'audit perdues** en développement, par un nettoyage de test non typé (corrigé structurellement). Irrécupérable : aucune sauvegarde, `archive_mode = off`. À corriger avant production — une base sans sauvegarde ni archivage WAL n'offre aucune reprise. | 🔴 Majeur | Ouvert — politique de sauvegarde à définir |
| 20 | **`TACHES_SECRET` à provisionner en production.** Absent ou trop court, la route refuse tout (503) et aucune tâche ne s'exécute — panne silencieuse côté métier. Journalisée côté serveur, mais à surveiller. | 🟠 Moyen | Ouvert — avant bascule |
| 21 | **Délais non validés sur `ei_employe`.** | 🟠 Moyen | ✅ Analyse préliminaire arbitrée à 5 jours ouvrés (étape 15). Les deux autres étapes restent provisoires, réglables depuis `/administration/delais`. |
| 22 | **Pièces jointes incompatibles avec Netlify.** Écriture sur le disque local, impossible en serverless : toute déclaration avec pièce jointe échouera. Un stockage objet doit remplacer `writeFile`, et la lecture reste à écrire (aucune route de téléchargement n'existe). | 🔴 Majeur | Ouvert — bloquant de déploiement |
| 23 | **7 délais sur 22 sans effet structurel.** `retour_information` n'est rattachée à aucun statut ; `cloture` porte le délai global, lu par une fonction que rien n'appelle (dans les deux applications). Signalé dans l'écran, mais la question de fond reste : faut-il câbler ces étapes ou retirer leurs lignes ? | 🟠 Moyen | Ouvert — arbitrage |
| 11 | `next-auth` v5 est en **beta** (`5.0.0-beta.32`). C'est la seule voie pour l'App Router et elle est largement utilisée en production, mais l'API peut encore bouger. | 🟢 Faible | Accepté |

---

## 8. Étapes restantes

| # | Étape | Vérification |
|---|---|---|
| 14 | Bascule, puis retrait de Laravel | **Bloqué : 10 conditions à remplir, aucune n'est remplie. Retrait soumis à validation explicite.** |

Chemin critique : `authz → Déclaration → Dossiers/workflow → Notifications`.

---

## 9. Interdits absolus

- ❌ `prisma migrate dev` / `migrate reset` / `db push` — la base est **partagée avec Laravel en
  service**. Seule `prisma db pull` (lecture seule) est autorisée.
- ❌ Supprimer ou modifier l'application Laravel avant la bascule validée.
- ❌ Considérer un module « terminé » sans sa vérification d'autorisation **côté serveur**.
- ❌ Committer `web/.env` (contient l'URL de connexion avec mot de passe — déjà gitignoré).
