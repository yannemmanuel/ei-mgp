# Matrice des exigences fonctionnelles

Source : CDC §8 (Exigences fonctionnelles détaillées), croisée avec §16 (Critères d'acceptation
fonctionnelle) et §18.5 (Matrice de synthèse). Les identifiants `EX-*` sont ceux du CDC — **conservés
tels quels** pour garder la traçabilité : ils doivent apparaître dans les noms des cas de test,
ex. « EX-DEC-03 : l'anonymat masque l'identité ».

Colonnes :
- **Priorité** : Essentielle / Importante / Souhaitable (définition CDC §8, page 32).
- **Composant d'origine** : où l'exigence avait été implémentée dans la première version, en
  Laravel. ⚠️ **CES NOMS NE DÉSIGNENT PLUS AUCUN FICHIER** depuis le portage en Next.js. La
  colonne est conservée comme trace de traçabilité historique ; pour savoir où une exigence vit
  AUJOURD'HUI, chercher son identifiant `EX-*` dans `web/src`, où les tests le citent.
- **Statut** : `À faire` pour toutes les lignes à l'issue de la Phase 0 (aucun code encore écrit).
  Passé à `Fait` en Phase 13, à l'issue de l'audit de traçabilité consolidé (DT-32) qui a recoupé
  chaque ID contre `tests/` et corrigé les deux seules lacunes réelles trouvées (RG-09, RG-11).

## Module 1 — Déclaration

| ID | Description (résumé CDC) | Priorité | Acteur | Composant d’origine | Statut |
|---|---|---|---|---|---|
| EX-DEC-01 | Accès formulaire via QR code dédié par parcours | Essentielle | Déclarant | Route publique + `QrCode` model + redirection contrôleur | Fait |
| EX-DEC-02 | Accès complémentaire par lien web direct | Importante | Déclarant | Routes `/declarer/{parcours}` sans dépendance QR | Fait |
| EX-DEC-03 | Option anonymat sur les 4 formulaires, masquage identité | Essentielle | Déclarant | Composant Livewire commun `DeclarationForm` (toggle anonymat) | Fait |
| EX-DEC-04 | Authentification conditionnelle employé (compte pro si identifié, libre si anonyme) | Essentielle | Employé déclarant | Guard web + logique conditionnelle dans le formulaire EI/Grief Employé | Fait |
| EX-DEC-05 | Accès libre sans compte pour sous-traitant/communauté | Essentielle | Sous-traitant, Communauté | Routes publiques, aucun middleware `auth` | Fait |
| EX-DEC-06 | Pièces jointes depuis l'appareil, max 10 fichiers / 50 Mo — les images sont réduites dans le navigateur avant le dépôt (arbitrage du 08/09/2026, en remplacement de « max 5 fichiers ») | Importante | Déclarant | `PieceJointeUploadService` + Form Request de validation | Fait |
| EX-DEC-07 | Validation champs obligatoires, message d'erreur explicite | Essentielle | Déclarant | Form Requests dédiés par parcours | Fait |
| EX-DEC-08 | Génération auto numéro de référence unique + accusé de réception | Essentielle | Système, Déclarant | `ReferenceGeneratorService` + vue accusé de réception | Fait |
| EX-DEC-09 | Génération code d'accès secondaire (4-6 chiffres) si anonyme | Essentielle | Système, Déclarant anonyme | `AccessCodeService` (génération + hash) | Fait |
| EX-DEC-10 | Formulaire de saisie relais (agents/personnes relais), canal d'origine tracé | Importante | Employé / agent relais | Route protégée `/relais/{parcours}` + champ `canal_captage_id` | Fait |

## Module 2 — Gestion des dossiers

| ID | Description (résumé CDC) | Priorité | Acteur | Composant d’origine | Statut |
|---|---|---|---|---|---|
| EX-GES-01 | Liste des dossiers filtrable (parcours, catégorie, statut, gravité, période) | Essentielle | Acteurs de traitement | Livewire `DossierList` + `DossierFilter` value object | Fait |
| EX-GES-02 | Affectation automatique selon parcours/catégorie | Essentielle | Système | `AffectationAutomatiqueService` déclenché à la création | Fait |
| EX-GES-03 | Réaffectation manuelle avec motif obligatoire, tracée | Importante | Acteurs de traitement | `DossierController@reassign` + Policy + `audit_logs` | Fait |
| EX-GES-04 | Mise à jour du statut à chaque étape franchie | Essentielle | Acteurs de traitement | `DossierWorkflowService::transition()` | Fait |
| EX-GES-05 | Clôture avec synthèse de résolution obligatoire | Essentielle | Acteurs de traitement | Form Request `ClotureDossierRequest` | Fait |
| EX-GES-06 | Réouverture contrôlée réservée à un rôle habilité, motif obligatoire | Importante | Service MGP/DADD, DG | Policy `DossierPolicy::reopen` restreinte aux rôles `service_mgp`, `dg` | Fait |

## Module 3 — Investigations

