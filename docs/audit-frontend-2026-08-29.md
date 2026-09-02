# AUDIT FRONTEND COMPLET — EI-MGP (état réel au 2026-08-29)

Audit uniquement — aucune modification de code n'a été faite pour produire ce document. Portée : outils/design utilisés, images/illustrations, disposition des éléments. Vérifié directement sur le code actuel (pas sur `docs/frontend-audit.md`/`design-system.md`, qui datent d'avant la résolution de palette et sont obsolètes sur ce point).

---

## 1. Outils et système de design actuellement en place

### Stack technique
- **Backend/rendu** : Laravel 12, Livewire 4.4.2 (composants pleine page via `->layout()`), Blade.
- **CSS** : Tailwind v4 (`@theme` inline dans `resources/css/app.css`, pas de fichier `tailwind.config.js` séparé).
- **JS** : Alpine.js (embarqué avec Livewire, aucune dépendance npm dédiée), Chart.js v4 (`chart.js/auto`), Vite.
- **Navigation** : `wire:navigate` sur tous les liens internes du back-office (SPA-like, ajouté récemment) — aucune librairie de routing côté client au-delà de ça.
- **Icônes** : aucun package (pas d'Heroicons/Lucide/Font Awesome) — 10 icônes SVG recopiées à la main dans `resources/views/components/icons/`.
- **Aucune librairie d'animation** (pas de GSAP/Framer/AOS) — seules des transitions CSS (`transition-colors`, `x-transition` d'Alpine) et une unique keyframe (`animate-rise-in`).
- **Aucune librairie de composants UI** (pas de shadcn/Flowbite/Headless UI) — tous les composants (modale, toast, badges, stepper…) sont des Blade components maison.

