import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { CODES_PARCOURS, PARCOURS, champsVisibles } from '../parcours-config'

/**
 * Rien du DÉCLARANT sur une déclaration anonyme.
 *
 * La règle tient à deux endroits, et il faut les deux :
 *
 *   - la SAISIE ne demande pas ces champs — un champ demandé puis stocké est perdu pour
 *     l'anonymat, quoi qu'en dise l'écran qui l'affiche ensuite ;
 *   - l'AFFICHAGE ne les montre pas — une donnée qu'on s'est engagé à ne pas montrer ne doit pas
 *     dépendre de l'écran qui l'a saisie, ni de la date à laquelle elle l'a été.
 */
describe('⚠️ Le poste du déclarant n’est pas demandé en anonyme', () => {
  it('est absent des champs visibles, sur les quatre types', () => {
    for (const code of CODES_PARCOURS) {
      const anonyme = champsVisibles(PARCOURS[code], true).map((c) => c.nom)

      expect(anonyme, `${code} : le poste du déclarant est demandé en anonyme`).not.toContain(
        'posteDeclarant'
      )
      expect(anonyme, `${code} : la précision du poste du déclarant est demandée`).not.toContain(
        'posteDeclarantPrecision'
      )
    }
  })

  it('reste demandé quand la personne s’identifie', () => {
    // La contrepartie : masquer en anonyme ne doit pas revenir à supprimer le champ. Sans ce cas,
    // le retirer partout passerait pour une réussite.
    const identifie = champsVisibles(PARCOURS.grief_employe, false).map((c) => c.nom)

    expect(identifie, 'le champ a disparu même pour une déclaration identifiée').toContain(
      'posteDeclarant'
    )
  })
})

describe('⚠️ La fiche ne montre rien du déclarant sur un dossier anonyme', () => {
  it('conditionne l’affichage à l’anonymat, pas à la présence de la donnée', () => {
    /*
      ⚠️ CE CAS LIT LE CODE DE LA FICHE, et c'est délibéré : aucun dossier anonyme ne porte ces
      colonnes aujourd'hui, la saisie les masquant. Un cas fondé sur les données passerait donc
      sans rien exercer — et le jour où une ligne ancienne ou importée en porterait, la fiche
      l'afficherait sans que rien ne l'ait signalé.
    */
    const page = readFileSync('src/app/(app)/dossiers/[id]/page.tsx', 'utf8')

    expect(page, 'le garde d’anonymat a disparu de la fiche').toContain(
      'const montrerLeDeclarant = !dossier.is_anonymous'
    )

    /*
      ⚠️ Comparé sur un texte SANS FINS DE LIGNE ni indentation. Les sources sont en CRLF : une
      assertion qui contient un saut de ligne ne correspond jamais, et le cas échoue alors sur
      l'outillage plutôt que sur la règle. Première écriture de ce cas, premier échec.
    */
    const surUneLigne = page.replace(/\s+/g, ' ')

    for (const extrait of [
      'montrerLeDeclarant ? (dossier.poste_declarant_precision ?? dossier.poste_declarant)',
      'montrerLeDeclarant && (dossier.directions_dossiers_direction_declarant_idTodirections !== null',
    ]) {
      expect(
        surUneLigne,
        `la fiche n’applique plus le garde : ${extrait.slice(0, 48)}…`
      ).toContain(extrait)
    }
  })

  it('n’a laissé aucun dossier anonyme porteur de ces colonnes', async () => {
    // La moitié « données » de la règle : la saisie doit ne rien avoir stocké. Un compteur non nul
    // signalerait une porte d'entrée qui échappe au masquage.
    const fuites = await prisma.dossiers.count({
      where: {
        is_anonymous: true,
        OR: [
          { poste_declarant: { not: null } },
          { poste_declarant_precision: { not: null } },
          { direction_declarant_id: { not: null } },
        ],
      },
    })

    expect(fuites, 'des déclarations anonymes portent des données de déclarant').toBe(0)
  })
})
