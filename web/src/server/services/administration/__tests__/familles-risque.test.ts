import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  chargerParametrageFamillesRisque,
  modifierTypesQualifiants,
} from '../familles-risque'
import { famillesRisqueProposees, typeQualifieLaFamille } from '../../dossier/famille-risque'
import { ErreurWorkflow } from '../../dossier/workflow'

/**
 * ⚠️ LE RETRAIT DOIT ÊTRE UN PARAMÈTRE, PAS UNE LIGNE DE CODE.
 *
 * La demande, mot pour mot : « on va retirer les familles seulement sur les EI mais on va laisser
 * une possibilité de paramétrage dans le backoffice ». Écrire la règle dans le code aurait rendu
 * le retrait irréversible sans déploiement — exactement ce que la seconde moitié de la phrase
 * refuse.
 *
 * Ces cas exercent le chemin ENTIER : le geste d'administration écrit en base, et le service que
 * la fiche consulte le rend. Vérifier le seul geste laisserait passer une écriture qui n'arrive
 * jamais jusqu'à l'écran de traitement.
 */
const ETAT_INITIAL = new Map<string, boolean>()

const acteur = async () => {
  const u = await prisma.users.findFirstOrThrow({ orderBy: { id: 'asc' }, select: { id: true } })
  return { id: u.id }
}

async function memoriserEtatInitial(): Promise<void> {
  if (ETAT_INITIAL.size > 0) return

  for (const p of await prisma.parcours.findMany({
    select: { code: true, familles_risque_actives: true },
  })) {
    ETAT_INITIAL.set(p.code, p.familles_risque_actives)
  }
}

afterAll(async () => {
  /*
    ⚠️ L'ÉTAT D'ORIGINE EST RÉTABLI, quoi qu'il arrive.

    Ce paramétrage commande ce que voient les traitants sur chaque fiche. Le laisser modifié par
    un cas de test changerait le comportement de l'application de développement — et de tous les
    cas qui tournent ensuite, qui se mettraient à prouver autre chose que ce qu'ils annoncent.
  */
  for (const [code, valeur] of ETAT_INITIAL) {
    await prisma.parcours.updateMany({
      where: { code },
      data: { familles_risque_actives: valeur },
    })
  }
})

describe('⚠️ Le retrait des familles se paramètre, il n’est pas écrit dans le code', () => {
  it('livre l’évènement indésirable DÉCOCHÉ et les griefs cochés', async () => {
    await memoriserEtatInitial()

    const { types } = await chargerParametrageFamillesRisque()
    const par = new Map(types.map((t) => [t.code, t.qualifieLaFamille]))

    expect(par.get('ei_employe'), 'l’évènement indésirable demande encore une famille').toBe(false)

    for (const code of ['grief_employe', 'grief_sous_traitant', 'grief_communaute']) {
      expect(par.get(code), `${code} ne demande plus de famille`).toBe(true)
    }
  })

  it('⚠️ recocher l’évènement indésirable le remet en service, sans déploiement', async () => {
    /*
      LE CŒUR DE LA DEMANDE. Si ce cas échoue, le retrait est définitif — c'est-à-dire exactement
      ce que « laisser une possibilité de paramétrage » interdit.
    */
    await memoriserEtatInitial()
    const qui = await acteur()

    expect(await typeQualifieLaFamille('ei_employe')).toBe(false)
    expect(await famillesRisqueProposees('ei_employe')).toEqual([])

    await modifierTypesQualifiants(qui, [
      'ei_employe',
      'grief_employe',
      'grief_sous_traitant',
      'grief_communaute',
    ])

    expect(await typeQualifieLaFamille('ei_employe'), 'le recochage n’arrive pas au service').toBe(
      true
    )
    expect(
      (await famillesRisqueProposees('ei_employe')).length,
      'le type est coché mais aucune famille n’est proposée'
    ).toBeGreaterThan(0)

    // Puis on le redécoche : le geste doit fonctionner dans les deux sens.
    await modifierTypesQualifiants(qui, ['grief_employe', 'grief_sous_traitant', 'grief_communaute'])

    expect(await typeQualifieLaFamille('ei_employe')).toBe(false)
  })

  it('⚠️ l’absence d’un type vaut « non », jamais « ne pas toucher »', async () => {
    /*
      Un formulaire de cases à cocher n'envoie pas les cases décochées. Les interpréter comme
      « laisser tel quel » rendrait tout décochage impossible : on cocherait, jamais l'inverse, et
      l'écran annoncerait pourtant un enregistrement réussi.
    */
    await memoriserEtatInitial()
    const qui = await acteur()

    await modifierTypesQualifiants(qui, [])

    const { types } = await chargerParametrageFamillesRisque()

    expect(
      types.filter((t) => t.qualifieLaFamille).map((t) => t.code),
      'une liste vide n’a pas tout décoché'
    ).toEqual([])
  })

  it('refuse un type inconnu plutôt que de l’ignorer', async () => {
    // L'ignorer enregistrerait un paramétrage amputé en annonçant que tout est enregistré.
    await memoriserEtatInitial()
    const qui = await acteur()

    await expect(
      modifierTypesQualifiants(qui, ['grief_employe', 'type_inexistant'])
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('journalise le changement, avec l’état avant et après', async () => {
    /*
      Ce geste change ce que voient tous les traitants d'un type. Comme pour les habilitations, il
      doit rester explicable : qui l'a fait, quand, et ce qui a basculé.
    */
    await memoriserEtatInitial()
    const qui = await acteur()

    await modifierTypesQualifiants(qui, ['grief_employe'])
    await modifierTypesQualifiants(qui, ['grief_employe', 'grief_communaute'])

    const trace = await prisma.audit_logs.findFirst({
      where: { action: 'parcours.modifie' },
      orderBy: { id: 'desc' },
      select: { old_values: true, new_values: true, user_id: true },
    })

    expect(trace, 'le changement n’a laissé aucune trace').not.toBeNull()
    expect(trace?.user_id).toBe(qui.id)

    const avant = (trace?.old_values as { famillesRisqueActives?: string[] })
      ?.famillesRisqueActives
    const apres = (trace?.new_values as { famillesRisqueActives?: string[] })
      ?.famillesRisqueActives

    expect(avant, 'l’état d’avant n’est pas tracé').toEqual(['grief_employe'])
    expect(apres, 'l’état d’après n’est pas tracé').toEqual(['grief_communaute', 'grief_employe'])
  })

  it('montre les familles proposées, pour ne pas décider à l’aveugle', async () => {
    // Cocher « ce type qualifie une famille » sans voir lesquelles reviendrait à activer une liste
    // qu'on n'a pas lue.
    await memoriserEtatInitial()

    const { familles } = await chargerParametrageFamillesRisque()

    expect(familles.length, 'aucune famille : l’écran activerait une liste vide').toBeGreaterThan(0)

    for (const famille of familles) {
      expect(famille.libelle, `« ${famille.code} » n’a pas de libellé lisible`).not.toMatch(
        /^[a-z0-9_]+$/
      )
    }
  })
})
