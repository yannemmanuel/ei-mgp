import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { peutVoirDossier, type DossierPourAutorisation } from '../policies/dossier'
import { perimetreDossiers } from '@/server/services/dossier/liste'
import type { UtilisateurAutorise } from '../utilisateur'
import { ROLE_NAMES } from '../roles'
import { utilisateurAvecRoles } from './aide'

/**
 * L'habilitation par type de déclaration, cochée dans les habilitations.
 *
 * « Les services MGP voient tous les griefs, et les correspondants MGP verront soit les griefs
 * sous-traitant, communautaire ou employé selon leurs habilitations. »
 *
 * Deux choses doivent tenir, et la seconde est celle qui a failli manquer : la case restreint
 * vraiment, ET elle résiste au droit de « consulter tous les dossiers ».
 */
const dossier = (
  parcoursCode: DossierPourAutorisation['parcoursCode']
): DossierPourAutorisation => ({
  parcoursCode,
  statutCode: 'en_analyse',
  isAnonymous: true,
  declarantUserId: null,
  siteId: null,
  directionId: null,
  estAffecteAuLecteur: true,
})

/** Un compte dont le rôle n'ouvre que les types passés. */
function habiliteSur(
  role: Parameters<typeof utilisateurAvecRoles>[0],
  parcours: UtilisateurAutorise['parcours']
): UtilisateurAutorise {
  return { ...utilisateurAvecRoles(role), siteId: null, directionId: null, parcours }
}

describe('Un correspondant ne voit que les types qui lui sont cochés', () => {
  it('montre son type et refuse les autres', () => {
    const drh = habiliteSur('correspondant_drh', ['grief_employe'])

    expect(peutVoirDossier(drh, dossier('grief_employe'))).toBe(true)
    expect(peutVoirDossier(drh, dossier('grief_communaute')), 'voit un grief communautaire').toBe(
      false
    )
    expect(peutVoirDossier(drh, dossier('grief_sous_traitant'))).toBe(false)
    expect(peutVoirDossier(drh, dossier('ei_employe'))).toBe(false)
  })

  it('suit la case quand on en coche deux', () => {
    // Rien n'oblige un rôle à n'ouvrir qu'un type : c'est bien l'intérêt de la case.
    const deux = habiliteSur('correspondant_drh', ['grief_employe', 'grief_sous_traitant'])

    expect(peutVoirDossier(deux, dossier('grief_employe'))).toBe(true)
    expect(peutVoirDossier(deux, dossier('grief_sous_traitant'))).toBe(true)
    expect(peutVoirDossier(deux, dossier('grief_communaute'))).toBe(false)
  })

  it('ne montre rien quand aucune case n’est cochée', () => {
    const aucun = habiliteSur('correspondant_drh', [])

    for (const type of ['ei_employe', 'grief_employe', 'grief_sous_traitant', 'grief_communaute'] as const) {
      expect(peutVoirDossier(aucun, dossier(type)), type).toBe(false)
    }
  })
})

describe('⚠️ « Consulter tous les dossiers » ne lève PAS le type', () => {
  /*
    ⚠️ LE CAS QUI REND LA CASE UTILE.

    `dossiers.view.all` rendait un périmètre vide, c'est-à-dire tous les dossiers sans condition.
    Tant que les types étaient écrits dans le code et réservés aux rôles transverses, la nuance ne
    se voyait pas : ils avaient les quatre de toute façon.

    Elle se voit depuis que les types se cochent. Un rôle observé en base — `correspondant_drh` —
    portait ce droit ET un seul type coché : il voyait quand même les évènements indésirables. La
    case aurait été un leurre.
  */
  const transverseUnSeulType: UtilisateurAutorise = {
    ...utilisateurAvecRoles('service_mgp'),
    siteId: null,
    directionId: null,
    parcours: ['grief_employe'],
  }

  it('refuse un type non coché malgré le droit', () => {
    expect(
      peutVoirDossier(transverseUnSeulType, dossier('ei_employe')),
      'le droit « tous les dossiers » a levé le cloisonnement par type'
    ).toBe(false)
  })

  it('accepte le type coché', () => {
    expect(peutVoirDossier(transverseUnSeulType, dossier('grief_employe'))).toBe(true)
  })

  it('borne aussi la clause SQL, et pas seulement la policy', () => {
    // Les deux implémentations de la même règle doivent dire la même chose : une clause vide
    // ramènerait tous les dossiers, y compris ceux d'un type non coché.
    const clause = perimetreDossiers(transverseUnSeulType)

    expect(clause.parcours, 'la clause SQL ne borne pas par type').toEqual({
      code: { in: ['grief_employe'] },
    })
  })

  it('laisse voir les quatre types à qui a les quatre cases', () => {
    // La contrepartie, et c'est la demande métier : « les services MGP voient tous les griefs ».
    const mgp: UtilisateurAutorise = {
      ...utilisateurAvecRoles('service_mgp'),
      siteId: null,
      directionId: null,
      parcours: ['ei_employe', 'grief_employe', 'grief_sous_traitant', 'grief_communaute'],
    }

    for (const type of ['ei_employe', 'grief_employe', 'grief_sous_traitant', 'grief_communaute'] as const) {
      expect(peutVoirDossier(mgp, dossier(type)), type).toBe(true)
    }
  })
})

