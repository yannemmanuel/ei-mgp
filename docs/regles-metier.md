# Règles de gestion

Source primaire : CDC §10 (RG-01 à RG-15). Complétées par les règles **implicites** trouvées dans
les formulaires (§9), le cycle de vie (§7) et les processus (§6) — signalées `[implicite]` et
toujours rattachées à leur section CDC d'origine pour ne rien inventer hors texte.

## A. Règles explicites du CDC (RG-01 à RG-15)

| ID | Règle | Application technique prévue |
|---|---|---|
| RG-01 | Numéro de référence unique généré à la soumission, format structuré par parcours (`EI-AAAA-NNNNNN`, `GEM-AAAA-NNNNNN`, `GST-AAAA-NNNNNN`, `GCO-AAAA-NNNNNN`) | `ReferenceGeneratorService`, séquence par (parcours, année), contrainte `UNIQUE` PostgreSQL |
| RG-02 | Code d'accès secondaire 4-6 chiffres pour toute déclaration anonyme ; seule clé de consultation avec la référence | Génération aléatoire cryptographique, stockage **hashé** (`hash()`/bcrypt), jamais en clair |
| RG-03 | Déclaration validée (statut ≠ Brouillon) non supprimable ; seule clôture/rejet motivé met fin au traitement actif | Pas de route DELETE sur `dossiers` ; `deleted_at` volontairement absent du modèle `Dossier` (aucun soft-delete métier autorisé) |
| RG-04 | Historique complet des actions et changements de statut conservé de façon inaltérable | Tables `historique_statuts` + `audit_logs`, append-only |
| RG-05 | Respect des délais §11 suivi automatiquement ; dépassement déclenche l'alerte §12 | Table `sla_delais` + scheduled commands (Module 5) |
| RG-06 | Si anonymat activé : aucun champ d'identification collecté/stocké/affiché, y compris dans la messagerie sécurisée | Table `declaration_identites` non créée si anonyme ; `messages.expediteur_identite` toujours NULL côté déclarant anonyme |
| RG-07 | Réouverture réservée aux rôles habilités (Service MGP/DADD, DG), motif obligatoire conservé | Policy + colonne `motif_reouverture` obligatoire en base |
| RG-08 | Déclaration « Critique » → circuit accéléré automatique, indépendamment de l'heure/jour | Event synchrone à la création du dossier (pas de dépendance à un cron) |
| RG-09 | Déclaration « Autre » → orientée vers Service MGP/DADD par défaut, dans le délai d'analyse préliminaire du parcours | Catégorie `autre` par parcours + affectation automatique forcée vers rôle `service_mgp` |
| RG-10 | Dossier non clôturable tant que ses actions correctives ne sont pas closes et leur efficacité vérifiée | Vérification bloquante dans `DossierWorkflowService::cloturer()` (EX-ACT-05) |
| RG-11 | Données personnelles d'un dossier clôturé : 24 mois consultation active, puis archivage 5-10 ans, puis anonymisation/suppression sauf contentieux | Job planifié mensuel `dossiers:appliquer-politique-conservation` |
| RG-12 | Statistiques agrégées/anonymisées conservées sans limitation de durée | Table `statistiques_mensuelles`, jamais purgée |
| RG-13 | Déclaration reçue par canal relais tracée avec canal d'origine, même workflow qu'une déclaration directe | `canal_captage_id` obligatoire sur `dossiers`, aucune branche de workflow différente |
| RG-14 | Accès aux données nominatives restreint par rôle (matrice §18.4) ; exports excluent par défaut les champs d'identité | Policies + `ExportPolicy` (EX-REP-06) |
| RG-15 | Consentement RGPD requis explicitement pour les sous-traitants ; présumé couvert pour employés/communautés sous réserve DPO | Champ obligatoire `consentement_rgpd` uniquement sur le formulaire Sous-traitant (§9.3) ; pas de blocage équivalent sur les 3 autres formulaires |

## B. Règles implicites extraites des formulaires et du cycle de vie

Ces règles ne portent pas d'identifiant `RG-*` dans le CDC mais sont formulées sans ambiguïté dans
le texte (colonnes « Règle de validation » des formulaires §9, ou logique du tableau §7). Elles sont
listées ici pour ne pas être perdues lors du codage.

