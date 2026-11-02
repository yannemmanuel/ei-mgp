# Audit des rôles et habilitations — 2 novembre 2026

## Mise à jour après nettoyage du catalogue

Les quatre droits hérités (`dossiers.assign`, `dossiers.reassign`,
`investigations.validate`, `rgpd.acces.view`) sont désormais exclus du catalogue
actif, de l’éditeur et des droits effectifs. Les services refusent toute nouvelle
attribution. Leurs noms restent reconnus pour la compatibilité de l’historique.

Le droit `plan_actions.view` contrôle désormais séparément le nouvel écran PA,
sur la page et dans la navigation. La lecture de ses données conserve le périmètre
des dossiers autorisés : ce droit seul n’ouvre aucun dossier supplémentaire.

Avant déploiement, appliquer manuellement dans la base cible l’évolution qualifiée
`prisma/evolutions/2026-11-02-nettoyage-habilitations.sql`. Elle reprend les droits
`actions.view` des rôles et comptes pour le PA puis retire les attributions des
quatre droits obsolètes, dans une transaction. Les données métier et les historiques
ne sont pas supprimés. Ne pas la rejouer après personnalisation des accès au PA :
la reprise ajouterait à nouveau les accès retirés depuis cette personnalisation.
Cette évolution n’a pas été exécutée dans le cadre de cette intervention.

Périmètre : code local des autorisations, catalogue livré, administration des rôles,
navigation et filtrage des dossiers. Les attributions effectives et les comptes de
production n’ont pas été consultés ni modifiés. Les changements de travail déjà
présents ont été conservés.

## Modèle existant

Les rôles sont paramétrables en base. `ROLES` est une référence de livraison,
pas la liste effective des rôles actifs. Chaque requête recharge les permissions,
les parcours, les étapes et les comportements depuis la base. Un rôle désactivé
ne confère plus ses droits. Des permissions directes peuvent aussi être portées
par un compte, indépendamment de ses rôles.

Les contrôles combinent lecture, parcours, rattachement et étapes de traitement.
Une direction rattachée à un CSST ouvre le périmètre de ce CSST ; une direction
autonome reste un périmètre distinct. La navigation masque les destinations
interdites et les actions d’administration revérifient `roles.manage` côté serveur.

## Corrections apportées

- **Retrait des droits de lecture contourné** : le comportement « uniquement ses
  déclarations » suffisait à ouvrir ses fiches et à les sélectionner dans les listes,
  même sans permission de lecture. La fiche et le filtre SQL exigent désormais
  au moins un droit de lecture. Un test couvre la révocation.
- **Réaffectation trompeuse** : `dossiers.reassign` ne possède plus d’appelant,
  mais était présenté comme un droit opérationnel. Il est marqué sans effet,
  comme l’affectation, et son aide décrit le traitement par habilitations.
- **Droits inactifs encore proposés** : l’éditeur interdit désormais de cocher
  les droits marqués sans effet. Une ancienne attribution reste retirable.
  Leur définition est conservée pour la compatibilité et l’historique.

## Constats à traiter dans une évolution dédiée

1. **Cumul de rôles et extension des périmètres** : les permissions, parcours et
   étapes sont fusionnés indépendamment ; un rôle transverse peut lever le
   cloisonnement des parcours ouverts par un autre rôle. Ce fonctionnement est
   explicitement documenté dans `site.ts`. Si les mandats doivent rester séparés,
   il faut conserver les permissions et périmètres par rôle jusqu’à la décision
   d’accès. Ne pas modifier silencieusement cette règle globale.
2. **Rattachement manquant** : un rôle cloisonné sans CSST ni direction est
   actuellement transverse dans ses parcours ; `siteManquant` le signale mais
   ne bloque pas l’accès. Recommandation : vérifier les comptes concernés puis
   rendre le rattachement obligatoire pour ces rôles, avec refus d’accès en
   cas de configuration incomplète.
3. **Écritures partielles** : permissions, parcours, étapes, création et suppression
   de rôle comportent plusieurs écritures séquentielles. Les regrouper avec leur
   audit dans des transactions ; vérifier aussi les modifications simultanées.
4. **Dernier administrateur** : le service protège le retrait du dernier rôle
   administrateur, mais le contrôle et l’écriture sont distincts. Tester les
   opérations concurrentes et les chemins de désactivation/retrait d’un compte.
5. **Permissions directes** : inventorier `model_has_permissions` avant tout
   nettoyage ; désactiver un rôle ne révoque pas ces droits directs.
6. **Catalogue historique** : affectation, réaffectation, validation d’investigation
   et accès RGPD marqué sans effet doivent être retirés des attributions par une
   évolution de données contrôlée. Conserver les anciennes affectations et rôles
   nécessaires à l’historique. Aucun effacement de données n’a été exécuté.
7. **Déclarant** : l’accès à ses propres déclarations non anonymes est une branche
   particulière, indépendante des parcours du rôle. Son alignement éventuel sur
   les cases de parcours exige une décision métier et un ajustement des rôles
   existants ; appliquer uniquement le filtre casserait le rôle livré.

## Vérification avant production

Exporter les rôles actifs et leurs permissions/parcours/étapes/comportements,
les comptes actifs avec rattachement, les permissions directes et les anciens
rôles encore attribués. Comparer ce relevé au workflow retenu avant de migrer.
Le catalogue livré ne permet pas de conclure que la production lui correspond.

Les rôles historiques ne doivent pas être supprimés sur la seule base de leur
nom : vérifier leurs porteurs, leurs usages d’alerte et l’historique associé.
