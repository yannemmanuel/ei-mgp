import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from './aide-base'

/**
 * L'affectation suit le FORMULAIRE et le RATTACHEMENT, sans aucun geste manuel.
 *
 * ⚠️ La réaffectation manuelle a été supprimée sur décision métier. Ce fichier tient les deux
 * moitiés de ce qui la remplace : elle ne doit pas revenir par une porte dérobée, et la règle
 * automatique doit vraiment router sur le site.
 */
const MODEL_TYPE_USER = String.raw`App\Models\User`

const dossiers: string[] = []
const comptes: bigint[] = []

afterAll(async () => {
  await nettoyerDossiers(dossiers)

  if (comptes.length > 0) {
    await prisma.utilisateur_parcours.deleteMany({ where: { user_id: { in: comptes } } })
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: comptes } } })
    await prisma.dossier_affectations.deleteMany({ where: { user_id: { in: comptes } } })
    await prisma.users.deleteMany({ where: { id: { in: comptes } } })
  }
})

/** Un compte du bon rôle et du bon parcours, rattaché au site voulu. */
async function correspondant(siteId: bigint | null): Promise<bigint> {
  const role = await prisma.roles.findFirstOrThrow({
    where: { name: 'rgp', guard_name: 'web' },
    select: { id: true },
  })
  const parcours = await prisma.parcours.findFirstOrThrow({
    where: { code: 'grief_employe' },
    select: { id: true },
  })

  const compte = await prisma.users.create({
    data: {
      name: 'Correspondant de test',
      email: `auto-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
      password: null,
      actif: true,
      site_id: siteId,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })
  comptes.push(compte.id)

  await prisma.model_has_roles.create({
    data: { role_id: role.id, model_type: MODEL_TYPE_USER, model_id: compte.id },
  })
  await prisma.utilisateur_parcours.create({
    data: { user_id: compte.id, parcours_id: parcours.id },
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

describe('⚠️ L’affectation route sur le SITE', () => {
  it('confie au correspondant du site concerné, pas à celui d’un autre', async () => {
    /*
      Sans ce filtre, une déclaration déposée sur un site était confiée aux correspondants de TOUS
      les sites : chacun la voyait dans « ses » dossiers, et personne ne savait qui la traitait.
      Le cloisonnement en lecture la leur masquait ensuite — ils étaient donc affectés à un
      dossier qu'ils ne pouvaient pas ouvrir.
    */
    const directions = await prisma.directions.findMany({
      where: { actif: true, site_id: { not: null } },
      select: { id: true, site_id: true },
      take: 10,
    })

    const ici = directions[0]
    const ailleurs = directions.find((d) => d.site_id !== ici?.site_id)

    if (!ici?.site_id || !ailleurs?.site_id) return // un seul site : le cas ne prouverait rien

    const duSite = await correspondant(ici.site_id)
    const dAilleurs = await correspondant(ailleurs.site_id)

    const dossierId = await griefSurLaDirection(ici.id)

    const confies = await prisma.dossier_affectations.findMany({
      where: { dossier_id: dossierId, actif: true },
      select: { user_id: true },
    })
    const titulaires = confies.map((c) => String(c.user_id))

    expect(titulaires, 'le correspondant du site n’a rien reçu').toContain(String(duSite))
    expect(titulaires, 'un correspondant d’un AUTRE site a été affecté').not.toContain(
      String(dAilleurs)
    )
  })

  it('confie à un compte SANS rattachement, qui voit tout', async () => {
    // Les deux décisions restent alignées : `siteCloisonnant()` ne borne pas non plus un compte
    // sans rattachement. On n'affecte jamais un dossier à quelqu'un qui ne pourrait pas le lire,
    // et on ne prive personne de ce qu'il a le droit de voir.
    const direction = await prisma.directions.findFirst({
      where: { actif: true, site_id: { not: null } },
      select: { id: true },
    })

    if (!direction) return

    const sansRattachement = await correspondant(null)
    const dossierId = await griefSurLaDirection(direction.id)

    expect(
      await prisma.dossier_affectations.count({
        where: { dossier_id: dossierId, user_id: sansRattachement, actif: true },
      })
    ).toBe(1)
  })
})

describe('⚠️ Plus aucune affectation MANUELLE', () => {
  it('ne laisse subsister ni service, ni action, ni bouton', () => {
    /*
      La suppression d'une fonction se défait vite : il suffit qu'un écran réimporte ce qu'on a
      laissé en place. Rien ne doit subsister — ni le service, ni la Server Action, ni le bouton.

      ⚠️ `dossier_affectations` n'est PAS concernée : la table reste, l'affectation automatique
      l'écrit, et « mes dossiers » la lit. C'est le GESTE manuel qui disparaît, pas la notion.
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
    // La contrepartie : supprimer le geste ne doit pas emporter la notion. « Mes dossiers », le
    // décompte des non-affectés et le cloisonnement `dossiers.view.own` en dépendent tous.
    const liste = readFileSync('src/server/services/dossier/liste.ts', 'utf8')

    expect(liste, 'le périmètre ne lit plus les affectations').toContain('dossier_affectations')
  })
})
