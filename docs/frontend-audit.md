# Audit frontend — EI-MGP

> ⚠️ **ARCHIVE — décrit l'application AVANT le portage en Next.js.**
>
> Ce document est un constat daté, et il le reste : il cite des composants Livewire, des vues
> Blade et des fichiers PHP qui n'existent plus depuis le retrait du framework (2026-09-22). Il
> n'est PAS mis à jour, parce qu'un audit réécrit après coup cesse d'être un audit. Pour l'état
> actuel, lire le code ; pour ce qui a été décidé depuis, `decisions-techniques.md`.


État constaté au 2026-08-29, sur le dépôt actuel (22 composants Livewire, back-office + front-office public).

## 1. Ce qui existe déjà (acquis, à ne pas refaire)

- **Layouts** : `components/layouts/app.blade.php` (back-office, sidebar fixe desktop / tiroir mobile en Alpine, topbar fine avec identité + rôle + déconnexion) et `components/layouts/guest.blade.php` (front-office public, deux colonnes — panneau de contexte + formulaire, police serif pour les titres, étapes numérotées). Tous les composants "page" utilisent `->layout()` (jamais `<x-layouts.app>` intégré dans leur propre vue — voir la note critique §4).
- **Composants Blade** : `<x-gravite-badge>`, `<x-statut-badge>`, `<x-empty-state>`, `<x-modal>` (Alpine, sans `x-teleport`), `<x-toast-container>`, `<x-icons.*>` (9 icônes SVG à la main, style Heroicons-outline).
- **Classes CSS** (`resources/css/app.css`, `@layer components`) : `.card`, `.btn`/`.btn-primary/-secondary/-danger/-warning`/`.btn-block`, `.badge`/`.badge-slate/-emerald/-amber/-orange/-red/-sky/-indigo`, `.alert`/`.alert-success/-error/-warning`.
- **Pages back-office** : Dossiers (liste + détail), Investigations (liste transverse + détail), Actions correctives (liste transverse + panneau embarqué sur la fiche dossier), Reporting (dashboard avec 4 graphiques Chart.js), Audit (journal), Administration (7 écrans CRUD : utilisateurs, catégories, statuts, sites, canaux, notifications, QR codes), Messagerie (fil de messages embarqué sur la fiche dossier, développé par un autre processus en parallèle).
- **Pages front-office public** : 4 formulaires de déclaration (EI Employé, Grief Employé, Grief Sous-traitant, Grief Communauté), Suivi de dossier (référence + code d'accès), Connexion.
- **Système de toasts** Livewire (`$this->dispatch('toast', ...)`), **modales de confirmation** pour les actions sensibles, `wire:confirm` natif pour les actions à un clic.
- **293 tests Pest passants**, aucune régression connue.

## 2. Incohérences et manques réels (vérifiés, pas supposés)

| Sujet | Constat |
|---|---|
| **Palette** | Deux jeux de couleurs institutionnelles ont été demandés à des moments différents : vert `#064E3B` / bleu-gris `#1E293B` / gris `#F3F4F6` (déjà implémenté, badges/boutons/sidebar/récépissé construits dessus) contre navy `#1F3864` / orange `#C55A11` / `#F4F6FA` (ce prompt). **Conflit direct, à trancher avant toute implémentation** — voir §8. |
| **DataTable réutilisable** | N'existe pas. Chaque tableau (Dossiers, Investigations, Actions correctives, Audit, 7 écrans Administration) réimplémente sa propre structure `<table>` + en-tête + `@forelse`. Fonctionnellement correct, mais dupliqué ~11 fois. |
| **WorkflowStepper** | N'existe pas. Le statut du dossier est aujourd'hui un badge unique (`<x-statut-badge>`), pas une frise de progression. Le CDC définit un graphe d'étapes clair (`DossierWorkflowService`) qui se prêterait bien à une frise. |
| **ActivityTimeline** | N'existe pas comme composant. L'historique du dossier (`dossier-detail-page.blade.php`) est une simple liste `<ul>` avec date/auteur/commentaire — fonctionnelle mais visuellement plate. |
| **Breadcrumb** | N'existe pas comme composant réutilisable. Chaque page fait son propre "← Retour à ..." en lien simple. |
| **NotificationMenu** | N'existe pas. Le module Notifications (phase 9, développé par le processus concurrent) envoie des notifications par email/outil mais il n'y a pas de cloche/centre de notifications dans la topbar. |
| **DatePicker / MultiSelect / Toggle** | Champs natifs HTML (`<input type="date">`, `<select>`, `<input type="checkbox">`) stylés globalement via `resources/css/app.css` — cohérents visuellement mais pas de composants Blade dédiés avec API propre. |
| **FileUpload moderne (dropzone)** | Le champ pièces jointes (`declaration/partials/pieces-jointes.blade.php`) est un `<input type="file">` standard stylé (bouton "Choose Files"), pas une zone de dépôt drag-and-drop. |
| **Pages d'erreur 403/404/500** | Ce sont les pages Laravel par défaut, jamais personnalisées. |
| **Illustrations / visuels** | Aucune image ni illustration nulle part dans l'app — uniquement des icônes SVG et de la couleur. Aucun asset SODECI officiel n'a été fourni dans le dépôt à ce jour (`find public -iname "*sodeci*"` et `find public/images` ne remontent rien). |
| **Skeletons de chargement** | `wire:loading` est utilisé ponctuellement (ex. upload de pièces jointes) mais pas de composant `<x-skeleton>` générique ; les boutons de soumission n'ont pas systématiquement d'état "en cours" visible. |
| **Responsive** | Testé manuellement sur desktop (1280/1440) et un point mobile (390px) pour les pages retouchées cette session (dossiers, sidebar, formulaires guest). Pas de passage systématique sur 768/834/1024/360/412/430 ni sur les écrans Administration/Audit/Investigations-liste. |
| **Accessibilité** | Focus visibles et contraste vérifiés pour les éléments ajoutés cette session (voir `docs` mémoire — un seul écart mineur documenté : `slate-500` sur le nouveau fond, ≈4,45:1 contre 4,5:1 requis). Pas d'audit clavier/lecteur d'écran complet sur les écrans plus anciens (Administration, Audit) ni sur les tableaux (tri, en-têtes `<th scope>`, etc.).

## 3. Ce qui a été délibérément laissé "sobre" (à ne pas confondre avec un oubli)

Le back-office (tableaux, filtres, Administration, Audit) a été construit dans un style neutre/institutionnel sur demande explicite antérieure ("desktop-first, palette sobre"). Le traitement plus distinctif (police serif, accroche, récépissé) n'a été appliqué qu'au front-office public, à dessein — voir mémoire projet.

## 4. Point d'architecture critique déjà résolu (pour information, ne pas revenir dessus)

Un bug Livewire de fond a été trouvé et corrigé cette session : les composants "page" plaçaient `<x-layouts.app>` (document HTML complet) directement dans leur propre vue, ce qui plaçait `wire:id` sur `<html>` et cassait le morphing côté client sur **toute** interaction (page blanche après un filtre, un submit, etc.), sans erreur visible. Corrigé en migrant les 17 composants concernés vers `->layout('components.layouts.app', [...])`. Ne jamais réintroduire `<x-layouts.app>`/`<x-layouts.guest>` à l'intérieur d'une vue de composant Livewire "page".
