import { describe, expect, it } from 'vitest'
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
    const autorise = avecEtapes({ parcours: 'grief_employe', statut: 'en_analyse' })
    const prive = avecEtapes()

    expect(peutFaireAvancerDepuis(autorise, 'grief_employe', 'en_analyse')).toBe(true)
    expect(peutFaireAvancerDepuis(prive, 'grief_employe', 'en_analyse')).toBe(false)

    // Et la grille ne déborde pas : une case cochée n'ouvre que SON type et SON étape.
    expect(peutFaireAvancerDepuis(autorise, 'grief_employe', 'en_investigation')).toBe(false)
    expect(peutFaireAvancerDepuis(autorise, 'grief_sous_traitant', 'en_analyse')).toBe(false)
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

describe('⚠️ Le reflet de test et la base restent exploitables', () => {
  /*
    ⚠️ CE QUE CETTE SECTION PEUT ENCORE GARANTIR — ET CE QU'ELLE A CESSÉ DE GARANTIR.

    Les cas métier ci-dessous se jouent en mémoire, sur des comptes fabriqués par `aide.ts`. Une
    version de cette section comparait ce reflet à la base, rôle par rôle et case par case, pour
    qu'ils ne puissent pas figer une règle que personne n'applique.

    ⚠️ CETTE COMPARAISON ÉTAIT MAL FONDÉE, et elle est retirée. La grille se coche depuis l'écran
    des habilitations : la base est faite pour DIVERGER de la configuration livrée. Le jour même
    de la bascule, un administrateur a re-paramétré un correspondant et supprimé un rôle — deux
    gestes parfaitement normaux —, et la comparaison est passée au rouge sans qu'aucun défaut
    n'existe. Un cas qui rougit sur l'usage prévu de la fonctionnalité ne protège plus rien : il
    apprend seulement à ignorer la suite.

    Restent deux garanties, l'une sur le reflet et l'autre sur la base, qui tiennent quel que soit
    le paramétrage du jour :

      1. le reflet ne nomme que des étapes qui EXISTENT et d'où un dossier peut partir — c'est ce
         qui attrape une étape retirée du circuit (« Affecté », le 2026-09-21) ou une faute de
         frappe, deux défauts qui rendraient les cas ci-dessous muets sans rien afficher ;
      2. la base reste EXPLOITABLE : aucune étape franchissable n'est laissée sans acteur actif.
         C'est l'invariant opérationnel, et le seul qui compte vraiment — une colonne vide bloque
         les dossiers sans message et sans recours.
  */
  it('⚠️ ne nomme que des étapes qui existent, et d’où un dossier peut partir', () => {
    /*
      Le défaut que ce cas attrape : une étape retirée du circuit — ou mal orthographiée — que le
      reflet continue de citer. `peutFaireAvancerDepuis()` répondrait « non » pour tous les rôles
      concernés, les cas métier ci-dessous se mettraient à exercer une situation impossible, et
      rien ne le signalerait. C'est exactement ce qui serait arrivé au retrait de « Affecté ».
    */
    const franchissables = new Set<string>(
      STATUTS.filter((statut) => transitionsDepuis(statut).length > 0)
    )

    expect(franchissables.size, 'aucune étape franchissable : le cas ne prouverait rien')
      .toBeGreaterThan(0)

    for (const role of Object.keys(ROLES)) {
      for (const cas of etapesLivrees(role)) {
        expect(
          (PARCOURS_CODES as readonly string[]).includes(cas.parcours),
          `${role} : « ${cas.parcours} » n’est pas un type de déclaration`
        ).toBe(true)

        expect(
          franchissables.has(cas.statut),
          `${role} : aucun dossier ne part de « ${cas.statut} », le reflet le cite pourtant`
        ).toBe(true)
      }
    }
  })

  it('⚠️ laisse la base EXPLOITABLE : aucune étape franchissable sans acteur actif', async () => {
    /*
      L'invariant qui compte vraiment, et le seul que le paramétrage ne peut pas rendre faux sans
      casser quelque chose : une étape dont plus aucun rôle actif n'est coché arrête les dossiers
      qui l'atteignent, sans message, sans erreur, et sans que personne sache à qui s'adresser.

      ⚠️ SUR LA BASE RÉELLE, et non sur le reflet : c'est elle qui décide. Le tableau de bord
      d'administration remonte la même chose à l'administrateur (`santeAdministration()`) ; ce cas
      le tient côté suite, pour que la bascule ne puisse pas laisser un trou derrière elle.
    */
    const matrice = await matriceDesEtapes()

    const orphelines: string[] = []

    for (const parcours of PARCOURS_CODES) {
      for (const statut of STATUTS) {
        if (transitionsDepuis(statut).length === 0) continue

        const acteurs = matrice.filter((c) => c.parcours === parcours && c.statut === statut)
        if (acteurs.length === 0) orphelines.push(`${parcours}/${statut}`)
      }
    }

    expect(
      orphelines,
      `ces étapes n’ont plus aucun rôle actif coché : les dossiers qui les atteignent y resteront`
    ).toEqual([])
  })

  /*
    ⚠️ UN CAS A ÉTÉ RETIRÉ ICI, et le dire vaut mieux que le laisser disparaître.

    Il vérifiait que les étapes autrefois OUVERTES restaient cochées pour exactement les rôles
    portant `dossiers.status.update` — la correspondance que la migration avait établie.

    Elle n'est pas un invariant : la grille et les permissions sont deux réglages INDÉPENDANTS,
    délibérément. Accorder « faire avancer un dossier » à un rôle ne coche aucune case, et c'est
    voulu — c'est la même séparation que pour la charge des dossiers, qui ne se déduit d'aucun
    droit. Le cas rougissait donc dès qu'un administrateur accordait un droit, sans qu'aucun
    défaut n'existe.

    Ce qu'il protégeait réellement — « une étape autrefois ouverte s'est refermée sur tout le
    monde » — est tenu par les deux cas ci-dessus, qui le disent mieux : ils exigent un acteur
    actif sur CHAQUE étape franchissable, celles-là comprises.
  */
})

