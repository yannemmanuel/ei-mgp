# Exigences de sécurité applicative

Source : CDC (anonymat §1.5/§6.6/RG-06, RGPD RG-11/RG-15, accès par rôle RG-14/§3), et exigences
techniques du prompt utilisateur (§25, §34). Ce document traduit ces exigences en contrôles
concrets Laravel.

## 1. Anonymat — exigence critique

| Exigence | Contrôle technique |
|---|---|
| Aucune donnée d'identification collectée si anonymat coché | Le formulaire Livewire ne rend même pas les champs d'identité si le toggle anonymat est actif (pas seulement `disabled`/masqué CSS) ; côté serveur, le Form Request ignore/rejette ces champs si `anonyme=true` |
| Aucune donnée d'identification stockée | Table `declaration_identites` **non créée** (pas de ligne) pour un dossier anonyme — vérifiable par une contrainte applicative + test automatisé |
| Aucune donnée d'identification affichée aux traitants | Aucune UI back-office ne doit référencer `declaration_identites` sans vérifier `dossier.is_anonymous === false` au préalable (revue de code systématique + test Feature dédié EX-DEC-03) |
| Le compte employé connecté n'est jamais lié à une déclaration anonyme | `dossiers.declarant_user_id` reste NULL si `is_anonymous = true`, même si l'employé était connecté au moment de la soumission (EX-DEC-04) |
| Suivi sans lever l'identité | Page `/suivi` accessible uniquement via `reference + code_secondaire`, jamais via une session utilisateur |
| Messagerie sans lever l'identité | Table `messages` : côté déclarant anonyme, pas de `user_id`, authentification par jeton de session lié à `reference + code_secondaire` (RG-06) |
| Logs d'audit non ré-identifiants | `audit_logs` ne doit jamais contenir en clair une donnée qui permettrait de recomposer l'identité d'un déclarant anonyme (ex. ne pas logger l'adresse IP de soumission dans un champ consultable par les rôles de traitement — seul l'auditeur/DPO y accède, cf. `exigences-audit.md`) |

## 2. Contrôle d'accès (RBAC)

- Toute permission est vérifiée **côté serveur** via Policies Laravel (`DossierPolicy`,
  `InvestigationPolicy`, `ActionCorrectivePolicy`, `AuditLogPolicy`, `ExportPolicy`) — jamais
  uniquement par masquage de bouton dans Blade/Livewire.
- Middleware `permission:` (spatie) sur toutes les routes back-office.
- Cloisonnement par parcours : une Policy vérifie systématiquement `dossier->parcours_id` en plus du
  rôle (cf. `acteurs.md` §1).
- **IDOR** : les routes de consultation d'un dossier par un utilisateur authentifié utilisent
  `Route::model()` + Policy `view`, jamais un simple ID incrémental exposé sans vérification. Les
  identifiants publics exposés (référence, `reference` colonne) ne doivent **pas** être la clé
  primaire technique (voir `modele-donnees.md` — usage d'ULID + référence métier distincte).
- Un utilisateur ne peut jamais être affecté comme traitant de son propre dossier (DT-06).

## 3. Protection des pièces jointes

| Risque | Contrôle |
|---|---|
| Upload de fichier malveillant | Validation Laravel (`mimes:`, `max:`), **revalidation du type réel** via `finfo`/`getMimeType()` côté serveur (ne jamais faire confiance au `Content-Type` envoyé par le navigateur) |
| Exécution de script uploadé | Stockage hors `public/`, noms de fichiers générés (UUID), aucune exécution possible depuis le disque de stockage |
| Accès non autorisé à une pièce confidentielle | Téléchargement exclusivement via un contrôleur qui vérifie la Policy du dossier parent avant de streamer le fichier (`Storage::response()` derrière `Gate`), jamais d'URL Storage publique directe pour les pièces jointes de dossiers non-anonymes sensibles |
| Dépassement de quota | Limite 10 fichiers / 50 Mo appliquée côté Form Request **et** côté configuration serveur (`upload_max_filesize`, `post_max_size`) |

## 4. Durcissement des routes publiques de déclaration

Les 4 formulaires publics et la page de suivi sont, par nature, exposés sans authentification — donc
la surface d'abus la plus large de l'application.

- **Rate limiting** (`throttle:`) par IP sur : soumission de déclaration, consultation de suivi,
  envoi de message via la messagerie sécurisée.
- Le rate limiting sur `/suivi` est particulièrement important car un code secondaire à 4-6 chiffres
  a une entropie faible (10 000 à 1 000 000 combinaisons) : throttling agressif + verrouillage
  temporaire après N tentatives échouées sur une même référence, journalisé pour l'auditeur/DPO.
- Anti-spam sur formulaires publics : honeypot / délai minimum de remplissage, sans dépendance à un
  service tiers externe non mentionné dans le CDC (pas de CAPTCHA imposé par le CDC — à confirmer
  avec le métier si nécessaire, cf. `decisions-techniques.md`).
- CSRF : protection standard Laravel sur tous les formulaires (Livewire la gère nativement).

## 5. Autres contrôles standards (OWASP Top 10)

| Risque | Contrôle |
|---|---|
| Injection SQL | Eloquent / Query Builder exclusivement, aucune requête SQL brute concaténée |
| XSS | Échappement Blade par défaut (`{{ }}`), pas de `{!! !!}` sur du contenu utilisateur |
| Mass assignment | `$fillable` explicite sur chaque modèle, jamais `$guarded = []` |
| Sessions | Configuration Laravel standard (cookies `HttpOnly`, `Secure` en production, régénération de session à la connexion) |
| Secrets | Toutes les valeurs sensibles en `.env`, jamais committées (cf. `decisions-techniques.md` — `.gitignore`) |
| CSRF sur API futures | Si une API est ajoutée plus tard (hors périmètre CDC actuel), Sanctum sera utilisé — non implémenté en Phase 0-1 |

## 6. Exports et restriction des données nominatives (RG-14, EX-REP-06)

- Chaque export (Excel/PDF) passe par `ExportPolicy` qui détermine, selon le rôle de l'utilisateur
  exportant, si les colonnes d'identité (`declaration_identites.*`) sont incluses ou non.
- Par défaut : **exclusion**. Seuls les rôles explicitement autorisés (`service_mgp` sur ses propres
  dossiers, `dpo` pour les besoins de conformité) peuvent inclure des données nominatives, et
  uniquement sur des dossiers non-anonymes.
- Aucun paramètre d'URL ne doit permettre de forcer l'inclusion de données nominatives
  (`?include_identity=1` par exemple) sans revérification de la permission côté serveur.

## 7. RGPD et conservation (RG-11, RG-15)

- Consentement RGPD explicite obligatoire uniquement pour le parcours Sous-traitant (seul formulaire
  du CDC à porter ce champ bloquant, §9.3).
- Politique de conservation (§11.3) implémentée comme job planifié, sous supervision du rôle `dpo`
  (permission `rgpd.conservation.manage`).
- Les demandes d'accès/rectification/suppression RGPD ne sont pas détaillées fonctionnellement dans
  le CDC au-delà du rôle DPO (§3) : seule l'existence du rôle et de son accès en lecture aux données
  personnelles + journaux d'accès est spécifiée. Un module de traitement de ticket RGPD n'est donc
  **pas** construit tant que le CDC ne le détaille pas (cf. règle « ne pas inventer »).
