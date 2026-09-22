import { afterAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { signerHorodatage } from '@/server/auth/horodatage-signe'
import { supprimerListePlate } from '@/server/services/administration/referentiels'
import {
  categoriePour,
  graviteParNiveau,
  nettoyerAudit,
  nettoyerDossiers,
} from '@/server/services/declaration/__tests__/aide-base'

/**
 * Un lieu ou une ville RETENU par un dossier ne se supprime plus.
 *
 * ⚠️ CE FICHIER EXISTE PARCE QUE LE CONTRÔLE MANQUAIT, et que le commentaire qui l'en dispensait
 * était exact tout en étant trompeur : « ces trois listes ne sont citées par aucune clé
 * étrangère ». Elles le sont — `dossiers.lieu` et `dossiers.ville` portent le LIBELLÉ en clair,
 * délibérément, pour que renommer un référentiel ne réécrive pas ce qu'un déclarant a répondu.
 * Simplement, le lien ne passe pas par une clé : PostgreSQL ne pouvait donc pas s'y opposer, et
 * rien d'autre ne s'y opposait.
 *
 * Le défaut n'est pas théorique. `users.poste` porte aujourd'hui « CS Achat », un libellé absent
 * de `postes` : c'est à quoi ressemble la suite — une valeur que plus aucune liste ne propose et
 * que plus rien n'explique.
 *
 * ⚠️ CES CAS POSENT LEUR PROPRE ÉTAT. Prendre un lieu déjà cité par la base de développement
 * aurait fait dépendre le résultat de ce qu'un administrateur venait de saisir — le motif a déjà
 * fait passer trois fichiers au rouge sans qu'aucun code n'ait changé. Chaque lieu est créé ici,
 * la déclaration qui le retient est déposée ici par le chemin public complet, et tout repart en
 * fin de fichier.
 *
 * ⚠️ LES LIBELLÉS SONT UNIQUES EN BASE (`lieux_libelle_unique`) : chaque cas prend le sien, sans
 * quoi le second à s'exécuter échouerait sur la contrainte plutôt que sur ce qu'il vérifie.
 */
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.77' }),
}))

const { traiterSoumission } = await import('@/server/services/declaration/soumission')

const ACTEUR = { id: 1n }
const MODELE_LIEU = String.raw`App\Models\Lieu`

const dossiers: string[] = []
const lieux: bigint[] = []

afterAll(async () => {
  await nettoyerDossiers(dossiers)
  await prisma.lieux.deleteMany({ where: { id: { in: lieux } } })
  await nettoyerAudit(MODELE_LIEU, lieux)
})

/** Un lieu neuf, actif, au libellé qui n'appartient qu'à ce cas. */
async function lieuNeuf(libelle: string): Promise<bigint> {
  const maintenant = new Date()
  const cree = await prisma.lieux.create({
    data: {
      libelle,
      actif: true,
      ordre: 999,
      created_at: maintenant,
      updated_at: maintenant,
    },
    select: { id: true },
  })

  lieux.push(cree.id)
  return cree.id
}

/**
 * Dépose une vraie déclaration qui RETIENT ce lieu.
 *
 * Par la soumission publique complète, et non par un `prisma.dossiers.create` : c'est ce chemin
 * qui décide réellement de ce qui atterrit dans `dossiers.lieu`. Écrire la colonne à la main
 * ferait passer le cas même le jour où le formulaire cesserait d'y ranger le libellé.
 */
