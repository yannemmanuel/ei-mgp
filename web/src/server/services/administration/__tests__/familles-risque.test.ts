import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  chargerParametrageFamillesRisque,
  creerFamilleRisque,
  deplacerFamilleRisque,
  modifierFamilleRisque,
  modifierTypesQualifiants,
  supprimerFamilleRisque,
} from '../familles-risque'
import {
  famillesRisqueProposees,
  qualifierFamilleRisque,
  typeQualifieLaFamille,
} from '../../dossier/famille-risque'
import { ErreurWorkflow } from '../../dossier/workflow'
import { creerDeclaration } from '../../declaration/creer-declaration'
import {
  categoriePour,
  graviteParNiveau,
  nettoyerDossiers,
} from '../../declaration/__tests__/aide-base'

/** Le type sur lequel se jouent les cas qui ont besoin d'un dossier qualifiable. */
const TYPE_QUALIFIANT = 'grief_employe'

const dossiers: string[] = []

async function dossierDeType(parcours: 'grief_employe'): Promise<string> {
  const categorie = await categoriePour(parcours)
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours,
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
  })

  dossiers.push(dossierId)
  return dossierId
}

afterAll(async () => {
  await nettoyerDossiers(dossiers)
})

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

/*
  ⚠️ CAPTURÉ DANS UN `beforeAll`, ET PLUS PARESSEUSEMENT AU PREMIER CAS.

  La première version mémorisait l'état lors du premier appel depuis un test. Il a suffi qu'un cas
  modifie le paramétrage avant que la capture n'ait lieu pour qu'elle enregistre un état DÉJÀ
  altéré — et le rétablissement de fin l'a alors fidèlement restauré : la base de développement est
  sortie du run avec l'évènement indésirable coché et les trois griefs décochés, l'exact inverse de
  ce qui est livré.

  Le geste n'était pas faux, son MOMENT l'était. `beforeAll` s'exécute avant tout cas du fichier :
  il n'y a plus de fenêtre.
*/
beforeAll(async () => {
  for (const p of await prisma.parcours.findMany({
    select: { code: true, familles_risque_actives: true },
  })) {
    ETAT_INITIAL.set(p.code, p.familles_risque_actives)
  }
})

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
  it('rend les quatre types, avec leur réglage et ce qu’un décochage laisserait', async () => {
    /*
      ⚠️ CE CAS N'AFFIRME PLUS « l'évènement indésirable est décoché ».

      Il le faisait, et il avait tort : ce réglage est fait pour être changé depuis l'écran. Un cas
      qui fige l'état du jour rougit dès qu'un administrateur coche une case — sur l'usage prévu de
      la fonctionnalité, donc, ce qui n'apprend qu'à ne plus lire la suite. L'état LIVRÉ est décrit
      par la migration ; ce qui se vérifie ici, c'est que l'écran rend fidèlement ce que la base
      porte, et le round-trip du cas suivant.
    */
    const { types } = await chargerParametrageFamillesRisque()

    expect(types.map((t) => t.code).sort()).toEqual([
      'ei_employe',
      'grief_communaute',
      'grief_employe',
      'grief_sous_traitant',
    ])

    const enBase = await prisma.parcours.findMany({
      select: { code: true, familles_risque_actives: true },
    })
    const attendu = new Map(enBase.map((p) => [p.code, p.familles_risque_actives]))

    for (const type of types) {
      expect(type.qualifieLaFamille, `${type.code} : l’écran ne dit pas ce que la base porte`).toBe(
        attendu.get(type.code)
      )

      // Le compte de dossiers déjà qualifiés : c'est lui qui permet d'annoncer ce qu'un décochage
      // laisserait derrière, et il doit être exact.
      const reels = await prisma.dossiers.count({
        where: { parcours: { code: type.code }, famille_risque_id: { not: null } },
      })

      expect(type.dossiersQualifies, `${type.code} : compte de dossiers qualifiés faux`).toBe(reels)
    }
  })

  it('⚠️ recocher l’évènement indésirable le remet en service, sans déploiement', async () => {
    /*
      LE CŒUR DE LA DEMANDE. Si ce cas échoue, le retrait est définitif — c'est-à-dire exactement
      ce que « laisser une possibilité de paramétrage » interdit.
    */
    const qui = await acteur()

    // On pose l'état de départ plutôt que de le supposer : le cas doit prouver le round-trip, pas
    // l'ambiance de la base.
    await modifierTypesQualifiants(qui, ['grief_employe', 'grief_sous_traitant', 'grief_communaute'])

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
    const { familles } = await chargerParametrageFamillesRisque()

    expect(familles.length, 'aucune famille : l’écran activerait une liste vide').toBeGreaterThan(0)

    for (const famille of familles) {
      expect(famille.libelle, `« ${famille.code} » n’a pas de libellé lisible`).not.toMatch(
        /^[a-z0-9_]+$/
      )
    }
  })
})

