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

### 🔄 Étape 5a — Module Déclaration : services métier et validations

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

---

## 7. Risques ouverts

| # | Risque | Gravité | État |
|---|---|---|---|
| 1 | **Les 295 tests Pest ne se migrent pas.** Ils encodent 15 RG + 13 RGI + 34 DT, dont 6 lacunes réelles trouvées seulement aux phases 13-14. La réécriture refait simultanément le code et le filet qui le protège. | 🔴 Majeur | Ouvert — poste de coût principal |
| 2 | **RG-06 (anonymat)** : propriété de sûreté, régression silencieuse possible. | 🔴 Majeur | Ouvert — à vérifier explicitement à chaque module |
| 3 | **Polymorphisme non supporté par Prisma.** `pieces_jointes` introspectée sans relation vers `dossiers`/`investigations`/`actions_correctives` : le lien n'existe que comme `attachable_type` + `attachable_id`. Idem `audit_logs`. | 🟠 Moyen | Confirmé à l'étape 1 — jointures à écrire manuellement |
| 4 | **Contrainte CHECK non représentée.** `niveaux_gravite_niveau_check` (échelle 1-4) reste appliquée par PostgreSQL mais est invisible du client Prisma : une écriture invalide échouera en erreur SQL brute au lieu d'être validée en amont. | 🟠 Moyen | Confirmé — à doubler par une validation Zod |
| 5 | **Livewire → React est une reconstruction**, pas une traduction. ~60 actions métier à recenser une par une (ce ne sont pas des routes). | 🔴 Majeur | Ouvert |
| 6 | **Pas de scheduler dans Next.js.** 5 commandes planifiées exigent une infra externe. RG-08 impose en plus du synchrone. | 🟠 Moyen | Ouvert — étape 12 |
| 7 | `mysql2` (4 vulnérabilités hautes) entre transitivement via `prisma`. **Non exploitable ici** : la faille exige une connexion à un serveur MySQL, l'application ne parle qu'à PostgreSQL. Aucun correctif dans la ligne 7.x ; `audit fix --force` rétrograderait vers Prisma 6. | 🟢 Faible | Accepté et documenté — à revoir à chaque montée de version |
| 8 | Génération PDF : mise en page dompdf entièrement à refaire. | 🟠 Moyen | Ouvert — étape 10 |
| 9 | **Limitation de débit en mémoire.** Le throttle de connexion ne vaut que pour un processus : sur un déploiement multi-instances, la limite est contournable en frappant une autre instance. Doit passer par un magasin partagé (Redis, ou la table `cache` existante) avant mise en production. | 🟠 Moyen | Ouvert |
| 10 | **Réinitialisation de mot de passe non portée.** Fonctionnalité Laravel existante (Fortify) ; nécessite une décision sur l'envoi d'e-mails. `password_reset_tokens` existe déjà. | 🟠 Moyen | Ouvert — avant bascule |
| 11 | `next-auth` v5 est en **beta** (`5.0.0-beta.32`). C'est la seule voie pour l'App Router et elle est largement utilisée en production, mais l'API peut encore bouger. | 🟢 Faible | Accepté |

---

## 8. Étapes restantes

| # | Étape | Vérification |
|---|---|---|
| 5b | Module 1 — Déclaration : 4 formulaires, wizard, page de suivi | RG-01/02/06, RGI-01→04 |
| 6 | Module 2 — Dossiers + workflow | RG-03/04/07/10 |
| 7 | Module 3 — Investigations | RGI-05/06 |
| 8 | Module 4 — Actions correctives | RGI-07/08/09 |
| 9 | Module 5 — Notifications | RG-08, EX-NOT-01→07 |
| 10 | Module 6 — Reporting + exports | RG-14, EX-REP-01→06 |
| 11 | Administration (7 référentiels) | — |
| 12 | Audit + RGPD + 5 tâches planifiées | RG-11/12, immuabilité |
| 13 | Tests de non-régression complets | 39 EX + 15 RG + 13 RGI |
| 14 | Bascule, puis retrait de Laravel | **Après validation explicite** |

Chemin critique : `authz → Déclaration → Dossiers/workflow → Notifications`.

---

## 9. Interdits absolus

- ❌ `prisma migrate dev` / `migrate reset` / `db push` — la base est **partagée avec Laravel en
  service**. Seule `prisma db pull` (lecture seule) est autorisée.
- ❌ Supprimer ou modifier l'application Laravel avant la bascule validée.
- ❌ Considérer un module « terminé » sans sa vérification d'autorisation **côté serveur**.
- ❌ Committer `web/.env` (contient l'URL de connexion avec mot de passe — déjà gitignoré).
