# DESIGN SYSTEM V2 — EI-MGP SODECI

Ce document définit les tokens du système. **Aucun n'est encore appliqué au code** — `resources/css/app.css` garde aujourd'hui `--color-brand-green: #00a651` / `--color-brand-bg: #f8fafc` uniquement. Ce fichier est la cible de la Phase 2 du plan de refonte, une fois validée.

Les échelles ci-dessous sont dérivées mathématiquement (conversion HSL→RGB, teinte fixe, variation contrôlée de luminosité/saturation) à partir des hex de référence, avec le hex de référence exact ancré au palier `600`. Elles sont un point de départ cohérent, pas un rendu Figma — un ajustement fin à l'œil reste légitime en Phase 2.

## Décision préalable : quelle couleur est "primary" ?

Deux instructions contradictoires ont été reçues dans cette conversation : `#00A651` + blanc (message précédent, hex donné explicitement comme couleur de marque SODECI) puis `#1F3864`/`#C55A11`/`#F4F6FA` (ce prompt-ci, présentés comme une "base" extensible). Les deux échelles complètes sont fournies ci-dessous ; **`docs/uiux-redesign.md` §11 recommande l'Option A**, mais le choix final revient à l'utilisateur.

- **Option A (recommandée)** : `primary` = échelle verte (identité SODECI réelle), `secondary` = échelle navy (texte de très haut contraste, en-têtes sombres ponctuels, graphiques), orange réservé au rang d'accent d'alerte secondaire aux côtés d'amber.
- **Option B** : `primary` = échelle navy, `secondary` = échelle orange, vert rétrogradé à un rôle secondaire ou retiré.

Les deux options réutilisent exactement les mêmes 3 échelles ci-dessous — seul le rôle sémantique (`primary` vs `secondary` vs `accent`) change selon l'option retenue.

## Couleurs — échelle Green (SODECI)

Ancrée exactement sur `#00A651` au palier 600.

| Palier | Hex | Usage suggéré |
|---|---|---|
| 50 | `#EFFAF5` | Fond de bandeau succès très léger |
| 100 | `#DFF6EA` | Fond de badge/pill au repos |
| 200 | `#C6ECD8` | Bordure d'accent discrète |
| 300 | `#94DBB6` | Icône secondaire, graphique (teinte claire) |
| 400 | `#59CF92` | Hover d'élément déjà accentué |
| 500 | `#11D46F` | Accent vif (graphiques, indicateur "positif") |
| **600** | **`#00A651`** | **Couleur de marque — boutons primaires, item de nav actif, accroche** |
| 700 | `#008A42` | Hover/active de bouton primaire |
| 800 | `#006B34` | Texte vert sur fond clair (contraste renforcé) |
| 900 | `#004D25` | Texte vert sur fond blanc, exigence de contraste maximale |

## Couleurs — échelle Navy

Ancrée exactement sur `#1F3864` au palier 600.

