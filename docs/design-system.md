# Design system — EI-MGP

## Tokens actuels (`resources/css/app.css`, `@theme`)

```css
--font-sans: 'Instrument Sans', ...;      /* UI, formulaires, tableaux */
--font-serif: 'Source Serif 4', ...;      /* titres et récépissé du front-office public uniquement */
--color-brand-green: #064e3b;
--color-brand-slate: #1e293b;
--color-brand-bg: #f3f4f6;
```

**⚠️ Conflit à trancher (voir plan §8)** : ce prompt demande navy `#1F3864` / orange `#C55A11` / `#F4F6FA`. Les deux palettes ne peuvent pas coexister — tout le système de boutons/sidebar/récépissé actuel est bâti sur `brand-green`/`brand-slate`.

Couleurs sémantiques (statut/gravité — **distinctes de la marque, ne changent pas avec elle**) : `badge-slate/-emerald/-amber/-orange/-red/-sky/-indigo`, correspondance `.alert-success/-error/-warning`.

## Composants existants

| Composant | Fichier | API |
|---|---|---|
| Card | `.card` (classe CSS) | `<div class="card p-5">` |
| Bouton | `.btn .btn-primary/-secondary/-danger/-warning` | `<button class="btn btn-primary">` |
| Badge de gravité | `<x-gravite-badge>` | `:niveau="$dossier->niveauGravite"` |
| Badge de statut | `<x-statut-badge>` | `:statut="$dossier->statut"` |
| Empty state | `<x-empty-state>` | `title`, `description`, slots `icon`/`action` |
| Modal | `<x-modal>` | `name`, `title`, `maxWidth`, slots `trigger`/défaut. **Sans `x-teleport`** (voir audit §4) |
| Toast | `<x-toast-container>` (une fois par layout) | déclenché par `$this->dispatch('toast', message:, type:)` |
| Icônes | `<x-icons.{nom}>` | 9 icônes : folder, clipboard-document-check, wrench-screwdriver, chart-bar, cog-6-tooth, shield-check, x-mark, bars-3, inbox |

## Composants demandés mais absents (à construire si le plan est validé)

- `Breadcrumb` — remplace les liens "← Retour" ad hoc.
- `WorkflowStepper` — frise de progression du statut dossier (Reçu → Affecté → Analyse → Investigation → Action corrective → Résolu → Clôturé), à partir du graphe déjà formalisé dans `DossierWorkflowService`.
- `ActivityTimeline` — remplace la `<ul>` d'historique par une frise verticale (puce + date + auteur + commentaire).
- `DataTable` — wrapper commun (en-tête, tri optionnel, pagination, empty state, densité) pour les ~11 tableaux existants, **sans** réécrire leur logique de requête/filtre.
- `NotificationMenu` — cloche dans la topbar, si le module Notifications (phase 9) expose une liste consultable côté utilisateur (à vérifier avec le propriétaire de ce module avant de construire l'UI).
- `Skeleton` — génrique, pour les zones à chargement Livewire visible.
- `FileUpload` (dropzone) — remplace `<input type="file">` stylé par une zone de dépôt avec liste de fichiers/progression/suppression.
- Pages `403`/`404`/`500` personnalisées (`resources/views/errors/`).

## Composants demandés déjà couverts autrement (ne pas dupliquer)

- "PrimaryButton/SecondaryButton/DangerButton/GhostButton" → déjà couverts par `.btn-*`, pas besoin de composants Blade séparés pour un simple jeu de classes.
- "Alert/SuccessMessage/ErrorMessage/WarningMessage/InfoMessage" → déjà couverts par `.alert-*` + `<x-toast-container>`.
- "ConfirmationModal" → `<x-modal>` + `wire:confirm` couvrent déjà ce besoin (voir audit).
- "KPICard/MetricCard" → déjà présentes sur le dashboard (`border-l-4 border-l-brand-green`), pourraient être extraites en composant `<x-kpi-card>` si on en ajoute d'autres (léger, pas urgent).
- "AppLayout/AuthLayout/PublicLayout/AdminLayout" → l'app n'a que 2 layouts réels (`app`, `guest`) car le back-office authentifié est un seul et même espace (dossiers, reporting, administration, audit partagent la même sidebar/permissions) ; scinder en 4 layouts ajouterait de la duplication sans bénéfice fonctionnel — **à confirmer avant de le faire si le prompt y tient**.

## Illustrations / visuels IA (sections 55–82 du prompt)

**Contrainte technique constatée** : aucun outil de génération d'image n'est disponible dans cet environnement (vérifié — seuls des outils Google Drive en lecture existent, aucun générateur d'image). Je ne peux donc pas produire moi-même les visuels photoréalistes demandés (agents de terrain SODECI, infrastructures hydrauliques, etc.).

Ce que je peux livrer à la place, si cette direction est retenue :
- Les composants d'intégration (`<x-ui.hero>`, `<x-ui.page-intro>`, `<x-ui.illustration>`) avec un emplacement d'asset clairement délimité, prêts à recevoir une image une fois fournie/générée ailleurs ;
- Les prompts détaillés (sujet, environnement, composition, lumière, style, palette, espace négatif) pour chacun des visuels listés au §61-63, à utiliser dans un outil de génération externe ;
- Un traitement alternatif sans photographie (motifs SVG géométriques abstraits évoquant l'eau/l'infrastructure, dans la palette de marque) si aucun visuel photoréaliste n'est disponible à temps — plus sobre, mais cohérent avec le principe "pas d'image générique juste pour faire joli" du prompt lui-même (§64, §74).
