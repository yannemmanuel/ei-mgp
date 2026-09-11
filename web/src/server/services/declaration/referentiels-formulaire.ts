import { prisma } from '@/lib/prisma'

/**
 * Les listes administrables qui alimentent les formulaires publics.
 *
 * Un seul aller-retour groupé plutôt que quatre requêtes dispersées dans la page : ces listes
 * sont lues à CHAQUE affichage du formulaire, qui est l'écran le plus exposé de l'application.
 *
 * ⚠️ Seules les valeurs ACTIVES sont proposées. Une valeur désactivée n'apparaît plus dans les
 * nouvelles déclarations mais reste lisible sur celles qui l'ont déjà retenue : c'est la raison
 * pour laquelle ces référentiels se désactivent au lieu de se supprimer.
 */
export type OptionFormulaire = { valeur: string; libelle: string }
export type OptionLieeFormulaire = OptionFormulaire & { parent: string }

/**
 * Le poste de repli, proposé sous CHAQUE direction.
 *
 * Le référentiel des postes ne peut pas être exhaustif : un intérimaire, un prestataire, un poste
 * créé la semaine dernière n'y figurent pas. Sans issue, le déclarant laissait le champ vide — et
 * l'information se perdait au lieu d'être imprécise.
 *
 * ⚠️ Ce n'est PAS une ligne du référentiel, et cela doit le rester. L'ajouter en base obligerait à
 * la créer, la maintenir et la désactiver sous chacune des directions, et un administrateur
 * pourrait la renommer en autre chose — alors que le serveur, lui, l'attend sous ce libellé exact
 * pour l'accepter. Une constante partagée par le chargement et la validation ne peut pas diverger
 * d'elle-même.
 */
export const POSTE_AUTRE = 'Autre'

export type ReferentielsFormulaire = {
  directions: OptionFormulaire[]
  postes: OptionLieeFormulaire[]
  lieux: OptionFormulaire[]
  villes: OptionFormulaire[]
  tranchesAnciennete: OptionFormulaire[]
}

export async function chargerReferentiels(): Promise<ReferentielsFormulaire> {
  const [directions, postes, lieux, villes, tranches] = await Promise.all([
    prisma.directions.findMany({
      where: { actif: true },
      orderBy: { libelle: 'asc' },
      select: { id: true, libelle: true },
    }),
    // Les postes voyagent avec leur direction : la cascade se joue ensuite dans le navigateur,
    // sans requête supplémentaire à chaque changement de direction.
    prisma.postes.findMany({
      where: { actif: true, directions: { actif: true } },
      orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
      select: { id: true, libelle: true, direction_id: true },
    }),
    prisma.lieux.findMany({
      where: { actif: true },
      orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
      select: { id: true, libelle: true },
    }),
    prisma.villes.findMany({
      where: { actif: true },
      orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
      select: { id: true, libelle: true },
    }),
    prisma.tranches_anciennete.findMany({
      where: { actif: true },
      orderBy: { ordre: 'asc' },
      select: { id: true, libelle: true },
    }),
  ])

  /*
    Les listes dont la valeur est CONSERVÉE EN CLAIR renvoient le libellé comme valeur.

    Lieu, ville et tranche d'ancienneté sont stockés tels quels sur le dossier : un référentiel
    renommé plus tard ne doit pas réécrire rétroactivement ce que le déclarant a choisi ce
    jour-là. La direction, elle, garde son identifiant — elle est une vraie clé étrangère, et
    c'est par elle que le dossier trouve son site.
  */
  const parLibelle = (l: { libelle: string }) => ({ valeur: l.libelle, libelle: l.libelle })

  /*
    « Autre » clôt la liste de chaque direction.

    Ajouté ici plutôt qu'en base (cf. `POSTE_AUTRE`), et seulement là où il manque : si une
    direction porte déjà un poste ainsi nommé, on ne le double pas — deux entrées identiques dans
    une liste déroulante n'ont aucun sens, et la seconde ne serait choisissable que par hasard.
  */
  const postesParDirection = postes.map((p) => ({
    valeur: p.libelle,
    libelle: p.libelle,
    parent: String(p.direction_id),
  }))

  for (const direction of directions) {
    const parent = String(direction.id)
    const dejaPresent = postesParDirection.some(
      (p) => p.parent === parent && p.libelle === POSTE_AUTRE
    )

    if (!dejaPresent) {
      postesParDirection.push({ valeur: POSTE_AUTRE, libelle: POSTE_AUTRE, parent })
    }
  }

  return {
    directions: directions.map((d) => ({ valeur: String(d.id), libelle: d.libelle })),
    postes: postesParDirection,
    lieux: lieux.map(parLibelle),
    villes: villes.map(parLibelle),
    tranchesAnciennete: tranches.map(parLibelle),
  }
}
