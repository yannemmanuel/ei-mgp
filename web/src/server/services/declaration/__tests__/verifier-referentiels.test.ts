import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PARCOURS, champsVisibles } from '../parcours-config'
import { verifierReferentiels } from '../verifier-referentiels'

/**
 * Les listes administrables sont transmises EN CLAIR — et doivent donc être vérifiées.
 *
 * Poste, lieu, ville et tranche d'ancienneté voyagent sous forme de libellé, pour que renommer un
 * référentiel ne réécrive pas rétroactivement ce qu'un déclarant a choisi. Le revers est direct :
 * le schéma ne peut plus rien prouver de leur existence, il ne voit qu'une chaîne. Sans ce
 * contrôle, une requête forgée écrirait n'importe quoi dans ces colonnes — et le formulaire
 * public est la surface d'abus la plus large de l'application.
 *
 * Ces cas s'exécutent contre la base réelle et n'écrivent rien, hormis un poste d'essai qu'ils
 * suppriment eux-mêmes.
 */
const champsEi = champsVisibles(PARCOURS.ei_employe, false)
const champsCommunaute = champsVisibles(PARCOURS.grief_communaute, false)

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Ce qui n’existe pas est refusé', () => {
  it('refuse un lieu absent du référentiel', async () => {
    const erreurs = await verifierReferentiels(champsEi, { lieu: 'Atelier imaginaire' })

    expect(erreurs?.lieu).toMatch(/ne correspond à aucune valeur/)
  })

  it('refuse une ville absente du référentiel', async () => {
    const erreurs = await verifierReferentiels(champsCommunaute, { ville: 'Cité perdue' })

    expect(erreurs?.ville).toBeDefined()
  })

  it('laisse passer un champ non renseigné', async () => {
    // Le caractère obligatoire est l'affaire du schéma, pas de ce contrôle : il vérifie
    // l'existence de ce qui est fourni, et rien d'autre.
    expect(await verifierReferentiels(champsEi, {})).toBeNull()
    expect(await verifierReferentiels(champsEi, { lieu: '' })).toBeNull()
  })
})

describe('Ce qui existe est accepté', () => {
  it('accepte un lieu actif du référentiel', async () => {
    const lieu = await prisma.lieux.findFirst({ where: { actif: true }, select: { libelle: true } })

    if (!lieu) {
      // Le référentiel est vide sur cette base : le cas ne prouverait rien, on le dit plutôt que
      // de le faire passer pour vert.
      expect.unreachable('aucun lieu actif en base — alimentez le référentiel pour ce cas')
    }

    expect(await verifierReferentiels(champsEi, { lieu: lieu.libelle })).toBeNull()
  })

  it('refuse un lieu DÉSACTIVÉ, même s’il existe', async () => {
    // C'est tout l'intérêt de la désactivation : la valeur reste lisible sur les déclarations qui
    // l'ont retenue, mais aucune nouvelle ne peut plus la choisir.
    const cree = await prisma.lieux.create({
      data: {
        libelle: 'Lieu d’essai désactivé',
        ordre: 999,
        actif: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true, libelle: true },
    })

    try {
      const erreurs = await verifierReferentiels(champsEi, { lieu: cree.libelle })
      expect(erreurs?.lieu, 'un lieu désactivé a été accepté').toBeDefined()
    } finally {
      await prisma.lieux.delete({ where: { id: cree.id } })
    }
  })
})

describe('La cascade est vérifiée côté serveur, pas seulement à l’écran', () => {
  it('refuse un poste réel rattaché à une AUTRE direction', async () => {
    const directions = await prisma.directions.findMany({
      where: { actif: true },
      take: 2,
      select: { id: true },
    })

    if (directions.length < 2) {
      expect.unreachable('moins de deux directions actives : la cascade ne peut pas être croisée')
    }

    const poste = await prisma.postes.create({
      data: {
        direction_id: directions[0].id,
        libelle: 'Poste d’essai de cascade',
        ordre: 999,
        actif: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true, libelle: true },
    })

    try {
      // Bon poste, bonne direction : accepté.
      expect(
        await verifierReferentiels(champsEi, {
          posteOccupe: poste.libelle,
          directionId: String(directions[0].id),
        })
      ).toBeNull()

      // Même poste, direction d'à côté : refusé. Sans ce croisement, la cascade ne vaudrait que
      // pour qui la respecte — c'est-à-dire pour personne d'autre que le navigateur.
      const erreurs = await verifierReferentiels(champsEi, {
        posteOccupe: poste.libelle,
        directionId: String(directions[1].id),
      })

      expect(erreurs?.posteOccupe, 'poste accepté sous une direction qui ne le porte pas').toBeDefined()
    } finally {
      await prisma.postes.delete({ where: { id: poste.id } })
    }
  })

  it('refuse un poste sans direction choisie', async () => {
    const erreurs = await verifierReferentiels(champsEi, { posteOccupe: 'Technicien' })

    expect(erreurs?.posteOccupe).toBeDefined()
  })
})

/**
 * Le poste et la direction survivent à une déclaration ANONYME — jusqu'en base.
 *
 * ⚠️ C'est le piège que ce déplacement évite, et il a déjà coûté deux fois : `declaration_
 * identites` n'est PAS créée quand l'anonymat est coché, si bien qu'un champ rangé là est demandé
 * à l'écran puis perdu, sans erreur ni trace. Vérifier qu'il s'affiche ne prouve donc rien ; il
 * faut le relire après écriture.
 */
describe('Une déclaration anonyme conserve direction et poste', () => {
  it('les retrouve sur le dossier, et non dans une table qui n’existe pas', async () => {
    const { categoriePour } = await import('./aide-base')
    const { nettoyerDossiers } = await import('./aide-base')
    const { creerDeclaration } = await import('../creer-declaration')

    const categorie = await categoriePour('grief_employe')
    const direction = await prisma.directions.findFirstOrThrow({
      where: { actif: true },
      select: { id: true },
    })

    const { dossierId } = await creerDeclaration({
      parcours: 'grief_employe',
      canalCaptageCode: 'qr_code',
      anonyme: true,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: null,
        description: 'Grief déposé sans se nommer.',
        directionId: direction.id,
        poste: 'Technicien réseau',
      },
    })

    try {
      const dossier = await prisma.dossiers.findUniqueOrThrow({
        where: { id: dossierId },
        select: { direction_id: true, poste: true, is_anonymous: true },
      })

      expect(dossier.is_anonymous).toBe(true)
      expect(dossier.direction_id, 'la direction a été perdue').toBe(direction.id)
      expect(dossier.poste, 'le poste a été perdu').toBe('Technicien réseau')

      // Et rien n'a été écrit dans la table d'identité : l'anonymat reste entier.
      const identite = await prisma.declaration_identites.count({ where: { dossier_id: dossierId } })
      expect(identite, 'une identité a été créée pour une déclaration anonyme').toBe(0)
    } finally {
      await nettoyerDossiers([dossierId])
    }
  })
})
