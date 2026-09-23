# Exigences de sécurité applicative

Source : CDC (anonymat §1.5/§6.6/RG-06, RGPD RG-11/RG-15, accès par rôle RG-14/§3) et exigences
techniques (§25, §34). Ce document traduit ces exigences en contrôles concrets, et **nomme le
fichier qui porte chacun** — une exigence dont on ne sait pas où elle est appliquée ne se vérifie
pas.

> ⚠️ **Réécrit le 2026-09-22.** Ce document prescrivait des contrôles Laravel : Policies PHP,
> échappement Blade, `$fillable`, middleware `permission:`. L'application est en Next.js depuis la
> migration, et ces prescriptions étaient devenues **inapplicables** — quelqu'un qui auditait
> contre elles cherchait ce qui n'existe pas, et passait à côté de ce qui protège réellement. Les
> EXIGENCES n'ont pas changé ; seuls les contrôles qui les servent sont réexprimés.

## 1. Anonymat — exigence critique

| Exigence | Contrôle technique | Où |
|---|---|---|
| Aucune donnée d'identification collectée si anonymat coché | Le formulaire ne REND PAS les champs marqués `identite` quand l'anonymat est coché — pas seulement masqués en CSS. Le serveur les jette ensuite, même s'ils lui parviennent : un navigateur peut avoir gardé une saisie antérieure, et une requête peut être forgée | `declaration/parcours-config.ts` (`identite`), `declarer/[parcours]/formulaire.tsx` |
| Aucune donnée d'identification stockée | La ligne `declaration_identites` n'est **pas créée** pour un dossier anonyme. Ce n'est pas un champ vidé : la ligne n'existe pas | `declaration/creer-declaration.ts` |
| Aucune donnée d'identification affichée aux traitants | La fiche ne charge l'identité qu'après vérification de `is_anonymous`, et le rôle peut en outre porter « ne voit pas l'identité du déclarant » | `dossier/fiche.ts`, `authz/utilisateur.ts` (`voitIdentiteDeclarant`) |
| Le compte connecté n'est jamais lié à une déclaration anonyme | `dossiers.declarant_user_id` reste NULL si `is_anonymous`, même si l'employé était connecté au moment du dépôt (EX-DEC-04) | `declaration/creer-declaration.ts` |
| Suivi sans lever l'identité | `/suivi` n'est accessible que par `référence + code d'accès`, jamais par une session utilisateur | `(public)/suivi/`, `auth/session-suivi.ts` |
| Messagerie sans lever l'identité | Côté déclarant anonyme, aucun `expediteur_user_id` ; l'authentification passe par le jeton lié à la référence et au code (RG-06) | `services/messagerie/` |
| Journal d'audit non ré-identifiant | `audit_logs` porte l'adresse IP et l'agent, mais ils ne sont **pas chargés** pour un rôle qui n'y a pas droit — la valeur ne transite jamais, elle n'est pas seulement masquée à l'écran | `audit/consultation.ts`, `authz` (`peutVoirAdresseIpAudit`) |

⚠️ **L'anonymat est tenu EN BASE, pas seulement à l'écran.** Des contrôles d'intégrité le
vérifient sur la base réelle : aucun dossier anonyme ne porte d'identité, aucun ne porte de
`declarant_user_id`.

## 2. Contrôle d'accès (RBAC)

Toute permission est vérifiée **côté serveur**, jamais par le seul masquage d'un bouton. Un
utilisateur sans droit ne doit pas pouvoir contourner la restriction en appelant directement une
action.

**Quatre verrous indépendants**, et il faut les quatre :

1. **La permission** — `exigerPermission()` en tête de chaque page et de chaque Server Action.
2. **Le parcours** — le type de déclaration doit être ouvert à l'un de ses rôles (`role_parcours`).
3. **Le rattachement** — site ou direction, quand le rôle est cloisonné
   (`cloisonne_par_rattachement`). La direction est plus fine que le site et prime sur lui.
4. **L'étape** — faire AVANCER un dossier suppose que l'un de ses rôles soit désigné pour l'étape
   de départ, sur ce type de déclaration (`role_etapes`).

Le tout vit dans `src/server/authz`, point d'entrée unique. Les pages n'accèdent jamais à Prisma
directement.

- **Cloisonnement par parcours** : vérifié dans les Policies, en plus du rôle (cf. `acteurs.md` §1).
- **IDOR** : les identifiants de dossier sont des ULID, pas des entiers incrémentaux, et chaque
  consultation repasse par la Policy `peutVoirDossier`. La référence métier (`EI-2026-000042`) est
  distincte de la clé technique.
