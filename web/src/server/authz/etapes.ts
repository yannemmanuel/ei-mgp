import { prisma } from '@/lib/prisma'
import { STATUTS, transitionsDepuis, type StatutCode } from '@/server/services/dossier/statuts'
import { PARCOURS_CODES, type ParcoursCode } from './parcours'

/**
 * Qui peut faire AVANCER un dossier, selon son type et l'étape où il se trouve.
 *
 * `docs/workflows.md` §3 le demande explicitement :
 *
 * > les « acteurs responsables » par étape [...] sont modélisés comme un **ensemble de rôles
 * > autorisés à faire progresser le dossier à cette étape**, vérifié par Policy, pas comme un
 * > unique `assignee_id`.
 *
 * Sans ce contrôle, n'importe quel porteur de `dossiers.status.update` pousserait seul un dossier
 * de bout en bout, y compris à des étapes confiées à d'autres acteurs.
 *
 * ⚠️ CETTE TABLE A QUITTÉ LE CODE le 2026-09-21. Elle y était écrite rôle par rôle : un rôle créé
 * depuis l'interface n'y figurait pas, ne pouvait faire avancer AUCUN dossier, et rien ne le
 * disait — ni à l'administrateur qui venait de le créer, ni à son porteur, qui voyait seulement
 * un bouton absent. Elle vit désormais dans `role_etapes` et se coche dans une grille
 * type × étape, rôle par rôle, dans `/administration/habilitations`.
 *
 * ⚠️ UN CHANGEMENT DE DÉFAUT, ET IL EST VOLONTAIRE. Ici, une étape absente de la table signifiait
 * « ouverte à tous ceux qui en ont le droit » — quatre acteurs du CDC n'ont pas de rôle
 * applicatif, et leur inventer une correspondance aurait bloqué du travail légitime. Cette nuance
 * ne survit pas en base : l'absence de ligne s'y lit comme une interdiction, et distinguer les
 * deux demanderait une table de plus dont personne ne comprendrait l'objet.
 *
 * La reprise a donc rendu EXPLICITE ce qui était implicite — pour chaque étape que le code
 * laissait ouverte, tous les rôles porteurs de `dossiers.status.update` ont reçu leur ligne. Le
 * comportement est identique au jour de la bascule ; ce qui change, c'est qu'on le voit, et qu'on
 * peut le corriger sans déploiement.
 *
 * L'étape de DÉPART reste la clé : le graphe des transitions contraint déjà les arrivées. Les
 * distinguer plus finement supposerait de trancher, par exemple, qui de « Retour d'information »
 * ou de « Mise en œuvre des mesures » commande le passage depuis « En investigation » — le CDC ne
 * le dit pas, et l'inventer figerait un choix qui n'est pas le nôtre.
 */

/** Garde Spatie : les lignes d'un autre garde ne concernent pas cette application. */
const GUARD = 'web'

/** Une case cochée : ce rôle fait avancer ce type de déclaration depuis cette étape. */
export type CaseEtape = {
  readonly role: string
  readonly libelleRole: string
  readonly parcours: string
  readonly statut: string
}

/**
 * Ce qu'il faut savoir d'une personne pour dire si elle peut franchir une étape.
 *
 * Décrit par sa forme plutôt qu'importé de `./utilisateur` : `UtilisateurAutorise` le satisfait,
 * et les deux modules restent indépendants l'un de l'autre.
 */
export type PorteurDEtapes = {
  readonly etapes: readonly { readonly parcours: string; readonly statut: string }[]
}

/**
 * Ce compte a-t-il la charge de cette étape, sur ce type de déclaration ?
 *
 * ⚠️ FAUX PAR DÉFAUT désormais — voir l'avertissement en tête de fichier. Les étapes que le code
 * laissait ouvertes ont reçu leurs lignes à la bascule : décocher ce qui l'était est un geste
 * d'administration, jamais un effet de bord de la migration.
 *
 * ⚠️ LIT LE COMPTE, PAS SES RÔLES. `chargerUtilisateurAutorise()` a déjà résolu ses étapes depuis
 * `role_etapes`, en écartant les rôles désactivés. Repartir des noms de rôles ici rouvrirait une
 * seconde lecture de la même donnée — et deux lectures finissent par diverger.
 */
export function peutFaireAvancerDepuis(
  u: PorteurDEtapes,
  parcours: ParcoursCode,
  statutActuel: StatutCode
): boolean {
  return u.etapes.some((etape) => etape.parcours === parcours && etape.statut === statutActuel)
}

