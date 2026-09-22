# UI/UX REDESIGN AUDIT — EI-MGP SODECI

> ⚠️ **ARCHIVE — décrit l'application AVANT le portage en Next.js.**
>
> Ce document est un constat daté, et il le reste : il cite des composants Livewire, des vues
> Blade et des fichiers PHP qui n'existent plus depuis le retrait du framework (2026-09-22). Il
> n'est PAS mis à jour, parce qu'un audit réécrit après coup cesse d'être un audit. Pour l'état
> actuel, lire le code ; pour ce qui a été décidé depuis, `decisions-techniques.md`.


Statut : **audit seul, aucun code modifié.** Conformément à l'instruction explicite du prompt qui a déclenché ce document, ceci est la Phase REDESIGN 0. Aucune ligne de Blade/CSS/PHP n'a été touchée pour produire ce rapport — tout ce qui suit vient de la lecture directe du code actuel (routes/web.php, les 22 composants Livewire, `RolePermissionSeeder`, `app.css`, les layouts, `DossierDetailPage`, `DashboardConsolide`, `DeclarationFormBase` et ses 4 sous-classes).

**Point de méthode à valider avant toute implémentation** : ce prompt fournit une palette de base (`#1F3864` navy / `#C55A11` orange / `#F4F6FA`), mais le message précédent de cette même conversation avait donné l'instruction explicite et directe *« utilise cette couleur #00A651 et le blanc »* — le vert `#00A651` est la couleur de marque réelle de SODECI. Les deux instructions sont contradictoires et je ne peux pas trancher seul un choix d'identité visuelle aussi structurant. Section 11 et `design-system-v2.md` proposent une résolution (vert SODECI en primaire, navy/orange comme teintes de soutien) mais **ce point reste en attente de confirmation explicite**, au même titre que le reste de ce rapport.

---

## 1. État actuel

L'application est un Laravel 12 / Livewire 4 / Tailwind v4, 22 composants Livewire répartis en 8 domaines (Déclaration ×4, Dossiers ×2, Investigations ×2, Actions correctives ×2, Reporting ×1, Administration ×7, Audit ×1, Messagerie ×1, Suivi ×1).