### Design tokens (`resources/css/app.css`)
- **Couleurs** : `--color-brand-green` (#00A651, marque SODECI) + trois échelles complètes 50-900 dérivées mathématiquement : `primary` (vert), `secondary` (navy #1F3864), `accent` (orange #C55A11) — ces deux dernières servent de soutien, pas de couleur de marque. Les couleurs sémantiques (`badge-emerald/-amber/-red/-sky/-orange/-indigo/-slate`) sont des teintes Tailwind natives, séparées de la marque par convention explicite (statut/gravité ≠ identité).
- **Typographie** : deux familles — `Instrument Sans` (texte courant, tout le back-office) et `Source Serif 4` (réservée aux moments "document officiel" du front-office public : accroche, récépissé). Échelle nommée `text-display/h1/h2/h3/h4/caption/label` — remplace un ancien pattern ad hoc répété 49 fois dans le code (37× `text-sm font-semibold`, 12× `text-lg font-semibold`), aujourd'hui unifié.
- **Espacement** : aucune échelle personnalisée — l'échelle par défaut de Tailwind (base 4px) est utilisée directement, avec des conventions non outillées (`p-5` pour le padding de carte, `gap-6` entre sections) documentées seulement en commentaire, pas en token CSS.
- **Formes** : 3 paliers (`rounded-md` contrôles, `rounded-xl` cartes, `rounded-full` badges) + un 4e ajouté récemment (`--radius-floating`, 16px) pour les surfaces flottantes (modale, notifications).
- **Profondeur** : `.card` = `shadow-sm` uniquement ; un `--shadow-floating` existe pour les surfaces élevées mais n'est utilisé qu'au niveau du panneau de notifications — la modale, elle, n'utilise pas ce token (incohérence mineure, `.card` réutilisé tel quel).
- **Mouvement** : pas de token de durée/easing centralisé — chaque composant fixe sa propre durée en dur (`duration-150`, `duration-200`, `duration-300`) directement dans les classes Tailwind.

### Inventaire des composants Blade réutilisables
`resources/views/components/` : `card`/`btn-*`/`badge-*`/`alert-*` (classes CSS), `gravite-badge`, `statut-badge`, `actif-badge`, `empty-state`, `modal`, `toast-container`, `breadcrumb`, `workflow-stepper`, `activity-timeline`, `wizard-progress`, `wizard-nav`, `icons.*` (10 fichiers). Aucun composant de type `DataTable`, `Drawer`, `Skeleton`, `CommandPalette`, ni de composant de recherche globale — ces éléments évoqués dans les échanges précédents restent à l'état de décision, non construits.

---

## 2. Images et illustrations visuelles

**Constat principal : il n'existe quasiment aucun asset visuel dans l'application.**

- **Un seul `<img>` dans tout le projet** : le QR code généré en SVG inline (data-URI) sur l'écran d'administration. Aucune autre image, aucune photo, aucune illustration.
- **`public/favicon.ico` fait 0 octet** — c'est un fichier vide, pas une icône. L'onglet du navigateur n'affiche donc aucune icône de marque (favicon par défaut du navigateur).
- **Aucun dossier `public/images` ou équivalent** — l'app n'a jamais eu de pipeline d'assets visuels.
- **Aucune illustration, même abstraite** : la stratégie "motifs SVG abstraits" décidée lors d'un échange précédent (pour combler l'absence d'outil de génération d'image) n'a pas été implémentée — c'est une décision actée, pas un livrable. Les 11 emplacements `<x-empty-state>` (dossiers vides, aucune pièce jointe, aucune notification, etc.) affichent uniquement une icône de contour + texte, jamais un visuel dédié.
- **Logo** : pas de logo réel — juste une pastille carrée `bg-brand-green` avec les initiales "EI" en texte blanc (`app.blade.php` et `guest.blade.php`).
- **Aucun arrière-plan travaillé** : ni dégradé, ni motif, ni texture dans tout `app.css` (vérifié — zéro occurrence de `gradient`/`pattern`/`backdrop-blur` en dehors d'un seul usage utilitaire sur la topbar).
- **Système d'icônes fragmenté** : seulement 10 icônes centralisées (`folder`, `clipboard-document-check`, `wrench-screwdriver`, `chart-bar`, `cog-6-tooth`, `shield-check`, `x-mark`, `bars-3`, `inbox`, `bell`). En parallèle, **4 fichiers contiennent des SVG codés en dur en dehors de ce système** (`breadcrumb.blade.php` — chevron, `workflow-stepper.blade.php` — coche, `dossier-detail-page.blade.php` — trombone, `confirmation.blade.php` — coche) : ce sont des icônes à usage unique jamais promues en composants partagés, donc invisibles si on ne regarde que `components/icons/`.

**Conséquence directe** : l'application est entièrement typographie + couleur + espacement blanc. C'est cohérent avec la direction "institutionnelle sobre" choisie, mais cela signifie aussi qu'aucun des objectifs "vivant"/"humain"/"identité visuelle mémorable" formulés dans les échanges précédents n'a de traduction concrète à ce jour — ils restent au stade de la décision (motifs SVG validés comme approche) sans qu'aucun motif n'ait encore été dessiné.

---

## 3. Disposition des éléments (mise en page, écran par écran)

### Back-office (`components/layouts/app.blade.php`)
- Sidebar fixe desktop (`w-64`) / tiroir hors-écran mobile, groupée en 4 sections (Mon activité / Dossiers / Analyse / Administration), chacune avec un label `text-label` en en-tête de groupe.
- Topbar sticky : hamburger (mobile only) — zone vide à gauche sur desktop — cloche de notification, nom/rôle utilisateur, déconnexion, à droite.
- Contenu principal : `max-w-6xl` centré, `px-4 py-8` — largeur de lecture confortable, mais sur un écran large (>1536px) cela laisse une bande de vide importante de chaque côté ; aucun mode "pleine largeur" pour les tableaux denses (dashboard, listes).

### Front-office public (`components/layouts/guest.blade.php`)
- Grille 2 colonnes (`minmax(0,1fr)_minmax(0,1.4fr)`) : panneau de contexte (logo, accroche en serif, sous-titre, étapes numérotées) à gauche, carte de formulaire à droite. S'empile en une colonne sur mobile (le panneau de contexte passe au-dessus du formulaire).
- Le panneau de contexte est **statique** : il ne change pas visuellement selon l'étape du wizard en cours (seule la liste des 3 étapes générales reste affichée telle quelle) — pas de renforcement contextuel dynamique par étape.

### Tableau de bord (`dashboard-consolide.blade.php`)
Empilement vertical strict : bandeau "à traiter" (conditionnel) → barre de filtres (7 champs + bouton, en `flex-wrap`) → 4 cartes KPI (`grid-cols-4`) → 2 grands graphiques (`grid-cols-3`, un sur 2 colonnes + un sur 1) → 2 graphiques moyens (`grid-cols-2`) → 3 tableaux de répartition (`grid-cols-3`) → tableau d'historique mensuel pleine largeur. Neuf blocs empilés au total : long à parcourir sur petit écran, aucune tabulation/accordéon pour grouper "vue d'ensemble" vs "détail".

### Fiche dossier (`dossier-detail-page.blade.php`)
Fil d'Ariane → carte d'en-tête (référence, titre, badges) → carte stepper de workflow → grille `lg:grid-cols-3` (2/3 contenu : description, identité, pièces jointes, investigations, actions correctives, messagerie, activité — jusqu'à 7 cartes empilées verticalement ; 1/3 actions : affectation, changement de statut, rejet/clôture/réouverture, contentieux). La colonne de gauche peut devenir très longue (un dossier avec investigation + actions correctives + messagerie affiche facilement 2-3 écrans de défilement) sans sommaire ni ancres pour sauter directement à une section.

### Listes (Dossiers/Investigations/Actions correctives)
Motif identique et cohérent sur les 3 : titre + option "Mes X uniquement" → carte de filtres en grille responsive (2/3/5-6 colonnes selon écran) → tableau `overflow-x-auto` → pagination. Le tableau n'a pas de version "cartes" pour mobile : sur petit écran, il faut scroller horizontalement plutôt que de voir une disposition adaptée (contredit directement la recommandation "pas de scroll horizontal" du référentiel UX consulté à la session précédente).

### Administration
Page d'accueil : grille de cartes responsive (1/2/3 colonnes) avec compteur par section. Les 7 sous-pages suivent toutes le même gabarit `lg:grid-cols-3` (formulaire 1/3 + tableau 2/3) — cohérent, mais identique à l'ancien patron CRUD que le prompt précédent qualifiait explicitement de "à ne pas se contenter d'améliorer" ; aucune de ces 7 pages n'a été restructurée au-delà de l'ajout d'un fil d'Ariane et d'un compteur en tête de la page d'accueil.

### Formulaire de déclaration (wizard)
Une seule carte, 4 sections conditionnelles (`@if ($etapeActuelle === N)`), barre de progression + libellé d'étape en tête, navigation Précédent/Continuer/Soumettre en pied de carte. Chaque étape est courte (2 à 7 champs) — bonne densité, cohérent avec l'objectif mobile-first.

---

## 4. Synthèse

### Ce qui est solide
- Système de tokens (couleur/typographie) réellement appliqué partout, sans dérive — aucune couleur "en dur" trouvée hors du système de tokens et des couleurs sémantiques assumées.
- Séparation stricte marque / sémantique (statut, gravité) — jamais mélangées.
- Motifs responsives présents (tiroir mobile, grilles qui s'empilent, wizard mobile-first) même s'ils ne couvrent pas 100% des tableaux.
- Cohérence inter-écrans forte sur les 3 listes et les 7 pages admin — même grammaire visuelle partout.

### Lacunes concrètes (constatées, non corrigées ici)
1. **Aucun visuel** : favicon vide, zéro illustration, zéro photo, logo réduit à un monogramme texte — l'app n'a pas d'identité visuelle au-delà de la couleur et du texte.
2. **Icônes fragmentées** : 4 SVG codés en dur hors du système d'icônes partagé.
3. **Tableaux non adaptatifs** : scroll horizontal sur mobile pour les 3 listes principales, pas de vue "cartes" alternative.
4. **Panneau de contexte public statique** : ne réagit pas à la progression du wizard.
5. **Fiche dossier très longue** sans sommaire/ancre de navigation interne.
6. **Dashboard dense** (9 blocs empilés) sans regroupement par onglets/accordéon.
7. **Administration** toujours au stade "CRUD amélioré" (compteurs + fil d'Ariane) plutôt que le "centre d'administration" envisagé plus tôt.
8. **Pas de token de mouvement centralisé** — durées de transition dupliquées en dur composant par composant.
9. **Documents d'audit précédents obsolètes** : `docs/frontend-audit.md` et `docs/design-system.md` décrivent encore le conflit de palette non résolu — ce nouveau document est la référence à jour, mais les anciens n'ont pas été corrigés ni supprimés.

Aucune de ces lacunes n'a été traitée dans ce document — audit seul, comme demandé.
