# Rapport de tests par arbres de décision

Date : 7 octobre 2026

## Résultat global

- 105 fichiers de tests découverts.
- 104 fichiers réussis.
- 878 tests réussis.
- 4 tests de ramasse-miettes non exécutés, car leur garde de sécurité a détecté 3 fichiers
  orphelins préexistants dans le magasin local.
- TypeScript validé.
- ESLint validé sans erreur.

Une nouvelle exécution globale a ensuite été interrompue par deux facteurs environnementaux :

- un dossier de test resté en mars 2020 après l'arrêt forcé d'une exécution fausse 11 assertions
  de reporting (tous les écarts observés valent exactement un dossier supplémentaire) ;
- plusieurs processus Node persistants épuisent la mémoire disponible et font dépasser à la
  campagne complète sa limite de cinq minutes.

Les matrices ajoutées dans cette phase passent isolément : 109 tests réussis.

## Arbres ajoutés

La matrice `src/server/authz/__tests__/arbres-decision.test.ts` exerce 14 feuilles :

- déclaration identifiée/anonyme × auteur identique/différent/absent ;
- direction autonome × direction identique/différente ;
- direction rattachée × site identique/différent ;
- site × dossier avec ou sans direction ;
- absence de rattachement ;
- affectation active/inactive × type de déclaration autorisé/interdit.

La matrice `src/lib/validations/__tests__/arbres-decision-parcours.test.ts` exerce 18 branches :

- les quatre parcours en mode identifié et anonyme ;
- matricule ou nom/prénom obligatoire selon le parcours ;
- entreprise du sous-traitant conservée en anonymat ;
- consentement RGPD conditionné à l'identification ;
- direction du déclarant conditionnée au fait qu'il soit ou non la victime ;
- qualité « autre », valeur hors liste et dates futures.

La matrice `src/server/services/dossier/__tests__/arbre-decision-statuts.test.ts` exerce les 81
couples de statuts possibles et vérifie que seuls les sept arcs métier autorisés sont ouverts.

## Défauts révélés et corrigés

- Libellés d'audit absents pour la politique de suppression, le retrait d'un dossier et les
  paramètres de l'application.
- Contrôles structurels dépendants du style de guillemets autour de `use server` et des
  permissions.
- Fixtures de déclaration devenues invalides après l'ajout de la direction obligatoire du
  déclarant.
- Détection de messagerie incomplète dans un environnement utilisant Resend.
- Test de cohérence des périmètres dépendant de données préexistantes ; il crée et nettoie
  maintenant sa propre investigation témoin.
- Assertions UI et assertions de source devenues obsolètes après le changement de marque et le
  formatage automatique.

## Point restant à traiter manuellement

Trois fichiers du magasin local ne sont plus référencés en base. La suite refuse volontairement
de les effacer et affiche maintenant leurs chemins exacts :

- `pieces-jointes/App/Models/Dossier/01m2thcra4j2t2cdh9w4xzzey5/01m2thcrbyhw3cx86yh99xfwv9.pdf` ;
- `pieces-jointes/App/Models/Dossier/01m2tj2m58zmzfbwv3sx521j7n/01m2tj2m7abw7axzqafsc66209.pdf` ;
- `pieces-jointes/App/Models/Dossier/01m31fbtezh6gs7a65hwng65k0/01m31fbtgg2k4vzsk7csrbnrjk.webp`.

Ils doivent être examinés puis supprimés ou réconciliés avant de relancer
`ramasse-miettes.test.ts`. Les deux pièces récentes sous `pieces-jointes/dossier` sont référencées
et ne figurent pas dans cet inventaire.

Cette campagne ne remplace pas des tests navigateur de bout en bout sur un environnement proche
de la production. Les prochains arbres prioritaires concernent les Server Actions, les erreurs
réseau/stockage et les parcours complets création → notification → traitement → clôture.