describe('⚠️ Plus aucune déclaration n’est affectée à la création', () => {
  it('ne laisse aucun type sous affectation automatique', async () => {
    /*
      Le circuit des évènements indésirables a été étendu aux griefs le 2026-09-20 : une
      déclaration revient à qui est habilité dessus et dont le rattachement la couvre, sans
      destinataire nommé.

      Ce cas lit la table de correspondance dans le code source : c'est elle qui décide, et une
      ligne non vide remettrait ce parcours sous affectation sans que rien d'autre ne le signale.
    */
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/server/services/declaration/creer-declaration.ts', 'utf8')

    const table = source.slice(
      source.indexOf('const ROLES_AFFECTATION_AUTOMATIQUE'),
      source.indexOf('}', source.indexOf('const ROLES_AFFECTATION_AUTOMATIQUE'))
    )

    for (const parcours of ['ei_employe', 'grief_employe', 'grief_sous_traitant', 'grief_communaute']) {
      expect(table, `« ${parcours} » est encore affecté automatiquement`).toContain(`${parcours}: []`)
    }
  })

  it('n’a écrit aucune affectation sur les dossiers récents', async () => {
    // La trace en base, à côté de la lecture du code : les deux ensemble disent que la règle
    // s'applique vraiment, et pas seulement qu'elle est écrite.
    const recents = await prisma.dossiers.findMany({
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { reference: true, created_at: true, dossier_affectations: { select: { id: true } } },
    })

    expect(recents.length, 'aucun dossier : le cas ne prouverait rien').toBeGreaterThan(0)

    // Les dossiers créés AVANT la bascule gardent leurs affectations : on ne regarde que ceux
    // d'après.
    const bascule = new Date('2026-09-20T00:00:00Z')

    for (const d of recents) {
      if (!d.created_at || d.created_at < bascule) continue

      expect(
        d.dossier_affectations.length,
        `${d.reference} a reçu une affectation après la bascule`
      ).toBe(0)
    }
  })
})

describe('⚠️ Le reflet du paramétrage livré reste exploitable', () => {
  /*
    ⚠️ UNE COMPARAISON RÔLE PAR RÔLE AVEC LA BASE A ÉTÉ RETIRÉE ICI, et le dire vaut mieux que la
    laisser disparaître.

    `utilisateurAvecRoles()` fabrique un compte à partir d'une COPIE du paramétrage initial,
    écrite dans l'outillage de test. Ce cas la rattachait à la base, pour qu'une copie dérivante
    ne fasse pas passer les cas unitaires sur un paramétrage inexistant.

    ⚠️ CETTE COMPARAISON ÉTAIT MAL FONDÉE depuis que les types se cochent depuis l'écran des
    habilitations : la base est FAITE pour diverger de la configuration livrée. Le 2026-09-21, un
    administrateur a coché les quatre types sur `administrateur_digital` — un geste normal — et le
    cas est passé au rouge sans qu'aucun défaut n'existe. Un cas qui rougit sur l'usage prévu de
    la fonctionnalité n'apprend qu'une chose : à ne plus lire la suite.

    Reste ce qui tient quel que soit le paramétrage du jour, et qui attrape le vrai défaut — un
    reflet qui nommerait un type inexistant rendrait les cas unitaires muets sans rien afficher.
  */
  it('ne nomme que des types de déclaration qui existent', async () => {
    const enBase = await prisma.parcours.findMany({ select: { code: true } })
    const codes = new Set(enBase.map((p) => p.code))

    expect(codes.size, 'aucun type en base : le cas ne prouverait rien').toBeGreaterThan(0)

    for (const role of ROLE_NAMES) {
      const reflet = utilisateurAvecRoles(role)

      for (const parcours of reflet.parcours) {
        expect(
          codes.has(parcours),
          `« ${role} » : le reflet cite « ${parcours} », qui n’existe pas en base`
        ).toBe(true)
      }
    }
  })

  it('⚠️ laisse la base EXPLOITABLE : chaque type actif reste ouvert à quelqu’un', async () => {
    /*
      L'invariant qui compte, et que le paramétrage ne peut pas rendre faux sans casser quelque
      chose : un type que plus aucun rôle actif n'ouvre est un type dont les déclarations
      n'atteignent personne — elles arrivent, et restent invisibles à tout le monde.
    */
    const types = await prisma.parcours.findMany({
      where: { actif: true },
      select: { code: true, libelle: true },
    })

    expect(types.length, 'aucun type actif : le cas ne prouverait rien').toBeGreaterThan(0)

    for (const type of types) {
      const ouvreurs = await prisma.role_parcours.count({
        where: { parcours: { code: type.code }, roles: { guard_name: 'web', actif: true } },
      })

      expect(
        ouvreurs,
        `« ${type.libelle} » n’est ouvert par aucun rôle actif : ses déclarations n’atteignent personne`
      ).toBeGreaterThan(0)
    }
  })
})
