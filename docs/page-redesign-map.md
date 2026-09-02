# PAGE REDESIGN MAP — EI-MGP SODECI

Pour chaque écran majeur : état actuel → limites UX → nouvelle structure → vérification fonctionnelle (méthodologie imposée, §41 du prompt d'origine). Les rôles cités sont les 15 rôles réels de `RolePermissionSeeder` — pas les personas génériques ("Gestionnaire", "Enquêteur"...) du prompt d'origine, qui ne correspondent à aucun rôle effectivement modélisé dans l'application.

## Rôles réels et regroupement en "profils" d'expérience

L'application n'a pas de rôle "Enquêteur" ou "Responsable" au sens strict : `investigations.create/update` et `actions.create/update` sont accordées à plusieurs rôles de traitement de dossier (`secretaire_csst`, `rqse`, `correspondant_mgp`...), et l'assignation d'un enquêteur à une investigation est une donnée (`enqueteur_id`) indépendante du rôle. Le dashboard par "rôle" du prompt d'origine devient donc, plus fidèlement, un dashboard par **permission dominante** :

| Profil d'expérience | Rôles réels concernés | Permission clé | Ce qu'il doit voir en premier |
|---|---|---|---|
| Déclarant | `employe_declarant`, `rgp`, `captage_grief_communaute`, `captage_grief_soustraitant` | `dossiers.view.own` uniquement | Ses propres dossiers, leur statut, un CTA "suivre un dossier" |
| Agent relais | `agent_relais` | `dossiers.create` uniquement | Raccourci direct vers les formulaires de saisie relais |
| Traitement de dossier | `secretaire_csst`, `rqse`, `responsable_grief_employe`, `correspondant_mgp` | `dossiers.view` + `investigations.*`/`actions.*` | Dossiers à traiter, échéances proches, mes investigations/actions en cours |
| Pilotage transverse | `service_mgp`, `dg` | `reporting.view` + `dossiers.view.all` | Le dashboard consolidé actuel (KPI + tendances), enrichi d'un bloc "à risque" |
| Conformité / audit | `dpo`, `auditeur` | `audit.view` + `reporting.view` | Historique/traçabilité en avant, KPI en second plan |
| Administration technique | `administrateur_digital` | `users.manage`, `roles.manage`, `qrcodes.manage`, `canaux.manage` | Le centre d'administration (§ dédiée plus bas) |
| Comité d'éthique | `comite_ethique` | `dossiers.view` seul | Vue simple des dossiers, aucune action de gestion |

Implémentation : `DashboardConsolide::render()` garde sa branche binaire actuelle (`reporting.view` oui/non) comme fondation, mais la subdivise — pas de nouvelle permission à créer, uniquement de nouvelles combinaisons de `@can`/`Gate::allows` déjà existantes pour choisir quel bloc afficher en tête de page.

## 1. Dashboard

**Objectif de la page** : répondre à "que se passe-t-il, qu'est-ce qui est urgent, que dois-je faire" — pas seulement afficher des compteurs.
**Qui l'utilise** : tout utilisateur authentifié (page d'atterrissage post-connexion, jamais de 403 — DT-31, contrainte à préserver).
**Info la plus importante selon le profil** : pour "Traitement de dossier", les dossiers en retard ; pour "Pilotage", la tendance et les dossiers critiques ; pour "Déclarant", l'état de ses propres dossiers.
**Action principale** : ouvrir le dossier qui a besoin d'attention — pas changer un filtre.
**À supprimer visuellement** : rien de fonctionnel, mais la barre de 7 filtres ne doit plus être la première chose vue.
**À mettre en avant** : un bloc "à traiter" en tête de page, avant les KPI.

### Nouvelle structure (profil "Pilotage transverse" — remplace l'actuel écran `reporting.view`)

