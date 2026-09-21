import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { mettreAJourInvestigation, ouvrirInvestigation } from '../investigation'

/** Port de `tests/Feature/Services/InvestigationServiceTest.php` (Laravel). */
const dossiersCrees: string[] = []
const investigationsCreees: string[] = []

const DONNEES = {
  faitsConstates: 'Constats relevés lors de la visite sur site.',
  recommandations: 'Renforcer la signalisation et former les équipes.',
}

/**
 * Amène un dossier jusqu'à « En investigation » par de VRAIES transitions, afin que
 * `historique_statuts` contienne l'entrée exploitée par RGI-05 — un statut forcé en base
 * laisserait le calcul de recevabilité sans point de départ.
 */
async function dossierEnInvestigation(acteurId: bigint): Promise<string> {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
  })
  dossiersCrees.push(dossierId)

  const { changerStatut } = await import('../../dossier/workflow')
  const statutActuel = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { statuts_dossier: { select: { code: true } } },
  })

  // ⚠️ « Affecté » a quitté le circuit le 2026-09-21 : « Reçu → En analyse » est la première
  // marche, et plus aucune déclaration n'est affectée à sa création.
  if (statutActuel.statuts_dossier.code === 'recu') {
    await changerStatut({ dossierId, vers: 'en_analyse', acteurId })
  }
  await changerStatut({ dossierId, vers: 'en_investigation', acteurId })

  return dossierId
}

async function deuxUtilisateurs(): Promise<[bigint, bigint]> {
  const users = await prisma.users.findMany({ where: { actif: true }, take: 2, select: { id: true } })
  return [users[0].id, users[1].id]
}