| ID interne | Règle | Source CDC |
|---|---|---|
| RGI-01 | La date de survenue/des faits ne peut pas être postérieure à la date de soumission | §9.1, §9.2, §9.3, §9.4 (règle répétée sur chaque formulaire) |
| RGI-02 | ~~La description factuelle est obligatoire avec un minimum de 20 caractères~~ → **Révisée le 08/09/2026** : description **obligatoire**, **sans longueur minimale**, **200 caractères au plus**. Seul le PLANCHER est levé — il écartait des signalements légitimes tenant en trois mots (« Fuite gaz zone B » : 16 caractères) ; le plafond tient à la lecture, le détail passant par la messagerie du dossier. Un dossier ne peut pas exister sans description : sans récit des faits, il n'est ni qualifiable ni affectable. | §9.1 à §9.6 (champ « Description ») |
| RGI-03 | Champs d'identification (nom, matricule/entreprise, coordonnées) obligatoirement masqués/non collectés si la case anonymat est cochée, quel que soit le parcours | §9.1–9.4, note `*` en bas de chaque tableau de formulaire |
| RGI-04 | Une pièce jointe est limitée à **3 fichiers et 5 Mo** au total par déclaration (retour métier du 11/09/2026 ; le plafond était passé à 10 fichiers / 50 Mo le 08/09, ramené depuis). Les images sont réduites dans le navigateur avant le dépôt, l'image réduite devenant l'original de référence sur lequel porte le `checksum_sha256`. | §9.1–9.4 (règle répétée), EX-DEC-06 |
| RGI-05 | La date d'ouverture d'une investigation ne peut être antérieure à la date de recevabilité du dossier | §9.5 |
| RGI-06 | La validation hiérarchique d'une investigation ne peut jamais être renseignée par l'enquêteur lui-même | §9.5 (« Ne peut être renseignée par l'enquêteur lui-même ») |
| RGI-07 | La date d'échéance d'une action corrective doit être postérieure à sa date de création | §9.6 |
| RGI-08 | La vérification d'efficacité d'une action corrective ne peut être positive sans commentaire associé | §9.6 |
| RGI-09 | La date de clôture d'une action corrective n'est renseignée qu'après une vérification d'efficacité positive | §9.6 |
| RGI-10 | Le statut affiché au déclarant est une projection simplifiée du statut interne (5 valeurs max : Reçu, En cours d'analyse, En traitement, Résolu, Clôturé) — jamais l'inverse | §7.2, table de correspondance |
| RGI-11 | Un dossain « Rejeté (non recevable) » est un statut terminal côté interne mais s'affiche comme « Clôturé » côté déclarant | §7.1, §7.2 |
| RGI-12 | Un numéro de référence et, si anonyme, un code secondaire sont **la seule** clé de consultation — pas de récupération par email/téléphone puisque ces champs peuvent être absents | §5.3, §5.4, §6.6 |
| RGI-13 | Une déclaration « Autre » suit le délai d'analyse préliminaire du parcours d'origine (pas un délai spécifique) le temps d'être requalifiée | §6.8 |
| RGI-14 | Le matricule est obligatoire dès lors que le déclarant s'identifie (arbitrage du 08/09/2026), et n'est ni demandé ni collecté en déclaration anonyme — c'est une donnée d'identité, soumise à RGI-03 et RG-06. Concerne les seuls parcours qui en comportent un : EI Employé et Grief Employé. | §9.1–9.2, RGI-03 |

## C. Règles de circuit accéléré (CDC §6.5, reprises en §12.3)

| Règle | Détail |
|---|---|
| Déclenchement | Automatique dès qu'un dossier est classé gravité **4 — Critique**, quel que soit le parcours |
| Notification | < 12h, y compris hors heures ouvrées, aux acteurs listés par parcours (tableau §6.5) |
| Premières mesures conservatoires | < 24h (au lieu de 3 jours ouvrés en circuit standard) |
| Information continue | La DG est informée en continu jusqu'à la clôture du dossier |

Matrice des destinataires immédiats (reprise exacte du CDC, ne pas simplifier) :

| Parcours | Destinataires notifiés immédiatement |
|---|---|
| EI Employé | RQSE · Secrétaire CSST · Président CSST (Directeur de structure) · Service Prévention |
| Grief Employé | Correspondant MGP · DRH · Service MGP/DADD · DG |
| Grief Sous-traitant | Correspondant MGP · SST/DR · Service MGP/DADD · DG |
| Grief Communauté | Service MGP/DADD · toutes les Directions · DG |

> Remarque : « Président CSST » et « Service Prévention » (ligne EI Employé) et « toutes les
> Directions » (ligne Grief Communauté) ne figurent **pas** dans la liste des acteurs détaillée du
> CDC §3. Ce sont des destinataires de notification uniquement (pas des rôles applicatifs avec
> accès dossier) — traité en `decisions-techniques.md` DT-07.

## D. Cohérence entre règles — vérifications croisées effectuées en Phase 0

- RG-10 (clôture bloquée si actions correctives ouvertes) est cohérent avec EX-ACT-05 : les deux
  décrivent le même comportement, pas de contradiction.
- RG-06 (anonymat total) est cohérent avec EX-NOT-07 (messagerie sécurisée) : la messagerie doit
  donc fonctionner par jeton de session (référence + code), jamais par compte utilisateur, pour ne
  jamais relier un message à une identité.
- RG-08 (circuit accéléré indépendant de l'heure) impose que le job de notification « Critique »
  **ne peut pas** dépendre d'un scheduler à intervalle (ex. toutes les 15 min) : il doit être
  déclenché de façon synchrone/événementielle à l'instant de la soumission.
