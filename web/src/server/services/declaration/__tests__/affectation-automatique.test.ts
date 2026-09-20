import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../creer-declaration'
import { personnesEnCharge } from '../../dossier/suivi-ei'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from './aide-base'

/**
 * ⚠️ PLUS AUCUNE DÉCLARATION N'EST AFFECTÉE À LA CRÉATION.
 *
 * Le circuit de l'évènement indésirable — personne n'est nommé, la charge revient à qui est
 * habilité sur ce type et dont le rattachement couvre le dossier — a été étendu aux griefs le
 * 2026-09-20, après avoir fait ses preuves.
 *
 * Ce fichier tenait la règle inverse : il vérifiait que l'affectation automatique route sur le
 * site, puis sur la direction. Ce qu'il tient désormais, c'est qu'elle ne route plus rien — et
 * que ce qui la remplace désigne bien quelqu'un, sans quoi chaque grief serait orphelin.
 */
const MODEL_TYPE_USER = String.raw`App\Models\User`

const dossiers: string[] = []
const comptes: bigint[] = []

afterAll(async () => {
  await nettoyerDossiers(dossiers)

  if (comptes.length > 0) {
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: comptes } } })
    await prisma.dossier_affectations.deleteMany({ where: { user_id: { in: comptes } } })
    await prisma.users.deleteMany({ where: { id: { in: comptes } } })
  }
})

