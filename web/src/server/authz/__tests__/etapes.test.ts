import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PARCOURS_CODES, type ParcoursCode } from '../parcours'
import { ROLES } from '../roles'
import {
  acteursDeLEtape,
  etapesSansActeur,
  matriceDesEtapes,
  peutFaireAvancerDepuis,
  type CaseEtape,
} from '../etapes'
import { peutChangerStatutDossier, type DossierPourAutorisation } from '../policies/dossier'
import { STATUTS, transitionsDepuis, type StatutCode } from '@/server/services/dossier/statuts'
import { etapesLivrees, utilisateurAvecEtapes, utilisateurAvecRoles } from './aide'

/**
 * Acteurs par étape (docs/workflows.md §3).
 *
 * Le graphe des transitions contraignait l'enchaînement des états, jamais QUI les franchit :
 * n'importe quel porteur de `dossiers.status.update` pouvait pousser seul un dossier de « Reçu »
 * à « Résolu », y compris à des étapes confiées à d'autres acteurs par le CDC.
 *
 * ⚠️ LA TABLE A QUITTÉ LE CODE le 2026-09-21 : elle vit dans `role_etapes` et se coche dans une
 * grille type × étape. Ces cas exercent donc deux choses distinctes — que la RÈGLE lit bien les
 * étapes résolues du compte, et que le PARAMÉTRAGE en base dit toujours ce que le CDC demande.
 */
const dossier = (
  parcoursCode: DossierPourAutorisation['parcoursCode'],
  statutCode: StatutCode
): DossierPourAutorisation => ({
  parcoursCode,
  statutCode,
  isAnonymous: true,
  declarantUserId: null,
  siteId: null,
  directionId: null,
  estAffecteAuLecteur: false,
})

/** Un compte dont on décrit la grille case par case, sans dépendre d'un nom de rôle. */
const avecEtapes = (...cases: { parcours: string; statut: string }[]) =>
  utilisateurAvecEtapes(cases, 'service_mgp')

describe('⚠️ La règle ne lit plus aucun nom de rôle', () => {
  it('décide sur les ÉTAPES du compte, et sur rien d’autre', () => {
    /*
      ⚠️ LE CŒUR DE LA BASCULE. La fonction recevait `u.roles` et les comparait à une table écrite
      dans le code : un rôle créé depuis l'interface n'y figurait jamais, ne pouvait faire avancer
      aucun dossier, et rien ne le signalait — ni à l'administrateur qui venait de le créer, ni à
      son porteur, qui voyait seulement un bouton absent.

      Deux comptes portant EXACTEMENT les mêmes rôles mais des grilles différentes doivent donc
      décider différemment. Si ce cas échoue, c'est que le nom du rôle est revenu dans la
      décision.
    */
    const autorise = avecEtapes({ parcours: 'grief_employe', statut: 'affecte' })
    const prive = avecEtapes()

    expect(peutFaireAvancerDepuis(autorise, 'grief_employe', 'affecte')).toBe(true)
    expect(peutFaireAvancerDepuis(prive, 'grief_employe', 'affecte')).toBe(false)

    // Et la grille ne déborde pas : une case cochée n'ouvre que SON type et SON étape.
    expect(peutFaireAvancerDepuis(autorise, 'grief_employe', 'en_analyse')).toBe(false)
    expect(peutFaireAvancerDepuis(autorise, 'grief_sous_traitant', 'affecte')).toBe(false)
  })

  it('⚠️ une étape NON cochée est interdite, et non plus ouverte à tous', () => {
    /*
      ⚠️ UN CHANGEMENT DE DÉFAUT, ET IL EST VOLONTAIRE.

      Dans le code, une étape absente de la table signifiait « ouverte à tous ceux qui en ont le
      droit » — quatre acteurs du CDC n'ont pas de rôle applicatif. Cette nuance ne survit pas en
      base : l'absence de ligne s'y lit comme une interdiction.

      La reprise a rendu explicite ce qui était implicite. Ce cas fige le nouveau défaut ; le
      suivant vérifie que la reprise a bien eu lieu, faute de quoi ce défaut serait une régression
      silencieuse plutôt qu'une décision.
    */
    const u = avecEtapes({ parcours: 'ei_employe', statut: 'recu' })

    expect(peutFaireAvancerDepuis(u, 'ei_employe', 'en_investigation')).toBe(false)
  })

  it('⚠️ les étapes que le code laissait OUVERTES ont bien reçu leurs lignes', async () => {
    /*
      ⚠️ LA MOITIÉ QUI SE SERAIT PERDUE EN SILENCE.

      `en_attente_information` et `action_corrective_en_cours` sur les quatre types, plus
      `en_investigation` sur l'évènement indésirable et le grief communautaire : le CDC n'y
      désigne personne, et le code les laissait donc ouvertes. Sans la reprise, la bascule les
      aurait fermées à tout le monde — un dossier en attente d'information n'en serait jamais
      reparti, sans message et sans recours.

      Le comportement doit être identique au jour de la bascule. On l'exerce sur la BASE, pas sur
      le reflet : c'est elle qui décide.
    */
    const matrice = await matriceDesEtapes()

    const ouvertes: { parcours: ParcoursCode; statut: string }[] = []

    for (const parcours of PARCOURS_CODES) {
      ouvertes.push({ parcours, statut: 'en_attente_information' })
      ouvertes.push({ parcours, statut: 'action_corrective_en_cours' })
    }

    ouvertes.push({ parcours: 'ei_employe', statut: 'en_investigation' })
    ouvertes.push({ parcours: 'grief_communaute', statut: 'en_investigation' })

    for (const cas of ouvertes) {
      const acteurs = matrice.filter(
        (c) => c.parcours === cas.parcours && c.statut === cas.statut
      )

      expect(
        acteurs.length,
        `${cas.parcours}/${cas.statut} : étape autrefois ouverte, plus aucun acteur`
      ).toBeGreaterThan(0)
    }
  })
})

