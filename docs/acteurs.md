# Acteurs, rôles applicatifs et permissions

Source : CDC §3 (Parties prenantes), §18.4 (Matrice RACI simplifiée). Chaque acteur métier du CDC
est mappé à un **rôle** unique. Le nommage des rôles est un slug technique ; le libellé
métier officiel (CDC) est conservé dans la colonne « Acteur CDC » pour ne jamais perdre la
correspondance.

## 1. Principe de conception

- Un utilisateur peut cumuler plusieurs rôles (ex. un DRH peut aussi être Correspondant MGP dans une
  petite structure) : l'attribution est un many-to-many (`model_has_roles`).

  ⚠️ **Cumuler n'est pas être deux fois restreint**, c'est porter un mandat plus large : un compte
  n'est borné à son rattachement que si TOUS ses rôles porteurs d'accès le prévoient.
- Les permissions sont **toujours vérifiées côté serveur** (`src/server/authz`),
  jamais uniquement par masquage de menu (§7, §25, §34 du prompt).
- Le **cloisonnement par parcours** (un RQSE ne doit voir que les dossiers EI, un Correspondant MGP
  Sous-traitant ne doit pas voir les dossiers Communauté sauf si le même utilisateur cumule les
  rôles) est réalisé par les **Policies**, qui croisent `role` × `dossier.parcours_id`, et non par
  la création d'un rôle par combinaison rôle×parcours (ce qui exploserait le nombre de rôles).
