import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import {
  categoriePour,
  graviteParNiveau,
  nettoyerAudit,
  nettoyerDossiers,
} from '../../declaration/__tests__/aide-base'
import { qualifierGravite } from '../workflow'
import { ErreurWorkflow } from '../workflow'
import { MODELES } from '@/server/modeles'

/**
 * Qualification de la gravité au traitement, et déplacement du circuit accéléré (RG-08).
 *
 * ⚠️ C'est le point le plus risqué du retour métier du 11/09. Retirer la gravité du formulaire
 * d'évènement indésirable était demandé ; ne retirer QUE cela aurait éteint l'alerte à la
 * Direction sans qu'aucun écran, aucun test et aucune erreur ne le signale — un dossier critique
 * serait simplement resté silencieux.
 *
 * Ces cas tiennent les deux moitiés de la bascule : plus d'alerte à la création faute de gravité,
 * et une alerte à la qualification.
 */
const MODEL_TYPE_DOSSIER = MODELES.dossier

const crees: string[] = []

async function acteur(): Promise<bigint> {
  const u = await prisma.users.findFirstOrThrow({ orderBy: { id: 'asc' }, select: { id: true } })
  return u.id
}

/** Un évènement indésirable tel que le formulaire en produit désormais : sans gravité. */
async function dossierSansGravite(): Promise<string> {
  const categorie = await categoriePour('ei_employe')

  const { dossierId, estCritique } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: null,
      description: 'Extincteur vide dans l’atelier 3.',
    },
  })

  crees.push(dossierId)

  // La création elle-même ne déclenche plus rien : c'est la moitié silencieuse de la bascule.
  expect(estCritique, 'un dossier sans gravité ne peut pas être critique à la création').toBe(false)

  return dossierId
}

/**
 * Nombre d'ENVOIS de l'alerte de circuit critique pour ce dossier.
 *
 * Une alerte produit une ligne d'audit PAR DESTINATAIRE : trois ici, douze pour un grief employé
 * selon les rôles habilités. Ce compte sert donc à comparer un avant et un après, jamais à
 * vérifier une valeur absolue — qui dépendrait du nombre de comptes en base et se mettrait à
 * échouer au premier compte créé.
 */
async function alertesCritiques(dossierId: string): Promise<number> {
  const lignes = await prisma.audit_logs.findMany({
    where: {
      auditable_type: MODEL_TYPE_DOSSIER,
      auditable_id: dossierId,
      action: 'notification.envoyee',
    },
    select: { new_values: true },
  })

  return lignes.filter(
    (l) => String((l.new_values as Record<string, unknown>).evenement_code) === 'circuit_critique'
  ).length
}

async function graviteDe(dossierId: string): Promise<bigint | null> {
  const d = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { niveau_gravite_id: true },
  })

  return d.niveau_gravite_id
}

afterEach(async () => {
  await nettoyerAudit(MODEL_TYPE_DOSSIER, crees)
  await nettoyerDossiers(crees)
  crees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Un évènement indésirable naît sans gravité', () => {
  it('se crée, et n’alerte personne tant qu’elle n’est pas posée', async () => {
    const dossierId = await dossierSansGravite()

    expect(await graviteDe(dossierId)).toBeNull()
    expect(await alertesCritiques(dossierId), 'alerte partie sans gravité connue').toBe(0)
  })
})

describe('Qualification au traitement', () => {
  it('enregistre la gravité et la trace dans le journal', async () => {
    const dossierId = await dossierSansGravite()
    const faible = await graviteParNiveau(1)

    await qualifierGravite({ dossierId, niveauGraviteId: faible.id, acteurId: await acteur() })

    expect(await graviteDe(dossierId)).toBe(faible.id)

    const trace = await prisma.audit_logs.findFirst({
      where: {
        auditable_type: MODEL_TYPE_DOSSIER,
        auditable_id: dossierId,
        action: 'dossier.gravite_qualifiee',
      },
      select: { new_values: true },
    })

    expect(trace, 'la qualification n’a laissé aucune trace').not.toBeNull()
  })

  it('déclenche le circuit accéléré quand le niveau posé le commande (RG-08)', async () => {
    const dossierId = await dossierSansGravite()

    // Niveau 4 : c'est lui qui porte `effet_circuit = 'accelere'` dans le référentiel livré.
    const critique = await graviteParNiveau(4)
    const { devientCritique } = await qualifierGravite({
      dossierId,
      niveauGraviteId: critique.id,
      acteurId: await acteur(),
    })

    expect(devientCritique, 'le circuit accéléré ne s’est pas déclenché').toBe(true)
    expect(await alertesCritiques(dossierId), 'aucun destinataire alerté').toBeGreaterThan(0)
  })

  it('n’alerte pas deux fois pour un dossier déjà critique', async () => {
    const dossierId = await dossierSansGravite()
    const critique = await graviteParNiveau(4)
    const qui = await acteur()

    await qualifierGravite({ dossierId, niveauGraviteId: critique.id, acteurId: qui })
    const apresLaPremiere = await alertesCritiques(dossierId)

    expect(apresLaPremiere).toBeGreaterThan(0)

    // Reposer le MÊME niveau ne doit rien relancer : la Direction a déjà été prévenue, et une
    // seconde alerte identique ferait douter de la première.
    const seconde = await qualifierGravite({
      dossierId,
      niveauGraviteId: critique.id,
      acteurId: qui,
    })

    expect(seconde.devientCritique).toBe(false)
    expect(
      await alertesCritiques(dossierId),
      'la Direction a été alertée une seconde fois'
    ).toBe(apresLaPremiere)
  })

  it('n’alerte pas en redescendant d’un niveau critique', async () => {
    const dossierId = await dossierSansGravite()
    const qui = await acteur()

    await qualifierGravite({ dossierId, niveauGraviteId: (await graviteParNiveau(4)).id, acteurId: qui })
    const apresLeCritique = await alertesCritiques(dossierId)

    const retour = await qualifierGravite({
      dossierId,
      niveauGraviteId: (await graviteParNiveau(2)).id,
      acteurId: qui,
    })

    expect(retour.devientCritique).toBe(false)
    expect(await alertesCritiques(dossierId)).toBe(apresLeCritique)
  })

  it('refuse un niveau inconnu', async () => {
    const dossierId = await dossierSansGravite()

    await expect(
      qualifierGravite({ dossierId, niveauGraviteId: 999_999n, acteurId: await acteur() })
    ).rejects.toThrow(ErreurWorkflow)

    expect(await graviteDe(dossierId), 'le dossier a été modifié malgré le refus').toBeNull()
  })
})

describe('Les griefs continuent de porter leur gravité dès la déclaration', () => {
  it('déclenche toujours le circuit accéléré à la création', async () => {
    // Le retrait ne vise que l'évènement indésirable : les trois parcours de grief demandent
    // encore la gravité au déclarant, et RG-08 doit continuer d'y partir à la création.
    const categorie = await categoriePour('grief_employe')
    const critique = await graviteParNiveau(4)

    const { dossierId, estCritique } = await creerDeclaration({
      parcours: 'grief_employe',
      canalCaptageCode: 'qr_code',
      anonyme: true,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: critique.id,
        description: 'Situation grave signalée par un employé.',
      },
    })

    crees.push(dossierId)

    expect(estCritique).toBe(true)
    expect(await alertesCritiques(dossierId), 'aucun destinataire alerté').toBeGreaterThan(0)
  })
})
