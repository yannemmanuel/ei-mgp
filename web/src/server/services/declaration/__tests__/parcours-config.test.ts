import { describe, expect, it } from 'vitest'

/**
 * EX-DEC-02 : chaque parcours est atteignable par son propre lien `/declarer/{code}`, sans
 * dépendance à un QR code. EX-DEC-03 : la bascule d'anonymat conditionne les champs rendus.
 */
import { schemaParcours } from '@/lib/validations/formulaire-parcours'
import { CODES_PARCOURS, PARCOURS, champsVisibles } from '../parcours-config'

/**
 * RGI-03 : si l'anonymat est coché, aucun champ d'identification n'est collecté — sur AUCUN des
 * 4 parcours. C'est la garantie d'affichage qui complète la garantie structurelle vérifiée côté
 * service (aucune ligne `declaration_identites` créée).
 */
describe('Masquage des champs d’identité en anonyme (RGI-03)', () => {
  it.each(CODES_PARCOURS)('ne rend aucun champ d’identité pour %s en anonyme', (code) => {
    const visibles = champsVisibles(PARCOURS[code], true)

    // `statutPlaignant` qualifie la plainte, pas la personne : seule exception documentée.
    const identiteRestante = visibles.filter((c) => c.identite && c.nom !== 'statutPlaignant')

    expect(identiteRestante).toEqual([])
  })

  it.each(CODES_PARCOURS)('rend les champs d’identité pour %s en identifié', (code) => {
    const visibles = champsVisibles(PARCOURS[code], false)

    expect(visibles.some((c) => c.identite)).toBe(true)
  })

  it('conserve les champs de contexte et de nature même en anonyme', () => {
    for (const code of CODES_PARCOURS) {
      const visibles = champsVisibles(PARCOURS[code], true)
      // Le contexte (étape 2) décrit les faits, jamais la personne : il reste toujours demandé.
      expect(visibles.some((c) => c.etape === 2)).toBe(true)
    }
  })
})