describe('⚠️ Le reflet de test suit la base, case par case', () => {
  /*
    ⚠️ CETTE SECTION EST LA CHARNIÈRE DE TOUT CE FICHIER.

    Les cas métier ci-dessous se jouent en mémoire, sur des comptes fabriqués par `aide.ts`. Ils
    ne prouvent quelque chose que si ce reflet dit la même chose que la base : sinon ils figent
    une règle que personne n'applique, et resteraient verts après une bascule ratée.

    ⚠️ LA COMPARAISON EST EN DEUX MOITIÉS, et ce n'est pas un contournement.

    La grille livrée est faite de deux choses de nature différente. Les étapes que le CDC DÉSIGNE
    ne dépendent que du CDC : elles se comparent nom par nom. Celles que le code laissait OUVERTES
    ont été attribuées par une dérivation — « tous les rôles portant `dossiers.status.update` » —,
    et leur contenu suit donc les PERMISSIONS de la base, qu'un administrateur peut ajuster depuis
    l'écran des habilitations. Les comparer à la liste du code ferait échouer ce cas le jour où
    quelqu'un accorde un droit, c'est-à-dire pour une raison qui n'est pas un défaut.

    Chaque moitié est donc vérifiée contre ce qui la détermine réellement.
  */
  it('reprend exactement les étapes que le CDC DÉSIGNE', async () => {
    const enBase = await matriceDesEtapes()

    // L'univers des cases désignées : celles dont le reflet prétend décider. Une case hors de cet
    // univers relève de la dérivation, vérifiée par le cas suivant.
    const universDesigne = new Set<string>()

    for (const role of Object.keys(ROLES)) {
      for (const cas of etapesLivrees(role)) {
        const ouverte =
          cas.statut === 'en_attente_information' ||
          cas.statut === 'action_corrective_en_cours' ||
          (cas.statut === 'en_investigation' &&
            (cas.parcours === 'ei_employe' || cas.parcours === 'grief_communaute'))

        if (!ouverte) universDesigne.add(`${cas.parcours}/${cas.statut}`)
      }
    }

    expect(universDesigne.size, 'aucune étape désignée : le cas ne prouverait rien').toBeGreaterThan(
      0
    )

    const parRole = new Map<string, Set<string>>()

    for (const cas of enBase) {
      const deja = parRole.get(cas.role) ?? new Set<string>()
      deja.add(`${cas.parcours}/${cas.statut}`)
      parRole.set(cas.role, deja)
    }

    const rolesActifs = await prisma.roles.findMany({
      where: { guard_name: 'web', actif: true },
      select: { name: true },
    })

    expect(rolesActifs.length, 'aucun rôle actif : le cas ne prouverait rien').toBeGreaterThan(0)

    for (const { name } of rolesActifs) {
      // Seuls les rôles que le code LIVRE ont un reflet : un rôle créé depuis l'interface n'en a
      // pas, et c'est exactement ce que la bascule rend possible.
      if (!(name in ROLES)) continue

      const reflet = etapesLivrees(name)
        .map((e) => `${e.parcours}/${e.statut}`)
        .filter((cle) => universDesigne.has(cle))

      const base = [...(parRole.get(name) ?? [])].filter((cle) => universDesigne.has(cle))

      expect(
        [...new Set(reflet)].sort(),
        `${name} : le reflet de test a dérivé des étapes désignées par le CDC`
      ).toEqual(base.sort())
    }
  })

  it('⚠️ attribue les étapes autrefois OUVERTES à qui porte le droit, en base', async () => {
    /*
      L'autre moitié, et celle qui pouvait se perdre en silence : les étapes sans acteur désigné
      appartenaient à tous les porteurs de `dossiers.status.update`. La reprise leur a donné une
      ligne chacun ; ce cas vérifie que la correspondance tient TOUJOURS — ni un rôle oublié, qui
      se retrouverait bloqué, ni un rôle de trop, qui franchirait une marche sans y avoir droit.

      ⚠️ LU DANS LA BASE DES DEUX CÔTÉS. Le droit s'accorde et se retire depuis l'écran des
      habilitations : le comparer à la liste du code ferait échouer ce cas pour un ajustement
      légitime, et c'est précisément ce que la bascule autorise.
    */
    const enBase = await matriceDesEtapes()

    const porteursDuDroit = await prisma.roles.findMany({
      where: {
        guard_name: 'web',
        actif: true,
        role_has_permissions: { some: { permissions: { name: 'dossiers.status.update' } } },
      },
      select: { name: true },
    })

    const attendus = new Set(porteursDuDroit.map((r) => r.name))

    expect(attendus.size, 'personne ne porte ce droit : le cas ne prouverait rien').toBeGreaterThan(
      0
    )

    const ouvertes: { parcours: ParcoursCode; statut: string }[] = []

    for (const parcours of PARCOURS_CODES) {
      ouvertes.push({ parcours, statut: 'en_attente_information' })
      ouvertes.push({ parcours, statut: 'action_corrective_en_cours' })
    }

    ouvertes.push({ parcours: 'ei_employe', statut: 'en_investigation' })
    ouvertes.push({ parcours: 'grief_communaute', statut: 'en_investigation' })

    for (const cas of ouvertes) {
      const coches = new Set(
        enBase
          .filter((c) => c.parcours === cas.parcours && c.statut === cas.statut)
          .map((c) => c.role)
      )

      for (const role of attendus) {
        expect(
          coches.has(role),
          `${cas.parcours}/${cas.statut} : ${role} porte le droit mais n’a plus sa case`
        ).toBe(true)
      }
    }
  })
})

