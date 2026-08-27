# Analyse du cahier des charges — Digitalisation EI / MGP

**Source** : `Cahier_des_Charges_Fonctionnel_Digitalisation_EI_MGP` (docx/pdf), version 1.0 — 27/08/2026,
fourni par l'AMOA pour le compte de la DADD. Fichier original localisé dans
`C:\Users\DELL\Documents\Formulaire SST\`.

Ce document est la synthèse d'analyse de la Phase 0. Il ne réinvente aucune règle métier : il
reformule et organise ce que le cahier des charges (« CDC ») dit déjà, en signalant explicitement
les zones d'ombre.

## 1. Contexte et enjeu

La DADD gère un dispositif de captage/traitement/suivi de deux familles de signalements :

- **EI — Événement Indésirable** : signalé par un **employé** uniquement (sécurité, environnement,
  presque-accident…).
- **Griefs / plaintes**, rattachés au **MGP** (Mécanisme de Gestion des Plaintes), avec 3
  populations de déclarants : **Employé**, **Sous-traitant**, **Communauté** riveraine.

Aujourd'hui : formulaires papier, canaux hétérogènes (registres, ligne verte, boîte à suggestions,
agents locaux), pas de numéro de suivi unique, échelles de gravité et délais incohérents,
pilotage impossible faute de données consolidées, anonymat mal garanti (CDC §1.2).

**Conclusion pour l'architecture** : le système doit être *un seul outil* couvrant 4 parcours de
déclaration avec un socle commun (statuts, gravité, anonymat, traçabilité), et non 4 applications
séparées.

## 2. Objectifs (CDC §1.5–1.6) → traduction en capacités système

| Objectif CDC | Capacité système correspondante |
|---|---|
| Remplacer le papier par un système centralisé, accessible par QR code par parcours | 4 formulaires publics + module de gestion de QR codes |
| Garantir une déclaration anonyme réelle et opérante de bout en bout | Non-collecte stricte des champs d'identité + double clé (référence + code secondaire) + messagerie sécurisée sans levée d'anonymat |
| Traçabilité intégrale de la déclaration à la clôture | Journal d'audit immuable + historique des statuts |
| Automatiser notifications, affectations, suivi des délais | Moteur de workflow + événements + jobs de relance/escalade |
| Tableaux de bord et statistiques consolidées | Module Reporting avec agrégations SQL et exports |

## 3. Périmètre fonctionnel retenu (CDC §2.1)

6 modules, détaillés exigence par exigence en §8 du CDC (repris intégralement dans
`exigences-fonctionnelles.md`) :

1. **Déclaration** — QR code / lien direct, 4 formulaires, anonymat, pièces jointes, validation,
   accusé de réception + référence.
2. **Gestion des dossiers** — consultation, affectation/réaffectation, statuts, clôture, réouverture
   contrôlée.
3. **Investigations** — enquête, constats, causes, recommandations, validation hiérarchique.
4. **Actions correctives** — création, affectation, suivi, vérification d'efficacité, clôture.
5. **Notifications** — réception, changement de statut, relances, alertes de dépassement, circuit
   accéléré, page de suivi déclarant.
6. **Reporting** — tableaux de bord, indicateurs, exports Excel/PDF.

Transverses : intégration des canaux historiques via **saisie relais tracée**, administration des
référentiels, traçabilité/audit de toutes les actions.

**Hors périmètre explicite (CDC §1.8, point 7)** : le multilinguisme (français / langues locales)
n'est **pas** retenu dans ce document. Cette exclusion doit être respectée : ne pas construire de
système i18n complet dans les premières phases, mais ne pas non plus figer le code en dur d'une
façon qui rendrait une future i18n coûteuse (cf. `decisions-techniques.md`).

## 4. Les 4 parcours

| Code parcours | Population | Formulaire CDC | Authentification |
|---|---|---|---|
| `ei_employe` | Employé | §9.1 | Optionnelle (SSO futur), obligatoirement anonyme si non identifié — EX-DEC-04 |
| `grief_employe` | Employé | §9.2 | Optionnelle, idem EX-DEC-04 |
| `grief_sous_traitant` | Sous-traitant | §9.3 | Aucune (EX-DEC-05) |
| `grief_communaute` | Membre communauté riveraine | §9.4 | Aucune (EX-DEC-05) |

Chaque parcours a : sa propre liste de catégories, son propre circuit de traitement (CDC §6.1–6.4),
ses propres acteurs de captage/traitement, mais **le même socle** : anonymat, échelle de gravité
unique à 4 niveaux, statuts harmonisés (interne + affiché), délais par étape, circuit accéléré si
« Critique ».

## 5. Points en attente d'arbitrage (CDC §1.8) et traitement dans ce projet

Le CDC liste 7 points ouverts. Ce projet doit rester valide quelle que soit leur résolution. Position
adoptée pour chaque point :

| # | Point ouvert | Hypothèse du CDC | Position technique adoptée ici |
|---|---|---|---|
| 1 | Solution technique cible (MS Forms vs app dédiée) | Le CDC reste agnostique | **Tranché côté prompt utilisateur** : application dédiée Laravel/PostgreSQL. Ce point est donc résolu pour ce projet. |
| 2 | Budget / délai projet | Aucune hypothèse | Sans objet pour le développement technique ; aucun arbitrage de périmètre n'est fait sur cette base. |
| 3 | Faisabilité messagerie sécurisée liée à un dossier anonyme | Incluse au périmètre cible, sous réserve technique | **Confirmée faisable** et implémentée (EX-NOT-07) — voir `workflows.md` §Messagerie. |
| 4 | Délais chiffrés manquants (analyse préliminaire EI, traitement/enquête EI, mise en œuvre mesures — tous parcours) | Valeurs « à valider » | Modélisées comme données de configuration modifiables sans déploiement (table `sla_delais`), avec un flag `est_valide_metier=false` par défaut sur ces lignes. Le calcul d'alerte reste **désactivé** pour une étape tant que son délai n'est pas validé (pas de fausse alerte sur une valeur provisoire). Voir `decisions-techniques.md` DT-04. |
| 5 | Nom / rattachement du DPO | Rôle documenté génériquement | Rôle `dpo` créé sans utilisateur nominatif préassigné ; à assigner en Phase 3/10 par l'administrateur. |
| 6 | Répartition responsable orientation « Autre » par parcours | Service MGP/DADD par défaut pour les 4 parcours | Implémenté tel quel (RG-09) ; le référentiel `categories` prévoit une catégorie « Autre » par parcours, routée par défaut vers le rôle `service_mgp`. |
| 7 | Multilinguisme | Hors périmètre | Non implémenté. Les libellés restent en base (tables de référence, pas de texte figé dans les vues Blade autant que possible) pour ne pas fermer la porte à une i18n future, sans construire de moteur de traduction. |

## 6. Exigences de sécurité, d'audit et de conformité — synthèse

Voir `exigences-securite.md` et `exigences-audit.md` pour le détail. Points structurants qui
conditionnent l'architecture dès la Phase 2 (schéma de données) :

- **Anonymat réel** (RG-06) : absence physique de colonnes d'identité renseignées, pas seulement un
  masquage d'affichage. → table `declaration_identites` séparée, créée uniquement si non-anonyme.
- **Immutabilité de l'audit** (§15, §24) : `audit_logs` ne doit être modifiable/supprimable par
  personne, y compris l'administrateur fonctionnel. → pas de route CRUD, contrainte applicative et
  policy dédiée refusant update/delete.
- **RGPD / durées de conservation** (RG-11, RG-12, §11.3) : 24 mois actif, puis archivage 5–10 ans,
  puis anonymisation/suppression sauf contentieux. → job planifié + `politique de conservation`
  configurable par catégorie.
- **Cloisonnement des accès par rôle et par parcours** (RG-14, §3, §18.4) : vérifié côté serveur via
  policies, jamais uniquement côté UI.

## 7. Ce qui n'est PAS inventé

Conformément à la consigne, les éléments suivants ne sont **pas** ajoutés comme règle métier alors
qu'ils ne figurent pas dans le CDC :

- Pas de workflow d'approbation budgétaire, pas de facturation, pas de module RH complet.
- Pas de règles de gravité automatique par mots-clés (le CDC ne décrit qu'une sélection manuelle par
  le déclarant/l'acteur, liste déroulante Faible/Modéré/Élevé/Critique).
- Pas de SLA différents de ceux du §11 (les délais « à valider » restent des valeurs indicatives
  modifiables, pas des délais inventés définitifs).
- Pas de canal de notification (SMS, WhatsApp…) non mentionné : le CDC ne précise que « notification
  outil + email » (§12.2) ; ce sont les seuls canaux implémentés en socle.
- Pas de hiérarchie d'organisation complète (organigramme RH) : seuls `sites` et `directions` sont
  modélisés comme référentiels de filtrage, tels qu'exigés par EX-REP-02 et le module 14.

## 8. Documents associés

- `acteurs.md` — matrice acteurs → rôles applicatifs → permissions.
- `exigences-fonctionnelles.md` — matrice complète des exigences (ID CDC conservés).
- `regles-metier.md` — RG-01 à RG-15 + règles implicites extraites des formulaires/workflows.
- `workflows.md` — machine à états par parcours, circuit accéléré, anonymat, canal relais, « Autre ».
- `exigences-securite.md` — exigences de sécurité applicative.
- `exigences-audit.md` — exigences de traçabilité et d'audit.
- `modele-donnees.md` — modèle relationnel PostgreSQL proposé.
- `decisions-techniques.md` — journal des décisions techniques et arbitrages non couverts par le CDC.
