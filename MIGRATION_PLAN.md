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
| Middleware `auth`/`permission:` | `middleware.ts` + vérification serveur |
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

---

## 8. Étapes restantes

| # | Étape | Vérification |
|---|---|---|
| 2 | Couche authz (rôles, permissions, scope parcours, 6 policies) | Tests reproduisant `DossierPolicyTest` |
| 3 | Auth (session, bcrypt, throttle, reset) | Comptes existants connectables |
| 4 | Design system shadcn/ui + layouts | — |
| 5 | Module 1 — Déclaration | RG-01/02/06, RGI-01→04 |
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
