# EI-MGP — application Next.js

Digitalisation du **Mécanisme de Gestion des Plaintes** : déclaration et suivi d'évènements
indésirables et de griefs sur 4 parcours (EI Employé, Grief Employé, Grief Sous-traitant, Grief
Communauté).

Cette application a remplacé un portage Laravel, retiré depuis. Le schéma et les référentiels,
qui n'existaient que dans ses migrations et ses seeders, sont préservés ici (voir *Recréer un
environnement*).

---

## ⚠️ À lire avant toute commande

- **`schema.prisma` est une INTROSPECTION**, pas une source. La structure de référence est
  `prisma/schema-initial.sql`. Une évolution du schéma s'écrit là, s'applique, puis se reprend
  par `prisma db pull` — jamais l'inverse. `prisma migrate dev`, `migrate reset` et `db push`
  restent à proscrire tant qu'aucun outil de migration n'a été mis en place.
- **Les tests écrivent dans la vraie base.** Ils créent puis suppriment leurs propres données, et
  `vitest.setup.mts` retire les lignes `notifications` et `audit_logs` produites pendant la
  campagne. Ne les lancez pas contre une base de production.
- **`web/.env` n'est pas versionné** : il contient l'URL de connexion avec son mot de passe.
- **`web/storage/` ne l'est pas non plus** : il contient les pièces jointes déposées, donc des
  données personnelles. Un historique git ne se purge pas.

---

## Démarrer

```bash
npm install
cp .env.example .env      # puis renseigner les valeurs ci-dessous
npx prisma generate
npm run dev               # http://localhost:3000
```

### Recréer un environnement

Sur une base vierge :

```bash
psql "$DATABASE_URL" -f prisma/schema-initial.sql   # 35 tables et leurs contraintes
npm run seed                                        # parcours, catégories, délais, permissions…
```

Le seed est idempotent : il peut être rejoué sur une base déjà peuplée. Il ne crée **aucun
compte** — les comptes se créent depuis `/administration/utilisateurs`.

`npm run exporter-referentiels` régénère `prisma/referentiels.json` depuis la base courante,
lorsqu'un référentiel modifié depuis l'application doit être versionné.

### Variables d'environnement

| Variable | Rôle | Sans elle |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL, partagée avec Laravel | L'application ne démarre pas |
| `AUTH_SECRET` | Signature des sessions Auth.js **et** du jeton de suivi déclarant | Connexion et suivi impossibles |
| `AUTH_URL` | URL publique de l'application | Auth.js refuse l'hôte (`UntrustedHost`) |
| `TACHES_SECRET` | Secret du déclencheur de tâches planifiées, **32 caractères minimum** | Les tâches renvoient 503 : aucune relance, aucune escalade, aucune anonymisation |
| `BCRYPT_ROUNDS` | Coût bcrypt, `12` par défaut | — (abaissé à `4` en test uniquement) |
| `STOCKAGE_RACINE` | Racine du magasin local, hors du dossier public | `./storage/private` |
| `STOCKAGE_MAGASIN` | `local` ou `blobs` | Détecté d'après l'hébergement |
| `MAIL_HOST`, `MAIL_FROM` | Transport SMTP — **les deux sont requis** pour expédier | Les e-mails sont journalisés, pas envoyés |
| `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD` | Réglages SMTP complémentaires | Port 587 en STARTTLS, sans authentification |

Comptes de démonstration présents dans la base de développement : `admin@`, `gestionnaire@`,
`superviseur@`, `enqueteur@`, `direction@`, `auditeur@` — tous en `@example.test`, mot de passe
`password`. **À supprimer avant toute mise en service.**

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

1. **Transport SMTP** — sans `MAIL_HOST` et `MAIL_FROM`, les envois sont journalisés. Le
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