```
Bonjour, {nom} — {rôle(s)}
Voici l'état actuel du dispositif EI / MGP

┌─ À TRAITER ────────────────────────────┐
│ {n} dossiers en retard · {n} échéances │  ← nouveau bloc, alimenté par les
│ proches · {n} dossiers critiques       │    mêmes requêtes que joursRestants()
│ [Voir les dossiers concernés]          │    (DossierListPage) déjà existant
└─────────────────────────────────────────┘

[Déclarations] [Taux résolution] [Taux clôture] [Délai moyen]   ← 4 KPI existants, inchangés

┌─ Volume mensuel (existant) ──┐ ┌─ Répartition gravité (existant) ─┐
└───────────────────────────────┘ └────────────────────────────────────┘
┌─ Délai moyen (existant) ─────┐ ┌─ Taux résolution (existant) ──────┐
└───────────────────────────────┘ └────────────────────────────────────┘

Filtres (barre repliable, sous les KPI et non plus au-dessus)
Répartitions par parcours/statut/gravité (existant, tables inchangées)
```

Le bloc "À TRAITER" est la seule pièce réellement nouvelle : une requête `Dossier::whereHas('affectations', ...)->where('echeance', '<', now())` (échéance déjà calculée ailleurs via `joursRestants()` dans `DossierListPage`, à factoriser en service partagé plutôt que dupliquée) comptant les dossiers en retard/à échéance proche dans le périmètre `RoleParcoursScope` de l'utilisateur.

### Profil "Traitement de dossier" (remplace le résumé personnel actuel)

```
Bonjour, {nom}

┌─ Mes dossiers à traiter (n) ──────────┐
│ • EI-2026-00128 — en retard (3j)      │  ← liste courte, 3-5 lignes,
│ • MGP-2026-00094 — échéance demain    │    lien direct vers chaque dossier
│ [Voir tous mes dossiers →]            │
└─────────────────────────────────────────┘

┌─ Mes investigations en cours (n) ─┐  ┌─ Mes actions correctives (n) ─┐
└─────────────────────────────────────┘  └──────────────────────────────┘
```

Remplace l'actuel simple compteur "X dossier(s) actuellement affecté(s)" (`getMesDossiersAffectesProperty()`) par une vraie liste actionnable — la propriété existante reste utilisée pour le total, une nouvelle requête bornée (`limit(5)`) alimente le détail.

**Vérification fonctionnelle requise** : `reporting.view`/`Gate::allows('export-rapports')` restent les seules portes d'accès aux exports ; le bloc "à traiter" doit repasser par `RoleParcoursScope` comme `DossierListPage::perimetre()`, jamais une requête non scopée.

## 2. Fiche dossier (case management)

**Objectif** : comprendre en un coup d'œil où en est le dossier et agir sans scroller pour trouver l'action pertinente.
**Qui l'utilise** : tous les rôles avec `dossiers.view*`, actions réservées selon policy (`reassign`/`updateStatus`/`close`/`reopen`, déjà en place).
**Info la plus importante** : l'étape du workflow et l'échéance — aujourd'hui noyées dans une rangée de badges.
**Action principale** : dépend du statut (changer de statut, réaffecter, clôturer) — déjà bien identifiée dans le panneau latéral actuel, à conserver, pas à réinventer.
**À supprimer** : rien — chaque section actuelle (description, identité, pièces jointes, investigations, actions, messagerie, historique) correspond à une exigence fonctionnelle réelle (CDC).
**À mettre en avant** : la position dans le workflow.

### Nouvelle structure

```
← Dossiers                                          (breadcrumb, nouveau)

EI-2026-00128 — Incident sur infrastructure
[CRITIQUE] [Anonyme]

●────────●────────●────────○
Reçu   Affecté  Analyse  Clôture         ← nouveau WorkflowStepper,
                                            dérivé de statut->code existant
                                            (StatutDossierCode), pas de nouvel état

[En retard de 3 jours]                  ← extrait du groupe de badges,
                                            mis en évidence seul, sous le stepper

┌─ Description (existant) ────────┐  ┌─ Affectation (existant, sidebar) ─┐
├─ Identité (existant, gardé) ────┤  ├─ Changer le statut (existant) ────┤
├─ Pièces jointes (existant) ─────┤  ├─ Rejeter / Clôturer / Réouvrir ───┤
├─ Investigations (existant) ─────┤  │  (existant, inchangé)             │
├─ Actions correctives (existant) ┤  └────────────────────────────────────┘
├─ Messagerie (existant) ─────────┤
└─ Activité (renommé "Historique")┘   ← ActivityTimeline, même donnée
                                          ($this->historique), présentation
                                          verticale avec repère par type
```