describe('Une étape appartient à ses acteurs', () => {
  it('interdit au Secrétaire CSST l’analyse préliminaire d’un grief', () => {
    // §6.2 étape 2 confie l'analyse d'un grief employé au DRH, au Correspondant MGP ou au RQSE.
    // Le cloisonnement par parcours l'écarte déjà ici ; l'assertion fige les deux verrous.
    const u = utilisateurAvecRoles('secretaire_csst')

    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'affecte'))).toBe(false)
  })

  it('interdit au DRH de relancer un grief employé depuis l’investigation', () => {
    // §6.2 : le DRH tient les étapes 2 et 3, pas l'étape 5 (DG · Service MGP) — alors qu'il porte
    // `dossiers.status.update` et voit le parcours. C'est exactement ce que la grille ajoute.
    const u = utilisateurAvecRoles('responsable_grief_employe')

    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'affecte'))).toBe(true)
    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'en_investigation'))).toBe(false)
  })

  it('applique l’intersection quand les deux documents divergent', () => {
    // `docs/workflows.md` §6.2 cite le RQSE parmi les acteurs de l'analyse d'un grief employé,
    // tandis que `docs/acteurs.md` §2 lui donne « Dossiers ei_employe ». Les deux transcriptions
    // restent fidèles à leur source ; c'est leur INTERSECTION qui s'applique, donc la règle la
    // plus étroite — le type coché borne l'étape cochée.
    const u = utilisateurAvecRoles('rqse')

    expect(peutFaireAvancerDepuis(u, 'grief_employe', 'affecte')).toBe(true)
    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'affecte'))).toBe(false)
    expect(peutChangerStatutDossier(u, dossier('ei_employe', 'affecte'))).toBe(true)
  })

  it('laisse le Correspondant MGP conduire l’enquête sous-traitant de bout en bout', () => {
    // §6.3 : le même acteur tient les étapes 2, 3 et 5 — la restriction ne doit pas le gêner.
    const u = utilisateurAvecRoles('correspondant_mgp')

    for (const statut of ['affecte', 'en_analyse', 'en_investigation'] as const) {
      expect(
        peutChangerStatutDossier(u, dossier('grief_sous_traitant', statut)),
        `étape ${statut}`
      ).toBe(true)
    }
  })

  it('n’ouvre l’affectation manuelle qu’à qui sait affecter', () => {
    // « Reçu → Affecté » est automatique (EX-GES-02). La voie manuelle ne sert qu'au cas où aucun
    // compte actif ne porte le rôle de captage : c'est un geste d'affectation.
    expect(
      peutChangerStatutDossier(utilisateurAvecRoles('service_mgp'), dossier('ei_employe', 'recu'))
    ).toBe(true)
    expect(
      peutChangerStatutDossier(utilisateurAvecRoles('rqse'), dossier('ei_employe', 'recu'))
    ).toBe(false)
  })

  it('réserve la relance après réouverture au Service MGP et à la DG (RG-07)', () => {
    for (const parcours of PARCOURS_CODES) {
      expect(peutFaireAvancerDepuis(utilisateurAvecRoles('service_mgp'), parcours, 'reouvert')).toBe(
        true
      )
      expect(peutFaireAvancerDepuis(utilisateurAvecRoles('dg'), parcours, 'reouvert')).toBe(true)
      expect(
        peutFaireAvancerDepuis(utilisateurAvecRoles('correspondant_mgp'), parcours, 'reouvert')
      ).toBe(false)
      expect(
        peutFaireAvancerDepuis(utilisateurAvecRoles('secretaire_csst'), parcours, 'reouvert')
      ).toBe(false)
    }
  })

  it('empêche un seul compte de traverser tout le circuit', () => {
    // Le symptôme rapporté : un dossier poussé seul de « Reçu » à « Résolu ». Aucun rôle ne doit
    // pouvoir franchir toutes les marches d'un parcours.
    const etapes: StatutCode[] = ['recu', 'affecte', 'en_analyse', 'reouvert']

    for (const role of Object.keys(ROLES)) {
      const u = utilisateurAvecRoles(role)
      const franchies = etapes.filter((statut) =>
        peutChangerStatutDossier(u, dossier('grief_employe', statut))
      )

      expect(franchies.length, `${role} franchit ${franchies.join(', ')}`).toBeLessThan(
        etapes.length
      )
    }
  })
})