describe('Schéma dérivé de la configuration', () => {
  const socle = {
    anonymat: true,
    categorieId: '1',
    niveauGraviteId: '1',
    description: 'Description factuelle suffisamment longue pour être acceptée.',
    horodatageAffichage: Math.floor(Date.now() / 1000) - 60,
  }

  it('exige les champs de contexte obligatoires même en anonyme', () => {
    const resultat = schemaParcours(PARCOURS.ei_employe, true).safeParse(socle)

    expect(resultat.success).toBe(false)
    const champs = resultat.error?.issues.map((i) => String(i.path[0]))
    expect(champs).toContain('dateSurvenance')
    expect(champs).toContain('lieu')
  })

  it('accepte une déclaration anonyme complète', () => {
    const resultat = schemaParcours(PARCOURS.ei_employe, true).safeParse({
      ...socle,
      dateSurvenance: new Date().toISOString().slice(0, 10),
      lieu: 'Atelier de concassage',
      directionId: '1',
      // Ajouté au formulaire EI le 11/09 (EI9), et obligatoire comme sur le grief employé.
      caractereRepetitif: 'premiere_fois',
    })

    expect(resultat.success).toBe(true)
  })

  describe('Matricule obligatoire — sans jamais entamer l’anonymat', () => {
    const CONCERNES = ['ei_employe', 'grief_employe'] as const

    const contexteComplet = {
      dateSurvenance: new Date().toISOString().slice(0, 10),
      dateHeureFaits: new Date().toISOString().slice(0, 16),
      lieu: 'Atelier de concassage',
      directionId: '1',
      // Propre au parcours Grief, obligatoire et sans rapport avec l'identité : sans lui, le
      // schéma échouerait pour une raison qui n'est pas celle qu'on veut observer ici.
      caractereRepetitif: 'premiere_fois',
    }

    it.each(CONCERNES)('exige le matricule quand le déclarant se nomme (%s)', (code) => {
      const resultat = schemaParcours(PARCOURS[code], false).safeParse({
        ...socle,
        ...contexteComplet,
        anonymat: false,
        nomPrenom: 'Alice Kouamé',
        posteOccupe: 'Opératrice',
      })

      expect(resultat.success).toBe(false)
      expect(resultat.error?.issues.map((i) => String(i.path[0]))).toContain('matricule')
    })

    it.each(CONCERNES)('n’exige RIEN de tel en anonyme (%s)', (code) => {
      // Le point qui compte. Le matricule est une donnée d'identité : exigé sans condition, il
      // rendrait toute déclaration anonyme impossible — l'anonymat est une exigence critique
      // (RG-06, RGI-03), et le champ n'est pas même rendu quand il est coché.
      const resultat = schemaParcours(PARCOURS[code], true).safeParse({
        ...socle,
        ...contexteComplet,
        anonymat: true,
      })

      expect(resultat.success, JSON.stringify(resultat.error?.issues)).toBe(true)
    })

    it('n’invente pas de matricule là où le parcours n’en demande pas', () => {
      // Un visiteur ou un tiers n'a pas de matricule : la règle ne doit pas déborder sur eux.
      for (const code of CODES_PARCOURS) {
        const aUnMatricule = PARCOURS[code].champs.some((c) => c.nom === 'matricule')

        expect(aUnMatricule, code).toBe((CONCERNES as readonly string[]).includes(code))
      }
    })
  })

  it('exige la direction, anonyme ou non (EI Employé)', () => {
    /**
     * La direction était facultative en anonyme, et nulle en base. Depuis qu'elle porte le
     * rattachement au site — donc l'acheminement vers le secrétaire compétent —, l'omettre
     * produirait un dossier que personne d'habilité ne voit. Elle est demandée dans les deux cas.
     *
     * Ce n'est pas une donnée d'identité : une direction compte des centaines de personnes, comme
     * le lieu, déjà obligatoire et collecté anonymement.
     */
    const base = {
      ...socle,
      dateSurvenance: new Date().toISOString().slice(0, 10),
      lieu: 'Atelier',
      caractereRepetitif: 'premiere_fois',
    }

    for (const anonyme of [true, false]) {
      const sans = schemaParcours(PARCOURS.ei_employe, anonyme).safeParse({
        ...base,
        anonymat: anonyme,
      })

      expect(sans.success, `anonyme=${anonyme}`).toBe(false)
      expect(sans.error?.issues.map((i) => String(i.path[0]))).toContain('directionId')
    }

    expect(
      schemaParcours(PARCOURS.ei_employe, true).safeParse({
        ...base,
        anonymat: true,
        directionId: '1',
      }).success
    ).toBe(true)
  })

  it('rend le consentement RGPD bloquant pour le seul parcours Sous-traitant (RG-15)', () => {
    const base = {
      ...socle,
      anonymat: false,
      dateHeureFaits: new Date().toISOString().slice(0, 16),
      // Le lieu est devenu une liste ; le nom et prénom ne sont plus demandés (11/09).
      lieuSite: 'Siège',
      caractereRepetitif: 'premiere_fois',
      entreprise: 'Entreprise X',
    }

    const sansConsentement = schemaParcours(PARCOURS.grief_sous_traitant, false).safeParse(base)
    expect(sansConsentement.success).toBe(false)
    expect(sansConsentement.error?.issues.map((i) => String(i.path[0]))).toContain('consentementRgpd')

    const avecConsentement = schemaParcours(PARCOURS.grief_sous_traitant, false).safeParse({
      ...base,
      consentementRgpd: true,
    })
    expect(avecConsentement.success).toBe(true)

    // Aucun autre parcours ne porte ce champ : RG-15 ne vise que le sous-traitant.
    for (const code of CODES_PARCOURS) {
      const porte = PARCOURS[code].champs.some((c) => c.nom === 'consentementRgpd')
      expect(porte, code).toBe(code === 'grief_sous_traitant')
    }
  })

  it('refuse une date des faits postérieure à aujourd’hui, sur tous les parcours (RGI-01)', () => {
    const demain = new Date()
    demain.setDate(demain.getDate() + 1)

    for (const code of CODES_PARCOURS) {
      const champDate = PARCOURS[code].champs.find((c) => c.type === 'date' || c.type === 'datetime')
      if (!champDate) continue

      const resultat = schemaParcours(PARCOURS[code], true).safeParse({
        ...socle,
        [champDate.nom]: demain.toISOString(),
      })

      expect(resultat.success, code).toBe(false)
      expect(resultat.error?.issues.map((i) => String(i.path[0])), code).toContain(champDate.nom)
    }
  })
})

/**
 * Ce que les QUATRE formulaires ont désormais en commun (retour métier du 11/09).
 *
 * Ces règles ont d'abord visé le seul évènement indésirable, puis ont été étendues à tous. Les
 * vérifier parcours par parcours, et non sur un échantillon, est le seul moyen qu'un cinquième
 * parcours — ou une retouche sur l'un des quatre — ne réintroduise pas discrètement ce qui vient
 * d'être retiré.
 */