Le `WorkflowStepper` est purement une nouvelle présentation de `StatutDossierCode` (déjà un enum fermé avec un ordre logique métier) — aucune nouvelle donnée, aucune nouvelle transition, juste une lecture visuelle de l'état actuel. Les statuts terminaux divergents (`Rejeté`) doivent être gérés comme une "sortie" du stepper linéaire, pas forcés dans les 4 étapes (à traiter en Phase 5 avec `docs/regles-metier.md` sous la main pour la liste exhaustive des statuts).

**Vérification fonctionnelle requise** : toutes les policies (`reassign`, `updateStatus`, `close`, `reopen`) et le champ `contentieux` restent inchangés ; `peutVoirIdentite`/`peutVoirMessagerie` continuent de conditionner l'affichage des sections correspondantes.

## 3. Navigation / Sidebar

**État actuel** : liste plate de 6 liens, gardés par `@can`, sans regroupement ni compteur (voir `uiux-redesign.md` §5).

**Nouvelle structure**, regroupée par intention plutôt que par domaine technique, tout en gardant exactement les mêmes gardes de permission qu'aujourd'hui (aucune nouvelle permission requise) :

```
ACCUEIL
  Tableau de bord                    (route('dashboard'), inchangé, jamais masqué)

MON ACTIVITÉ                          (nouveau groupe, visible si l'utilisateur a
  Mes dossiers                        des affectations — réutilise DossierListPage
  Mes investigations                  avec un filtre par défaut sur l'utilisateur
  Mes actions                         courant, pas une nouvelle page)

DOSSIERS                              (existant, @can viewAny Dossier)
  Tous les dossiers
  En retard                           (nouveau : lien vers DossierListPage avec
                                        filtre "échéance dépassée" pré-appliqué)

ANALYSE                               (existant, regroupé)
  Investigations                      (@can viewAny Investigation)
  Actions correctives                 (@can viewAny ActionCorrective)

PILOTAGE                              (existant Reporting, renommé)
  Reporting

ADMINISTRATION                        (existant, inchangé)
AUDIT                                 (existant, inchangé)
```

"Mes dossiers"/"Mes investigations"/"Mes actions" ne sont **pas de nouvelles pages** : ce sont les listes existantes (`DossierListPage`, `InvestigationListPage`, `ActionCorrectiveListPage`) instanciées avec un paramètre d'URL par défaut (ex. `?assigneAMoi=1`), donc zéro nouveau composant Livewire, juste un lien avec query string et un filtre déjà scriptable côté composant.

**Vérification fonctionnelle requise** : chaque lien garde exactement le `@can`/`canAny` actuel — le regroupement est une question de présentation, pas de permission.

## 4. Formulaire de déclaration (wizard)

**État actuel** : une seule page qui défile (~10-20 champs visibles simultanément selon le parcours), voir `ei-employe-form.blade.php`.

**Nouvelle structure** — wizard réel, 3-4 étapes selon le parcours :

```
Étape 2 / 4                                    ●●○○
À propos de l'événement

Que s'est-il passé ? *
[textarea description]

Catégorie *                    Niveau de gravité *
[select]                       [select]

                                    [← Précédent]  [Continuer →]
```

Répartition proposée pour EI employé (4 étapes) : (1) Identité/anonymat + canal relais, (2) contexte (date/lieu/direction/poste), (3) nature (catégorie/gravité/description/mesure corrective), (4) pièces jointes + récapitulatif + soumission. Les parcours "grief" plus courts auraient 3 étapes (identité, nature, pièces jointes+soumission).

**Contrainte de sécurité impérative** (voir `uiux-redesign.md` §15) : le honeypot (`piegeAraignee`) et le délai anti-bot (`horodatageAffichage`, vérifié ≥3s) sont évalués dans `submit()`, appelé une seule fois à la fin — le découpage en étapes doit rester une pagination **côté vue uniquement** (propriété Livewire `etapeActuelle` qui montre/cache des blocs déjà présents dans le DOM ou navigue entre eux), sans jamais appeler une validation serveur distincte par étape qui court-circuiterait `reglesCommunes()`/`reglesSpecifiques()` exécutées ensemble aujourd'hui. Une validation "étape par étape" à l'affichage (pour ne pas laisser avancer avec un champ obligatoire vide) peut rester côté client/`$this->validateOnly()` sans toucher au chemin de soumission final.

