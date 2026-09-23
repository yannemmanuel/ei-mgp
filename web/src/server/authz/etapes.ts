import { prisma } from '@/lib/prisma'
import { STATUTS, transitionsDepuis, type StatutCode } from '@/server/services/dossier/statuts'
import { PARCOURS_CODES, type ParcoursCode } from './parcours'

/**
 * Qui peut faire AVANCER un dossier, selon son type et l'étape où il se trouve
 * (`docs/workflows.md` §3 : un ensemble de rôles autorisés, pas un `assignee_id` unique).
 *
 * Sans ce contrôle, tout porteur de `dossiers.status.update` pousserait seul un dossier de bout
 * en bout, y compris aux étapes confiées à d'autres.
 *
 * La matrice vit dans `role_etapes` et se coche dans `/administration/habilitations`.
 *
 * ⚠️ Une ligne absente INTERDIT. Le code, lui, lisait l'absence comme « ouverte à tous » : la
 * bascule a donc écrit explicitement les lignes des étapes alors ouvertes, à comportement égal.
 *
 * Seule l'étape de DÉPART est la clé — le graphe des transitions contraint déjà les arrivées, et
 * le CDC ne dit pas qui, de deux acteurs, commande un passage donné.
 */

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
 * ⚠️ Lit le COMPTE, pas ses rôles : `chargerUtilisateurAutorise()` a déjà résolu ses étapes en
 * écartant les rôles désactivés, et deux lectures de la même donnée finissent par diverger.
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
    where: { roles: { actif: true } },
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
 * Rôles désignés pour cette étape, par leur libellé — pour l'expliquer à qui se voit refuser.
 *
 * ⚠️ Le libellé de la BASE : un rôle créé depuis l'interface n'a pas d'entrée dans le code, et la
 * fiche afficherait son nom technique à qui cherche à comprendre.
 */
export async function acteursDeLEtape(
  parcours: ParcoursCode,
  statutActuel: StatutCode
): Promise<string[]> {
  const lignes = await prisma.role_etapes.findMany({
    where: {
      roles: { actif: true },
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
 * Le revers de la restriction : une étape sans acteur bloque le dossier pour toujours, sans
 * message ni recours. Le cas se produit dès qu'on réorganise les rôles avant de réattribuer les
 * comptes — d'où cette remontée au tableau de bord d'administration.
 *
 * ⚠️ Seules les étapes d'où l'on peut PARTIR : un statut terminal n'a aucune transition sortante,
 * et le signaler noierait les vraies alertes.
 *
 * ⚠️ Fonction PURE, pour être exerçable sur des cas construits : un test qui lirait la
 * configuration du jour dépendrait de qui a été recruté.
 */
export function etapesSansActeur(
  matrice: readonly CaseEtape[],
  rolesPortes: ReadonlySet<string>,
  /*
    ⚠️ Les statuts réellement ATTEIGNABLES : un statut désactivé n'est destination d'aucune
    transition, et le signaler annoncerait un blocage là où il n'y a rien à franchir.

    Fourni par l'appelant pour que la fonction reste pure. Omis, tous sont considérés atteignables.
  */
  statutsAtteignables?: ReadonlySet<string>
): string[] {
  const orphelines: string[] = []

  for (const parcours of PARCOURS_CODES) {
    for (const statut of STATUTS) {
      if (transitionsDepuis(statut).length === 0) continue
      if (statutsAtteignables && !statutsAtteignables.has(statut)) continue

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