describe('⚠️ L’écran nomme les acteurs par leur LIBELLÉ', () => {
  it('ne renvoie jamais un nom technique à qui se voit refuser le geste', async () => {
    /*
      La fiche explique le refus par « cette étape revient à … ». Le libellé venait d'une
      constante du code : un rôle créé depuis l'interface n'y a aucune entrée, et l'écran aurait
      affiché « responsable_hse_nord » à l'utilisateur qui cherche à comprendre.
    */
    const acteurs = await acteursDeLEtape('grief_employe', 'affecte')

    expect(acteurs.length, 'aucun acteur sur cette étape : le cas ne prouverait rien').toBeGreaterThan(
      0
    )

    for (const libelle of acteurs) {
      expect(libelle, `« ${libelle} » ressemble à un nom technique`).not.toMatch(/^[a-z0-9_]+$/)
    }
  })
})

describe('Aucune étape ne doit rester sans preneur', () => {
  /*
    Une étape sans preneur bloque le dossier pour toujours, sans message et sans recours.

    ⚠️ Ce cas a d'abord LU LA BASE et exigé qu'aucune étape ne soit orpheline. Il avait raison sur
    le fond et tort sur la forme : il mesurait l'effectif du jour, pas la règle. La détection est
    du code, et c'est elle qu'on vérifie ici. Le constat sur la base réelle a sa place là où un
    administrateur peut agir : `santeAdministration()` le fait remonter au tableau de bord.
  */
  const matriceFictive: CaseEtape[] = PARCOURS_CODES.flatMap((parcours) =>
    STATUTS.filter((statut) => transitionsDepuis(statut).length > 0).map((statut) => ({
      role: `acteur_${parcours}_${statut}`,
      libelleRole: `Acteur ${parcours} ${statut}`,
      parcours,
      statut,
    }))
  )

  it('repère une étape dont plus aucun rôle n’est porté', () => {
    const toutesOrphelines = etapesSansActeur(matriceFictive, new Set())

    expect(
      toutesOrphelines.length,
      'aucune étape désignée : le cas ne prouverait rien'
    ).toBeGreaterThan(0)

    // Et le message doit NOMMER qui est attendu : « une étape est bloquée » n'aide personne à la
    // débloquer, alors que « attend Chargé de sécurité » désigne le rôle à attribuer.
    for (const ligne of toutesOrphelines) {
      expect(ligne, ligne).toMatch(/^\w+\/\w+ \(attend .+\)$/)
    }
  })

  it('ne signale rien quand tous les rôles désignés sont portés', () => {
    const tous = new Set(matriceFictive.map((c) => c.role))

    expect(etapesSansActeur(matriceFictive, tous)).toEqual([])
  })

  it('suffit d’UN rôle porté par étape', () => {
    /*
      La règle est un OU, pas un ET : une étape confiée à trois rôles est tenue dès que l'un
      d'eux est porté. L'exiger tous rendrait presque toute configuration orpheline, et l'alerte
      cesserait d'être lue.
    */
    const unParEtape = new Set<string>()

    for (const parcours of PARCOURS_CODES) {
      for (const statut of STATUTS) {
        const acteurs = matriceFictive.filter(
          (c) => c.parcours === parcours && c.statut === statut
        )
        if (acteurs.length > 0) unParEtape.add(acteurs[0].role)
      }
    }

    expect(etapesSansActeur(matriceFictive, unParEtape)).toEqual([])
  })

  it('⚠️ signale une COLONNE VIDE, ce qui n’existait pas avant', () => {
    /*
      ⚠️ LE REVERS DU CHANGEMENT DE DÉFAUT. Tant que la table vivait dans le code, une étape
      absente valait « ouverte à tous » et n'avait pas à être signalée. Elle est désormais
      interdite à tous : une case décochée par mégarde bloque le circuit, et c'est précisément ce
      que l'administrateur doit apprendre.
    */
    const amputee = matriceFictive.filter(
      (c) => !(c.parcours === 'grief_employe' && c.statut === 'en_analyse')
    )

    const tous = new Set(matriceFictive.map((c) => c.role))
    const orphelines = etapesSansActeur(amputee, tous)

    expect(orphelines).toEqual(['grief_employe/en_analyse (aucun rôle coché)'])
  })

  it('ne signale pas une étape terminale, d’où aucun dossier ne part', () => {
    // « Résolu » et « Clos » n'ont aucune transition sortante : n'y désigner personne n'y bloque
    // rien, et le signaler noierait les vraies alertes sous huit lignes permanentes.
    const orphelines = etapesSansActeur(matriceFictive, new Set())

    for (const ligne of orphelines) {
      const statut = ligne.split(' ')[0].split('/')[1] as StatutCode
      expect(transitionsDepuis(statut).length, `${ligne} ne mène nulle part`).toBeGreaterThan(0)
    }
  })
})