| Palier | Hex | Usage suggéré |
|---|---|---|
| 50 | `#F4F6FB` | Fond de page alternatif (très proche du `#F4F6FA` du prompt d'origine) |
| 100 | `#E4EBF6` | Fond de section "pilotage/direction" |
| 200 | `#C6D3EC` | Bordure de carte sombre |
| 300 | `#94AEDB` | Icône sur fond sombre |
| 400 | `#537CC6` | Lien/accent sur fond clair |
| 500 | `#30579C` | Accent moyen |
| **600** | **`#1F3864`** | **Texte à très haut contraste, en-têtes de section "Direction", graphiques (série secondaire)** |
| 700 | `#182C4E` | Fond de panneau sombre ponctuel (si besoin, ex. section "Pilotage" du dashboard) |
| 800 | `#12213B` | Hover sur fond 700 |
| 900 | `#0C1627` | Texte sur fond très clair, cas d'extrême contraste |

## Couleurs — échelle Orange

Ancrée exactement sur `#C55A11` au palier 600.

| Palier | Hex | Usage suggéré |
|---|---|---|
| 50 | `#FCF3EE` | Fond d'alerte légère |
| 100 | `#F8E5D8` | Fond de badge "attention" |
| 200 | `#F2CEB5` | Bordure d'alerte |
| 300 | `#EDAA7E` | — |
| 400 | `#E7813C` | Icône d'alerte |
| 500 | `#E86C17` | Accent vif d'alerte |
| **600** | **`#C55A11`** | **Alerte secondaire / accent "action requise" (aux côtés d'amber existant)** |
| 700 | `#A44B0E` | Hover de bouton d'alerte |
| 800 | `#833C0B` | Texte orange à contraste renforcé |
| 900 | `#5E2B08` | Texte orange sur fond blanc |

## Neutral

Ne pas réinventer : le code utilise déjà `slate-*` (Tailwind natif) partout comme neutre (bordures, texte, fonds de survol). `neutral-*` = alias direct de `slate-*` — pas de nouvelle échelle à charger.

## Sémantique (statut/gravité — ne pas toucher aux valeurs existantes)

Ces couleurs encodent déjà des règles métier (`badge-emerald`/`badge-amber`/`badge-red`/`badge-sky` dans `app.css`, `couleur` stocké en base sur `NiveauGravite`) — le Design System V2 les **formalise** en tokens nommés sans changer une seule valeur :

| Token sémantique | Ancre | Usage |
|---|---|---|
| `--color-success` | `emerald-600` (existant) | Résolu, taux de résolution positif |
| `--color-warning` | `amber-600` (existant) | Échéance proche, à surveiller |
| `--color-danger` | `red-600` (existant) | En retard, rejeté, contentieux |
| `--color-info` | `sky-600` (existant) | En investigation, informatif |
| `--color-neutral-status` | `slate-600` (existant) | Statut sans connotation (brouillon, etc.) |

## Surface / Background / Border / Text (tokens sémantiques transverses)

| Token | Valeur (Option A) | Usage |
|---|---|---|
| `--color-background` | `slate-50` / `#f8fafc` (déjà `brand-bg`) | Fond de page |
| `--color-surface` | `white` | `.card`, panneaux de premier niveau |
| `--color-surface-elevated` | `white` + `shadow-md` | Modales, menus ouverts |
| `--color-surface-floating` | `white` + `shadow-lg` | Popovers, notifications, command palette |
| `--color-overlay` | `slate-900/50` (déjà utilisé par les modales) | Fond assombri derrière une modale |
| `--color-border` | `slate-200` | Séparateurs, bordures de carte |
| `--color-border-strong` | `slate-300` | Bordures de champ, inputs |
| `--color-text-primary` | `slate-900` | Titres, texte principal |
| `--color-text-secondary` | `slate-600` | Texte de support |
| `--color-text-muted` | `slate-400` | Placeholders, texte tertiaire |
| `--color-text-on-primary` | `white`, **réservé au texte large (≥18px/≥600)** | Voir note contraste ci-dessous |

**Note de contraste (héritée de la passe précédente, toujours valable)** : blanc sur `primary-600` (`#00A651`) ≈ 3.24:1 — sous le seuil AA 4.5:1 pour texte normal, ne clear que l'exception "grand texte" (≥18px ou ≥14px gras) à 3:1. Donc : texte blanc sur vert plein uniquement pour un gros libellé de bouton/badge, jamais pour un paragraphe. Le navy (`#1F3864`) sur blanc, et le blanc sur navy `600`, passent AA sans réserve (contraste ≈8.6:1) — utile si l'Option A veut un bandeau "Direction/Pilotage" en fond sombre sans souci d'accessibilité.

## Typographie

Conserve les 2 familles déjà installées (`Instrument Sans` = `--font-sans`, `Source Serif 4` = `--font-serif`), leur donne une échelle nommée au lieu de tailles ad hoc répétées (`text-sm font-semibold` recopié partout aujourd'hui) :

| Nom | Taille / interligne | Poids | Famille | Usage |
|---|---|---|---|---|
| Display | 36px / 1.15 | 600 | serif | Accroche hero du front-office public uniquement |
| H1 | 28px / 1.2 | 600 | sans | Titre de page back-office (ex. "Dossiers", "Tableau de bord") |
| H2 | 20px / 1.3 | 600 | sans | Titre de section dans une page (remplace le `text-sm font-semibold` générique actuel) |
| H3 | 16px / 1.4 | 600 | sans | Titre de carte/sous-section |
| H4 | 14px / 1.4 | 600 | sans | Titre de bloc mineur, en-tête de tableau |
| Body Large | 16px / 1.6 | 400 | sans | Paragraphe principal (description de dossier) |
| Body | 14px / 1.5 | 400 | sans | Texte courant (valeur par défaut actuelle du projet) |
| Body Small | 13px / 1.5 | 400 | sans | Texte de support (déjà l'usage `text-xs`/`text-sm` actuel) |
| Caption | 12px / 1.4 | 500 | sans | Légendes de graphique, métadonnées |
| Label | 11px / 1.3, uppercase, tracking 0.08em | 600 | sans | Labels de champ, en-têtes de colonne (motif déjà utilisé pour les eyebrows du récépissé) |

## Espacement

Pas de nouvelle échelle brute : le projet utilise déjà l'échelle Tailwind par défaut (base 4px). Ce qui manque, ce sont des **alias sémantiques** pour arrêter les choix ad hoc :

| Token | Valeur | Usage |
|---|---|---|
| `--space-card-padding` | `20px` (`p-5`, déjà la norme du projet) | Padding interne de `.card` |
| `--space-section-gap` | `24px` (`gap-6`, déjà majoritaire) | Espace entre sections d'une page |
| `--space-field-gap` | `16px` (`gap-4`, déjà utilisé dans les formulaires) | Espace entre champs de formulaire |
| `--space-page-padding` | `32px` desktop / `16px` mobile (déjà `px-4 py-8`/`lg:px-16`) | Marge de page |

## Langage de formes (radius)

Le système actuel a en réalité déjà une logique à 3 paliers, jamais formalisée — Phase 2 la nomme et ajoute un 4ᵉ palier pour les surfaces flottantes qui n'existent pas encore :

| Token | Valeur | Usage actuel/cible |
|---|---|---|
| `--radius-control` | 6px (`rounded-md`) | Boutons, inputs, badges rectangulaires — **inchangé** |
| `--radius-card` | 12px (`rounded-xl`) | `.card` — **inchangé** |
| `--radius-floating` | 16px (`rounded-2xl`) | **Nouveau** : modales, notification panel, command palette |
| `--radius-pill` | 9999px (`rounded-full`) | Badges de statut — **inchangé** |

## Profondeur (surfaces)

| Niveau | Ombre | Usage |
|---|---|---|
| Background | aucune | Fond de page |
| Surface | `shadow-sm shadow-slate-900/5` (existant, `.card`) | Cartes de premier niveau |
| Elevated | `shadow-md` | Modales ouvertes, dropdowns |
| Floating | `shadow-lg` | Popovers, notification panel, command palette (survolent le contenu, pas seulement une section) |
| Overlay | `bg-slate-900/50` (scrim, sans ombre propre) | Fond assombri derrière modale/drawer |

Pas de glassmorphism, pas de `backdrop-blur` généralisé (le seul `backdrop-blur` actuel, sur la topbar sticky, reste un cas isolé justifié — pas un principe à étendre).

## Mouvement

| Token | Valeur | Usage |
|---|---|---|
| `--duration-fast` | 100ms | Hover, focus |
| `--duration-base` | 150ms | Transition de couleur (déjà la valeur par défaut sur `a`/`button`) |
| `--duration-moderate` | 200ms | Ouverture de tiroir/sidebar mobile (déjà utilisé) |
| `--duration-entrance` | 300ms | Entrée de modale, apparition de toast |
| Easing entrée | `ease-out` | Tout ce qui apparaît |
| Easing sortie | `ease-in` | Tout ce qui disparaît |

Règle transverse déjà en place à respecter partout : toute animation décorative (hors feedback fonctionnel immédiat comme `wire:loading`) doit être encadrée par `@media (prefers-reduced-motion: no-preference)`, comme c'est déjà le cas pour `.animate-rise-in`.
