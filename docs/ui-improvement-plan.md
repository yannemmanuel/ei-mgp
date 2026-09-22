# Plan d'amélioration UI — EI-MGP

## Décisions requises avant de commencer (bloquantes)

1. **Palette** : garder vert/bleu-gris/mist déjà implémenté (risque de régression visuelle nul, travail déjà testé) OU migrer vers navy/orange (implique de retoucher badges de statut par défaut, boutons primaires, sidebar, pastille logo, récépissé de confirmation, dashboard — partout où `brand-green`/`brand-slate` apparaît). Les deux ne peuvent pas coexister sous les mêmes noms de composants.
2. **Visuels IA** : aucun générateur d'image n'est disponible dans cet environnement. Confirmer laquelle des 3 options du design-system (§ Illustrations) est souhaitée : composants prêts à recevoir un asset externe, prompts détaillés à utiliser ailleurs, ou motifs SVG abstraits en remplacement.
3. **Portée** : ce prompt couvre l'intégralité de l'application (14 phases, ~25 composants, 7 points de rupture responsive, audit accessibilité complet, pipeline visuel). Correspond à plusieurs semaines de travail réel. Recommandation : valider un ordre de priorité (proposé ci-dessous) plutôt que de tout lancer d'un bloc — chaque phase reste vérifiable indépendamment (tests + navigateur réel) avant de passer à la suivante, comme fait jusqu'ici sur ce projet.

## Ordre recommandé

Basé sur : (a) ce qui a le plus d'impact utilisateur immédiat, (b) ce qui est prérequis structurel pour le reste, (c) le risque de régression.

| # | Phase | Contenu | Prérequis | Risque régression |
|---|---|---|---|---|
| 1 | Résolution des décisions bloquantes | Palette + visuels + portée | — | Aucun |
| 2 | `WorkflowStepper` + `ActivityTimeline` | Les deux composants les plus visibles/utiles absents aujourd'hui, sur la fiche dossier (page la plus consultée du back-office) | Décision palette | Faible — ajout, pas de retrait |
| 3 | `Breadcrumb` | Remplace les "← Retour" ad hoc sur ~8 pages | — | Faible |
| 4 | `DataTable` commun | Uniformise les ~11 tableaux sans toucher requêtes/filtres | Décision palette | Moyen — toucher 11 vues, prévoir vérif visuelle une par une |
| 5 | `FileUpload` dropzone | Remplace l'input natif sur les 4 formulaires publics | — | Faible, isolé au front-office |
| 6 | Pages 403/404/500 | `not-found.tsx` / `error.tsx` par segment | — | Aucun |
| 7 | `Skeleton` + états de chargement bouton | Généralise `wire:loading` déjà utilisé ponctuellement | — | Faible |
| 8 | `NotificationMenu` | Dépend de ce qu'expose réellement le module Notifications (à vérifier avec son propriétaire — développé en parallèle par un autre processus) | Audit du module Notifications existant | Moyen — dépend d'une API pas encore confirmée |
| 9 | Responsive systématique | Passage des 7 points de rupture sur les écrans non encore testés (Administration, Audit, listes Investigations/Actions correctives) | — | Faible, corrections ciblées |
| 10 | Accessibilité complète | Clavier, `aria-*`, `<th scope>`, focus sur les écrans plus anciens | — | Faible |
| 11 | Visuels/illustrations | Selon la décision §2 | Décision visuels | Faible si traité en dernier (purement additif) |
| 12 | Polish final | Revue globale alignements/espacements | Toutes les phases précédentes | — |

## Ce qui n'est délibérément PAS dans ce plan

- Réécriture des layouts en 4 variantes (`AppLayout`/`AuthLayout`/`PublicLayout`/`AdminLayout`) — le back-office authentifié est un seul espace cohérent aujourd'hui (dossiers, reporting, administration, audit partagent sidebar + permissions) ; le scinder ajouterait de la duplication sans gain fonctionnel. À reconsidérer seulement si un besoin concret apparaît (ex. un layout admin visuellement très différent).
- Recréation de composants qui existent déjà sous une autre forme (voir design-system.md, section "déjà couverts autrement") — éviter la duplication demandée au §35 du prompt lui-même.
- Toute modification des Policies, permissions, migrations ou logique de workflow métier — hors périmètre frontend, non touché.

## Vérification à chaque phase

Protocole de vérification : `npx tsc --noEmit` et `npx eslint src` sans erreur, `npm run build` sans erreur, `npx vitest run` sans régression — ⚠️ en lisant le COMPTE DE FICHIERS et non la seule couleur, un worker qui n'a pas démarré laissant la suite verte —, vérification en navigateur réel sur desktop et mobile pour les écrans touchés, captures avant/après pour les changements visuellement significatifs.
