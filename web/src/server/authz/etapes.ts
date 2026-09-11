import { STATUTS, type StatutCode } from '@/server/services/dossier/statuts'
import { PARCOURS_CODES, type ParcoursCode } from './parcours'
import type { Role } from './roles'

/**
 * Qui peut faire AVANCER un dossier, selon son parcours et l'étape où il se trouve.
 *
 * `docs/workflows.md` §3 le demande explicitement :
 *
 * > les « acteurs responsables » par étape [...] sont modélisés comme un **ensemble de rôles
 * > autorisés à faire progresser le dossier à cette étape**, vérifié par Policy, pas comme un
 * > unique `assignee_id`.
 *
 * Cette table manquait. Le graphe des transitions (`services/dossier/statuts.ts`) contraignait
 * bien l'enchaînement des états — impossible de sauter de « Reçu » à « Clôturé » —, mais rien ne
 * disait QUI a le droit de franchir chaque marche. N'importe quel porteur de
 * `dossiers.status.update` pouvait donc pousser seul un dossier de bout en bout, y compris à des
 * étapes confiées à d'autres acteurs par le CDC.
 *
 * Le tableau est indexé sur le statut de DÉPART : le graphe contraint déjà les arrivées. Les
 * distinguer plus finement supposerait de trancher, par exemple, qui de « Retour d'information »
 * ou de « Mise en œuvre des mesures » commande le passage depuis « En investigation » — le CDC
 * ne le dit pas, et l'inventer figerait un choix qui n'est pas le nôtre.
 *
 * ⚠️ Un statut ABSENT de la table n'est pas un oubli : il signifie qu'aucune restriction de rôle
 * ne s'applique à cette étape, la contrainte de permission et de parcours continuant seule de
 * jouer. Trois acteurs du CDC n'ont pas de rôle applicatif — « Responsable identifié » (EI §6.1
 * étape 4), « DL » (§6.3), « Équipe dédiée » (§6.4 étape 5) — et « Déclarant ou tiers » n'est pas
 * un compte du back-office. Leur inventer une correspondance bloquerait du travail légitime au
 * nom d'une règle que personne n'a écrite.
 */
type ActeursParStatut = Partial<Record<StatutCode, readonly Role[]>>

/** Rouvrir puis relancer un dossier reste réservé au Service MGP/DADD et à la DG (RG-07). */
const APRES_REOUVERTURE = ['service_mgp', 'dg'] as const satisfies readonly Role[]

/**
 * « Reçu → Affecté » est décrit comme automatique (EX-GES-02) et l'est : `creerDeclaration()`
 * affecte et fait avancer le dossier dans la même transaction. La voie manuelle subsiste pour le
 * cas où aucun compte actif ne porte le rôle de captage du parcours — le dossier resterait sinon
 * bloqué à « Reçu ». C'est un geste d'affectation : il revient à qui sait affecter.
 */
const AFFECTATION = ['service_mgp'] as const satisfies readonly Role[]

