import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PARCOURS, champsVisibles, CODES_PARCOURS } from '../parcours-config'
import { POSTE_AUTRE, chargerReferentiels } from '../referentiels-formulaire'
import { verifierReferentiels } from '../verifier-referentiels'

/**
 * Second retour métier du 11/09/2026 sur les formulaires.
 *
 * Quatre demandes, vérifiées ici sur la configuration déclarative et sur les référentiels qui
 * l'alimentent — c'est là que vivent les règles, le rendu n'en étant que la conséquence.
 */
const tous = CODES_PARCOURS.map((code) => [code, PARCOURS[code]] as const)

describe('« Le déclarant est-il la victime ? »', () => {
  it('est posée sur les quatre parcours', () => {
    for (const [code, config] of tous) {
      const champ = config.champs.find((c) => c.nom === 'declarantEstVictime')

      expect(champ, `${code} ne pose pas la question`).toBeDefined()
      expect(champ?.type, code).toBe('case')
      expect(champ?.etape, `${code} : la question doit venir en étape 1`).toBe(1)
    }
  })

  it('reste posée EN ANONYME', () => {
    /*
      Le cas qui compte. Marquer ce champ `identite` l'aurait fait disparaître dès l'anonymat
      coché — or c'est justement là qu'il éclaire le plus : savoir qu'un signalement anonyme vient
      d'un témoin plutôt que de la personne concernée oriente l'instruction sans rien révéler ni
      de l'un ni de l'autre.
    */
    for (const [code, config] of tous) {
      const visibles = champsVisibles(config, true).map((c) => c.nom)

      expect(visibles, `${code} retire la question en anonyme`).toContain('declarantEstVictime')
    }
  })
})

describe('Le poste', () => {
  it('disparaît en anonyme des DEUX parcours de salariés', () => {
    /*
      La règle a changé une fois : le premier retour ne retirait le poste que du grief anonyme,
      le second l'a étendu à l'évènement indésirable. Direction et poste réunis resserrent assez
      pour reconnaître quelqu'un dans un effectif restreint, et cela ne dépend pas du parcours.
    */
    for (const code of ['ei_employe', 'grief_employe'] as const) {
      const anonyme = champsVisibles(PARCOURS[code], true).map((c) => c.nom)

      expect(anonyme, `${code} : le poste est encore demandé en anonyme`).not.toContain('posteOccupe')

      // ⚠️ Retrait CONDITIONNEL, pas suppression : il reste demandé à qui se nomme.
      const identifie = champsVisibles(PARCOURS[code], false).map((c) => c.nom)
      expect(identifie, `${code} : le poste a été retiré même pour qui se nomme`).toContain(
        'posteOccupe'
      )
    }

    // La DIRECTION, elle, survit à l'anonymat : elle porte l'acheminement vers le bon site, et
    // la masquer ferait de chaque signalement anonyme un dossier que personne ne voit.
    for (const code of ['ei_employe', 'grief_employe'] as const) {
      expect(
        champsVisibles(PARCOURS[code], true).map((c) => c.nom),
        `${code} : la direction a disparu avec le poste`
      ).toContain('directionId')
    }
  })

  it('n’est PAS marqué `identite` : il est stocké sur le dossier', () => {
    /*
      Garde-fou de conception. Obtenir le même masquage avec `identite` aurait été plus court d'un
      mot — et faux : le champ serait alors parti dans `declaration_identites`, table qui n'est
      pas créée pour une déclaration anonyme. Le poste aurait été demandé puis perdu sur les
      déclarations identifiées comme sur les autres.
    */
    for (const code of ['ei_employe', 'grief_employe'] as const) {
      const poste = PARCOURS[code].champs.find((c) => c.nom === 'posteOccupe')

      expect(poste?.masqueSiAnonyme, code).toBe(true)
      expect(poste?.identite, `${code} : le poste repartirait dans declaration_identites`).toBeFalsy()
    }
  })

  it('propose « Autre » sous chaque direction, sans jamais la doubler', async () => {
    const { directions, postes } = await chargerReferentiels()

    expect(directions.length, 'aucune direction active : le cas ne prouverait rien').toBeGreaterThan(0)

    for (const direction of directions) {
      const sousCetteDirection = postes.filter((p) => p.parent === direction.valeur)
      const autres = sousCetteDirection.filter((p) => p.libelle === POSTE_AUTRE)

      expect(autres, `« Autre » manque sous « ${direction.libelle} »`).toHaveLength(1)
      // Et il ferme la liste : un repli proposé avant les vrais postes se choisit par défaut.
      expect(sousCetteDirection.at(-1)?.libelle, direction.libelle).toBe(POSTE_AUTRE)
    }
  })

  it('accepte « Autre » côté serveur, et refuse toujours un poste inventé', async () => {
    // Le formulaire propose « Autre » : le serveur doit le reconnaître. Mais il ne doit pas pour
    // autant s'être ouvert aux chaînes libres — c'est la surface d'abus la plus large de
    // l'application.
    const direction = await prisma.directions.findFirstOrThrow({
      where: { actif: true },
      select: { id: true },
    })
    const champs = PARCOURS.ei_employe.champs

    const avecAutre = await verifierReferentiels(champs, {
      directionId: String(direction.id),
      posteOccupe: POSTE_AUTRE,
    })
    expect(avecAutre, '« Autre » est refusé alors qu’il est proposé').toBeNull()

    const avecInvente = await verifierReferentiels(champs, {
      directionId: String(direction.id),
      posteOccupe: 'Grand manitou',
    })
    expect(avecInvente?.posteOccupe, 'un poste inventé est accepté').toBeDefined()
  })
})

