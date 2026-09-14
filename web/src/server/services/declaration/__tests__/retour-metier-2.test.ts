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
