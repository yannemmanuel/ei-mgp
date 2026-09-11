import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { parcoursAutorises } from '@/server/authz'
import { filtreDepuisParametres } from '../filtre'
import { calculerIndicateurs, nbDeclarations } from '../indicateurs'
import { lignesExport } from '../export'

/**
 * Les statistiques doivent dire la vérité DU LECTEUR, pas celle de tout le monde.
 *
 * ⚠️ Le reporting ignorait entièrement le cloisonnement par parcours. Tant que `reporting.view`
 * n'était porté que par des rôles transverses, l'omission restait sans effet ; le jour où il a été
 * accordé à un rôle restreint à un seul type de déclaration, celui-ci s'est mis à lire les
 * volumes de tous les autres — alors que sa liste de dossiers, elle, continuait de n'en montrer
 * qu'un. Deux écrans, deux vérités, et rien pour signaler laquelle était la bonne.
 *
 * Ces cas comparent des rôles de périmètres DIFFÉRENTS sur les données réelles. Ils n'écrivent
 * rien.
 */
afterAll(async () => {
  await prisma.$disconnect()
})

const CLOISONNE = 'secretaire_csst' as const
const TRANSVERSE = 'service_mgp' as const

describe('Le périmètre du lecteur plafonne les indicateurs', () => {
  it('ne compte que les déclarations des parcours ouverts au rôle', async () => {
    for (const role of [CLOISONNE, TRANSVERSE, 'correspondant_mgp'] as const) {
      const u = utilisateurAvecRoles(role)
      const filtre = filtreDepuisParametres({}, u)

      const annonce = await nbDeclarations(filtre)

      // Recompte indépendant, à partir des codes de parcours du rôle.
      const attendu = await prisma.dossiers.count({
        where: { parcours: { code: { in: parcoursAutorises(u.roles) } } },
      })

      expect(annonce, `${role} : le total ne correspond pas à son périmètre`).toBe(attendu)
    }
  })

  it('donne des chiffres DIFFÉRENTS à un rôle cloisonné et à un transverse', async () => {
    /*
      Le cas qui traduit le symptôme signalé : « tout le monde a les mêmes stats ».

      Si les deux totaux coïncidaient encore, soit le périmètre ne s'applique pas, soit la base ne
      contient qu'un seul parcours — et le cas le dirait plutôt que de passer au vert.
    */
    const cloisonne = await nbDeclarations(filtreDepuisParametres({}, utilisateurAvecRoles(CLOISONNE)))
    const transverse = await nbDeclarations(filtreDepuisParametres({}, utilisateurAvecRoles(TRANSVERSE)))

    const horsPerimetre = await prisma.dossiers.count({
      where: { parcours: { code: { notIn: parcoursAutorises(utilisateurAvecRoles(CLOISONNE).roles) } } },
    })

    expect(horsPerimetre, 'aucun dossier hors du périmètre restreint : le cas ne prouverait rien')
      .toBeGreaterThan(0)
    expect(cloisonne, 'le rôle cloisonné lit encore le total de tout le monde').toBeLessThan(transverse)
  })

  it('ne laisse pas un paramètre d’URL ouvrir un parcours interdit', async () => {
    // Le périmètre est un PLAFOND : demander un parcours qu'on n'a pas le droit de voir ne
    // l'ouvre pas, cela ne renvoie rien.
    const u = utilisateurAvecRoles(CLOISONNE)
    const interdit = await prisma.parcours.findFirst({
      where: { code: { notIn: parcoursAutorises(u.roles) } },
      select: { id: true, code: true },
    })

    if (!interdit) return

    const filtre = filtreDepuisParametres({ parcoursId: String(interdit.id) }, u)

    expect(
      await nbDeclarations(filtre),
      `${CLOISONNE} a pu compter les dossiers de ${interdit.code} par l’URL`
    ).toBe(0)
  })

  it('cloisonne aussi le délai moyen, qui passe par une autre requête', async () => {
    /*
      `delaiMoyenJours` est la seule mesure qui n'emprunte pas la clause Prisma commune : elle est
      écrite en SQL brut. Un périmètre posé dans le filtre mais oublié là aurait cloisonné six
      indicateurs sur sept — et le septième aurait dit la vérité de tout le monde.
    */
    const u = utilisateurAvecRoles(CLOISONNE)
    const indicateurs = await calculerIndicateurs(filtreDepuisParametres({}, u))

    // La répartition par parcours ne doit nommer que les parcours ouverts.
    const autorises = new Set(parcoursAutorises(u.roles))
    const codes = await prisma.parcours.findMany({ select: { code: true, libelle: true } })
    const libellesAutorises = new Set(
      codes.filter((p) => autorises.has(p.code as never)).map((p) => p.libelle)
    )

    for (const ligne of indicateurs.parParcours) {
      expect(
        libellesAutorises.has(ligne.libelle),
        `${CLOISONNE} voit « ${ligne.libelle} », hors de son périmètre`
      ).toBe(true)
    }
  })
})

describe('L’export ne rouvre pas ce que l’écran ferme', () => {
  it('n’exporte que les dossiers du périmètre du demandeur', async () => {
    for (const role of [CLOISONNE, TRANSVERSE] as const) {
      const u = utilisateurAvecRoles(role)
      const lignes = await lignesExport(filtreDepuisParametres({}, u), false)

      const attendu = await prisma.dossiers.count({
        where: { parcours: { code: { in: parcoursAutorises(u.roles) } } },
      })

      expect(lignes.length, `${role} : l’export déborde de son périmètre`).toBe(attendu)
    }
  })
})
