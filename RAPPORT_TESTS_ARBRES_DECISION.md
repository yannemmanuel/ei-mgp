# Rapport de tests par arbres de décision

Date : 6 octobre 2026

## Résultat global

- 105 fichiers de tests découverts.
- 104 fichiers réussis.
- 878 tests réussis.
- 4 tests de ramasse-miettes non exécutés, car leur garde de sécurité a détecté 3 fichiers
  orphelins préexistants dans le magasin local.
- TypeScript validé.
- ESLint validé sans erreur.

## Arbres ajoutés

La matrice `src/server/authz/__tests__/arbres-decision.test.ts` exerce 14 feuilles :

- déclaration identifiée/anonyme × auteur identique/différent/absent ;
- direction autonome × direction identique/différente ;
- direction rattachée × site identique/différent ;
- site × dossier avec ou sans direction ;
- absence de rattachement ;
- affectation active/inactive × type de déclaration autorisé/interdit.

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
de les effacer. Ils doivent être examinés puis supprimés ou réconciliés avant de relancer
`ramasse-miettes.test.ts`.

Cette campagne ne remplace pas des tests navigateur de bout en bout sur un environnement proche
de la production. Les prochains arbres prioritaires concernent les Server Actions, les erreurs
réseau/stockage et les parcours complets création → notification → traitement → clôture.