describe('Une étape appartient à ses acteurs', () => {
  it('interdit au Secrétaire CSST l’analyse préliminaire d’un grief', () => {
    // §6.2 étape 2 confie l'analyse d'un grief employé au DRH, au Correspondant MGP ou au RQSE.
    // Le cloisonnement par parcours l'écarte déjà ici ; l'assertion fige les deux verrous.
    const u = utilisateurAvecRoles('secretaire_csst')

    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'en_analyse'))).toBe(false)
  })

  it('interdit au DRH de relancer un grief employé depuis l’investigation', () => {
    // §6.2 : le DRH tient les étapes 2 et 3, pas l'étape 5 (DG · Service MGP) — alors qu'il porte
    // `dossiers.status.update` et voit le parcours. C'est exactement ce que la grille ajoute.
    const u = utilisateurAvecRoles('responsable_grief_employe')

    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'en_analyse'))).toBe(true)
    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'en_investigation'))).toBe(false)
  })

  it('applique l’intersection quand les deux documents divergent', () => {
    // `docs/workflows.md` §6.2 cite le RQSE parmi les acteurs de l'analyse d'un grief employé,
    // tandis que `docs/acteurs.md` §2 lui donne « Dossiers ei_employe ». Les deux transcriptions
    // restent fidèles à leur source ; c'est leur INTERSECTION qui s'applique, donc la règle la
    // plus étroite — le type coché borne l'étape cochée.
    const u = utilisateurAvecRoles('rqse')

    expect(peutFaireAvancerDepuis(u, 'grief_employe', 'en_analyse')).toBe(true)
    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'en_analyse'))).toBe(false)
    expect(peutChangerStatutDossier(u, dossier('ei_employe', 'en_analyse'))).toBe(true)
  })

  it('laisse le Correspondant MGP conduire l’enquête sous-traitant de bout en bout', () => {
    // §6.3 : le même acteur tient les étapes 2, 3 et 5 — la restriction ne doit pas le gêner.
    const u = utilisateurAvecRoles('correspondant_mgp')

    for (const statut of ['recu', 'en_analyse', 'en_investigation'] as const) {
      expect(
        peutChangerStatutDossier(u, dossier('grief_sous_traitant', statut)),
        `étape ${statut}`
      ).toBe(true)
    }
  })

  it('⚠️ laisse les correspondants DÉMARRER un dossier depuis « Reçu »', () => {
    /*
      ⚠️ LE CAS QUI PROTÈGE LE RETRAIT DE « AFFECTÉ » (2026-09-21).

      Ce cas disait l'inverse, et il avait raison à l'époque : « Reçu → Affecté » était un geste
      d'AFFECTATION, réservé à qui sait affecter. Le Service MGP y était seul, les correspondants
      étaient cochés sur « Affecté », et c'est de là qu'ils démarraient.

      L'étape retirée, « Reçu » devient la première marche RÉELLE. Sans report de ses acteurs, le
      seul Service MGP aurait pu démarrer un grief : le correspondant DRH, le correspondant DL, le
      correspondant DADD et le responsable MGP de structure auraient vu leurs dossiers arriver
      sans pouvoir les faire avancer d'un cran — sans message, sans erreur, et sans que personne
      sache à qui s'adresser.

      C'est donc ce report qu'on fige ici, rôle par rôle et type par type.
    */
    const premierPas: [string, ParcoursCode][] = [
      ['charge_securite', 'ei_employe'],
      ['correspondant_drh', 'grief_employe'],
      ['responsable_grief_employe', 'grief_employe'],
      ['correspondant_dl', 'grief_sous_traitant'],
      ['correspondant_dadd', 'grief_communaute'],
      ['responsable_mgp_structure', 'grief_communaute'],
    ]

    for (const [role, parcours] of premierPas) {
      expect(
        peutChangerStatutDossier(utilisateurAvecRoles(role), dossier(parcours, 'recu')),
        `${role} ne peut plus démarrer un dossier ${parcours}`
      ).toBe(true)
    }

    // La contrepartie : le report n'a ouvert « Reçu » à personne d'autre. Un rôle de consultation
    // ne démarre rien, et un rôle borné à un autre type non plus.
    expect(
      peutChangerStatutDossier(utilisateurAvecRoles('comite_ethique'), dossier('grief_employe', 'recu'))
    ).toBe(false)
    expect(
      peutChangerStatutDossier(utilisateurAvecRoles('charge_securite'), dossier('grief_employe', 'recu'))
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
    const etapes: StatutCode[] = ['recu', 'en_analyse', 'reouvert']

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
    const acteurs = await acteursDeLEtape('grief_employe', 'en_analyse')

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