describe('« Solution souhaitée »', () => {
  it('remplace « Mesure immédiate » là où elle existait', () => {
    for (const code of ['ei_employe', 'grief_employe', 'grief_sous_traitant'] as const) {
      const champ = PARCOURS[code].champs.find((c) => c.nom === 'propositionMesureCorrective')

      expect(champ?.libelle, code).toBe('Solution souhaitée')
    }
  })

  it('ne double PAS la question sur la plainte riveraine', () => {
    // Ce parcours portait déjà « Solution souhaitée ». Y renommer « Mesure immédiate » aurait
    // affiché deux zones de texte identiques l'une sous l'autre ; la seconde a donc été retirée.
    const champs = PARCOURS.grief_communaute.champs

    expect(champs.filter((c) => c.libelle === 'Solution souhaitée')).toHaveLength(1)
    expect(
      champs.find((c) => c.nom === 'propositionMesureCorrective'),
      'la plainte riveraine porte encore l’ancien champ'
    ).toBeUndefined()
  })
})

describe('« Autre » ouvre toujours une saisie libre', () => {
  /*
    Demande métier : partout où « Autre » est proposé, on doit pouvoir écrire ce dont il s'agit.
    « Autre » seul apprend qu'une personne n'entre dans aucune case, jamais laquelle la décrit.

    Le mécanisme est DÉCLARATIF (`precisionSi`) et non codé en dur dans le formulaire : la
    catégorie « Autre », antérieure, l'est encore — une troisième exception écrite à la main
    aurait garanti qu'une quatrième soit oubliée.
  */
  it('recense toute option « Autre » et exige qu’elle porte une précision', () => {
    const manquantes: string[] = []

    for (const [code, config] of tous) {
      for (const champ of config.champs) {
        const autre = champ.options?.find((o) => o.libelle.toLowerCase() === 'autre')
        if (!autre) continue

        if (champ.precisionSi?.valeur !== autre.valeur) {
          manquantes.push(`${code}/${champ.nom}`)
        }
      }
    }

    expect(manquantes, `« Autre » sans saisie libre : ${manquantes.join(', ')}`).toEqual([])
  })

  it('ouvre la saisie libre sous le POSTE', () => {
    // Celle-ci n'est pas dans `options` — « Autre » est injecté par direction au chargement du
    // référentiel — donc le cas précédent ne la voit pas. Elle est vérifiée à part.
    const poste = PARCOURS.ei_employe.champs.find((c) => c.nom === 'posteOccupe')

    expect(poste?.precisionSi?.valeur, 'le poste « Autre » ne peut pas être précisé').toBe(
      POSTE_AUTRE
    )
    expect(poste?.precisionSi?.colonne).toBe('postePrecision')
  })

  it('range chaque précision sur la MÊME table que son champ', () => {
    /*
      Garde-fou de stockage. Une précision rangée dans `declaration_identites` alors que son champ
      vit sur `dossiers` serait demandée à l'écran puis perdue en anonymat — le piège déjà tombé
      sur l'entreprise, la ville, et le statut du plaignant.
    */
    for (const [code, config] of tous) {
      for (const champ of config.champs) {
        if (!champ.precisionSi) continue

        expect(
          Boolean(champ.identite),
          `${code}/${champ.nom} : le champ et sa précision ne vivent pas sur la même table`
        ).toBe(false)
      }
    }
  })
})

