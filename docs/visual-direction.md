# DIRECTION ARTISTIQUE — "Institutional Premium" — EI-MGP SODECI

## Ce que le produit doit raconter

EI-MGP n'est pas un CRM ni un outil de ticketing générique : c'est le canal par lequel un employé, un sous-traitant ou un membre d'une communauté signale un évènement indésirable ou dépose une plainte contre une entreprise publique de l'eau. Deux publics très différents utilisent la même identité visuelle :

- **Le déclarant** (front-office public, souvent sur téléphone, parfois en situation de détresse ou de méfiance) — l'interface doit inspirer **confiance et sécurité**, pas impressionner.
- **Le gestionnaire/enquêteur/décideur** (back-office, usage professionnel répété, forte densité de données) — l'interface doit inspirer **rigueur et efficacité**, pas décorer.

"Institutional Premium" se traduit ici par : gouvernance visible (statuts, traçabilité, workflow explicite) + une identité de marque assumée (vert SODECI, pas un gris administratif anonyme) + une exécution soignée (typographie hiérarchisée, espacement respirant, transitions discrètes) — sans jamais basculer vers l'esthétique "produit grand public" qui banaliserait la gravité de certains signalements (harcèlement, sécurité, contentieux).

## Vivant sans surchargé — règles concrètes pour ce projet

