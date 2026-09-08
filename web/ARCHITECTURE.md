# Architecture

Ce document explique **pourquoi** le code est organisé ainsi. Les fichiers portent les
justifications de détail ; on trouve ici les principes qui les gouvernent.

---

## 1. Le principe qui commande tout : l'autorisation se refait côté serveur

L'application traite des signalements — dont certains anonymes, dont certains mettent en cause des
personnes. Une fuite n'est pas un défaut d'affichage, c'est une atteinte à quelqu'un.

Trois conséquences structurantes :

**`src/proxy.ts` n'est pas un contrôle d'accès.** Il vérifie la présence d'un cookie et redirige.
Il ne consulte pas la base, ne connaît ni rôle ni permission, et peut s'exécuter en périphérie. Son
en-tête le dit, et il faut le maintenir vrai.

**Chaque page et chaque Server Action revérifie.** `exigerUtilisateur()` / `exigerPermission()` au
début d'une page, et de nouveau dans chaque action qu'elle expose. Une Server Action est une entrée
réseau à part entière : masquer un bouton ne protège rien.

**Ce qui n'est pas autorisé n'est pas chargé.** Le cloisonnement ne se fait pas à l'affichage mais
dans la requête : les identités d'un dossier hors périmètre, les colonnes nominatives d'un export
non autorisé, l'adresse IP d'une ligne d'audit pour un rôle non habilité — ces données ne sont pas
masquées, elles ne sont pas lues. Un oubli de rendu ne peut donc pas les divulguer.

```
src/server/authz/
  permissions.ts      36 permissions — liste close
  libelles.ts         traduction en français lisible + regroupement par domaine
  roles.ts            15 rôles → permissions
  parcours.ts         cloisonnement par parcours
  site.ts             cloisonnement par site, déduit de la direction concernée
  etapes.ts           qui fait avancer un dossier, par parcours et par étape
  utilisateur.ts      chargement depuis la base, à chaque requête
  policies/           une par domaine métier
```

**Trois verrous indépendants** commandent l'accès à un dossier, et il faut les trois :

| Verrou | Question | Où |
|---|---|---|
| Permission | ce compte a-t-il le droit en général ? | `permissions.ts` |
| Parcours | ce dossier est-il de son ressort ? | `parcours.ts` |
| Site | ce dossier relève-t-il de son site ? | `site.ts` |
| Étape | cette marche-ci lui revient-elle ? | `etapes.ts` |

Le **site** d'un dossier n'est pas saisi : il découle de la direction concernée
(`directions.site_id`), choisie à la déclaration. La direction n'est donc PAS une donnée
d'identité — la traiter comme telle la mettait à NULL en anonyme, et tout signalement anonyme
devenait un dossier sans site que nul secrétaire ne voyait. Une direction compte des centaines de
personnes, comme le lieu, déjà obligatoire et collecté anonymement.