- Aucun rôle ne bénéficie d'un bypass implicite de type "super-admin". Même
  `administrateur_digital` reçoit des permissions explicites, listées et testables — pour rester
  conforme à l'exigence d'audit (§24 : « ne jamais permettre un CRUD classique sur audit_logs »,
  y compris pour l'administrateur).

## 2. Matrice acteurs → rôle → accès (base sur CDC §3)

> ⚠️ **La colonne « Périmètre dossiers » dit ce que le rôle PERMET, pas ce que la personne voit.**
>
> Depuis l'ajout de la table `utilisateur_parcours`, le parcours se confie compte par compte,
> dans `/administration/utilisateurs`. Le périmètre effectif est l'**intersection** des deux : le
> rôle doit ouvrir le parcours, ET le parcours doit avoir été attribué.
>
> Conséquences :
> - **Un compte sans attribution ne voit aucun dossier**, quel que soit son rôle. C'est l'état
>   d'un compte nouvellement créé, et c'est délibéré : l'habilitation est explicite.
> - Trois personnes portant `correspondant_mgp` peuvent suivre chacune un type de grief
>   différent — c'est précisément ce que la colonne ci-dessous ne pouvait pas exprimer.
> - Les **rôles transverses** (`service_mgp`, `dg`, `auditeur`, `dpo`) échappent à la règle et
>   gardent les 4 parcours sans attribution. Sans cette exception, un dossier dont le parcours
>   n'est confié à personne deviendrait invisible de tous.
> - ⚠️ La permission `dossiers.view.all` **court-circuite ce cloisonnement** : elle donne accès à
>   tous les dossiers sans consulter ni rôle ni attribution. Un rôle censé être cloisonné par
>   parcours doit donc passer par `dossiers.view`, jamais par `dossiers.view.all`.
>
> La règle vit dans `src/server/authz/parcours.ts` : `parcoursDuRole()` répond sur le rôle,
> `parcoursAutorises()` sur la personne.

> ### Réorganisation du 11/09/2026 (second retour métier)
>
> **L'évènement indésirable n'est plus affecté.** Son traitement revient au **Chargé de sécurité
> du site**, qui complète le dossier après chaque comité. Il voit tous les EI de son site par le
> cloisonnement, sans qu'aucun ne lui soit affecté, et **ne détient ni `dossiers.assign` ni
> `dossiers.reassign`** : il ne peut le confier à personne, il le traite.
>
> Conséquence : un EI reste au statut « reçu ». Son délai court donc **depuis la réception** et
> non depuis une affectation qui n'a plus lieu (`STATUT_VERS_ETAPE`, `delais.ts`) — sans quoi il
> n'aurait eu aucune échéance, donc aucune relance ni escalade.
>
> **Les griefs se répartissent par type** : un correspondant par parcours, plus un Responsable MGP
> de structure qui voit les trois mais sur son seul site. « Structure » = **site**, seul découpage
> que porte chaque dossier — les griefs sous-traitant et communautaire n'ont pas de direction.
>
> Les rôles remplacés sont **désactivés, jamais supprimés** : ils ne confèrent plus rien dès le
> prochain appel, mais `model_has_roles` est conservée et les réactiver rend leurs droits sans
> réattribution. Ils restent nommés dans `ROLES`, `ROLES_PAR_PARCOURS` et la table des acteurs
> pour que leur historique se lise.

| Acteur CDC | Rôle applicatif (slug) | Compte requis | Périmètre dossiers | Niveau d'accès CDC |
|---|---|---|---|---|
| Déclarant (employé identifié) | `employe_declarant` | Optionnel (SSO futur) | Ses propres dossiers non-anonymes uniquement | Aucun compte requis / SSO conditionnel |
| Déclarant (sous-traitant / communauté) | *(aucun — accès public par référence + code)* | Aucun | Son dossier via référence + donnée de vérification | Accès libre |
| Employé / agent relais | `agent_relais` | Oui | Formulaire de saisie relais uniquement | Accès restreint au formulaire de saisie |
| **Chargé de sécurité du site** | `charge_securite` | Oui | Dossiers `ei_employe` **de son site**, sans affectation | Traitement complet de l'EI — **ne peut affecter à personne** |
| ~~Secrétaire CSST / Comité SST~~ | `secretaire_csst` | — | ⚠️ **Rôle désactivé** — remplacé par le Chargé de sécurité | — |
| ~~RQSE~~ | `rqse` | — | ⚠️ **Rôle désactivé** — remplacé par le Chargé de sécurité | — |
| RGP | `rgp` | Oui | Captage `grief_employe` | Écriture captage, lecture de ses dossiers |
| DRH / Directeurs / DR (griefs employés) | `responsable_grief_employe` | Oui | Dossiers `grief_employe` | Lecture/écriture |
| **Correspondant DRH** | `correspondant_drh` | Oui | Dossiers `grief_employe` + module Investigations | Lecture/écriture + Investigations |
| **Correspondant DADD** | `correspondant_dadd` | Oui | Dossiers `grief_communaute` + module Investigations | Lecture/écriture + Investigations |
| **Correspondant DL** | `correspondant_dl` | Oui | Dossiers `grief_sous_traitant` + module Investigations | Lecture/écriture + Investigations |
| **Responsable MGP de structure** | `responsable_mgp_structure` | Oui | Les 3 types de grief, **de son site uniquement** | Lecture/écriture + validation d'investigation |
| ~~Correspondant MGP / Enquêteur~~ | `correspondant_mgp` | — | ⚠️ **Rôle désactivé** — remplacé par les trois correspondants ci-dessus | — |
| Service MGP / DADD | `service_mgp` | Oui | **Tous les dossiers, 4 parcours** | Lecture/écriture transverse + administration fonctionnelle (référentiels métier) |
| Comité éthique / Syndicats | `comite_ethique` | Oui | Dossiers sensibles `grief_employe` (lecture) | Lecture restreinte, **sans données nominatives** |
| DP / Directions régionales | `captage_grief_communaute` | Oui | Captage `grief_communaute` | Écriture captage, lecture de ses dossiers |
| SST / DR / Commanditaire | `captage_grief_soustraitant` | Oui | Captage `grief_sous_traitant` | Écriture captage, lecture de ses dossiers |
| DG (direction) | `dg` | Oui | **Tous les dossiers** (lecture), décisions d'arbitrage (écriture ciblée) | Lecture globale + écriture décisions |
| DPO / Référent protection des données | `dpo` | Oui | Vue sur données personnelles, journaux d'accès, demandes RGPD | Lecture données personnelles + administration conservation |
| Administrateur digital / fonctionnel | `administrateur_digital` | Oui | Aucun accès métier aux dossiers par défaut | Console d'administration complète (technique) |
| Auditeur | `auditeur` | Oui | Lecture seule de l'historique complet + `audit_logs` | Lecture seule, sans droit de modification |

> Remarque : le CDC (§3, ligne « Service MGP / DADD ») lui attribue **aussi** un accès
> « administration fonctionnelle ». Il existe donc un chevauchement volontaire entre
> `service_mgp` (référentiels métier : catégories, statuts affichés, modèles de notification) et
> `administrateur_digital` (paramétrage technique : comptes, rôles, QR codes). Ce point est
> documenté comme décision technique DT-02 (`decisions-techniques.md`) plutôt que résolu
> silencieusement.

## 3. Catalogue de permissions proposé

Convention : `ressource.action[.portée]`.

| Domaine | Permissions |
|---|---|
| Dossiers | `dossiers.view`, `dossiers.view.own`, `dossiers.view.all`, `dossiers.create` *(via captage)*, `dossiers.assign`, `dossiers.reassign`, `dossiers.status.update`, `dossiers.close`, `dossiers.reopen` |
| Investigations | `investigations.view`, `investigations.create`, `investigations.update`, `investigations.validate` |
| Actions correctives | `actions.view`, `actions.create`, `actions.update`, `actions.verify_efficacite`, `actions.close` |
| Messagerie sécurisée | `messagerie.view`, `messagerie.send` |
| Notifications | `notifications.templates.manage` |
| Référentiels métier | `referentiels.categories.manage`, `referentiels.statuts.manage`, `referentiels.sites.manage` |
| Référentiels techniques | `qrcodes.manage`, `users.manage`, `roles.manage`, `canaux.manage` |
| Reporting | `reporting.view`, `reporting.export`, `reporting.export.nominatif` |
| Audit | `audit.view` *(lecture seule — aucune permission `audit.update`/`audit.delete` n'existe dans le système)* |
| RGPD | `rgpd.conservation.manage`, `rgpd.acces.view` |

`dossiers.view` est systématiquement restreint en Policy par `parcours_id` selon le rôle (cf.
tableau §2), sauf pour `service_mgp`, `dg` et `auditeur` (transverses par nature CDC).

## 4. Matrice RACI reprise du CDC (§18.4) — vérification de cohérence

La matrice RACI du CDC a été comparée à la matrice d'accès (§3) : aucune contradiction trouvée.
Un point à noter : la ligne « Administrateur digital » du RACI a des tirets partout sauf
« Pilotage : R (technique) » — confirmant que ce rôle n'a **aucune** responsabilité métier sur les
dossiers, uniquement technique. Ceci renforce le choix `administrateur_digital` sans accès dossier
par défaut (§2 ci-dessus).

## 5. Cas particulier : compte employé identifié (EX-DEC-04)

Un utilisateur `employe_declarant` :
- peut se connecter via un compte professionnel (préparation SSO — cf. `decisions-techniques.md`
  DT-01) uniquement s'il choisit d'être identifié ;
- n'obtient **aucune** permission de traitement (pas de rôle de gestionnaire) du simple fait de
  s'authentifier ;
- voit uniquement la liste de ses propres dossiers non-anonymes (`dossiers.view.own`) ;
- si un même individu cumule un rôle de traitement (ex. RQSE) ET déclare un EI en tant qu'employé,
  les deux usages restent séparés fonctionnellement : le RQSE ne doit pas hériter d'un accès
  spécial sur son propre dossier via ce mécanisme (une policy dédiée doit vérifier qu'un utilisateur
  n'est jamais affecté comme traitant de son propre dossier — règle de bon sens non explicitée dans
  le CDC, documentée en `decisions-techniques.md` DT-06).