describe('Harmonisation des quatre formulaires', () => {
  const tous = CODES_PARCOURS.map((code) => [code, PARCOURS[code]] as const)

  it('ne collecte plus d’adresse e-mail, nulle part', () => {
    for (const [code, config] of tous) {
      expect(config.champs.map((c) => c.nom), code).not.toContain('contactEmail')
    }
  })

  it('ne demande le nom qu’à ceux que le matricule ne désigne pas', () => {
    /*
      Sous-traitants et riverains ne figurent dans aucun fichier du personnel : s'ils choisissent
      de se nommer, leur nom est le seul point de reprise dont dispose le traitement. Les
      salariés, eux, ont leur matricule — le nom n'y ajoutait qu'une donnée de plus à protéger.

      Le champ reste marqué `identite` : l'anonymat le fait disparaître, comme les autres.
    */
    const externes = new Set(['grief_sous_traitant', 'grief_communaute'])

    for (const [code, config] of tous) {
      const nom = config.champs.find((c) => c.nom === 'nomPrenom')

      expect(nom !== undefined, code).toBe(externes.has(code))
      if (nom) expect(nom.identite, `${code} : le nom survivrait à l’anonymat`).toBe(true)
    }
  })

  it('ne demande plus la gravité au déclarant', () => {
    // Elle est qualifiée au traitement. ⚠️ Si ce drapeau repassait à `true` quelque part, le
    // circuit accéléré partirait DEUX fois : à la création et à la qualification.
    for (const [code, config] of tous) {
      expect(config.graviteSaisieParLeDeclarant, code).toBe(false)
      expect(config.champs.map((c) => c.nom), code).not.toContain('niveauGraviteId')
    }
  })

  it('ne porte plus de bloc « Vos attentes »', () => {
    for (const [code, config] of tous) {
      expect(config.attentesDeclarant, code).toBe(false)
    }
  })

  it('demande partout le caractère répétitif, avec les trois mêmes valeurs', () => {
    for (const [code, config] of tous) {
      const champ = config.champs.find((c) => c.nom === 'caractereRepetitif')

      expect(champ, `${code} ne demande pas le caractère répétitif`).toBeDefined()
      expect(champ?.obligatoire, code).toBe(true)
      expect(champ?.options?.map((o) => o.valeur), code).toEqual([
        'premiere_fois',
        'deja_signale',
        'recurrent',
      ])
    }
  })

  it('choisit le lieu dans le référentiel, jamais en saisie libre', () => {
    for (const [code, config] of tous) {
      const lieu = config.champs.find((c) => c.nom === 'lieu' || c.nom === 'lieuSite')

      expect(lieu, `${code} n’a aucun champ de lieu`).toBeDefined()
      expect(lieu?.type, code).toBe('select')
      expect(lieu?.referentiel, code).toBe('lieux')
      expect(lieu?.obligatoire, code).toBe(true)
    }
  })

  it('demande « Solution souhaitée » une fois, et sous ce libellé seul', () => {
    /*
      Le champ a porté trois noms successifs : « Proposition de mesure corrective », puis
      « Mesure immédiate », puis « Solution souhaitée » (retour métier du 11/09, second passage).
      Ce qui est vérifié ici n'est aucun de ces libellés en particulier, mais deux invariants qui
      survivront au suivant :

      1. Aucun ancien libellé ne subsiste quelque part — un formulaire renommé à moitié pose la
         même question sous deux noms selon le parcours.
      2. La question n'est posée QU'UNE FOIS par formulaire. La plainte riveraine portait déjà un
         champ « Solution souhaitée » ; y renommer « Mesure immédiate » l'aurait dédoublée, et un
         déclarant aurait vu deux zones de texte identiques l'une sous l'autre.
    */
    const ABANDONNES = ['Mesure immédiate', 'Proposition de mesure corrective']

    for (const [code, config] of tous) {
      const libelles = config.champs.map((c) => c.libelle)

      for (const ancien of ABANDONNES) {
        expect(libelles, `${code} porte encore « ${ancien} »`).not.toContain(ancien)
      }

      const solutions = libelles.filter((l) => l === 'Solution souhaitée')
      expect(solutions, `${code} pose deux fois la même question`).toHaveLength(1)
    }
  })

  it('ne réserve les champs de salarié qu’aux parcours de salariés', () => {
    // Un sous-traitant n'a pas de matricule SODECI, un riverain n'a ni direction ni poste : les
    // leur demander produirait des champs que personne ne peut remplir.
    const salarie = new Set(['matricule', 'directionId', 'posteOccupe'])

    for (const [code, config] of tous) {
      const porte = config.champs.filter((c) => salarie.has(c.nom)).map((c) => c.nom)
      const attendu = code === 'ei_employe' || code === 'grief_employe'

      expect(porte.length > 0, `${code} : champs de salarié ${porte.join(', ')}`).toBe(attendu)
    }
  })

  it('ne promet un rappel que là où il collecte de quoi rappeler', () => {
    /*
      L'invariant qui a motivé le retour du téléphone.

      Retirer toutes les coordonnées laissait « Je souhaite être recontacté » et « Canal de retour
      préféré » sur deux formulaires qui ne demandaient plus où joindre qui que ce soit. Un canal
      de retour proposé sans support est une promesse que le dispositif ne peut pas tenir.
    */
    for (const [code, config] of tous) {
      const noms = config.champs.map((c) => c.nom)
      const proposeUnRappel = noms.some((n) => n.startsWith('souhaitEtre'))
      const collecteUneCoordonnee = noms.includes('contactTelephone')

      expect(collecteUneCoordonnee, `${code} : rappel proposé sans coordonnée`).toBe(proposeUnRappel)
    }

    // Et les canaux proposés doivent tous rester praticables.
    for (const [code, config] of tous) {
      const canal = config.champs.find((c) => c.nom.startsWith('canalRetour') || c.nom.startsWith('preferenceCanal'))
      const valeurs = canal?.options?.map((o) => o.valeur) ?? []

      expect(valeurs, `${code} propose un retour par e-mail sans collecter d’adresse`).not.toContain('email')
    }
  })
})
