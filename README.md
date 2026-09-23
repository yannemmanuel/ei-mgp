# EI-MGP — Digitalisation du Mécanisme de Gestion des Plaintes

Déclaration et suivi d'**évènements indésirables** et de **griefs**, sur quatre parcours : EI
Employé, Grief Employé, Grief Sous-traitant, Grief Communauté.

L'application vit dans [`web/`](web/) — Next.js, TypeScript, Prisma, PostgreSQL.
**Commencez par [`web/README.md`](web/README.md)** : installation, variables d'environnement,
déploiement, sauvegardes.

```
web/            l'application
docs/           le corpus d'exigences — cité par le code, il fait autorité
MIGRATION_PLAN.md   journal de la migration : décisions, défauts trouvés, risques ouverts
netlify.toml    déploiement et tâches planifiées
```

## Un point d'histoire qui compte encore

Ce dépôt a d'abord hébergé une application **Laravel**, remplacée par le portage Next.js. Le
framework a été retiré ; le schéma de base et les données de référence, qui n'existaient que dans
ses migrations et ses seeders, ont été extraits sous une forme qui vit sans lui :

| Fichier | Rôle |
|---|---|
| `web/prisma/structure.sql` | Structure complète — 36 tables, contraintes et commentaires compris |
| `web/prisma/referentiels.json` | Parcours, catégories, statuts, gravités, délais, permissions… |
| `web/prisma/seed.mts` | Rejoue les référentiels (`npm run seed`), idempotent |

> ⚠️ **`structure.sql` se RÉGÉNÈRE, il ne s'écrit pas.** Il a remplacé le 23/09/2026 un
> `schema-initial.sql` qui portait la même promesse — « structure complète » — et qui avait
> silencieusement pris dix-huit évolutions de retard : **8 tables et 71 colonnes manquantes**,
> plus 7 tables supprimées depuis. Une base recréée à partir de lui n'aurait su ni autoriser un
> geste, ni recevoir une déclaration.
>
> Après toute évolution de schéma : `npm run db:pull` puis `npm run db:structure`. Ce n'est pas
> une consigne à retenir — `structure-a-jour.test.ts` échoue si on l'oublie, et dit quoi taper.

L'état antérieur reste intégralement récupérable :

```bash
git show avant-retrait-laravel   # juste avant le retrait
git show baseline-laravel        # l'application Laravel d'origine
```

## Où lire quoi

- **Faire tourner l'application, la déployer** → [`web/README.md`](web/README.md)
- **Comprendre les choix de structure** → [`web/ARCHITECTURE.md`](web/ARCHITECTURE.md)
- **Ce que le produit doit faire** → [`docs/`](docs/) — exigences fonctionnelles, règles métier,
  sécurité, audit, décisions techniques
- **Ce qui a été migré, trouvé, et ce qui reste ouvert** →
  [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md)

`docs/` n'est pas une archive : une vingtaine de fichiers du code y renvoient explicitement pour
justifier une règle. Il fait autorité en cas de doute.