| Faire | Ne pas faire |
|---|---|
| Un dégradé très subtil (`from-white to-slate-50`) sur un fond de section hero | Un dégradé de marque saturé en fond de page back-office |
| Une transition de 150-300ms sur ouverture de modale/toast | Une animation permanente (pulsation, particules) |
| Un accent de couleur sur l'élément qui vient de changer d'état (ex. ligne de tableau qui vient d'être mise à jour) | Des couleurs vives sur des éléments statiques sans rapport avec un évènement |
| Un stepper de workflow avec une micro-transition au passage à l'étape suivante | Du glassmorphism sur les cartes de contenu métier |
| Une ombre portée légère différenciant 2-3 niveaux de profondeur | Des ombres lourdes façon "neumorphism" |

## Hero et front-office public

Le panneau de contexte de la coquille publique (déjà en place : accroche en `font-serif`, sous-titre de réassurance, liste d'étapes) est la bonne direction et n'a pas besoin d'être réinventé — il doit être **enrichi**, pas remplacé :
- Ajouter un léger élément graphique dans le panneau de contexte (motif SVG abstrait ou illustration, voir stratégie ci-dessous) pour combler l'espace vide sous la liste d'étapes sur desktop.
- Le moment "récépissé" (confirmation avec numéro de référence en serif, bordures fines) reste le point culminant émotionnel du parcours déclarant — c'est le bon endroit pour une micro-animation d'apparition (déjà `.animate-rise-in`), pas ailleurs.
- Le futur wizard multi-étapes (Phase 6) doit garder ce panneau de contexte visible en permanence sur desktop (réassurance constante), et le réduire à une barre de progression compacte en tête de formulaire sur mobile.

## Stratégie d'illustrations IA — détail

Reprend `uiux-redesign.md` §13 avec le contenu concret par emplacement, prêt à être utilisé quelle que soit l'option retenue (asset fourni / prompt externe / SVG abstrait) :

| Emplacement | Rôle fonctionnel | Contenu si figuratif (Option 1/2) | Contenu si abstrait (Option 3) |
|---|---|---|---|
| Hero accueil / choix du parcours | Rassurer avant le premier geste | Employé ou membre de communauté consultant un téléphone, cadre professionnel ivoirien réaliste | Motif de gouttes/ondes concentriques en dégradé vert très clair |
| Formulaire EI employé | Contextualiser "sécurité au travail" | Agent de terrain SODECI avec équipement de protection, infrastructure hydraulique en arrière-plan | Motif de circuit/canalisation stylisé |
| Formulaire grief employé/sous-traitant | Contextualiser "environnement professionnel" | Bureau moderne, interaction professionnelle neutre (pas de scène conflictuelle représentée) | Motif géométrique neutre |
| Formulaire grief communauté | Contextualiser "service public de l'eau" | Point d'eau/robinet, vie communautaire, sans visage identifiable en gros plan | Motif de vagues |
| Confidentialité (mention anonymat) | Rassurer sur la protection des données | Icône/scène symbolique (cadenas stylisé intégré à une scène), jamais une personne "cachée" (cliché à éviter) | Motif de bouclier/maille abstraite |
| Empty state "aucun dossier à traiter" | Feedback positif, pas anxiogène | Scène calme, bureau rangé, lumière naturelle | Simple icône `x-icons` existante agrandie + halo de couleur |
| Empty state "aucun résultat de recherche" | Aider à comprendre, pas décourager | — (rarement figuratif, préférer une icône) | Icône loupe stylisée |
| Succès (soumission, action validée) | Confirmer positivement sans être puéril | Éviter tout personnage ; préférer un motif de coche intégré à une scène discrète | Coche animée légère (déjà en place sur le récépissé) |
| Erreur importante (500, dossier introuvable) | Rassurer que ce n'est pas une perte de données | Scène neutre, jamais alarmiste | Motif d'onde interrompue |
| Investigation / Actions correctives | Contextualiser "rigueur d'enquête" | Enquêteur consultant des documents, environnement de bureau | Motif de checklist stylisé |

Règles anti-dérapage à respecter quelle que soit l'option (rappelées du prompt d'origine, à faire respecter à quiconque produit ces visuels) : jamais de logo SODECI reconstitué, jamais de texte généré dans l'image, jamais de watermark, jamais de personnage cartoon ou de cliché ethnique/africain, scènes réalistes et professionnelles uniquement, jamais purement décoratives — chaque illustration doit être rattachée à un des emplacements ci-dessus, pas ajoutée "pour faire joli".

## Dark mode — verdict

**Non recommandé pour cette phase.** Justification, pas juste une préférence :
- Le back-office est un outil de travail de bureau/terrain consulté en heures de service, pas une application de consommation nocturne (contrairement à Linear/Notion cités en référence, utilisés aussi le soir en usage personnel).
- Le front-office public doit avant tout rassurer et être universellement lisible sur des téléphones d'entrée de gamme en plein jour (déclaration sur le terrain) — un mode sombre n'apporte rien à ce cas d'usage prioritaire.
- Un dark mode mal exécuté sur une app de conformité/gouvernance (contrastes recalculés partout, y compris les couleurs sémantiques de gravité qui ne doivent surtout pas perdre leur codage) est un risque d'accessibilité pour un bénéfice d'usage incertain ici.

Pour ne pas fermer la porte : les tokens du Design System V2 sont déjà nommés sémantiquement (`--color-surface`, `--color-text-primary`, etc.) plutôt qu'en valeurs brutes dans les vues — un dark mode resterait possible plus tard en ne redéfinissant que ces tokens, sans réécrire les composants. Décision à réévaluer si un usage terrain nocturne réel est signalé par l'utilisateur (ex. astreinte).

## Micro-interactions — principes transverses

- **Boutons** : état `hover` (couleur), `active/press` (léger `scale-[0.98]` ou assombrissement), `wire:loading` (spinner/texte de chargement — déjà en place sur le formulaire de déclaration, à généraliser à toutes les actions serveur), `disabled` (déjà géré par `.btn`).
- **Champs de formulaire** : focus ring déjà en place et volontairement hors `@layer` (contrainte technique Tailwind v4 documentée dans `app.css`) — ne pas le retoucher sans revalider qu'il reste hors layer. Ajouter un état de validation instantanée (bordure verte discrète) uniquement là où une validation live existe déjà (`wire:model.live`), pas ailleurs pour ne pas donner un faux signal de validation serveur.
- **Toasts** : apparition/disparition déjà en place (`x-toast-container`) — garder l'auto-dismiss à 5s, ne pas l'animer davantage.
- **Stepper de workflow (nouveau)** : transition de 200-300ms sur le remplissage de la barre de progression quand une étape se complète, pas de rebond/bounce.
- **Ligne de tableau modifiée** : un flash de fond très bref (`bg-brand-green/5` puis retour, ~600ms) après une action réussie sur cette ligne, pour donner un retour visuel sans dépendre uniquement du toast.

Toute animation ci-dessus reste soumise à `prefers-reduced-motion` — précédent déjà posé par `.animate-rise-in`, à répliquer systématiquement plutôt qu'à réinventer un mécanisme par composant.