/** Un compte portant ce rôle, rattaché au site ou à la direction voulus. */
async function compteAvecRole(
  role: string,
  rattachement: { siteId?: bigint | null; directionId?: bigint | null } = {}
): Promise<bigint> {
  const ligneRole = await prisma.roles.findFirstOrThrow({
    where: { name: role, guard_name: 'web' },
    select: { id: true },
  })

  const compte = await prisma.users.create({
    data: {
      name: `Titulaire de test (${role})`,
      email: `auto-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
      password: null,
      actif: true,
      site_id: rattachement.siteId ?? null,
      direction_id: rattachement.directionId ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })
  comptes.push(compte.id)

  await prisma.model_has_roles.create({
    data: { role_id: ligneRole.id, model_type: MODEL_TYPE_USER, model_id: compte.id },
  })

  return compte.id
}

async function griefSurLaDirection(directionId: bigint | null): Promise<string> {
  const categorie = await categoriePour('grief_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'grief_employe',
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
      directionId,
    },
  })

  dossiers.push(dossierId)
  return dossierId
}

/** Le rattachement du dossier, tel que la fiche le lit. */
async function rattachementDe(dossierId: string) {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { site_id: true, direction_id: true },
  })

  return {
    parcoursCode: 'grief_employe' as const,
    siteId: dossier.site_id,
    directionId: dossier.direction_id,
  }
}

describe('⚠️ Aucune affectation à la création', () => {
  it('ne nomme personne sur un grief', async () => {
    /*
      Le grief était confié au rôle de captage à sa création. Il ne l'est plus : le laisser ferait
      coexister deux façons de désigner qui traite — une ligne d'affectation pour les griefs, le
      rattachement pour les évènements indésirables — et la fiche aurait à choisir laquelle croire.
    */
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    const dossierId = await griefSurLaDirection(direction.id)

    expect(
      await prisma.dossier_affectations.count({ where: { dossier_id: dossierId } }),
      'une affectation a été écrite à la création'
    ).toBe(0)
  })

  it('laisse le dossier à « reçu », sans transition automatique', async () => {
    // « Reçu → Affecté » suivait l'affectation. Sans destinataire à nommer, le dossier reste à
    // « reçu » — et c'est de là que court son délai d'analyse préliminaire.
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    const dossierId = await griefSurLaDirection(direction.id)

    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { statuts_dossier: { select: { code: true } } },
    })

    expect(dossier.statuts_dossier.code).toBe('recu')
  })
})

describe('⚠️ Ce qui remplace l’affectation : l’habilitation du rôle', () => {
  it('désigne le titulaire habilité sur ce type et rattaché à cette direction', async () => {
    /*
      C'est la moitié qui doit fonctionner : supprimer l'affectation sans que personne ne réponde
      du dossier laisserait chaque grief orphelin, et la fiche annoncerait « personne ».

      `correspondant_drh` ouvre les griefs employés et porte le droit de faire avancer un dossier
      — les deux conditions de `personnesEnCharge()`.
    */
    const direction = await prisma.directions.findFirstOrThrow({
      where: { actif: true },
      select: { id: true },
    })

    const titulaire = await compteAvecRole('correspondant_drh', { directionId: direction.id })
    const dossierId = await griefSurLaDirection(direction.id)

    const enCharge = await personnesEnCharge(await rattachementDe(dossierId))

    expect(
      enCharge.map((c) => String(c.id)),
      'le correspondant habilité sur cette direction ne répond pas du grief'
    ).toContain(String(titulaire))
  })

  it('⚠️ ne désigne pas un titulaire habilité sur un AUTRE type', async () => {
    // Le chargé de sécurité n'ouvre que les évènements indésirables : un grief ne lui revient pas,
    // même sur sa propre direction. C'est exactement ce que les cases doivent produire.
    const direction = await prisma.directions.findFirstOrThrow({
      where: { actif: true },
      select: { id: true },
    })

    const horsType = await compteAvecRole('charge_securite', { directionId: direction.id })
    const dossierId = await griefSurLaDirection(direction.id)

    const enCharge = await personnesEnCharge(await rattachementDe(dossierId))

    expect(
      enCharge.map((c) => String(c.id)),
      'un titulaire habilité sur un autre type répond du grief'
    ).not.toContain(String(horsType))
  })

  it('⚠️ ne désigne pas un titulaire d’une AUTRE direction', async () => {
    const directions = await prisma.directions.findMany({
      where: { actif: true },
      select: { id: true },
      take: 2,
    })

    if (directions.length < 2) return // une seule direction : le cloisonnement ne se démontre pas

    /*
      ⚠️ `responsable_mgp_structure`, et NON un correspondant.

      Les correspondants DRH, DADD et DL ne sont pas cloisonnés par rattachement : ils suivent
      LEUR type de grief sur toute l'entreprise — c'est la demande métier, « Correspondant DRH →
      employés ». Les employer ici ferait échouer ce cas sur une règle qu'ils ne portent pas, et
      il ne dirait alors rien du cloisonnement.
    */
    const [ici, ailleurs] = directions
    const dAilleurs = await compteAvecRole('responsable_mgp_structure', {
      directionId: ailleurs.id,
    })
    const dossierId = await griefSurLaDirection(ici.id)

    const enCharge = await personnesEnCharge(await rattachementDe(dossierId))

    expect(
      enCharge.map((c) => String(c.id)),
      'un titulaire d’une autre direction répond du grief'
    ).not.toContain(String(dAilleurs))
  })
})

describe('⚠️ Plus aucune affectation MANUELLE non plus', () => {
  it('ne laisse subsister ni service, ni action, ni bouton', () => {
    /*
      La suppression d'une fonction se défait vite : il suffit qu'un écran réimporte ce qu'on a
      laissé en place. Rien ne doit subsister — ni le service, ni la Server Action, ni le bouton.

      ⚠️ `dossier_affectations` n'est PAS concernée : la table reste, elle porte les affectations
      écrites avant la bascule, et « mes dossiers » les lit encore.
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

    const tout = sources(racine)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')

    for (const trace of ['reaffecter(', 'utilisateursAffectables', 'actionReaffecter']) {
      expect(tout, `« ${trace} » subsiste encore`).not.toContain(trace)
    }
  })

  it('garde en revanche la table et sa lecture', () => {
    // La contrepartie : supprimer le geste ne doit pas emporter la notion. « Mes dossiers » et le
    // cloisonnement `dossiers.view.own` en dépendent tous les deux.
    const liste = readFileSync('src/server/services/dossier/liste.ts', 'utf8')

    expect(liste, 'le périmètre ne lit plus les affectations').toContain('dossier_affectations')
  })
})
