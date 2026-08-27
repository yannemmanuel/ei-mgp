# Workflows métier

Source : CDC §6 (Processus métier détaillés), §7 (Cycle de vie des dossiers).

## 1. Machine à états — statuts internes (CDC §7.1)

```
Brouillon → Soumis → Reçu → Affecté → En analyse ─┬─→ En investigation ─┬─→ Action corrective en cours → Résolu → Clôturé → (Réouvert →→ retour En investigation | Action corrective en cours)
                                                    │                    │
                                                    └─→ Rejeté           └─→ En attente d'information complémentaire → (retour En investigation)
                                                       (terminal,
                                                        affiché "Clôturé")
```

Table des transitions autorisées (reprise exacte CDC §7.1) :

| Statut interne | Entrée depuis | Sortie vers | Acteur qui déclenche |
|---|---|---|---|
| Brouillon | (début saisie) | Soumis | Déclarant |
| Soumis | Brouillon | Reçu | Système (automatique) |
| Reçu | Soumis | Affecté | Système (affectation automatique, EX-GES-02) |
| Affecté | Reçu | En analyse | Acteur affecté |
| En analyse | Affecté | En investigation **ou** Rejeté | Acteur en charge de la recevabilité |
| En investigation | En analyse, En attente d'information, Réouvert | Action corrective en cours **ou** En attente d'information complémentaire | Enquêteur / Correspondant MGP |
| En attente d'information complémentaire | En investigation | En investigation | Déclarant (réponse) ou tiers |
| Action corrective en cours | En investigation, Réouvert | Résolu | Système (EX-ACT-05, quand toutes les actions sont vérifiées efficaces) |
| Résolu | Action corrective en cours | Clôturé | Acteur responsable |
| Clôturé | Résolu, Rejeté | Réouvert (exceptionnel) | Service MGP/DADD ou DG uniquement (RG-07) |
| Réouvert | Clôturé | En investigation **ou** Action corrective en cours | Service MGP/DADD ou DG |
| Rejeté (non recevable) | En analyse | *(terminal)* | Acteur en charge de la recevabilité |

**Décision d'implémentation (voir `decisions-techniques.md` DT-05)** : les statuts `Brouillon` et
`Soumis` sont traités comme des **états transitoires côté formulaire** (état du composant Livewire
avant validation), et non comme des lignes persistées dans `dossiers`. La ligne `dossiers` est créée
directement au statut `Reçu` lors de la soumission réussie (cf. §15 du prompt : les 13 étapes de
création sont exécutées dans une seule transaction). Cette simplification ne change aucune règle
métier visible : RG-03 protège déjà uniquement les déclarations « validées » (donc jamais l'état
Brouillon), et aucune exigence ne demande la persistance d'un brouillon serveur.

## 2. Statuts affichés au déclarant (CDC §7.2) — table de correspondance figée

| Statut affiché | Statuts internes regroupés |
|---|---|
| Reçu | Soumis, Reçu, Affecté |
| En cours d'analyse | En analyse |
| En traitement | En investigation, En attente d'information complémentaire, Action corrective en cours, Réouvert |
| Résolu | Résolu |
| Clôturé | Clôturé, Rejeté (non recevable) |

Cette table doit être une fonction pure (`StatutAffichageResolver`) — jamais dupliquée dans les
vues, pour éviter toute divergence entre back-office et page de suivi publique.

## 3. Circuits de traitement par parcours (CDC §6.1–6.4)

Les 4 tableaux ci-dessous sont la transcription fidèle du CDC. Ils diffèrent uniquement par les
**acteurs responsables par étape**, pas par la structure des étapes elle-même (toutes suivent :
Captage → Analyse préliminaire → Traitement/enquête → Retour d'information → Mise en œuvre des
mesures → Retour après résolution → Clôture/suivi/évaluation).

### 3.1 EI Employé (§6.1) — 6 étapes (pas de "retour après résolution" séparé, fusionné avec "retour à l'ensemble des agents")

| # | Étape | Acteur(s) | Statut résultant |
|---|---|---|---|
| 1 | Captage | Employé (déclarant) | Reçu |
| 2 | Analyse et plan d'action | Secrétaire CSST · RQSE | En analyse |
| 3 | Retour d'information au déclarant | Secrétaire CSST · RQSE | En traitement |
| 4 | Mise en œuvre des mesures | Responsable identifié | Action corrective en cours |
| 5 | Retour à l'ensemble des agents | Comité SST | Résolu |
| 6 | Évaluation et clôture | Comité SST | Clôturé |

### 3.2 Grief Employé (§6.2) — 7 étapes

| # | Étape | Acteur(s) | Statut résultant |
|---|---|---|---|
| 1 | Captage | RGP · Directeurs/DR · Comité éthique · Syndicats · Service MGP | Reçu |
| 2 | Analyse préliminaire | DRH · Correspondant MGP · RQSE | En analyse |
| 3 | Traitement / enquête approfondie | DRH · Correspondant MGP · RQSE | En investigation |
| 4 | Retour d'information au plaignant | Service MGP | En traitement |
| 5 | Mise en œuvre des mesures | DG · Service MGP | Action corrective en cours |
| 6 | Retour après résolution | Service MGP | Résolu |
| 7 | Clôture, suivi et évaluation | DG · Service MGP | Clôturé |

### 3.3 Grief Sous-traitant (§6.3) — 7 étapes

