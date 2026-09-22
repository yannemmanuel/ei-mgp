-- Retirer les tables que Laravel avait laissées, et le référentiel des tranches d'ancienneté.
--
-- ⚠️ CE FICHIER SUPPRIME DES TABLES. C'est la seule évolution non additive du projet, et elle est
-- explicitement demandée (« supprimer tout ce qui est Laravel dans le projet »). Chaque ligne
-- ci-dessous a été vérifiée avant d'être écrite : aucune n'est lue ni écrite par le code Next, et
-- le contenu de chacune est rappelé pour que la décision soit relisible dans six mois.
--
-- ⚠️ CE QUI N'EST PAS SUPPRIMÉ, ET POURQUOI. Trois tables ont la forme Laravel mais PORTENT le
-- fonctionnement actuel — les supprimer casserait l'application :
--
--   `cache`                 la limitation de débit s'y incrémente (`throttle.ts`). 22 lignes.
--   `notifications`         la boîte de réception la lit et l'écrit (`boite.ts`).
--   `model_has_roles`,      l'attribution des rôles, lue à chaque vérification d'autorisation.
--   `role_has_permissions`  Forme Spatie (`model_type`, `guard_name`), fonction bien vivante.
--
-- De même, les chaînes `App\Models\*` et `Spatie\...` dans `audit_logs.auditable_type` et
-- `pieces_jointes.attachable_type` sont des DONNÉES, pas du code : 330 lignes d'audit et les 20
-- pièces jointes les citent. Les retirer demande une migration de données distincte, pas une
-- suppression de table.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- La file d'attente Laravel — remplacée par les tâches planifiées Netlify
-- ---------------------------------------------------------------------------------------------
--
-- Les trois tables sont VIDES et aucune n'est citée par le code (vérifié : 0 occurrence de
-- `prisma.jobs`, `prisma.job_batches`, `prisma.failed_jobs`). Les six traitements périodiques
-- sont déclarés dans `netlify.toml` et passent par `server/services/taches/registre.ts`.

DROP TABLE IF EXISTS "failed_jobs";
DROP TABLE IF EXISTS "job_batches";
DROP TABLE IF EXISTS "jobs";

-- ---------------------------------------------------------------------------------------------
-- Le verrou de cache — sans emploi
-- ---------------------------------------------------------------------------------------------
--
-- ⚠️ NE PAS CONFONDRE AVEC `cache`, QUI RESTE. `cache_locks` sert aux verrous atomiques de
-- Laravel ; la limitation de débit de cette application n'en a pas besoin — elle s'appuie sur un
-- `ON CONFLICT ... DO UPDATE` qui fait l'incrément en une seule instruction. Table vide.

DROP TABLE IF EXISTS "cache_locks";

-- ---------------------------------------------------------------------------------------------
-- L'authentification Laravel — remplacée par NextAuth
-- ---------------------------------------------------------------------------------------------
--
-- ⚠️ `sessions` PORTAIT 14 LIGNES, et c'est une raison de PLUS de la supprimer, pas une raison de
-- la garder. Ce sont des jetons de session d'un dispositif qui n'authentifie plus personne,
-- conservés sans durée de vie et sans que rien ne les expire. L'application est en JWT depuis la
-- bascule : aucune de ces lignes ne peut ouvrir de session, mais elles portent encore adresse IP
-- et agent utilisateur de comptes réels.
--
-- `password_reset_tokens` est vide : la réinitialisation passe par `invitations_connexion`.

DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "password_reset_tokens";

-- ---------------------------------------------------------------------------------------------
-- L'historique des migrations Laravel
-- ---------------------------------------------------------------------------------------------
--
-- 31 lignes nommant les migrations PHP appliquées entre-temps. Elles n'ont aucun équivalent ici :
-- le schéma évolue par les fichiers de `prisma/evolutions/`, appliqués à la main puis récupérés
-- par `prisma db pull`. Garder cette table ferait croire qu'un mécanisme de suivi existe.
--
-- ⚠️ IL N'EN EXISTE TOUJOURS PAS (constat O1 de l'audit). Sa suppression ne crée pas le manque,
-- elle cesse de le masquer.

DROP TABLE IF EXISTS "migrations";

-- ---------------------------------------------------------------------------------------------
-- Les tranches d'ancienneté — figées dans le code
-- ---------------------------------------------------------------------------------------------
--
-- ⚠️ CE N'EST PAS UN VESTIGE LARAVEL mais une décision métier prise le même jour : cinq paliers
-- d'années ne dépendent ni du site, ni de la direction, ni de l'organisation. Ce qui ne varie pas
-- ne gagne rien à être paramétrable, et l'écran coûtait une table, trois actions, un tiers de
-- page d'administration et un aller-retour en base à chaque affichage du formulaire.
--
-- Les cinq libellés sont repris À L'IDENTIQUE dans `TRANCHES_ANCIENNETE`
-- (`parcours-config.ts`), dans leur ordre d'affichage :
--
--     Moins d'1 an · 1 à 3 ans · 3 à 5 ans · 5 à 10 ans · Plus de 10 ans
--
-- ⚠️ AUCUNE DÉCLARATION N'EST PERDUE. `declaration_identites.anciennete_tranche` stocke le
-- LIBELLÉ en clair, pas une clé : les griefs déjà déposés gardent leur réponse. Vérifié avant
-- suppression — la colonne compte 0 ligne renseignée à ce jour, mais le raisonnement vaut pour la
-- production, où elle en portera.
--
-- ⚠️ DEUX LIGNES D'AUDIT citent `App\Models\TrancheAnciennete`. Leur libellé de décodage RESTE
-- dans `audit/libelles.ts` : le journal doit continuer à nommer ce qui a été fait, même quand la
-- table concernée n'existe plus.

DROP TABLE IF EXISTS "tranches_anciennete";

COMMIT;