- Un utilisateur n'instruit jamais son propre dossier (DT-06).

⚠️ **Un rôle désactivé ne confère RIEN** — ni permission, ni parcours, ni étape. C'est là que la
désactivation prend son sens : la masquer dans les écrans n'aurait retiré aucun droit.

⚠️ **Les autorisations sont relues en base à CHAQUE requête**, jamais portées par le jeton de
session. Une désactivation prend effet immédiatement, sans attendre l'expiration du jeton.

## 3. Protection des pièces jointes

| Risque | Contrôle | Où |
|---|---|---|
| Fichier malveillant | Type réel vérifié **aux octets d'en-tête** (`file-type`), jamais d'après le `Content-Type` du navigateur ni l'extension. Liste blanche d'extensions | `declaration/pieces-jointes.ts` |
| Exécution d'un fichier déposé | Stockage **hors du dossier public**, nom de fichier régénéré (ULID), jamais dérivé du nom fourni — un nom d'origine peut contenir des séparateurs de chemin | `stockage/magasin.ts` |
| Accès non autorisé | **Aucune pièce n'est jamais servie par une URL de stockage publique.** Le fichier transite par une route qui revérifie la Policy du dossier PARENT, que la pièce soit attachée au dossier, à une investigation ou à une action corrective | `api/pieces-jointes/[id]/route.ts` |
| Contenu actif dans un aperçu | La réponse pose `nosniff` et une CSP dédiée ; `?apercu=1` ne relâche aucun contrôle, il est lu **après** l'autorisation et ne décide que des en-têtes | `stockage/reponse-piece-jointe.ts` |
| Dépassement de quota | Plafond par fichier et plafond global du lot, appliqués côté serveur | `lib/limites-pieces-jointes.ts` |
| Fichiers survivant à leur dossier | Tâche hebdomadaire qui efface du magasin ce que plus aucune ligne ne désigne | `stockage/ramasse-miettes.ts` |

⚠️ **LES FICHIERS SONT ÉCRITS À L'INTÉRIEUR DE LA TRANSACTION, avant leurs lignes.** Un `ROLLBACK`
après ce point laisse donc un fichier orphelin. **L'ordre est délibéré** : l'inverse laisserait une
ligne promettant un fichier qui n'existe pas — une pièce jointe visible dans la fiche, introuvable
au téléchargement. Mieux vaut un fichier de trop, qu'on sait retrouver, qu'une ligne qui ment.

Le ramasse-miettes assume cette conséquence, et **n'efface que ce dont il peut prouver l'âge** :
un fichier de moins de 24 heures peut être une pièce jointe en cours de dépôt, dont la transaction
n'a pas encore commité. Un fichier d'âge inconnu est signalé, jamais effacé.

⚠️ **Écart connu** : le plafond annoncé au déclarant (5 Mo) dépasse ce que la plate-forme accepte
une fois encodé en multipart (~6,7 Mo pour 6 Mo autorisés). Un lot au plafond exact sera refusé.

## 4. Durcissement des routes publiques

Les 4 formulaires publics et la page de suivi sont exposés sans authentification : c'est la
surface d'abus la plus large de l'application.

- **Limitation de débit par IP** sur la soumission de déclaration, la connexion, la consultation
  de suivi et la messagerie publique. Le compteur vit **en base**, incrémenté par un
  `ON CONFLICT … DO UPDATE` atomique : il tient donc sur plusieurs instances, là où un compteur en
  mémoire se contournerait en changeant de serveur. Voir `auth/throttle.ts`.
- La limitation sur `/suivi` est la plus importante : un code d'accès à 6 chiffres n'a qu'un
  million de combinaisons.
- **Anti-robot** sur les formulaires publics, sans service tiers :
  - un champ piège invisible — un robot qui le remplit reçoit un **faux succès**, car lui
    signaler la détection lui apprendrait à ne plus le remplir ;
  - un délai minimal de remplissage, calculé sur un **horodatage signé en HMAC** par le serveur.
    ⚠️ Non signé, ce contrôle ne valait rien : il suffisait de poster « maintenant moins dix ».
    Voir `auth/horodatage-signe.ts`.
- **CSRF** : les Server Actions de Next.js vérifient l'origine de la requête nativement.

## 5. Autres contrôles standards (OWASP)