Fondations visuelles déjà en place (posées lors d'une passe précédente, non ce prompt-ci) :
- Un jeu de composants CSS minimal : `.card`, `.btn` (`-primary/-secondary/-danger/-warning`), `.badge-*` (7 teintes sémantiques), `.alert-*`.
- Une palette à 2 tons : `--color-brand-green: #00a651` + `--color-brand-bg: #f8fafc`, le reste en neutres `slate-*`.
- Sidebar back-office blanche avec accent vert sur l'item actif, navigation plate (Dossiers, Investigations, Actions correctives, Reporting, Administration, Audit), gardée par `@can`.
- Layout public (`guest.blade.php`) à deux colonnes : panneau de contexte clair avec accroche en `font-serif`, formulaire dans une `.card`.
- 4 graphiques Chart.js sur le dashboard consolidé, système de toasts, modales Alpine, QR codes SVG inline.
- 9 icônes Heroicons recopiées à la main (`x-icons.*`), pas de package d'icônes installé.

Ce qui n'existe **pas du tout** aujourd'hui, malgré ce que la structure du prompt laisse supposer :
- Pas de centre de notifications utilisateur (voir §9 — la donnée existe déjà côté backend, l'écran n'existe pas).
- Pas de recherche globale, pas de Command Palette.
- Pas de page profil.
- Pas de drawer (tout est page complète ou modale).
- Pas de wizard multi-étapes sur les formulaires de déclaration — le panneau "3 étapes" du layout public est une simple frise décorative du parcours global (remplir → recevoir une référence → suivre), le formulaire lui-même est une seule page qui défile (`ei-employe-form.blade.php` : ~20 champs visibles d'un coup, aucun état `etapeActuelle`).
- Pas de dashboards différenciés par rôle — un seul dashboard avec une branche binaire (`reporting.view` oui/non).

## 2. Problèmes UX majeurs

- **Le dossier ne raconte pas d'histoire.** `dossier-detail-page.blade.php` empile 7 cartes verticalement (description → identité → pièces jointes → investigations → actions correctives → messagerie → historique) sans hiérarchie de lecture : le statut du workflow (où en est ce dossier ?) n'est visible que via 2 badges texte dans l'en-tête, il n'y a aucune représentation du parcours (reçu → affecté → analyse → clôture).
- **Le dashboard répond à "combien" mais pas à "quoi faire".** 4 cartes KPI + 4 graphiques + 3 tableaux de répartition sont tous au même niveau visuel. Rien ne répond à "qu'est-ce qui est urgent", "qu'est-ce qui nécessite mon action maintenant" — un dossier en retard de 10 jours a la même importance visuelle qu'une statistique de tendance.
- **15 rôles réels, une seule expérience.** `RolePermissionSeeder` définit 15 rôles métier avec des permissions très différentes (`employe_declarant` ne voit que ses dossiers ; `service_mgp` voit tout, affecte, exporte, gère les référentiels). Le dashboard actuel ne distingue que "a `reporting.view`" vs "non" — un `secretaire_csst` avec 40 dossiers à traiter et un `employe_declarant` avec 1 dossier personnel reçoivent une expérience quasi identique.
- **Formulaire de déclaration = mur de champs.** Un déclarant en situation de détresse (c'est un mécanisme de plainte, pas un formulaire administratif anodin) doit affronter ~10-14 champs visibles simultanément avant de pouvoir soumettre.
- **Notifications invisibles.** `DossierEvenementNotification` écrit déjà dans la table `notifications` standard de Laravel (canal "outil" = `toDatabase()`) à chaque affectation, changement de statut, circuit critique — mais rien dans l'interface ne les affiche. Un utilisateur affecté à un dossier ne le sait que s'il consulte manuellement la liste.
- **Actions importantes cachées dans le flux.** Réaffecter, changer le statut, clôturer sont des boutons pleine largeur empilés dans une colonne latérale — fonctionnels mais non priorisés (le bouton "Rejeter" en rouge a le même poids visuel qu'un changement de statut anodin tant qu'on n'a pas scrollé jusqu'à lui).

## 3. Problèmes visuels

- Absence totale d'échelle typographique nommée : tous les titres de section utilisent `text-sm font-semibold text-slate-900` (`<h2 class="mb-3 text-sm font-semibold text-slate-900">` apparaît identique sur au moins 15 écrans différents) — un titre de carte "Description" a la même taille qu'un label de champ.
- Une seule teinte d'accent (`brand-green`) utilisée à la fois pour les items de nav actifs, les boutons primaires, les bordures de carte KPI (`border-l-4 border-l-brand-green`, appliqué identiquement aux 4 KPI du dashboard sans distinction de signification) — rien ne code visuellement "ceci est positif" vs "ceci est neutre" vs "ceci demande attention".
- Cartes toutes au même niveau de surface (`bg-white`, `shadow-sm`, `rounded-xl`) qu'il s'agisse d'un conteneur de premier niveau ou d'une sous-section — aucune hiérarchie de profondeur (background / surface / elevated).
- Rayons d'angle cohérents mais non intentionnels : `rounded-xl` sur `.card`, `rounded-md` sur `.btn`/`.badge` (en fait `rounded-full`) — fonctionne, mais n'a jamais été formalisé comme un système.

## 4. Problèmes de hiérarchie

- Sur le dashboard, les filtres (7 `<select>` + 2 dates dans une carte) précèdent visuellement les KPI alors qu'ils sont un outil secondaire de raffinement, pas le contenu principal.
- Sur la fiche dossier, l'information "ce dossier est en retard de 12 jours" est un badge parmi 4 autres dans l'en-tête, au même niveau que "Anonyme" — une donnée opérationnelle critique traitée avec le même poids qu'un simple attribut descriptif.
- Aucune distinction visuelle entre une action réversible (filtrer) et une action à conséquence (clôturer un dossier, rejeter, marquer en contentieux) au-delà de la couleur du bouton.

## 5. Problèmes de navigation

- Navigation plate à 6 entrées, aucun regroupement par intention ("mon activité" vs "vue transverse" vs "pilotage" vs "administration") alors que les permissions le permettraient déjà.
- Aucun compteur/badge sur les items de nav (ex. nombre de dossiers en retard visible uniquement en ouvrant la liste et en lisant chaque ligne).
- Le lien "Reporting" pointe toujours vers `/dashboard`, qui se ramifie en interne (vue consolidée vs résumé personnel) — logique correcte, mais rien dans le libellé du lien n'indique à un `employe_declarant` que "Reporting" va en réalité lui montrer un résumé personnel, pas un tableau de bord.
- Pas de fil d'Ariane (breadcrumb) sur les pages profondes (`/dossiers/{id}/investigations/{id}`) — seul un lien texte "← Retour à la liste" existe sur la fiche dossier, pas sur la fiche investigation.

## 6. Problèmes responsive

- La sidebar mobile fonctionne (tiroir Alpine `sidebarOpen`), mais le contenu principal (`dashboard-consolide.blade.php`) empile 7 `<select>` de filtre en pleine largeur sur mobile sans groupement — long à traverser au doigt.
- Les tableaux de répartition (`par parcours`/`par statut`/`par gravité`) sont de vrais `<table>` HTML : sur mobile ils rétrécissent au lieu de se transformer, seule la largeur de conteneur s'adapte.
- Le formulaire de déclaration (cible mobile-first prioritaire, ce sont des smartphones de terrain) n'a aucune optimisation tactile spécifique au-delà du responsive générique Tailwind : pas de zones de touch élargies, pas de clavier contextuel (`inputmode`) sur les champs numériques/téléphone.

## 7. Composants à supprimer

- Rien à supprimer au sens strict — la base actuelle (`.card`/`.btn`/`.badge`/`.alert`) est saine et doit être **absorbée** dans le Design System V2 plutôt que jetée : ces classes encodent déjà correctement statut/gravité, un vocabulaire à préserver (§45 du prompt : ne pas casser la logique métier, la gravité et le statut sont des règles métier autant que des couleurs).
- Le titre de section générique `text-sm font-semibold text-slate-900` répété partout doit disparaître en tant que pattern ad hoc — remplacé par un vrai token typographique (`--text-heading-sm` ou équivalent, voir `design-system-v2.md`).

## 8. Composants à refondre

- **Sidebar / navigation** — passer d'une liste plate à des groupes par intention + compteurs (voir `page-redesign-map.md`).
- **En-tête de fiche dossier** — extraire le statut/l'échéance dans un vrai stepper de workflow, pas des badges parmi d'autres.
- **Cartes KPI du dashboard** — différencier par sémantique (volume neutre / performance positive / risque) au lieu d'un accent vert uniforme.
- **Historique de dossier** (`<ul>` de `<li>` texte) — refondu en timeline d'activité verticale avec repères visuels par type d'évènement.
- **Formulaire de déclaration** — refondu en wizard multi-étapes réel (voir Phase 6).
- **Empty states** — le composant `<x-empty-state>` existe déjà (title/description/icon/action) : à enrichir visuellement (illustration légère), pas à reconstruire.

## 9. Composants à créer

- `WorkflowStepper` — étapes du parcours dossier (reçu → affecté → analyse → clôture), état actif/complété/à venir.
- `ActivityTimeline` — historique dossier + éventuellement fil d'activité dashboard ("Nouveau dossier", "Investigation terminée").
- `Breadcrumb` — fil d'Ariane pour les pages imbriquées (dossier → investigation).
- `NotificationBell` / centre de notifications — **la donnée existe déjà** (`auth()->user()->notifications`, alimentée par `DossierEvenementNotification::toDatabase()`), c'est un écran à créer, pas une fonctionnalité à inventer. Portée : lecture/marquage lu, lien vers le dossier concerné.
- `DataTable` enrichi — pattern commun pour les 3 listes existantes (Dossiers, Investigations, Actions correctives), avec tri visuel et densité cohérente, sans changer leurs requêtes/permissions.
- `RoleDashboardCard` / widget "à traiter" — carte de synthèse orientée action, déclinée par profil de permission (voir §13 `page-redesign-map.md`).
- `Drawer` — pour un aperçu rapide de dossier depuis une liste sans quitter la page (optionnel, à confirmer en Phase 5).

## 10. Nouvelles structures de pages

Détaillées page par page dans `page-redesign-map.md` (méthodologie §41 du prompt : état actuel → limite UX → nouvelle structure → vérification fonctionnelle, pour chaque écran majeur). Résumé :
- **Dashboard** : passe d'un bloc unique filtres+KPI+graphiques à une composition priorisée par profil (bandeau d'accueil contextuel → alertes "à traiter" → KPI → tendances → répartitions).
- **Dossier** : passe d'un empilement de cartes à une expérience "case management" avec stepper de workflow en tête de page.
- **Formulaire de déclaration** : passe d'un long formulaire à un wizard 3-4 étapes avec barre de progression.
- **Administration** : passe d'une grille de 7 cartes identiques à un centre avec statistiques par section (ex. "12 utilisateurs actifs", "3 modèles de notification configurés").

## 11. Nouvelle direction artistique

Détaillée dans `visual-direction.md`. Synthèse :
- Concept "Institutional Premium" retenu, adapté au contexte réel (SODECI, service public de l'eau en Côte d'Ivoire — pas un SaaS générique).
- **Palette — point à trancher** : je recommande de garder `#00A651` (vert SODECI, donné explicitement par l'utilisateur avec sa valeur hexadécimale exacte lors du message précédent) comme couleur primaire de marque, et d'intégrer `#1F3864` (navy) comme neutre profond/texte de très haut contraste et `#C55A11` (orange) comme accent d'alerte secondaire (au même rang que amber/red existants) plutôt que comme couleur de marque principale — parce que (a) le vert est la couleur réelle de l'identité SODECI et le critère de succès §44 du prompt exige que l'app reste "reconnaissable comme l'application EI/MGP de SODECI", (b) l'instruction "utilise #00A651 et le blanc" est plus récente et plus explicite (hex donné directement, sans exemple/valeur "de base") que celle de ce prompt-ci. Alternative si ce choix est rejeté : basculer entièrement sur navy/orange comme dans `design-system-v2.md` — les deux options y sont chiffrées.
- Typographie : conserver la paire déjà installée (Instrument Sans + Source Serif 4) mais lui donner une vraie échelle (`design-system-v2.md` §Typographie) au lieu d'un usage ponctuel limité à 2 endroits.
- Dark mode : non recommandé pour l'instant (voir `visual-direction.md` §Dark mode) — application institutionnelle de conformité consultée en contexte professionnel/bureau, pas un outil d'usage nocturne prolongé ; les tokens seront néanmoins structurés en sémantique (`--color-surface`, `--color-text` etc.) pour ne pas fermer la porte plus tard.

## 12. Design System V2

Voir `design-system-v2.md` — jeu complet : échelles de couleur (primary/secondary/neutral/success/warning/danger/info + surface/background/border/text), échelle typographique nommée (Display → Label), échelle d'espacement, langage de formes (radius), niveaux de profondeur (background/surface/elevated/floating/overlay), tokens de mouvement.

## 13. Stratégie d'illustrations IA

**Contrainte technique confirmée** : cet environnement d'exécution n'a accès à aucun outil de génération d'image (vérifié explicitement — seuls des outils de lecture Google Drive sont disponibles). Les illustrations ne peuvent donc pas être produites par moi directement dans cette session. Trois options, aucune tranchée :

1. **Composants prêts à recevoir un asset** — je construis les emplacements (empty states, hero de formulaire, écrans de succès/erreur) avec les bonnes dimensions/traitement (recadrage, superposition de couleur de marque, `loading="lazy"`), l'utilisateur fournit les fichiers réels (photothèque SODECI ou commande à un prestataire) et je les intègre.
2. **Prompts détaillés prêts à l'emploi** — je rédige, pour chaque emplacement listé en §21 du prompt d'origine, un prompt texte complet (style "Premium African Corporate", contraintes anti-clichés, interdiction de logo/texte/watermark) que l'utilisateur peut soumettre à un outil externe (Midjourney, DALL·E, etc.) et me rapporter les fichiers obtenus.
3. **Motifs SVG abstraits** — je crée des motifs géométriques/organiques (vagues, gouttes, lignes de circuit) en SVG pur, cohérents avec la palette et le thème "eau/gouvernance", sans figuration humaine — solution 100% réalisable immédiatement dans le code, mais moins "vivante" que des illustrations figuratives.

**Cette décision reste ouverte** — déjà signalée avant ce prompt, toujours sans réponse.

## 14. Plan de refonte

Repris de l'ordre imposé (§40 du prompt), Phase 0 = ce document :

| Phase | Contenu | Fichiers principaux concernés |
|---|---|---|
| 1 | Docs (ce livrable + les 3 autres) | `docs/uiux-redesign.md`, `design-system-v2.md`, `visual-direction.md`, `page-redesign-map.md` |
| 2 | Design System V2 (tokens CSS) | `resources/css/app.css` |
| 3 | Layout global (sidebar, topbar, nav) | `components/layouts/app.blade.php`, nouveaux `x-icons.*` |
| 4 | Dashboard par profil | `DashboardConsolide.php` + vue, `resources/js/charts.js` |
| 5 | Dossiers (case management) | `dossier-detail-page.blade.php`, `DossierDetailPage.php`, nouveau `WorkflowStepper` |
| 6 | Déclarations (wizard) | `DeclarationFormBase.php` + 4 sous-classes + vues |
| 7 | Investigations | `investigation-detail-page.blade.php`, `investigation-list-page.blade.php` |
| 8 | Actions correctives | `action-corrective-panel.blade.php`, `action-corrective-list-page.blade.php` |
| 9 | Notifications (nouvel écran, donnée déjà existante) | nouveau composant `NotificationCenter` |
| 10 | Administration (centre) | `administration/index.blade.php` + 7 écrans admin |
| 11 | Reporting | déjà couvert en Phase 4 (même composant) |
| 12 | Illustrations IA | selon décision §13 ci-dessus |
| 13 | Responsive | passe transverse sur toutes les phases précédentes |
| 14 | Accessibilité | passe transverse (contrastes, focus, clavier) |
| 15 | Micro-interactions & animations | transverse, `prefers-reduced-motion` partout |
| 16 | Polish final | revue visuelle systématique (§43 du prompt) |

Chaque phase, une fois lancée, suivra la méthodologie imposée §41 : audit de l'écran → limites UX → nouvelle structure → implémentation → vérification fonctionnelle (permissions, règles métier, tests Pest).

## 15. Risques de régression

- **293 tests Pest existants** couvrent les règles métier (workflow de statut, permissions `RoleParcoursScope`, validations de déclaration) — aucun ne teste le rendu visuel, donc une refonte profonde du Blade ne devrait rien casser dans cette suite tant que : les noms de route, les `wire:model`/noms de propriétés publiques Livewire, et les `@can`/policies ne changent pas.
- **Migration `->layout()`** : tous les composants utilisent déjà `->layout('components.layouts.app'|'guest', [...])` (corrigé lors d'une session précédente suite à un bug critique de morph Livewire documenté séparément) — toute nouvelle vue doit respecter la contrainte "un seul élément racine" déjà identifiée, sous peine de reproduire ce bug.
- **RoleParcoursScope** : les 3 pages de liste (Dossiers, Investigations, Actions correctives) pushent le périmètre par rôle dans la requête SQL avant `paginate()` — une restructuration visuelle (ex. passage en cartes) ne doit pas réintroduire un filtrage post-requête qui casserait la pagination ou exposerait des lignes hors périmètre.
- **Le wizard de déclaration (Phase 6)** touche le composant le plus exposé et le plus sensible en sécurité de l'application (public, anti-spam, rate limiting, honeypot, délai anti-bot de 3s) — la restructuration en étapes doit conserver `submit()` intact et ne pas fragmenter la validation d'une façon qui affaiblirait le honeypot/l'horodatage anti-bot.
- **Notifications (Phase 9)** est la seule phase qui touche un flux de données non encore exposé en UI — risque le plus faible de régression fonctionnelle (rien d'existant à casser) mais nécessite de vérifier le format exact de `toDatabase()` (`evenement_code`/`objet`/`corps`) avant d'construire l'écran.
