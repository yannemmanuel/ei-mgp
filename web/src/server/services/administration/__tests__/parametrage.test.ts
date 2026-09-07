import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { nettoyerAudit } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import { dateLimite, viderCacheDelais } from '../../dossier/delais'
import { listerDelais, modifierDelai } from '../delais'
import { listerGravites, modifierGravite } from '../gravites'

/**
 * Délais et niveaux de gravité paramétrables.
 *
 * Ces deux référentiels commandent des comportements que rien d'autre ne déclenche : sans délai
 * validé il n'y a ni relance ni escalade (DT-04), et l'effet de circuit d'une gravité décide de
 * l'alerte immédiate de la Direction (RG-08). Les rendre modifiables sans les protéger
 * reviendrait à exposer un interrupteur sans étiquette.
 */
const MODELE_DELAI = String.raw`App\Models\SlaDelai`
const MODELE_GRAVITE = String.raw`App\Models\NiveauGravite`

const delaisTouches: bigint[] = []
const gravitesTouchees: bigint[] = []

async function acteur() {
  const utilisateur = await prisma.users.findFirstOrThrow({ select: { id: true } })
  return { id: utilisateur.id }
}

afterEach(async () => {
  await nettoyerAudit(MODELE_DELAI, delaisTouches)
  await nettoyerAudit(MODELE_GRAVITE, gravitesTouchees)
  delaisTouches.length = 0
  gravitesTouchees.length = 0
  viderCacheDelais()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Délais paramétrables', () => {
  it('restitue chaque couple parcours × étape', async () => {
    const delais = await listerDelais()

    expect(delais.length).toBeGreaterThan(0)
    for (const d of delais) {
      expect(d.parcours.libelle).toBeTruthy()
      expect(d.etape_code).toBeTruthy()
    }
  })

  it('refuse une valeur ou une unité qui rendraient le calcul absurde', async () => {
    const qui = await acteur()
    const delai = await prisma.sla_delais.findFirstOrThrow()

    for (const valeur of [0, -3, 1.5]) {
      await expect(
        modifierDelai(qui, delai.id, {
          valeur,
          unite: 'jours_ouvres',
          estValideMetier: true,
          notes: null,
        })
      ).rejects.toBeInstanceOf(ErreurWorkflow)
    }

    await expect(
      modifierDelai(qui, delai.id, {
        // Une unité inconnue tomberait dans la branche par défaut du calcul et produirait une
        // échéance égale à la date de départ : une alerte immédiate sur tous les dossiers.
        valeur: 3,
        unite: 'lunaisons' as never,
        estValideMetier: true,
        notes: null,
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('DT-04 : dévalider un délai éteint l’échéance, le revalider la rétablit', async () => {
    const qui = await acteur()

    const delai = await prisma.sla_delais.findFirstOrThrow({
      where: { etape_code: 'analyse_preliminaire', parcours: { code: 'ei_employe' } },
    })
    delaisTouches.push(delai.id)

    const dossier = await prisma.dossiers.findFirstOrThrow({
      where: { parcours_id: delai.parcours_id },
      select: { id: true, parcours_id: true },
    })

    const contexte = {
      id: dossier.id,
      statutCode: 'en_analyse' as const,
      parcoursId: dossier.parcours_id,
    }

    try {
      await modifierDelai(qui, delai.id, {
        valeur: delai.valeur,
        unite: delai.unite as 'jours_ouvres',
        estValideMetier: false,
        notes: delai.notes,
      })

      // Aucune échéance : une valeur provisoire ne doit déclencher ni relance ni escalade.
      expect(await dateLimite(contexte)).toBeNull()

      await modifierDelai(qui, delai.id, {
        valeur: delai.valeur,
        unite: delai.unite as 'jours_ouvres',
        estValideMetier: true,
        notes: delai.notes,
      })

      // Le cache est purgé par le service : sans cela, la correction resterait sans effet et
      // l'administrateur croirait avoir agi.
      expect(await dateLimite(contexte)).not.toBeNull()
    } finally {
      await prisma.sla_delais.update({
        where: { id: delai.id },
        data: {
          valeur: delai.valeur,
          unite: delai.unite,
          est_valide_metier: delai.est_valide_metier,
          notes: delai.notes,
        },
      })
      viderCacheDelais()
    }
  })

  it('n’écrit aucune trace quand rien ne change', async () => {
    const qui = await acteur()
    const delai = await prisma.sla_delais.findFirstOrThrow()
    delaisTouches.push(delai.id)

    await modifierDelai(qui, delai.id, {
      valeur: delai.valeur,
      unite: delai.unite as 'jours_ouvres',
      estValideMetier: delai.est_valide_metier,
      notes: delai.notes,
    })

    const traces = await prisma.audit_logs.count({
      where: { auditable_type: MODELE_DELAI, auditable_id: String(delai.id) },
    })
    expect(traces).toBe(0)
  })
})

describe('Niveaux de gravité paramétrables', () => {
  it('expose l’échelle ordonnée', async () => {
    const gravites = await listerGravites()

    expect(gravites.map((g) => g.niveau)).toEqual([...gravites.map((g) => g.niveau)].sort())
    expect(gravites.some((g) => g.effet_circuit === 'accelere')).toBe(true)
  })

  it('refuse une couleur qui n’est pas hexadécimale', async () => {
    const qui = await acteur()
    const gravite = await prisma.niveaux_gravite.findFirstOrThrow()

    for (const couleur of ['rouge', 'red; background:url(x)', '#12345', 'javascript:1']) {
      await expect(
        modifierGravite(qui, gravite.id, {
          libelle: gravite.libelle,
          couleur,
          effetCircuit: gravite.effet_circuit as 'standard',
          actif: gravite.actif,
        })
      ).rejects.toBeInstanceOf(ErreurWorkflow)
    }
  })

  it('refuse de désactiver le dernier niveau actif', async () => {
    const qui = await acteur()
    const actifs = await prisma.niveaux_gravite.findMany({ where: { actif: true } })

    // Sans niveau actif, le formulaire de déclaration n'a plus rien à proposer : aucune
    // déclaration ne pourrait plus être déposée.
    const aRedesactiver: bigint[] = []

    try {
      for (const g of actifs.slice(1)) {
        await prisma.niveaux_gravite.update({ where: { id: g.id }, data: { actif: false } })
        aRedesactiver.push(g.id)
      }

      await expect(
        modifierGravite(qui, actifs[0].id, {
          libelle: actifs[0].libelle,
          couleur: actifs[0].couleur,
          effetCircuit: actifs[0].effet_circuit as 'standard',
          actif: false,
        })
      ).rejects.toThrow(/au moins un niveau/i)
    } finally {
      await prisma.niveaux_gravite.updateMany({
        where: { id: { in: aRedesactiver } },
        data: { actif: true },
      })
    }
  })

  it('modifie le libellé et l’audite', async () => {
    const qui = await acteur()
    const gravite = await prisma.niveaux_gravite.findFirstOrThrow()
    gravitesTouchees.push(gravite.id)

    try {
      await modifierGravite(qui, gravite.id, {
        libelle: 'Libellé de test',
        couleur: gravite.couleur,
        effetCircuit: gravite.effet_circuit as 'standard',
        actif: gravite.actif,
      })

      const apres = await prisma.niveaux_gravite.findUniqueOrThrow({ where: { id: gravite.id } })
      expect(apres.libelle).toBe('Libellé de test')

      const [trace] = await prisma.audit_logs.findMany({
        where: { auditable_type: MODELE_GRAVITE, auditable_id: String(gravite.id) },
        select: { action: true, old_values: true },
      })

      expect(trace.action).toBe('niveau_gravite.modifie')
      expect((trace.old_values as Record<string, unknown>).libelle).toBe(gravite.libelle)
    } finally {
      await prisma.niveaux_gravite.update({
        where: { id: gravite.id },
        data: { libelle: gravite.libelle },
      })
    }
  })

  it('ne laisse modifier ni le niveau ni le code', async () => {
    const exportes = await import('../gravites')
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile('src/server/services/administration/gravites.ts', 'utf8')
    )

    // L'échelle ordonne des dossiers déjà classés : en changer les degrés les déplacerait
    // silencieusement.
    expect(source).not.toMatch(/data:\s*\{[^}]*\bniveau:/)
    expect(source).not.toMatch(/data:\s*\{[^}]*\bcode:/)
    expect(Object.keys(exportes).filter((n) => /supprimer|delete/i.test(n))).toEqual([])
  })
})