afterEach(async () => {
  if (investigationsCreees.length > 0) {
    await prisma.investigations.deleteMany({ where: { id: { in: investigationsCreees } } })
    investigationsCreees.length = 0
  }
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Ouverture d’une investigation (EX-INV-01, RGI-05)', () => {
  it('ouvre une fiche sur un dossier « En investigation »', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: DONNEES,
    })
    investigationsCreees.push(id)

    const investigation = await prisma.investigations.findUniqueOrThrow({ where: { id } })
    expect(investigation.statut).toBe('en_cours')
    expect(investigation.enqueteur_id).toBe(enqueteur)
  })

  it('refuse l’ouverture sur un dossier qui n’est pas « En investigation » (EX-INV-01)', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const categorie = await categoriePour('ei_employe')
    const gravite = await graviteParNiveau(1)

    const { dossierId } = await creerDeclaration({
      parcours: 'ei_employe',
      canalCaptageCode: 'qr_code',
      anonyme: true,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: gravite.id,
        description: 'Description factuelle de test suffisamment longue.',
      },
    })
    dossiersCrees.push(dossierId)

    await expect(
      ouvrirInvestigation({
        dossierId,
        enqueteurId: enqueteur,
        dateOuverture: new Date(),
        donnees: DONNEES,
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('refuse une date d’ouverture antérieure à la recevabilité du dossier (RGI-05)', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const hier = new Date()
    hier.setDate(hier.getDate() - 1)

    await expect(
      ouvrirInvestigation({ dossierId, enqueteurId: enqueteur, dateOuverture: hier, donnees: DONNEES })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})

describe('Mise à jour (EX-INV-02, EX-INV-03)', () => {
  it('laisse une fiche modifiable : plus aucune étape ne la fige', async () => {
    /*
      ⚠️ Le verrou « une investigation soumise ou validée ne peut plus être modifiée » a été
      RETIRÉ avec la validation elle-même. Il n'existe plus d'étape qui fige la fiche — en laisser
      un aurait bloqué définitivement des fiches sans aucun moyen de les rouvrir.
    */
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: DONNEES,
    })
    investigationsCreees.push(id)

    await mettreAJourInvestigation({
      investigationId: id,
      donnees: { ...DONNEES, faitsConstates: 'Constats corrigés après relecture.' },
    })

    const apres = await prisma.investigations.findUniqueOrThrow({ where: { id } })
    expect(apres.faits_constates).toBe('Constats corrigés après relecture.')
  })
})

describe('⚠️ Recommandations obligatoires (EX-INV-04)', () => {
  /*
    ⚠️ CETTE EXIGENCE NE VIVAIT QUE DANS `soumettrePourValidation()`, supprimée avec la
    validation. Les recommandations sont la SOURCE des actions correctives : une fiche sans
    recommandation ne permet d'en créer aucune. Elle a donc été déplacée sur les deux fonctions
    qui écrivent la fiche — ces deux tests sont ce qui empêche de la reperdre.
  */
  it('refuse une ouverture sans recommandations', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    await expect(
      ouvrirInvestigation({
        dossierId,
        enqueteurId: enqueteur,
        dateOuverture: new Date(),
        donnees: { ...DONNEES, recommandations: '   ' },
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('refuse de VIDER les recommandations d’une fiche existante', async () => {
    // Le chemin réellement dangereux : ouvrir dans les règles, puis effacer. Sans ce contrôle,
    // la fiche redeviendrait une source vide sans que rien ne s'y oppose.
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: DONNEES,
    })
    investigationsCreees.push(id)

    await expect(
      mettreAJourInvestigation({
        investigationId: id,
        donnees: { ...DONNEES, recommandations: '' },
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    const apres = await prisma.investigations.findUniqueOrThrow({ where: { id } })
    expect(apres.recommandations, 'les recommandations ont été effacées').toBe(
      DONNEES.recommandations
    )
  })

  it('refuse aussi une ouverture sans faits constatés (EX-INV-02)', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    await expect(
      ouvrirInvestigation({
        dossierId,
        enqueteurId: enqueteur,
        dateOuverture: new Date(),
        donnees: { ...DONNEES, faitsConstates: '  ' },
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})

describe('⚠️ Plus aucune VALIDATION d’investigation', () => {
  it('ne laisse subsister ni service, ni policy, ni Server Action, ni bouton', () => {
    /*
      La suppression d'un workflow se défait vite : il suffit qu'un écran réimporte ce qu'on a
      laissé en place. Une Server Action oubliée resterait surtout APPELABLE DIRECTEMENT, sans
      passer par aucun bouton.

      ⚠️ `valide_par` et `valide_le` ne sont PAS concernées : les colonnes restent et portent la
      trace de qui avait validé avant le changement. C'est le GESTE qui disparaît, pas l'histoire.
    */
    const racine = join(process.cwd(), 'src')

    const sources = (depuis: string): string[] =>
      readdirSync(depuis).flatMap((entree) => {
        const chemin = join(depuis, entree)
        if (statSync(chemin).isDirectory()) {
          return entree === '__tests__' ? [] : sources(chemin)
        }
        return /\.tsx?$/.test(entree) ? [chemin] : []
      })

    /*
      ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT LA RECHERCHE, et c'est indispensable : plusieurs
      fichiers DOCUMENTENT la suppression en nommant ce qui a disparu. Chercher dans le texte brut
      ferait échouer ce test sur les commentaires mêmes qui expliquent pourquoi il existe — et la
      seule façon de le faire passer serait d'effacer cette explication.

      Ce qui est traqué ici, c'est du CODE : une définition, un import, un appel.
    */
    const sansCommentaires = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

    const tout = sources(racine)
      .map((f) => sansCommentaires(readFileSync(f, 'utf8')))
      .join('\n')

    for (const trace of [
      'validerInvestigation',
      'soumettrePourValidation',
      'peutValiderInvestigation',
      'actionValiderInvestigation',
      'actionSoumettreInvestigation',
      'rolesValidateurs',
      'en_attente_validation',
    ]) {
      expect(tout, `« ${trace} » subsiste encore`).not.toContain(trace)
    }
  })

  it('n’a laissé aucune fiche bloquée dans un état devenu inatteignable', async () => {
    // Deux fiches attendaient une validation au moment du changement. Sans la reprise de données,
    // elles seraient restées en attente d'un geste que plus personne ne peut faire.
    const bloquees = await prisma.investigations.count({ where: { statut: { not: 'en_cours' } } })

    expect(bloquees, 'des fiches portent encore un statut de validation').toBe(0)
  })
})
