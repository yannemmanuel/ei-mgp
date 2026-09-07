# Exigences de traçabilité et d'audit

Source : CDC §15 (Exigences de traçabilité et d'audit), §24 du prompt utilisateur.

## 1. Portée de la traçabilité (CDC §15)

| Exigence CDC | Traduction technique |
|---|---|
| Historique des actions horodaté et associé à l'auteur (création, affectation, changement de statut, ajout pièce jointe, notification envoyée) | Table `audit_logs`, écriture systématique via un `Observer` Eloquent sur les modèles concernés + écriture explicite dans les actions n'ayant pas de modèle dédié (ex. notification envoyée) |
| Journal des modifications conservant la valeur avant/après | Colonnes `old_values` / `new_values` (JSON) sur `audit_logs`, remplies par l'Observer (`$model->getOriginal()` vs `$model->getChanges()`) |
| Historique complet des statuts successifs, avec date et auteur de chaque transition | Table dédiée `historique_statuts` (en plus de `audit_logs` généraliste — table métier lisible directement pour l'affichage de la frise chronologique d'un dossier) |
| Conservation des preuves (pièces jointes, échanges messagerie) selon la politique §11.3 | Les fichiers de `pieces_jointes` et les lignes de `messages` suivent le même cycle de purge/archivage que le dossier parent |
| Consultation des historiques réservée aux rôles habilités (Service MGP/DADD, DPO, Auditeur), lecture seule pour l'auditeur | `AuditLogPolicy::view` limitée à ces 3 rôles ; **aucune** permission `audit_logs.update` ou `audit_logs.delete` n'existe dans le catalogue de permissions |
| Intégrité : historique et journal non altérables/supprimables, y compris par un profil administrateur | Pas de route HTTP d'update/delete sur `audit_logs` ; contrainte défensive supplémentaire au niveau DB (voir §3 ci-dessous) |

## 2. Ce qui doit être audité (liste consolidée, croisée avec le prompt §24 et le CDC)

- Création de dossier (déclaration soumise).
- Modification d'un champ de dossier.
- Affectation / réaffectation (avec motif).
- Changement de statut (chaque transition de la machine à états).
- Ajout / suppression logique d'une pièce jointe.
- Envoi d'une notification (type, destinataire, canal — jamais le contenu s'il concerne un dossier
  anonyme, cf. `exigences-securite.md` §1).
- Création / modification / validation d'une investigation.
- Création / modification / clôture d'une action corrective.
- Clôture d'un dossier.
- Réouverture d'un dossier (avec motif).
- Modification des référentiels d'administration (catégories, statuts, sites, modèles de
  notification, niveaux de gravité, canaux, QR codes).
- Modification des permissions et des rôles utilisateurs.
- Connexions/déconnexions des comptes à privilèges (recommandé pour la piste d'audit d'un système
  gérant des données sensibles, même si non explicitement listé au mot près dans le CDC — cf.
  `decisions-techniques.md` DT-08 pour la justification de cet ajout raisonnable).

Trois évènements supplémentaires, proposés lors de la migration Next.js et **validés par le
métier** (cf. `MIGRATION_PLAN.md`) :

- **Export de données nominatives** (`rapport.export_nominatif`) : c'est la seule voie par
  laquelle des données personnelles quittent le système. Le DPO doit pouvoir savoir qui a extrait
  quoi. Seul l'export réellement nominatif est journalisé — un export anonyme ne sort aucune
  identité. Les paramètres reçus sont consignés en entier, y compris ceux qui ont été refusés.
- **Exécution des tâches planifiées** (`tache.executee`, `tache.echouee`) : sans trace, une tâche
  qui échoue chaque nuit est indiscernable d'une tâche qui n'a rien à faire.
- **Réattribution d'un mot de passe** (`user.mot_de_passe_regenere`) : ni la valeur ni son
  empreinte ne sont consignées, seulement le fait que l'opération a eu lieu et par qui.

## 3. Garantie d'immuabilité — mesures en profondeur (defense in depth)

Le prompt utilisateur est explicite : *« Ne jamais permettre un CRUD classique sur audit_logs »*.
Mesures superposées prévues (aucune seule n'est considérée suffisante) :

1. **Couche application** : aucun `AuditLogController`, aucune route `PUT/PATCH/DELETE
   /audit-logs/*`. Le modèle `AuditLog` n'expose pas de méthode d'update dans son cycle de vie
   applicatif (créé uniquement via un service `AuditLogger::record()` en `INSERT` pur).
2. **Couche Policy** : `AuditLogPolicy` retourne `false` pour `update` et `delete` sur tous les
   rôles sans exception, y compris `administrateur_digital`.
3. **Couche modèle Eloquent** : surcharge défensive empêchant `update()`/`delete()` d'aboutir même
   si un développeur futur les appelait par erreur (ex. lever une exception dans un événement
   `updating`/`deleting` du modèle).
4. **Couche base de données** (renforcement, à valider en Phase 2) : envisager un rôle PostgreSQL
   applicatif avec uniquement `INSERT`/`SELECT` sur `audit_logs` (pas `UPDATE`/`DELETE`), séparé du
   rôle utilisé pour le reste du schéma — décision à trancher en Phase 2 selon la contrainte
   d'hébergement (point d'arbitrage CDC §1.8 point 1, hors périmètre de ce document).

## 4. Accès en lecture — qui voit quoi

| Rôle | Accès `audit_logs` | Accès `historique_statuts` |
|---|---|---|
| `auditeur` | Lecture seule, historique complet, tous parcours | Lecture seule, tous dossiers |
| `dpo` | Lecture seule, focalisé données personnelles/journaux d'accès | Lecture seule, tous dossiers |
| `service_mgp` | Lecture seule, tous parcours (pilotage) | Lecture seule, tous dossiers |
| Autres rôles de traitement | Aucun accès à `audit_logs` | Lecture seule, **uniquement** l'historique des dossiers relevant de leur périmètre (même Policy que `dossiers.view`) |
| `administrateur_digital` | Lecture seule (pas plus qu'un autre rôle habilité) | Lecture seule sur dossiers techniques (QR codes, référentiels) uniquement |

## 5. Non-régression avec l'anonymat

Un point de vigilance spécifique (croisement §1 de `exigences-securite.md` et présent document) :
l'audit ne doit **jamais** devenir une voie de contournement de l'anonymat. Concrètement :
- `audit_logs.old_values`/`new_values` sur une action touchant un dossier anonyme ne doivent jamais
  contenir de champ d'identité (puisque ce champ n'existe nulle part en base pour ce dossier — la
  garantie est donc structurelle, pas seulement procédurale).
- L'IP et le user-agent de soumission d'une déclaration anonyme sont technique­ment journalisables
  (utile en cas d'abus du formulaire), mais leur **consultation** doit être restreinte au strict
  nécessaire (DPO/Auditeur en cas d'enquête sur abus), jamais visible par les rôles de traitement
  métier (`rqse`, `correspondant_mgp`, etc.) qui ne doivent voir aucune trace pouvant réidentifier le
  déclarant.
