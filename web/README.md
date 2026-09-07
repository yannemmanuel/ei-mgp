# EI-MGP — application Next.js

Digitalisation du **Mécanisme de Gestion des Plaintes** : déclaration et suivi d'évènements
indésirables et de griefs sur 4 parcours (EI Employé, Grief Employé, Grief Sous-traitant, Grief
Communauté).

Ce dossier est le portage Next.js de l'application Laravel qui vit à la racine du dépôt. Les deux
**partagent la même base PostgreSQL** pendant toute la durée de la migration.

---

## ⚠️ À lire avant toute commande

- **La base est partagée avec l'application Laravel en service.** Aucune commande de migration
  Prisma ne doit être exécutée ici. `prisma migrate dev`, `migrate reset` et `db push` sont
  interdits : le schéma appartient aux migrations Laravel. Seul `prisma db pull` (lecture) est
  autorisé pour resynchroniser `schema.prisma` après une migration Laravel.
- **Les tests écrivent dans la vraie base.** Ils créent puis suppriment leurs propres données, et
  `vitest.setup.mts` retire les lignes `notifications` et `audit_logs` produites pendant la
  campagne. Ne les lancez pas contre une base de production.
- **`web/.env` n'est pas versionné** : il contient l'URL de connexion avec son mot de passe.

---

## Démarrer

```bash
npm install
cp .env.example .env      # puis renseigner les valeurs ci-dessous
npx prisma generate
npm run dev               # http://localhost:3000
```

### Variables d'environnement

| Variable | Rôle | Sans elle |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL, partagée avec Laravel | L'application ne démarre pas |
| `AUTH_SECRET` | Signature des sessions Auth.js **et** du jeton de suivi déclarant | Connexion et suivi impossibles |
| `AUTH_URL` | URL publique de l'application | Auth.js refuse l'hôte (`UntrustedHost`) |
| `TACHES_SECRET` | Secret du déclencheur de tâches planifiées, **32 caractères minimum** | Les tâches renvoient 503 : aucune relance, aucune escalade, aucune anonymisation |
| `BCRYPT_ROUNDS` | Coût bcrypt, `12` par défaut | — (abaissé à `4` en test uniquement) |
| `STOCKAGE_RACINE` | Racine de stockage des pièces jointes, hors du dossier public | `./storage/private` |
| `MAIL_HOST`, `MAIL_FROM` | Transport SMTP — **les deux sont requis** pour expédier | Les e-mails sont journalisés, pas envoyés |
| `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD` | Réglages SMTP complémentaires | Port 587 en STARTTLS, sans authentification |

Comptes de démonstration (seedés par Laravel) : `admin@`, `gestionnaire@`, `superviseur@`,
`enqueteur@`, `direction@`, `auditeur@` — tous en `@example.test`, mot de passe `password`.

---

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Compilation de production (inclut la vérification TypeScript) |
| `npm start` | Serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Suite Vitest (245 tests, contre la base réelle) |

---

## Tâches planifiées — à câbler

**Next.js n'a pas d'ordonnanceur.** Là où Laravel déclare `Schedule::command(...)` et s'appuie sur
un `php artisan schedule:run` lancé par le cron système, les tâches sont ici exposées par une
route appelée depuis un ordonnanceur externe.

```bash
curl -X POST -H "Authorization: Bearer $TACHES_SECRET" \
  https://<hote>/api/taches/<nom>
```

| Tâche | Cadence attendue | Effet |
|---|---|---|
| `recalculer-retard-actions` | quotidienne | Bascule en retard les actions correctives échues |
| `relancer-echeances` | quotidienne | Relance J-3 des acteurs de traitement |
| `detecter-retards` | quotidienne | Escalade N+1 / Service MGP / Direction |
| `calculer-statistiques-mensuelles` | le 1er, 01h30 | Archive le mois écoulé |
| `appliquer-politique-conservation` | le 1er, 02h00 | Archivage 24 mois, anonymisation 10 ans |
| `purger-compteurs-debit` | quotidienne | Entretien des compteurs de limitation de débit |

**Sans ce câblage, aucune de ces opérations n'a jamais lieu** — y compris l'anonymisation
exigée par le RGPD. C'est le point d'exploitation le plus important de ce portage.

---

## État de la migration

Le journal complet — étapes livrées, défauts trouvés dans la baseline, risques ouverts — vit dans
[`../MIGRATION_PLAN.md`](../MIGRATION_PLAN.md). Il fait autorité sur ce fichier en cas d'écart.

**Ce qui reste bloquant avant une mise en service :**

1. **Pièces jointes** — écriture sur disque local, incompatible avec Netlify (voir ci-dessus).
2. **Transport SMTP** — sans `MAIL_HOST` et `MAIL_FROM`, les envois sont journalisés. Le
   démarrage annonce lequel des deux modes est actif.

## Sauvegardes

Deux niveaux, complémentaires :

- **Rétention Neon** (console) : restauration à un instant donné, continue. C'est la protection
  principale.
- **`npm run sauvegarde`** : vidage logique `pg_dump`, à planifier quotidiennement sur une
  machine disposant de `pg_dump`. Rotation à 30 jours. Protège de ce que Neon ne couvre pas —
  perte du compte, changement de fournisseur.

⚠️ Un vidage **contient des données personnelles**. Mêmes obligations que la base : stockage
restreint, purge à échéance (RG-11). Ne le déposez pas dans un artefact de CI.

Voir `ARCHITECTURE.md` pour les conventions de code et le modèle d'autorisation.