describe('⚠️ Le statut du plaignant survit à l’anonymat', () => {
  it('n’est PLUS marqué `identite`', () => {
    /*
      Défaut corrigé, et il était silencieux. Le champ est OBLIGATOIRE et reste affiché sous
      anonymat — il qualifie la plainte, pas la personne. Mais il était rangé dans
      `declaration_identites`, table qui n'est PAS créée pour une déclaration anonyme : la réponse
      était exigée à l'écran puis jetée. Cinq des six plaintes riveraines en base n'avaient aucun
      statut pour cette seule raison.
    */
    const champ = PARCOURS.grief_communaute.champs.find((c) => c.nom === 'statutPlaignant')

    expect(champ?.obligatoire, 'le champ n’est plus obligatoire').toBe(true)
    expect(champ?.identite, 'le statut repartirait dans declaration_identites').toBeFalsy()
    expect(
      champsVisibles(PARCOURS.grief_communaute, true).map((c) => c.nom),
      'le statut a disparu de la plainte anonyme'
    ).toContain('statutPlaignant')
  })

  it('⚠️ aucun champ exigé en anonymat n’est marqué `identite`', () => {
    // La règle générale, qui vaut mieux qu'un cas particulier : un champ demandé à un déclarant
    // anonyme ne peut pas vivre dans une table qu'on ne crée pas pour lui.
    const fautifs: string[] = []

    for (const [code, config] of tous) {
      for (const champ of champsVisibles(config, true)) {
        if (champ.identite) fautifs.push(`${code}/${champ.nom}`)
      }
    }

    expect(fautifs, `affichés en anonymat mais jamais stockés : ${fautifs.join(', ')}`).toEqual([])
  })
})

describe('Rien n’est collecté puis abandonné en route', () => {
  it('⚠️ chaque champ et chaque précision atteint `donneesDossier`', async () => {
    /*
      Le maillon qu'aucun autre cas ne couvre.

      `traiterSoumission()` range les valeurs dans `dossierSpecifique`, puis les recopie UNE À UNE
      dans l'objet passé à `creerDeclaration()`. Oublier une ligne dans cette recopie ne casse
      rien : la valeur est lue, validée, rangée… et jamais écrite. Exactement ce qui est arrivé au
      statut du plaignant, sous une autre forme.

      La fonction exige un contexte de requête HTTP et n'est pas appelable ici ; on lit donc sa
      source, comme le fait déjà la suite de non-régression pour le formulaire.
    */
    const { readFile } = await import('node:fs/promises')
    const source = await readFile('src/server/services/declaration/soumission.ts', 'utf8')

    const oublies: string[] = []

    for (const [code, config] of tous) {
      for (const champ of config.champs) {
        // Les champs d'identité passent par `colonne` et un autre chemin : hors sujet ici.
        if (champ.identite) continue
        if (!champ.precisionSi) continue

        if (!source.includes(champ.precisionSi.colonne)) {
          oublies.push(`${code}/${champ.precisionSi.colonne}`)
        }
      }
    }

    // Le statut du plaignant lui-même, déplacé sur `dossiers` et donc soumis à la même recopie.
    if (!source.includes('statutPlaignant')) oublies.push('statutPlaignant')

    expect(oublies, `collectés puis jamais écrits : ${oublies.join(', ')}`).toEqual([])
  })
})