| ID | Description (résumé CDC) | Priorité | Acteur | Composant d’origine | Statut |
|---|---|---|---|---|---|
| EX-INV-01 | Ouverture fiche d'investigation liée à un dossier | Importante | Correspondant MGP / Enquêteur | Modèle `Investigation` (FK `dossier_id` non-null) | Fait |
| EX-INV-02 | Saisie des constats d'enquête | Importante | Correspondant MGP / Enquêteur | Champs `faits_constates`, `personnes_rencontrees` | Fait |
| EX-INV-03 | Analyse des causes (immédiate / racine) | Souhaitable | Correspondant MGP / Enquêteur | Champs `cause_immediate`, `causes_racines` | Fait |
| EX-INV-04 | Recommandations et mesures proposées | Essentielle | Correspondant MGP / Enquêteur | Champ `recommandations` → source des actions correctives | Fait |
| EX-INV-05 | Validation hiérarchique avant clôture (jamais par l'enquêteur lui-même) | Importante | DRH, DG, Service MGP | `InvestigationPolicy::validate` (exclut `enqueteur_id === auth()->id()`) | Fait |

## Module 4 — Actions correctives

| ID | Description (résumé CDC) | Priorité | Acteur | Composant d’origine | Statut |
|---|---|---|---|---|---|
| EX-ACT-01 | Création d'action(s) corrective(s) depuis recommandations validées, responsable + échéance | Essentielle | Acteurs de traitement | Modèle `ActionCorrective` | Fait |
| EX-ACT-02 | Affectation à un responsable de mise en œuvre | Essentielle | Système, Acteurs de traitement | FK `responsable_id` | Fait |
| EX-ACT-03 | Suivi d'avancement (non démarrée / en cours / réalisée / en retard) | Essentielle | Responsable de l'action | Enum `statut` + job de recalcul du retard | Fait |
| EX-ACT-04 | Vérification d'efficacité après mise en œuvre | Importante | Comité SST, Service MGP | Champs `verification_efficacite`, `verification_commentaire` | Fait |
| EX-ACT-05 | Clôture de l'action, rattachée automatiquement à la clôture du dossier | Importante | Système | Règle RG-10 appliquée dans `DossierWorkflowService` (blocage clôture) | Fait |

## Module 5 — Notifications

| ID | Description (résumé CDC) | Priorité | Acteur | Composant d’origine | Statut |
|---|---|---|---|---|---|
| EX-NOT-01 | Notification auto à l'affectation d'un dossier | Essentielle | Système | Event `DossierAffecte` → Listener → `Notification` | Fait |
| EX-NOT-02 | Notification au déclarant identifié à chaque changement de statut majeur | Importante | Système, Déclarant identifié | Event `StatutDossierChange` (canal conditionné à `declarant_user_id` non-null) | Fait |
| EX-NOT-03 | Relance auto avant échéance (J-3) | Essentielle | Système, Acteurs de traitement | Scheduled command `dossiers:relancer-echeances` (queue) | Fait |
| EX-NOT-04 | Alerte escalade : N+1 + Service MGP à échéance dépassée ; Direction à +50 % | Essentielle | Système, Hiérarchie, Service MGP | Scheduled command `dossiers:detecter-retards` | Fait |
| EX-NOT-05 | Déclenchement immédiat circuit accéléré + notif simultanée si « Critique » | Essentielle | Système | Event `DeclarationCritique` déclenché en synchrone (pas de queue) à la soumission | Fait |
| EX-NOT-06 | Page de suivi accessible par référence + donnée de vérification secondaire | Essentielle | Système, Déclarant | Route publique `/suivi` + Livewire `SuiviDossier` + rate limiting | Fait |
| EX-NOT-07 | Messagerie sécurisée liée au dossier, sans lever l'anonymat | Importante | Système, Correspondant MGP/Enquêteur, Déclarant anonyme | Modèle `Message` + accès par jeton de session (référence+code), jamais par compte | Fait |

## Module 6 — Reporting

| ID | Description (résumé CDC) | Priorité | Acteur | Composant d’origine | Statut |
|---|---|---|---|---|---|
| EX-REP-01 | Tableau de bord centralisé consolidant les 4 parcours | Essentielle | Service MGP/DADD, Direction | Livewire `DashboardConsolide` + requêtes agrégées | Fait |
| EX-REP-02 | Filtrage par parcours/catégorie/période/site-direction/gravité | Importante | Service MGP/DADD, Direction | `ReportingFilter` value object partagé avec Module 2 | Fait |
| EX-REP-03 | Calcul auto délai moyen et taux de résolution/clôture | Essentielle | Système | `IndicateurService` (requêtes SQL agrégées, pas de calcul PHP sur collections complètes) | Fait |
| EX-REP-04 | Export Excel / PDF | Importante | Service MGP/DADD, Auditeur | `maatwebsite/excel` Exports + `barryvdh/laravel-dompdf` | Fait |
| EX-REP-05 | Historisation des stats agrégées anonymisées sans limitation de durée | Souhaitable | Système | Table `statistiques_mensuelles` alimentée par job planifié | Fait |
| EX-REP-06 | Restriction des données nominatives dans les exports selon le rôle | Essentielle | Système, DPO | Policy `ExportPolicy` + exclusion des colonnes d'identité par défaut | Fait |

## Récapitulatif quantitatif (cohérence avec CDC §18.5)

| Module | Nb exigences CDC | Essentielle | Importante | Souhaitable |
|---|---|---|---|---|
| 1. Déclaration | 10 | 7 | 3 | 0 |
| 2. Gestion des dossiers | 6 | 4 | 2 | 0 |
| 3. Investigations | 5 | 1 | 3 | 1 |
| 4. Actions correctives | 5 | 3 | 2 | 0 |
| 5. Notifications | 7 | 5 | 2 | 0 |
| 6. Reporting | 6 | 3 | 2 | 1 |
| **Total** | **39** | **23** | **14** | **2** |

**Conséquence pour le plan de phases** : les 23 exigences « Essentielle » doivent toutes être
couvertes avant toute démonstration de recette (CDC §16). Les 14 « Importante » sont incluses dans
le périmètre de développement standard (non différées par défaut, sauf contrainte de calendrier
signalée par l'utilisateur — point d'arbitrage n°2). Les 2 « Souhaitable » (EX-INV-03, EX-REP-05)
peuvent être livrées en fin de programme sans bloquer la mise en service.