async function declarationCitant(libelle: string): Promise<void> {
  process.env.AUTH_SECRET ??= 'secret-de-test-suffisamment-long-pour-hmac'

  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)
  const direction = await prisma.directions.findFirstOrThrow({
    where: { actif: true },
    select: { id: true },
  })

  const donnees = new FormData()
  donnees.set('parcours', 'ei_employe')
  donnees.set('anonymat', 'on')
  donnees.set('directionId', String(direction.id))
  donnees.set('categorieId', String(categorie.id))
  donnees.set('niveauGraviteId', String(gravite.id))
  donnees.set(
    'description',
    'Vérification : déclaration déposée pour retenir un lieu du référentiel.'
  )
  donnees.set('dateSurvenance', new Date().toISOString().slice(0, 10))
  donnees.set('lieu', libelle)
  donnees.set('caractereRepetitif', 'premiere_fois')
  donnees.set('piegeAraignee', '')
  // Quatre secondes de recul : le délai minimal de remplissage est de trois.
  donnees.set('horodatageAffichage', signerHorodatage(Date.now() - 4_000))

  const resultat = await traiterSoumission(donnees)

  /*
    ⚠️ LE DOSSIER EST ENREGISTRÉ POUR NETTOYAGE AVANT LA MOINDRE ASSERTION.

    Une première version affirmait d'abord et retenait ensuite : une assertion fautive a laissé
    deux dossiers d'essai dans la base de développement, qui ont ensuite fait échouer les
    exécutions suivantes en gonflant le décompte de citations. Un test qui salit la base qu'il
    interroge se met lui-même en échec, une exécution plus tard, pour une raison qui n'a plus
    rien à voir.
  */
  const cree = await prisma.dossiers.findFirst({
    where: { reference: resultat.succes?.reference ?? '—' },
    select: { id: true, lieu: true },
  })

  if (cree) dossiers.push(cree.id)

  /*
    Les deux refus possibles sont vérifiés SÉPARÉMENT, et chacun montre son détail.

    ⚠️ Les réunir en une seule chaîne ne marche pas : `[].join(' · ')` vaut `''`, qui n'est ni
    `undefined` ni nullish. L'assertion échouait donc sur les déclarations qui passaient, et
    aurait laissé passer celles qui échouent.
  */
  expect(resultat.erreurGenerale, 'refus global sur la déclaration de préparation').toBeUndefined()
  expect(
    Object.entries(resultat.erreurs ?? {}).map(([champ, message]) => `${champ}: ${String(message)}`),
    'des champs ont été refusés sur la déclaration de préparation'
  ).toEqual([])

  expect(cree, 'la déclaration de préparation n’a pas été écrite').not.toBeNull()
  expect(cree?.lieu, 'le lieu n’a pas été retenu sur le dossier').toBe(libelle)
}

describe('⚠️ Une entrée citée par un dossier ne se supprime pas', () => {
  it('⚠️ refuse le lieu qu’une déclaration a retenu, et nomme le nombre', async () => {
    const libelle = 'Essai citation — atelier nord'
    const id = await lieuNeuf(libelle)
    await declarationCitant(libelle)

    await expect(supprimerListePlate(ACTEUR, 'lieu', id)).rejects.toThrow(/cité par 1 dossier/)

    /*
      Le refus ne suffit pas : ce qui compte est que la ligne soit TOUJOURS là. Une suppression
      suivie d'une erreur laisserait la base exactement dans l'état que ce cas prétend empêcher,
      tout en le faisant passer.
    */
    const restant = await prisma.lieux.findUnique({ where: { id }, select: { id: true } })
    expect(restant, 'le lieu a été supprimé malgré le refus').not.toBeNull()
  })

  it('laisse supprimer une entrée que plus rien ne cite', async () => {
    /*
      Le revers indispensable. Un garde-fou qui refuse TOUT ferait passer le cas précédent tout en
      rendant le référentiel inadministrable — et personne ne s'en apercevrait avant la première
      suppression tentée en production.
    */
    const id = await lieuNeuf('Essai citation — entrepôt libre')

    await expect(supprimerListePlate(ACTEUR, 'lieu', id)).resolves.toBeUndefined()

    const restant = await prisma.lieux.findUnique({ where: { id }, select: { id: true } })
    expect(restant, 'l’entrée libre n’a pas été supprimée').toBeNull()
  })

  it('⚠️ ne bloque pas sur un libellé dont un AUTRE est le prolongement', async () => {
    /*
      Le décompte porte sur une ÉGALITÉ, jamais sur une correspondance partielle.

      Écrit avec `contains`, il aurait refusé la suppression de « Bureau » dès qu'un dossier
      citerait « Bureau central » — un refus que son destinataire ne peut ni comprendre ni
      vérifier, puisque aucun dossier ne cite « Bureau ». D'où le sens de ce cas : c'est le lieu
      COURT qu'on supprime, pendant qu'un dossier retient le long.
    */
    const court = 'Essai citation — bureau'
    const long = 'Essai citation — bureau central'

    const idCourt = await lieuNeuf(court)
    const idLong = await lieuNeuf(long)
    await declarationCitant(long)

    await expect(supprimerListePlate(ACTEUR, 'lieu', idCourt)).resolves.toBeUndefined()

    // Et celui qui est réellement cité reste protégé.
    await expect(supprimerListePlate(ACTEUR, 'lieu', idLong)).rejects.toThrow(/cité par 1 dossier/)
  })
})