/**
 * La matrice entière, telle que la base la porte.
 *
 * ⚠️ NE RETIENT QUE LES RÔLES ACTIFS, exactement comme `chargerUtilisateurAutorise()` : un rôle
 * éteint ne confère rien, et le compter ici ferait croire qu'une étape a un acteur alors que
 * personne ne peut la franchir. C'est le genre d'écart qu'on ne découvre que sur un dossier
 * bloqué.
 */
export async function matriceDesEtapes(): Promise<CaseEtape[]> {
  const lignes = await prisma.role_etapes.findMany({
    where: { roles: { guard_name: GUARD, actif: true } },
    select: {
      roles: { select: { name: true, libelle: true } },
      parcours: { select: { code: true } },
      statuts_dossier: { select: { code: true } },
    },
  })

  return lignes.map((ligne) => ({
    role: ligne.roles.name,
    libelleRole: ligne.roles.libelle,
    parcours: ligne.parcours.code,
    statut: ligne.statuts_dossier.code,
  }))
}

/**
 * Rôles désignés pour cette étape, par leur LIBELLÉ — pour l'expliquer à qui se voit refuser le
 * geste.
 *
 * ⚠️ LE LIBELLÉ DE LA BASE, plus une constante du code. Un rôle créé depuis l'interface n'a
 * aucune entrée dans `LIBELLES_ROLE` : la fiche aurait affiché son nom technique,
 * « responsable_hse_nord », à l'utilisateur qui cherche à comprendre pourquoi il ne peut rien
 * faire.
 */
export async function acteursDeLEtape(
  parcours: ParcoursCode,
  statutActuel: StatutCode
): Promise<string[]> {
  const lignes = await prisma.role_etapes.findMany({
    where: {
      roles: { guard_name: GUARD, actif: true },
      parcours: { code: parcours },
      statuts_dossier: { code: statutActuel },
    },
    orderBy: { roles: { libelle: 'asc' } },
    select: { roles: { select: { libelle: true } } },
  })

  return lignes.map((ligne) => ligne.roles.libelle)
}

/**
 * Étapes que PLUS PERSONNE ne peut franchir, faute de compte actif portant un rôle désigné.
 *
 * Le revers d'une restriction : une étape sans acteur bloque le dossier pour toujours, sans
 * message et sans recours — un défaut pire que la permissivité qu'on a voulu corriger. Le cas
 * n'a rien de théorique : il se produit chaque fois que les rôles sont réorganisés avant que les
 * comptes ne soient réattribués, et il est devenu plus facile à ouvrir depuis que la matrice se
 * décoche depuis l'interface.
 *
 * ⚠️ UNE CASE VIDE COMPTE MAINTENANT. Tant que la table vivait dans le code, une étape absente
 * était « ouverte à tous » et n'avait donc pas à être signalée. Elle est désormais interdite à
 * tous : une ligne décochée par mégarde bloque le circuit, et c'est précisément ce que cette
 * fonction doit faire remonter au tableau de bord d'administration.
 *
 * ⚠️ SEULES LES ÉTAPES D'OÙ L'ON PEUT PARTIR. Un statut terminal — « Résolu », « Clos » — n'a
 * aucune transition sortante : n'y désigner personne n'y bloque rien, et le signaler noierait les
 * vraies alertes sous huit lignes permanentes.
 *
 * ⚠️ Fonction PURE : elle reçoit la matrice et les rôles réellement portés, et ne lit aucune base.
 * C'est ce qui permet de l'exercer sur des cas construits — un test qui lirait la configuration
 * du jour passerait ou échouerait selon qui a été recruté, sans qu'aucun code ait changé.
 */
export function etapesSansActeur(
  matrice: readonly CaseEtape[],
  rolesPortes: ReadonlySet<string>
): string[] {
  const orphelines: string[] = []

  for (const parcours of PARCOURS_CODES) {
    for (const statut of STATUTS) {
      if (transitionsDepuis(statut).length === 0) continue

      const acteurs = matrice.filter(
        (cas) => cas.parcours === parcours && cas.statut === statut
      )

      if (acteurs.length === 0) {
        orphelines.push(`${parcours}/${statut} (aucun rôle coché)`)
        continue
      }

      if (!acteurs.some((cas) => rolesPortes.has(cas.role))) {
        orphelines.push(
          `${parcours}/${statut} (attend ${acteurs.map((cas) => cas.libelleRole).join(' ou ')})`
        )
      }
    }
  }

  return orphelines
}