/*
  Les rôles remplacés restent NOMMÉS à côté de leurs successeurs, jamais retirés.

  `secretaire_csst`, `rqse` et `correspondant_mgp` sont désactivés en base : ils ne confèrent
  plus rien, et les citer ici ne rouvre aucun accès — `chargerUtilisateurAutorise()` écarte un
  rôle inactif avant que cette table ne soit consultée. Mais les laisser permet de réactiver l'un
  d'eux sans avoir à retrouver quelles étapes il tenait, et garde lisible l'historique des
  dossiers qu'ils ont fait avancer.
*/
const ACTEURS: Record<ParcoursCode, ActeursParStatut> = {
  /*
    §6.1 — l'évènement indésirable revient au CHARGÉ DE SÉCURITÉ du site.

    ⚠️ `recu` lui est ouvert, et c'est le cœur du nouveau circuit : l'évènement indésirable n'est
    plus affecté à personne, il reste donc à « reçu » jusqu'à ce qu'il le traite. Sans cette
    ligne, il aurait fallu qu'un tiers l'affecte d'abord — exactement l'étape que la décision
    métier supprime, et le dossier serait resté bloqué.
  */
  ei_employe: {
    recu: ['charge_securite', ...AFFECTATION],
    affecte: ['charge_securite', 'secretaire_csst', 'rqse'],
    en_analyse: ['charge_securite', 'secretaire_csst', 'rqse'],
    reouvert: APRES_REOUVERTURE,
  },

  // §6.2 — étapes 2 et 3 : DRH · Correspondant DRH · Responsable MGP de structure.
  grief_employe: {
    recu: AFFECTATION,
    affecte: [
      'responsable_grief_employe',
      'correspondant_drh',
      'responsable_mgp_structure',
      'correspondant_mgp',
      'rqse',
    ],
    en_analyse: [
      'responsable_grief_employe',
      'correspondant_drh',
      'responsable_mgp_structure',
      'correspondant_mgp',
      'rqse',
    ],
    en_investigation: ['dg', 'service_mgp'],
    reouvert: APRES_REOUVERTURE,
  },

  // §6.3 — étapes 2, 3 et 5 : Correspondant DL · Responsable MGP de structure.
  grief_sous_traitant: {
    recu: AFFECTATION,
    affecte: ['correspondant_dl', 'responsable_mgp_structure', 'correspondant_mgp'],
    en_analyse: ['correspondant_dl', 'responsable_mgp_structure', 'correspondant_mgp'],
    en_investigation: ['correspondant_dl', 'responsable_mgp_structure', 'correspondant_mgp'],
    reouvert: APRES_REOUVERTURE,
  },

  // §6.4 — étapes 2 et 3 : Service MGP/DADD · Correspondant DADD · Responsable MGP de structure.
  grief_communaute: {
    recu: AFFECTATION,
    affecte: ['service_mgp', 'correspondant_dadd', 'responsable_mgp_structure', 'correspondant_mgp'],
    en_analyse: [
      'service_mgp',
      'correspondant_dadd',
      'responsable_mgp_structure',
      'correspondant_mgp',
    ],
    reouvert: APRES_REOUVERTURE,
  },
}

/**
 * Ce rôle a-t-il la charge de cette étape, sur ce parcours ?
 *
 * Vrai par défaut quand le CDC ne désigne personne : voir l'avertissement en tête de fichier.
 */
export function peutFaireAvancerDepuis(
  roles: readonly Role[],
  parcours: ParcoursCode,
  statutActuel: StatutCode
): boolean {
  const habilites = ACTEURS[parcours][statutActuel]

  if (habilites === undefined) return true

  return roles.some((role) => (habilites as readonly string[]).includes(role))
}

/** Rôles désignés pour cette étape, ou `null` si le CDC n'en désigne aucun. */
export function acteursDeLEtape(
  parcours: ParcoursCode,
  statutActuel: StatutCode
): readonly Role[] | null {
  return ACTEURS[parcours][statutActuel] ?? null
}

/**
 * Étapes que PLUS PERSONNE ne peut franchir, faute de compte actif portant un rôle désigné.
 *
 * Le revers d'une restriction : une étape dont aucun compte actif ne porte le rôle bloque le
 * dossier pour toujours, sans message et sans recours — un défaut pire que la permissivité qu'on
 * a voulu corriger. Le cas n'a rien de théorique : il se produit chaque fois que les rôles sont
 * réorganisés avant que les comptes ne soient réattribués.
 *
 * ⚠️ Fonction PURE : elle reçoit les rôles réellement portés et ne lit aucune base. C'est ce qui
 * permet de l'exercer sur des cas construits — un test qui lirait la configuration du jour
 * passerait ou échouerait selon qui a été recruté, sans qu'aucun code ait changé — et de
 * l'appeler depuis le tableau de bord, où l'information doit arriver à l'administrateur.
 */
export function etapesSansActeur(rolesPortes: ReadonlySet<Role>): string[] {
  const orphelines: string[] = []

  for (const parcours of PARCOURS_CODES) {
    for (const statut of STATUTS) {
      const acteurs = acteursDeLEtape(parcours, statut)
      if (acteurs === null) continue

      if (!acteurs.some((role) => rolesPortes.has(role))) {
        orphelines.push(`${parcours}/${statut} (attend ${acteurs.join(' ou ')})`)
      }
    }
  }

  return orphelines
}