describe('⚠️ CRUD des familles de risque', () => {
  /*
    ⚠️ SUR DES FAMILLES JETABLES, ET SUR ELLES SEULES.

    Les neuf familles livrées sont citées par des dossiers réels ; un cas qui en prendrait une pour
    cible effacerait une qualification que personne ne pourrait reconstituer. Chaque cas crée donc
    la sienne, avec un libellé unique, et la supprime à la fin.
  */
  const jetables: bigint[] = []

  const libelleUnique = (quoi: string) => `ZZ verification ${quoi} ${process.pid} ${Date.now()}`

  async function familleJetable(actif = true): Promise<{ id: bigint; libelle: string }> {
    const libelle = libelleUnique('famille')
    await creerFamilleRisque(await acteur(), { libelle, actif })

    const creee = await prisma.familles_risque.findFirstOrThrow({
      where: { libelle },
      select: { id: true, libelle: true },
    })

    jetables.push(creee.id)
    return creee
  }

  afterAll(async () => {
    if (jetables.length === 0) return

    // Bornée aux seuls identifiants créés ici : un filtre par libellé approchant finirait par
    // emporter une famille réelle le jour où quelqu'un en crée une qui ressemble.
    await prisma.dossiers.updateMany({
      where: { famille_risque_id: { in: jetables } },
      data: { famille_risque_id: null },
    })
    await prisma.familles_risque.deleteMany({ where: { id: { in: jetables } } })
  })

  it('CRÉE une famille, avec un code dérivé du libellé et un rang en dernier', async () => {
    const avant = await prisma.familles_risque.count()
    const creee = await familleJetable()

    const ligne = await prisma.familles_risque.findUniqueOrThrow({ where: { id: creee.id } })

    expect(await prisma.familles_risque.count()).toBe(avant + 1)
    expect(ligne.code, 'le code n’est pas un identifiant technique').toMatch(/^[a-z0-9_]+$/)
    expect(ligne.code.length, 'le code déborde la colonne (64)').toBeLessThanOrEqual(64)

    // En DERNIER : une famille nouvelle n'a aucune raison de passer devant celles que les
    // traitants ont l'habitude de voir en tête.
    const rangs = await prisma.familles_risque.findMany({ select: { ordre: true } })
    expect(ligne.ordre).toBe(Math.max(...rangs.map((r) => r.ordre)))
  })

  it('refuse un libellé vide, et un libellé sans aucune lettre', async () => {
    const qui = await acteur()

    await expect(creerFamilleRisque(qui, { libelle: '   ', actif: true })).rejects.toBeInstanceOf(
      ErreurWorkflow
    )

    // « --- » ne produit aucun code : la ligne serait créée avec un code vide, en collision avec
    // la suivante du même genre.
    await expect(creerFamilleRisque(qui, { libelle: '---', actif: true })).rejects.toBeInstanceOf(
      ErreurWorkflow
    )
  })

  it('⚠️ refuse un code déjà pris plutôt que de créer un doublon silencieux', async () => {
    // Deux familles au même code rendraient le journal d'audit ambigu, et la contrainte d'unicité
    // ferait échouer l'écriture avec une erreur Prisma illisible pour l'administrateur.
    const creee = await familleJetable()

    await expect(
      creerFamilleRisque(await acteur(), { libelle: creee.libelle, actif: true })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('RENOMME sans toucher au code', async () => {
    /*
      ⚠️ LE CODE EST LA CLÉ DE RAPPROCHEMENT DU JOURNAL, qui est en ajout seul. Le faire suivre le
      libellé ferait désigner aux lignes déjà écrites une entrée qu'on ne retrouverait plus.
    */
    const creee = await familleJetable()
    const avant = await prisma.familles_risque.findUniqueOrThrow({ where: { id: creee.id } })

    const nouveau = libelleUnique('renommee')
    await modifierFamilleRisque(await acteur(), creee.id, { libelle: nouveau, actif: true })

    const apres = await prisma.familles_risque.findUniqueOrThrow({ where: { id: creee.id } })

    expect(apres.libelle).toBe(nouveau)
    expect(apres.code, 'le code a suivi le libellé').toBe(avant.code)
  })

  it('⚠️ DÉSACTIVER retire du choix, sans toucher aux dossiers qui la portent', async () => {
    // La règle de tous les référentiels ici. C'est aussi la seule issue quand une famille est
    // citée : la suppression est refusée, la désactivation ne l'est pas.
    const creee = await familleJetable()
    const dossierId = await dossierDeType(TYPE_QUALIFIANT)

    await qualifierFamilleRisque({ dossierId, familleId: creee.id })
    await modifierFamilleRisque(await acteur(), creee.id, { libelle: creee.libelle, actif: false })

    expect(
      (await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })).famille_risque_id,
      'la désactivation a effacé la qualification du dossier'
    ).toBe(creee.id)

    expect(
      (await famillesRisqueProposees(TYPE_QUALIFIANT)).map((f) => f.id),
      'une famille désactivée est encore proposée'
    ).not.toContainEqual(creee.id)
  })

  it('SUPPRIME une famille que rien ne cite', async () => {
    const creee = await familleJetable()

    await supprimerFamilleRisque(await acteur(), creee.id)

    expect(await prisma.familles_risque.findUnique({ where: { id: creee.id } })).toBeNull()
  })

  it('⚠️ REFUSE de supprimer une famille CITÉE par un dossier', async () => {
    /*
      RG-03. Effacer une ligne citée laisserait des dossiers dont plus personne ne saurait dire à
      quoi ils se rattachaient — et le message doit proposer l'issue, sans quoi l'administrateur
      reste devant un refus sans suite.
    */
    const creee = await familleJetable()
    const dossierId = await dossierDeType(TYPE_QUALIFIANT)

    await qualifierFamilleRisque({ dossierId, familleId: creee.id })

    await expect(supprimerFamilleRisque(await acteur(), creee.id)).rejects.toThrow(/Désactivez-la/)

    expect(
      await prisma.familles_risque.findUnique({ where: { id: creee.id } }),
      'la famille citée a été supprimée malgré le refus'
    ).not.toBeNull()
  })

  it('⚠️ REFUSE de retirer la DERNIÈRE famille tant qu’un type en demande une', async () => {
    /*
      ⚠️ LA PANNE SILENCIEUSE QUE CE CAS FERME.

      Un type coché dont plus aucune famille n'est active affiche une carte VIDE — ou, selon le
      chemin, ne l'affiche plus du tout. Le traitant voit une étape de son travail disparaître sans
      aucun message, et l'administrateur voit toujours la case cochée.

      On isole la situation : toutes les familles livrées sont désactivées le temps du cas, il n'en
      reste qu'une, et le service doit refuser de la retirer.
    */
    const qui = await acteur()

    const survivante = await familleJetable()
    const autres = await prisma.familles_risque.findMany({
      where: { actif: true, NOT: { id: survivante.id } },
      select: { id: true },
    })

    try {
      await prisma.familles_risque.updateMany({
        where: { id: { in: autres.map((a) => a.id) } },
        data: { actif: false },
      })

      // Au moins un type demande une famille : c'est le paramétrage livré.
      expect(
        await prisma.parcours.count({ where: { familles_risque_actives: true } })
      ).toBeGreaterThan(0)

      await expect(
        modifierFamilleRisque(qui, survivante.id, { libelle: survivante.libelle, actif: false })
      ).rejects.toBeInstanceOf(ErreurWorkflow)

      await expect(supprimerFamilleRisque(qui, survivante.id)).rejects.toBeInstanceOf(
        ErreurWorkflow
      )

      /*
        ⚠️ ET L'ISSUE RESTE OUVERTE : décocher les types d'abord doit lever le refus. Une garde
        sans issue transformerait une protection en impasse.
      */
      const typesAvant = await prisma.parcours.findMany({
        where: { familles_risque_actives: true },
        select: { id: true },
      })

      await prisma.parcours.updateMany({
        where: { id: { in: typesAvant.map((t) => t.id) } },
        data: { familles_risque_actives: false },
      })

      await modifierFamilleRisque(qui, survivante.id, { libelle: survivante.libelle, actif: false })

      expect(
        (await prisma.familles_risque.findUniqueOrThrow({ where: { id: survivante.id } })).actif
      ).toBe(false)

      await prisma.parcours.updateMany({
        where: { id: { in: typesAvant.map((t) => t.id) } },
        data: { familles_risque_actives: true },
      })
    } finally {
      await prisma.familles_risque.updateMany({
        where: { id: { in: autres.map((a) => a.id) } },
        data: { actif: true },
      })
    }
  })

  it('DÉPLACE une famille dans la liste, et renumérote tout', async () => {
    const creee = await familleJetable()

    const avant = await prisma.familles_risque.findMany({
      orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
      select: { id: true },
    })

    expect(avant.length, 'une seule famille : le déplacement ne prouverait rien').toBeGreaterThan(1)
    expect(avant[avant.length - 1].id, 'la famille créée n’est pas en dernier').toBe(creee.id)

    await deplacerFamilleRisque(await acteur(), creee.id, 'monter')

    const apres = await prisma.familles_risque.findMany({
      orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
      select: { id: true, ordre: true },
    })

    expect(apres[apres.length - 2].id, 'la famille n’a pas monté d’un rang').toBe(creee.id)

    // ⚠️ RENUMÉROTÉE EN ENTIER : des rangs en double donneraient un classement qui dépend de
    // l'ordre de lecture de la base, donc qui change d'un écran à l'autre sans que rien ne bouge.
    expect(apres.map((l) => l.ordre)).toEqual(apres.map((_, i) => i + 1))
  })

  it('refuse de faire monter la première, ou descendre la dernière', async () => {
    // Un déplacement impossible doit le dire. L'ignorer en silence donnerait un écran où le bouton
    // répond « enregistré » sans rien changer.
    const qui = await acteur()
    const toutes = await prisma.familles_risque.findMany({
      orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
      select: { id: true },
    })

    await expect(deplacerFamilleRisque(qui, toutes[0].id, 'monter')).rejects.toBeInstanceOf(
      ErreurWorkflow
    )
    await expect(
      deplacerFamilleRisque(qui, toutes[toutes.length - 1].id, 'descendre')
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('journalise la création et la suppression, valeurs comprises', async () => {
    /*
      ⚠️ LA SUPPRESSION EST LE CAS QUI COMPTE : le journal est la SEULE trace qui restera de la
      ligne. Se contenter d'enregistrer « supprimée » rendrait l'audit incapable de répondre à
      « qu'y avait-il exactement ? », la question qu'on se pose précisément quand une suppression
      pose problème.
    */
    const creee = await familleJetable()
    const ligne = await prisma.familles_risque.findUniqueOrThrow({ where: { id: creee.id } })

    const creation = await prisma.audit_logs.findFirst({
      where: { action: 'famille_risque.creee', auditable_id: String(creee.id) },
      select: { new_values: true },
    })

    expect(creation, 'la création n’a laissé aucune trace').not.toBeNull()
    expect((creation?.new_values as { libelle?: string })?.libelle).toBe(creee.libelle)

    await supprimerFamilleRisque(await acteur(), creee.id)

    const suppression = await prisma.audit_logs.findFirst({
      where: { action: 'famille_risque.supprimee', auditable_id: String(creee.id) },
      select: { old_values: true },
    })

    expect(suppression, 'la suppression n’a laissé aucune trace').not.toBeNull()

    const effacees = suppression?.old_values as { libelle?: string; code?: string } | null

    expect(effacees?.libelle, 'le libellé effacé n’est pas consigné').toBe(ligne.libelle)
    expect(effacees?.code, 'le code effacé n’est pas consigné').toBe(ligne.code)
  })
})