**Vérification fonctionnelle requise** : `submit()` inchangé dans sa logique, tests Pest existants sur `DeclarationFormBase` et les 4 sous-classes doivent continuer à passer sans modification (ils testent `Livewire::test(...)->set(...)->call('submit')`, indépendant de la façon dont les champs sont répartis visuellement en étapes).

## 5. Administration (centre)

**État actuel** : grille de 7 cartes identiques (titre + description d'une ligne), voir `administration/index.blade.php`.

**Nouvelle structure** — mêmes 7 destinations, mêmes gardes `@can`, enrichies d'un indicateur par section :

```
Administration

┌─ Utilisateurs ──────────┐  ┌─ Catégories ─────────────┐  ┌─ Statuts ────────────┐
│ {n} comptes actifs      │  │ {n} catégories actives   │  │ {n} statuts configurés│
│ [Gérer →]               │  │ [Gérer →]                │  │ [Gérer →]             │
└──────────────────────────┘  └───────────────────────────┘  └───────────────────────┘
┌─ Sites ─────────────────┐  ┌─ Canaux de captage ──────┐  ┌─ Notifications ──────┐
...
┌─ QR codes ──────────────┐
│ {n} QR codes générés    │
└──────────────────────────┘
```

Chaque compteur est une requête `count()` déjà triviale sur les modèles existants (`User::count()`, `Categorie::actif()->count()`, etc.) — aucune nouvelle table, aucun nouveau service.

## 6. Notification center (nouvel écran, donnée déjà existante)

**Constat clé** : `DossierEvenementNotification` écrit déjà dans la table standard `notifications` de Laravel via `toDatabase()` (canal "outil") à chaque affectation/changement de statut/circuit critique — `auth()->user()->notifications`/`unreadNotifications` sont donc immédiatement exploitables sans migration ni nouveau service.

```
🔔 (badge = unreadNotifications()->count(), dans la topbar)

Notifications
Aujourd'hui
● Dossier EI-2026-00128 — Vous avez été affecté     [lu au clic]
● Action corrective — Échéance dans 2 jours
Plus tôt
● Investigation — Validation requise
```

Composant Livewire minimal : liste paginée de `auth()->user()->notifications`, action `marquerLu($id)` → `$notification->markAsRead()` (méthode native Laravel), lien de chaque ligne construit à partir du contenu déjà stocké (`evenement_code`/`objet`/`corps` — vérifier lors de l'implémentation si un identifiant de dossier doit être ajouté aux données stockées pour permettre un lien direct, sinon le lien renverra vers la liste générale).

**Vérification fonctionnelle requise** : ne pas modifier `DossierEvenementNotification`/les 3 listeners existants sans nécessité — si un lien direct vers le dossier est souhaité, ajouter une clé (`dossier_id`) à `toDatabase()` est un changement mineur et rétrocompatible (n'affecte pas les notifications déjà stockées, qui resteront sans lien direct).

## Inventaire complet des pages (référence)

| Page | Composant | Phase de refonte |
|---|---|---|
| Connexion | `auth/login.blade.php` | 3 (layout) — déjà modernisé, pas de refonte structurelle prévue |
| Dashboard | `DashboardConsolide` | 4 |
| Liste dossiers | `DossierListPage` | 5 |
| Détail dossier | `DossierDetailPage` | 5 |
| Liste investigations | `InvestigationListPage` | 7 |
| Détail investigation | `InvestigationDetailPage` | 7 |
| Liste actions correctives | `ActionCorrectiveListPage` | 8 |
| 4 formulaires de déclaration | `EiEmployeForm` + 3 autres | 6 |
| Suivi public | `SuiviDossier` | 6 (même layout que déclaration) |
| Administration (7 écrans) | `*Admin` (7 composants) | 10 |
| Audit | `AuditLogViewer` | transverse (accessibilité/densité, pas de restructuration majeure — écran de conformité, la sobriété est une qualité ici) |
| Notifications | *(nouveau)* | 9 |