Deux garde-fous encadrent ce verrou, tous deux tournés vers le même risque — masquer un dossier à
qui doit le traiter est pire que le montrer trop largement : un compte **sans** site n'est pas
cloisonné (l'oubli de paramétrage est signalé, pas transformé en écran vide), et cumuler un rôle
non cloisonné desserre la contrainte plutôt que de l'ajouter.

Le troisième manquait : le graphe des transitions contraignait l'enchaînement des statuts, mais
tout porteur de `dossiers.status.update` pouvait franchir n'importe quelle marche de son périmètre
— un seul compte menait un dossier de « Reçu » à « Résolu ». `docs/workflows.md` §3 demandait
pourtant cette table explicitement.

`dossiers.view.own` mérite sa propre mention : la permission était traitée à l'identique de
`dossiers.view`, ce qui la vidait de son sens. Elle signifie « ses dossiers » — ceux qui lui sont
affectés ou qu'il a déclarés —, jamais « tout son parcours ».

Les droits sont **relus en base à chaque requête**, jamais portés par le jeton de session : la
révocation d'un compte est ainsi effective à l'appel suivant, sans attendre l'expiration.

Le partage des responsabilités est explicite : le **code** décide ce qui EXISTE — le catalogue
fermé des 36 permissions et des 15 rôles —, la **base** décide qui obtient quoi, comment cela
s'appelle et si cela s'applique. Tout se règle depuis `/administration/habilitations` et prend
effet immédiatement. Trois contrôles remplacent la comparaison automatique qui protégeait ces
associations tant qu'elles étaient figées : validation contre le catalogue, invariant du dernier
administrateur actif, et journalisation de chaque changement.

| Colonne de `roles` | Qui décide | Effet |
|---|---|---|
| `name` | le code, définitivement | Identifiant technique. Référencé par `model_has_roles`, `authz/roles.ts` et le cloisonnement `authz/parcours.ts` — le renommer retirerait son périmètre à un rôle **sans aucune erreur**. Aucune interface ne l'expose. |
| `libelle`, `description` | l'administration | Ce que les gens lisent. `LIBELLES_ROLE` n'est plus que la référence livrée et le repli. |
| `actif` | l'administration | Un rôle inactif ne confère plus **ni permission ni parcours**, dès la requête suivante. Les rattachements `model_has_roles` sont conservés : réactiver rend leurs droits aux comptes sans réattribution. |

La désactivation d'un rôle n'atteint pas les permissions accordées **directement** à un compte
(`model_has_permissions`) : elles ne transitent par aucun rôle. La table est vide aujourd'hui,
mais s'en souvenir avant de compter sur la désactivation pour couper un accès.

---

## 2. Couches

```
app/                     Routes, pages, Server Actions — aucune règle métier
  (public)/              Déclaration, suivi, redirection QR — sans compte
  (app)/                 Back-office — session exigée par le layout
  api/                   Fichiers (exports) et déclencheur de tâches
server/services/         Règles métier — le cœur
server/authz/            Autorisation
server/auth/             Session, identifiants, hachage
lib/validations/         Schémas Zod
components/ui/           Primitives (shadcn/Base UI) + étiquettes de statut, états vides
components/layout/       Coquille et éléments communs à toutes les pages
```

**`components/layout/` porte la cohérence entre écrans**, et c'est délibéré : chaque page
composait auparavant son propre titre, ses propres filtres, sa propre pagination, et l'œil devait
réapprendre la page à chaque navigation.

```
en-tete-page.tsx    Fil d'Ariane, titre, une phrase, actions — dans cet ordre, partout
barre-filtres.tsx   Filtres repliés, puces des critères actifs, état porté par l'URL
pagination.tsx      Recopie les paramètres courants — changer de page ne perd pas les filtres
squelettes.tsx      Formes de chargement, alimentées par les `loading.tsx`
navigation.ts       Une entrée par objet métier, filtrée par permission
```

Un `loading.tsx` existe au niveau du groupe `(app)` : la coquille reste en place et seule la zone
de contenu se recompose. Sans lui, chaque navigation figeait l'écran précédent le temps de la
lecture en base — et le clic paraissait n'avoir rien produit.

Une règle métier ne vit **jamais** dans un composant ni dans une action : les actions valident,
autorisent, puis délèguent. C'est ce qui permet aux tests d'exercer les règles sans HTTP.

Le cas de la **soumission de déclaration** illustre la règle : les voies publique et relais
partagent `services/declaration/soumission.ts`, parce que RG-13 exige un workflow identique. Deux
implémentations finiraient par diverger — et la divergence porterait sur des règles de sûreté.

---

## 3. Base de données — contraintes héritées

`schema.prisma` est une **introspection** (`prisma db pull`), jamais une source. La structure de
référence est `prisma/schema-initial.sql`, extraite au retrait de Laravel — les contraintes que
Prisma ne modélise pas, les CHECK, y ont été rajoutées à la main. C'est donc ce fichier qui fait
autorité, et non le schéma Prisma.

| Contrainte | Conséquence dans le code |
|---|---|
| Clés primaires ULID sur les entités métier | `ulid().toLowerCase()` — la casse compte, la colonne est `char(26)` |
| Relations polymorphes (`pieces_jointes`, `audit_logs`) | Prisma ne les modélise pas : jointures manuelles sur `*_type` + `*_id` |
| `auditable_type` porte un nom de classe PHP | `String.raw` obligatoire — `'App\Models\User'` perd ses antislashs en JS |
| Contraintes CHECK | Invisibles du client : doublées par une validation Zod |
| Hachages bcrypt | Préfixe normalisé en `$2y$` — PHP rejette `$2b$` |

**Après tout changement de schéma, redémarrer `next dev`.** `prisma generate` réécrit le client
dans `node_modules`, que Next ne surveille pas : le serveur en cours garde l'ancien en mémoire,
ignore les colonnes qui viennent d'apparaître et répond 500 — avec un message qui accuse la
requête, jamais le client. `predev` régénère le client à chaque démarrage, et `npm run db:pull`
enchaîne l'introspection et la génération ; il reste à relancer le serveur. `NEXT_DIST_DIR` permet
d'ouvrir une seconde instance pour vérifier sans interrompre la première.

**Tables en ajout seul** : `audit_logs` (CDC §15) et `historique_statuts` (RG-04). Aucun module
n'expose de modification ou de suppression pour elles, et un test structurel échoue si une telle
fonction apparaît.

**Aucune suppression métier** : ni dossier (RG-03), ni référentiel, ni compte. La désactivation
(`actif`) remplace partout la suppression. Seule exception, encadrée : l'anonymisation RGPD
supprime `declaration_identites` — jamais la ligne `dossiers`, que RG-12 exige de conserver pour
que les statistiques restent calculables.

---

## 4. Anonymat (RG-06) — une propriété de sûreté, pas une option

Un déclarant anonyme ne doit pouvoir être réidentifié par **aucun** chemin. Ce qui en découle :

- Aucune ligne `declaration_identites` n'existe pour un dossier anonyme : la garantie est
  structurelle, pas procédurale. Les colonnes nominatives d'un export y sont vides par
  construction.
- La messagerie du déclarant s'authentifie par un **cookie signé** portant l'identifiant du
  dossier prouvé — jamais un compte. `expediteur_user_id` est forcé à NULL côté déclarant, même si
  l'appelant fournit un identifiant.
- Le journal d'audit n'enregistre pas le contenu des notifications d'un dossier anonyme, et l'IP
  de soumission n'est consultable que par le DPO et l'auditeur.
- Un dossier anonyme ne reçoit aucune notification de changement de statut : il n'existe personne
  à qui écrire.

---

## 5. Choix de portage notables

| Laravel | Ici | Pourquoi |
|---|---|---|
| Session serveur (`session()`) | Cookie signé HMAC | Next.js n'a pas de session serveur |
| `Schedule::command()` | `POST /api/taches/{nom}` | Next.js n'a pas d'ordonnanceur |
| Livewire | Server Components + Server Actions | Reconstruction, pas traduction |
| `maatwebsite/excel` | `exceljs` | Vrai `.xlsx` |
| `barryvdh/laravel-dompdf` | `@react-pdf/renderer` | Mise en page réécrite |
| Chart.js | Barres CSS rendues côté serveur | Aucune dépendance, lisible sans JavaScript |
| `middleware.ts` | `proxy.ts` | Déprécié en Next.js 16 |

**Écarts assumés avec la baseline**, tous documentés dans `MIGRATION_PLAN.md` : un compte
désactivé ne peut plus se connecter (Laravel l'autorisait), un refus d'autorisation redirige vers
`/acces-refuse` au lieu d'un 403, les exports nominatifs et les exécutions de tâches sont
journalisés.

⚠️ **Le statut HTTP ne dit pas si l'accès a été refusé.** La coquille `(app)/layout.tsx` commence
à diffuser avant que la page n'appelle `exigerPermission()` : quand celle-ci redirige, l'en-tête
est déjà parti en **200**, et la redirection voyage dans la charge RSC sous la forme
`acces-refuse;307`. Un contrôle qui lit le code de retour conclura à un accès autorisé alors qu'il
ne l'est pas — c'est arrivé en vérifiant la désactivation des rôles. Chercher le marqueur dans le
corps, pas le statut. Un 307 en en-tête vient du proxy (absence de cookie), jamais d'une policy.

---

## 6. Tests

354 tests, exécutés **contre la base réelle** — pas de doublure. Un test qui ment sur son
environnement ne protège rien.

Quatre règles nées de défauts trouvés en chemin :

1. **Un test qui fabrique son entrée ne teste jamais le producteur de cette entrée.** Trois
   référentiels sont restés vides en base pendant des mois sans qu'aucun test ne le signale.
   `chargement.test.ts` et `parite-laravel.test.ts` valident désormais l'état réel de la base.
   Quatrième occurrence : le formulaire public détruisait les saisies de toutes les étapes sauf la
   dernière — les tests appellent `creerDeclaration()` avec leurs propres données et n'ont jamais
   traversé l'interface.
2. **Toujours filtrer un nettoyage d'audit par `auditable_type`.** `auditable_id` est une colonne
   texte partagée par tous les modèles : un nettoyage par identifiant seul détruit des lignes sans
   rapport. `nettoyerAudit(type, ids)` rend le type obligatoire dans sa signature. **Et toujours
   trier** une lecture dont on compare les lignes par position : PostgreSQL ne promet aucun ordre,
   et un cas non trié passe par chance jusqu'au jour où une jointure ajoutée ailleurs retourne le
   tirage.
3. **Vérifier, ne pas supposer.** Le préfixe bcrypt, le comportement de `render` de Base UI, les
   dist-tags npm : chaque hypothèse qui a été vérifiée s'est révélée fausse au moins une fois.
4. **Une navigation qui annonce une destination doit la servir.** Quatre liens de la barre
   latérale ont mené vers deux 404 pendant toute la migration : les écrans transverses
   `/investigations` et `/actions-correctives` n'avaient jamais été portés depuis Laravel. Rien
   ne reliait ce que la barre annonce à ce que l'application sert. `navigation.test.ts` le fait
   désormais, en confrontant chaque `href` à l'existence de son `page.tsx`.

Les 67 exigences (39 EX, 15 RG, 13 RGI) sont citées par au moins un test. Trois d'entre elles sont
couvertes **structurellement** (lecture du source) plutôt que par exécution, faute de pouvoir
appeler une Server Action hors requête HTTP.

**Une seule exception à l'environnement `node`** : `declarer/[parcours]/__tests__/formulaire.test.tsx`
s'exécute dans un DOM (jsdom). Deux défauts s'y sont succédé — des étapes démontées qui effaçaient
les saisies, puis un double-clic sur « Continuer » qui envoyait la déclaration en sautant les
pièces jointes — et aucun n'était visible en lisant le source ni en inspectant le HTML servi : ils
vivent dans l'interaction. Le module de Server Action y est le seul remplacé, parce qu'il franchit
la frontière serveur ; rien de la logique du formulaire ne l'est.
