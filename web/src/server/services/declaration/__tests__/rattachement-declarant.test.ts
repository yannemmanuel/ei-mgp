import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../creer-declaration'
import { PARCOURS, champsVisibles } from '../parcours-config'
import { categoriePour, nettoyerDossiers } from './aide-base'

/**
 * Le rattachement du DÉCLARANT, distinct de celui des faits.
 *
 * Une déclaration est souvent déposée par un témoin. Le dossier ne portait qu'un rattachement —
 * celui de la direction concernée — et l'on ignorait d'où parlait celui qui signalait.
 *
 * ⚠️ Le cas le plus important de ce fichier est le DERNIER : la direction du déclarant ne doit
 * jamais décider du site. Router sur la direction d'un témoin enverrait le signalement à un
 * service étranger aux faits.
 */
const dossiers: string[] = []

afterEach(async () => {
  await nettoyerDossiers(dossiers)
  dossiers.length = 0
})

const SALARIES = ['ei_employe', 'grief_employe'] as const

describe('Les deux rattachements sont distincts, et le disent', () => {
  it('existe sur les deux parcours de salariés', () => {
    for (const code of SALARIES) {
      const noms = PARCOURS[code].champs.map((c) => c.nom)

      expect(noms, `${code} : la direction du déclarant manque`).toContain('directionDeclarant')
      expect(noms, `${code} : le poste du déclarant manque`).toContain('posteDeclarant')
    }
  })

  it('⚠️ ne porte JAMAIS le même libellé que celui de la personne concernée', () => {
    // La demande tient en un mot : faire la différence. Deux champs homonymes dans un même
    // formulaire se remplissent au hasard.
    for (const code of SALARIES) {
      const libelles = PARCOURS[code].champs
        .filter((c) => ['directionId', 'posteOccupe', 'directionDeclarant', 'posteDeclarant'].includes(c.nom))
        .map((c) => c.libelle)

      expect(new Set(libelles).size, `${code} : deux rattachements portent le même nom`).toBe(
        libelles.length
      )
    }
  })

  it('n’est demandé que si le déclarant N’EST PAS la personne concernée', () => {
    for (const code of SALARIES) {
      for (const nom of ['directionDeclarant', 'posteDeclarant']) {
        const champ = PARCOURS[code].champs.find((c) => c.nom === nom)

        expect(champ?.afficherSi, `${code}/${nom} : affiché sans condition`).toEqual({
          champ: 'declarantEstVictime',
          vaut: false,
        })
      }
    }
  })

  it('retire le poste du déclarant en anonymat, garde sa direction', () => {
    // Même arbitrage que pour la personne concernée : le poste associé à une direction resserre
    // trop, la direction seule compte des centaines de personnes.
    for (const code of SALARIES) {
      const anonyme = champsVisibles(PARCOURS[code], true).map((c) => c.nom)

      expect(anonyme, `${code} : le poste du déclarant survit à l’anonymat`).not.toContain(
        'posteDeclarant'
      )
      expect(anonyme, `${code} : la direction du déclarant a disparu`).toContain('directionDeclarant')
    }
  })
})

describe('⚠️ Le site découle de la direction CONCERNÉE, jamais de celle du déclarant', () => {
  it('achemine sur les faits, pas sur le témoin', async () => {
    /*
      Le cas qui protège l'acheminement.

      Deux directions rattachées à des sites différents : celle des faits, et celle d'où parle le
      témoin. Le dossier doit partir vers le site des FAITS. Confondre les deux enverrait le
      signalement à un service qui n'a rien à voir avec l'évènement — et personne ne s'en
      apercevrait, le dossier étant bien visible… par les mauvaises personnes.
    */
    const directions = await prisma.directions.findMany({
      where: { actif: true, site_id: { not: null } },
      select: { id: true, site_id: true },
      take: 10,
    })

    const faits = directions[0]
    const temoin = directions.find((d) => d.site_id !== faits?.site_id)

    if (!faits || !temoin) return // une seule paire site/direction : le cas ne prouverait rien

    const categorie = await categoriePour('ei_employe')
    const cree = await creerDeclaration({
      parcours: 'ei_employe',
      canalCaptageCode: 'qr_code',
      anonyme: true,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: null,
        description: 'Signalé par un collègue d’une autre direction.',
        directionId: faits.id,
        directionDeclarantId: temoin.id,
      },
    })

    dossiers.push(cree.dossierId)

    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: cree.dossierId },
      select: { site_id: true, direction_id: true, direction_declarant_id: true },
    })

    expect(dossier.direction_id, 'la direction des faits a été écrasée').toBe(faits.id)
    expect(dossier.direction_declarant_id, 'le rattachement du témoin est perdu').toBe(temoin.id)
    expect(dossier.site_id, 'le dossier est parti sur le site du TÉMOIN').toBe(faits.site_id)
  })

  it('conserve le poste du déclarant et sa précision « Autre »', async () => {
    const categorie = await categoriePour('grief_employe')
    const cree = await creerDeclaration({
      parcours: 'grief_employe',
      canalCaptageCode: 'qr_code',
      anonyme: false,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: null,
        description: 'Grief rapporté pour le compte d’un collègue.',
        poste: 'Technicien réseau',
        posteDeclarant: 'Autre',
        posteDeclarantPrecision: 'Stagiaire en alternance',
      },
      donneesIdentite: { nomPrenom: 'Awa Koffi' },
    })

    dossiers.push(cree.dossierId)

    const d = await prisma.dossiers.findUniqueOrThrow({
      where: { id: cree.dossierId },
      select: { poste: true, poste_declarant: true, poste_declarant_precision: true },
    })

    // Les deux postes coexistent sans se confondre : c'est tout l'objet du changement.
    expect(d.poste).toBe('Technicien réseau')
    expect(d.poste_declarant).toBe('Autre')
    expect(d.poste_declarant_precision).toBe('Stagiaire en alternance')
  })
})