| Risque | Contrôle | Où |
|---|---|---|
| Injection SQL | Prisma exclusivement. Les rares requêtes brutes sont des *tagged templates* ; tout fragment dynamique passe par `Prisma.sql` / `Prisma.join`. **Aucun `Prisma.raw` nulle part** | tout `src/server/services` |
| XSS | React échappe par défaut. **Aucun `dangerouslySetInnerHTML`, aucun `eval`** dans la base de code | — |
| Affectation en masse | Les entrées sont validées par des schémas Zod et recopiées champ par champ ; aucun objet de requête n'est passé tel quel à une écriture | `lib/validations/` |
| Sessions | Jeton JWT ne portant QUE l'identité, deux heures d'inactivité, cookies `HttpOnly` et `Secure` en production | `auth/config.ts` |
| En-têtes HTTP | CSP, HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | `lib/entetes-securite.ts`, `next.config.ts` |
| Mots de passe | 12 caractères minimum, plafond à 72 octets — la troncature silencieuse de bcrypt est traitée explicitement. Jamais stockés en clair | `auth/hachage.ts`, `auth/mot-de-passe.ts` |
| Secrets | Toutes les valeurs sensibles en `.env`, ignoré par git ; `.env.example` ne porte aucune valeur réelle | — |
| Tâches planifiées | Secret comparé en **temps constant**, POST exigé, refus par défaut si le secret est absent | `api/taches/[tache]/route.ts` |

## 6. Exports et données nominatives (RG-14, EX-REP-06)

- **Par défaut : exclusion.** L'export nominatif porte sa propre permission, distincte de celle de
  l'export ordinaire.
- Chaque export nominatif est **journalisé** : il fait sortir des données personnelles du système.
- Aucun paramètre d'URL ne permet de forcer l'inclusion de données nominatives sans revérification
  côté serveur.
- Les dossiers anonymes n'exposent jamais d'identité, quel que soit le rôle.

## 7. RGPD et conservation (RG-11, RG-15)

- Consentement RGPD explicite obligatoire sur le parcours Sous-traitant (seul formulaire du CDC à
  porter ce champ bloquant, §9.3).
- Politique de conservation (§11.3) appliquée par une tâche planifiée mensuelle, sous la
  responsabilité du rôle `dpo` (permission `rgpd.conservation.manage`).

**Ce que l'anonymisation efface** (`rgpd/effacement.ts`, qui porte la liste et la justifie
entrée par entrée) :

| Effacé | Comment |
|---|---|
| `declaration_identites` | la ligne entière |
| Pièces jointes | **les FICHIERS d'abord, puis les lignes** — une photo d'accident montre des visages, un badge, une plaque |
| Messages | le corps remplacé par une mention ; la ligne survit, car le FAIT qu'un échange ait eu lieu reste une donnée d'instruction |
| `investigations.personnes_rencontrees` | mis à NULL — c'est littéralement une liste de personnes |
| `actions_correctives.responsable_nom` | mis à NULL |
| `dossiers.entreprise`, les 4 colonnes de poste | mis à NULL — dans une structure ou une direction restreinte, ils désignent une personne |
| Champs libres et commentaires d'historique | remplacés par une mention explicite, jamais vidés : un champ NULL se lirait « jamais renseigné » |

**Ce qui N'EST PAS effacé**, et pourquoi : la ligne `dossiers` (RG-03), les champs structurés —
type, catégorie, gravité, dates — que RG-12 exige de garder calculables sans limite de durée, le
lieu et la ville (contraints au référentiel, donc non nominatifs), et la référence, sans laquelle
le dossier deviendrait introuvable y compris pour un auditeur.

⚠️ **UN DOSSIER N'EST MARQUÉ ANONYMISÉ QUE SI SON EFFACEMENT A ABOUTI.** C'est l'invariant qui
compte : marquer malgré un échec produirait un dossier ré-identifiable portant une trace qui
affirme le contraire, et qu'aucun passage ultérieur ne reprendrait. Un échec est compté, remonté
dans le résumé de la tâche planifiée, et le dossier reste éligible.

⚠️ **Traité par lots de 500.** L'ensemble éligible est « tous les dossiers clôturés depuis plus de
dix ans » : sans borne, le premier passage traitait tout l'arriéré d'un coup, dans une fonction
serverless dont le temps d'exécution est plafonné.

⚠️ **DÉCISION À CONTESTER SI LE MÉTIER LE SOUHAITE.** Les champs libres — description, faits
constatés, recommandations — sont effacés. À dix ans d'une clôture, leur valeur statistique est
proche de zéro et leur risque ne l'est pas ; mais si le métier veut les conserver, la décision
doit être **écrite**, car ce sont eux qui font qu'un dossier reste ré-identifiable.

- Les demandes d'accès / rectification / suppression ne sont pas détaillées dans le CDC au-delà du
  rôle DPO (§3). Aucun module de ticket RGPD n'est construit tant que le CDC ne le spécifie pas
  (règle « ne pas inventer »).