| # | Étape | Acteur(s) | Statut résultant |
|---|---|---|---|
| 1 | Captage | SST · DR · Commanditaire | Reçu |
| 2 | Analyse préliminaire | Correspondant MGP · DL | En analyse |
| 3 | Traitement du grief | Correspondant MGP · DL | En investigation |
| 4 | Retour d'information au plaignant | Service MGP | En traitement |
| 5 | Mise en œuvre des mesures | Correspondant MGP · DL | Action corrective en cours |
| 6 | Retour après résolution | Service MGP | Résolu |
| 7 | Clôture, suivi et évaluation | Service MGP | Clôturé |

### 3.4 Grief Communauté (§6.4) — 7 étapes

| # | Étape | Acteur(s) | Statut résultant |
|---|---|---|---|
| 1 | Captage | DP · Directions régionales · Employés/agents relais · Service MGP · Toutes Directions | Reçu |
| 2 | Analyse préliminaire | Service MGP/DADD · Correspondant MGP | En analyse |
| 3 | Traitement du grief | Service MGP/DADD · Correspondant MGP · Enquêteur | En investigation |
| 4 | Retour d'information au plaignant | Service MGP/DADD | En traitement |
| 5 | Mise en œuvre des mesures | Équipe dédiée | Action corrective en cours |
| 6 | Retour après résolution | Service MGP/DADD | Résolu |
| 7 | Clôture, suivi et évaluation | DG · Service MGP | Clôturé |

**Implication technique** : les « acteurs responsables » par étape ne sont pas toujours un seul
rôle — ils sont modélisés comme un **ensemble de rôles autorisés à faire progresser le dossier à
cette étape**, vérifié par Policy, pas comme un unique `assignee_id`. L'affectation (table
`dossier_affectations`) peut porter plusieurs utilisateurs simultanément sur un même dossier (ex.
Secrétaire CSST + RQSE tous deux affectés à un EI).

## 4. Sous-processus transverses

### 4.1 Circuit accéléré — Critique (§6.5)
Voir `regles-metier.md` §C pour le détail complet (déjà transcrit, non dupliqué ici).

### 4.2 Déclaration anonyme (§6.6)
1. Génération référence + code secondaire à la soumission.
2. Aucun champ d'identification collecté ni transmis aux traitants.
3. Suivi exclusivement via page de consultation (référence + code).
4. Échanges enquêteur ↔ déclarant via messagerie sécurisée liée au dossier, sans lever l'anonymat.
5. Le dossier apparaît dans le tableau de bord au même titre que les autres, **à l'exclusion des
   champs d'identification dans les exports**.

### 4.3 Canal relais (§6.7)
- Un agent (ligne verte, agent local) ou une personne relais (boîte à suggestions, dépouillée
  périodiquement) saisit la déclaration au nom du déclarant.
- Le canal d'origine est une métadonnée automatique du dossier (`canal_captage_id`).
- Même numéro de référence, même workflow, mêmes délais qu'une saisie directe (RG-13) — **aucune
  branche de code séparée** ne doit exister pour les dossiers issus d'un canal relais au-delà de la
  capture de cette métadonnée.

### 4.4 Orientation des déclarations « Autre » (§6.8)
1. Le Service MGP/DADD reçoit la déclaration dans le délai de l'analyse préliminaire du parcours
   concerné (3 jours ouvrés pour les 3 parcours Griefs — le délai EI « Autre » suit la valeur EI
   « à valider », cf. `decisions-techniques.md` DT-04).
2. Requalification vers la catégorie la plus proche, ou affectation directe à l'acteur compétent.
3. Une fois requalifiée, le dossier suit le processus standard de sa nouvelle catégorie — **le
   parcours ne change pas**, seule la `categorie_id` change (une déclaration « Autre » du parcours
   Grief Employé reste un dossier `grief_employe`, jamais requalifiée vers un autre parcours : le
   CDC ne décrit une réorientation qu'au niveau catégorie, pas parcours).

## 5. Diagramme d'état consolidé (vue développeur)

```
                    ┌───────────┐
   (soumission) ──► │   Reçu    │
                    └─────┬─────┘
                          │ affectation auto (EX-GES-02)
                    ┌─────▼─────┐
                    │  Affecté  │
                    └─────┬─────┘
                          │ début analyse
                    ┌─────▼──────┐        rejet motivé
                    │ En analyse │─────────────────────► Rejeté (terminal, affiché "Clôturé")
                    └─────┬──────┘
                          │ recevable
              ┌───────────▼────────────┐   ◄──┐ retour info reçue
              │   En investigation     │──────┘
              └───────────┬────────────┘
                    │      │
   info manquante   │      │ recommandations formulées
        ┌───────────▼──┐   │
        │ En attente   │   │
        │ d'information│───┘ (retour ci-dessus)
        └──────────────┘   │
                     ┌──────▼───────────────┐
                     │ Action corrective     │
                     │ en cours              │
                     └──────┬────────────────┘
                            │ toutes actions vérifiées efficaces (RG-10 / EX-ACT-05)
                      ┌─────▼─────┐
                      │  Résolu   │
                      └─────┬─────┘
                            │ synthèse de résolution saisie (EX-GES-05)
                      ┌─────▼─────┐   réouverture motivée, rôle habilité (RG-07)   ┌──────────┐
                      │  Clôturé  │ ───────────────────────────────────────────►  │ Réouvert │
                      └───────────┘  ◄─────────────────────────────────────────── └────┬─────┘
                                                                                          │
                                                                     retour "En investigation"
                                                                     ou "Action corrective en cours"
```
