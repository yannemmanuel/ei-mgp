import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { signerHorodatage } from '@/server/auth/horodatage-signe'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from './aide-base'

/**
 * La soumission publique, exercée ENTIÈREMENT — contrôles anti-robot compris.
 *
 * ⚠️ CE FICHIER EXISTE PARCE QUE SON ABSENCE A FAILLI COÛTER CHER.
 *
 * En signant l'horodatage anti-robot (S2, 2026-09-22), le champ est passé d'un nombre de secondes
 * à une chaîne « secondes.signature ». Le schéma Zod, lui, continuait de le coercer en nombre :
 * `Number('1790086208.TfDX…')` vaut `NaN`, et `.int()` le rejette. TOUTE déclaration légitime
 * aurait été refusée — sur un champ caché que le déclarant ne peut ni voir ni corriger.
 *
 * Les cas unitaires du module de signature passaient tous : ils exerçaient la signature, pas la
 * soumission. Le défaut n'est apparu qu'en suivant le chemin complet. C'est ce chemin que ce
 * fichier tient désormais.
 *
 * ⚠️ `next/headers` EST SIMULÉ : la soumission lit l'adresse IP pour la limitation de débit, et
 * cette lecture n'a pas de contexte de requête hors serveur. Simuler l'en-tête est le seul moyen
 * d'exercer le vrai chemin plutôt qu'une copie.
 */
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.42' }),
}))

const { traiterSoumission } = await import('../soumission')

const dossiers: string[] = []

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'secret-de-test-suffisamment-long-pour-hmac'
})

afterAll(async () => {
  await nettoyerDossiers(dossiers)
})

/**
 * Un formulaire complet et valide, sauf ce que le cas veut fausser.
 *
 * ⚠️ L'horodatage est signé AVEC UN RECUL de quatre secondes : le délai minimal de remplissage
 * est de trois. Poser « maintenant » ferait échouer tous les cas sur le délai, et masquerait ce
 * qu'ils prétendent vérifier.
 */
async function formulaire(horodatage?: string): Promise<FormData> {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  // La direction CONCERNÉE est obligatoire sur l'évènement indésirable : c'est elle qui établit
  // le site du dossier, donc son cloisonnement. Sans elle, la validation refuse — à juste titre.
  const direction = await prisma.directions.findFirstOrThrow({
    where: { actif: true },
    select: { id: true },
  })

  const donnees = new FormData()
  donnees.set('directionId', String(direction.id))
  donnees.set('parcours', 'ei_employe')
  donnees.set('anonymat', 'on')
  donnees.set('categorieId', String(categorie.id))
  donnees.set('niveauGraviteId', String(gravite.id))
  donnees.set('description', 'Vérification : description factuelle suffisamment longue pour passer.')
  donnees.set('dateSurvenance', new Date().toISOString().slice(0, 10))
  // Le lieu est un champ du parcours, obligatoire dans la configuration livrée.
  donnees.set('lieu', 'Atelier 3')
  donnees.set('piegeAraignee', '')
  donnees.set('horodatageAffichage', horodatage ?? signerHorodatage(Date.now() - 4_000))

  return donnees
}

describe('⚠️ Une déclaration légitime passe — le défaut que ce fichier a pris', () => {
  it('aboutit avec un horodatage SIGNÉ par le serveur', async () => {
    /*
      Le cas qui manquait. Avec le champ encore validé en `z.coerce.number()`, il échouait sur une
      erreur de validation portant sur `horodatageAffichage` — invisible pour le déclarant.
    */
    const resultat = await traiterSoumission(await formulaire())

    expect(
      resultat.erreurGenerale ?? JSON.stringify(resultat.erreurs ?? {}),
      'une déclaration valide a été refusée'
    ).toBeUndefined()

    expect(resultat.succes, 'aucune référence rendue').toBeDefined()
    expect(resultat.succes?.reference).toMatch(/^EI-\d{4}-\d{6}$/)
    expect(resultat.succes?.codeAcces).toMatch(/^\d{6}$/)

    const cree = await prisma.dossiers.findFirst({
      where: { reference: resultat.succes?.reference },
      select: { id: true, is_anonymous: true },
    })

    expect(cree, 'la déclaration n’a pas été écrite').not.toBeNull()
    if (cree) {
      dossiers.push(cree.id)
      expect(cree.is_anonymous, 'l’anonymat demandé n’a pas été respecté').toBe(true)
    }
  })
})

describe('⚠️ Les contournements de l’horodatage sont refusés', () => {
  it('⚠️ refuse la valeur FORGÉE « maintenant − 10 » — le contournement d’origine', async () => {
    /*
      Le geste exact que l'ancien contrôle laissait passer : prétendre que le formulaire est
      ouvert depuis dix secondes. Sans signature, la valeur traversait `Number()` et le délai
      minimal était franchi.
    */
    const avant = await prisma.dossiers.count()

    const resultat = await traiterSoumission(
      await formulaire(String(Math.floor(Date.now() / 1000) - 10))
    )

    expect(resultat.succes, 'la valeur forgée a produit une déclaration').toBeUndefined()
    expect(resultat.erreurGenerale).toMatch(/n’a pas pu être vérifié/)

    expect(await prisma.dossiers.count(), 'un dossier a été écrit malgré le refus').toBe(avant)
  })

  it('refuse une signature inventée', async () => {
    const forge = `${Math.floor(Date.now() / 1000) - 10}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

    const resultat = await traiterSoumission(await formulaire(forge))

    expect(resultat.succes).toBeUndefined()
    expect(resultat.erreurGenerale).toMatch(/n’a pas pu être vérifié/)
  })

  it('⚠️ refuse un jeton VALIDE mais périmé, et le dit autrement', async () => {
    /*
      Sans borne de validité, un robot récolterait un jeton UNE fois et le rejouerait
      indéfiniment. Le message diffère à dessein : le formulaire resté ouvert une journée est un
      cas d'usage ordinaire, et mérite qu'on dise quoi faire — recharger.
    */
    const vieux = signerHorodatage(Date.now() - 13 * 3600 * 1000)

    const resultat = await traiterSoumission(await formulaire(vieux))

    expect(resultat.succes).toBeUndefined()
    expect(resultat.erreurGenerale).toMatch(/resté ouvert trop longtemps/)
  })

  it('⚠️ refuse une soumission instantanée, jeton pourtant valide', async () => {
    // La signature garantit l'origine, pas la lenteur. Le délai minimal reste un contrôle à part,
    // et c'est lui qui impose désormais une attente réelle — puisque l'horodatage ne se forge plus.
    const resultat = await traiterSoumission(await formulaire(signerHorodatage()))

    expect(resultat.succes).toBeUndefined()
    expect(resultat.erreurGenerale).toMatch(/trop rapidement/)
  })

  it('piège l’araignée sans lui dire qu’elle est prise', async () => {
    /*
      Un robot qui remplit le champ invisible reçoit un FAUX succès : lui signaler la détection
      lui apprendrait à ne plus le remplir. Ce qui compte est qu'aucune écriture n'ait lieu.
    */
    const avant = await prisma.dossiers.count()

    const donnees = await formulaire()
    donnees.set('piegeAraignee', 'rempli par un robot')

    const resultat = await traiterSoumission(donnees)

    expect(resultat.succes, 'le faux succès a disparu : le robot saurait qu’il est repéré').toBeDefined()
    expect(await prisma.dossiers.count(), 'le piège a laissé écrire un dossier').toBe(avant)
  })
})
