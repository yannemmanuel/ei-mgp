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
  utilisateur.ts      chargement depuis la base, à chaque requête
  policies/           une par domaine métier
```

Les droits sont **relus en base à chaque requête**, jamais portés par le jeton de session : la
révocation d'un compte est ainsi effective à l'appel suivant, sans attendre l'expiration.

Le partage des responsabilités est explicite : le **code** décide ce qui EXISTE — le catalogue
fermé des 36 permissions et des 15 rôles —, la **base** décide qui obtient quoi. Les associations
se règlent depuis `/administration/habilitations` et prennent effet immédiatement. Trois contrôles
remplacent la comparaison automatique qui protégeait ces associations tant qu'elles étaient
figées : validation contre le catalogue, invariant du dernier administrateur actif, et
journalisation de chaque changement.

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
components/              Interface
```

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

---

## 6. Tests

285 tests, exécutés **contre la base réelle** — pas de doublure. Un test qui ment sur son
environnement ne protège rien.

Trois règles nées de défauts trouvés en chemin :

1. **Un test qui fabrique son entrée ne teste jamais le producteur de cette entrée.** Trois
   référentiels sont restés vides en base pendant des mois sans qu'aucun test ne le signale.
   `chargement.test.ts` et `parite-laravel.test.ts` valident désormais l'état réel de la base.
2. **Toujours filtrer un nettoyage d'audit par `auditable_type`.** `auditable_id` est une colonne
   texte partagée par tous les modèles : un nettoyage par identifiant seul détruit des lignes sans
   rapport. `nettoyerAudit(type, ids)` rend le type obligatoire dans sa signature.
3. **Vérifier, ne pas supposer.** Le préfixe bcrypt, le comportement de `render` de Base UI, les
   dist-tags npm : chaque hypothèse qui a été vérifiée s'est révélée fausse au moins une fois.

Les 67 exigences (39 EX, 15 RG, 13 RGI) sont citées par au moins un test. Trois d'entre elles sont
couvertes **structurellement** (lecture du source) plutôt que par exécution, faute de pouvoir
appeler une Server Action hors requête HTTP.
