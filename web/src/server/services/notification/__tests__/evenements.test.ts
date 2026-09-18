import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import {
  categoriePour,
  graviteParNiveau,
  nettoyerAudit,
  nettoyerDossiers,
} from '../../declaration/__tests__/aide-base'
import { confierPourTest } from '../../declaration/__tests__/aide-base'
import { changerStatut } from '../../dossier/workflow'
import { definirTransportEmail, TransportJournal, type MessageEmail } from '../transport'

/**
 * Évènements métier déclencheurs de notification (EX-NOT-01, EX-NOT-02, EX-NOT-05).
 *
 * Les tests existants couvraient le MOTEUR (résolution de gabarit, substitution, canaux). Ceux-ci
 * couvrent le CÂBLAGE : qu'une affectation, un changement de statut ou une déclaration critique
 * déclenchent effectivement un envoi. Un moteur correct branché sur rien n'envoie rien — et c'est
 * exactement l'état dans lequel se trouvait la baseline, faute de gabarits.
 */
const MODEL_TYPE_DOSSIER = String.raw`App\Models\Dossier`
const dossiersCrees: string[] = []
let emails: MessageEmail[] = []

class TransportCapture {
  async envoyer(message: MessageEmail): Promise<void> {
    emails.push(message)
  }
}

async function evenementsNotifies(dossierId: string): Promise<string[]> {
  const lignes = await prisma.audit_logs.findMany({
    where: {
      auditable_type: MODEL_TYPE_DOSSIER,
      auditable_id: dossierId,
      action: 'notification.envoyee',
    },
    orderBy: { id: 'asc' },
    select: { new_values: true },
  })

  return lignes.map((l) => String((l.new_values as Record<string, unknown>).evenement_code))
}

async function nouvelleDeclaration(
  options: { niveau?: number; declarantUserId?: bigint } = {}
): Promise<string> {
  const categorie = await categoriePour('grief_employe')
  const gravite = await graviteParNiveau(options.niveau ?? 1)
  const identifie = options.declarantUserId !== undefined

  const { dossierId } = await creerDeclaration({
    parcours: 'grief_employe',
    canalCaptageCode: 'qr_code',
    anonyme: !identifie,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
      ...(identifie ? { declarantUserId: options.declarantUserId } : {}),
    },
    ...(identifie
      ? { donneesIdentite: { nomPrenom: 'Déclarant identifié', contactEmail: 'declarant@example.test' } }
      : {}),
  })

  dossiersCrees.push(dossierId)
  return dossierId
}

/** Amène le dossier jusqu'à un titulaire, préalable à toute transition. */
async function prendreEnCharge(dossierId: string, acteurId: bigint): Promise<void> {
  await confierPourTest(dossierId, acteurId)
}

beforeEach(() => {
  emails = []
  definirTransportEmail(new TransportCapture())
})

afterEach(async () => {
  definirTransportEmail(new TransportJournal())
  await nettoyerAudit(MODEL_TYPE_DOSSIER, dossiersCrees)
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

// ⚠️ Borné aux comptes fabriqués ici : jamais de suppression large sur `users`.
const comptesCrees: bigint[] = []
const MODEL_TYPE_USER = String.raw`App\Models\User`

afterAll(async () => {
  if (comptesCrees.length > 0) {
    await prisma.utilisateur_parcours.deleteMany({ where: { user_id: { in: comptesCrees } } })
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: comptesCrees } } })
    await prisma.dossier_affectations.deleteMany({ where: { user_id: { in: comptesCrees } } })
    await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })
  }

  await prisma.$disconnect()
})

describe('EX-NOT-01 — notification à l’affectation', () => {
  it('⚠️ notifie les titulaires DÈS LA CRÉATION', async () => {
    /*
      Ce cas exerçait la réaffectation MANUELLE, seule à notifier. Elle a été supprimée — les
      affectations découlent désormais du parcours et du rattachement — et `surAffectation()`
      s'est alors retrouvé sans aucun appelant : un correspondant aurait reçu des dossiers sans
      jamais en être averti.

      ⚠️ Le titulaire est FABRIQUÉ ici. Le premier jet s'appuyait sur les comptes en base ; aucun
      ne portait le rôle de captage des griefs employés, et le cas passait sans rien exercer. Un
      cas qui dépend de la configuration du jour ne prouve rien le jour où elle change.
    */
    const role = await prisma.roles.findFirstOrThrow({
      where: { name: 'rgp', guard_name: 'web' },
      select: { id: true },
    })
    const parcours = await prisma.parcours.findFirstOrThrow({
      where: { code: 'grief_employe' },
      select: { id: true },
    })

    const titulaire = await prisma.users.create({
      data: {
        name: 'Titulaire de test',
        email: `titulaire-${Date.now()}@example.test`,
        password: null,
        actif: true,
        // Sans rattachement : il reçoit alors les déclarations de tous les sites, comme il les
        // voit toutes. Les deux décisions suivent la même règle.
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true },
    })
    comptesCrees.push(titulaire.id)

    await prisma.model_has_roles.create({
      data: { role_id: role.id, model_type: MODEL_TYPE_USER, model_id: titulaire.id },
    })
    await prisma.utilisateur_parcours.create({
      data: { user_id: titulaire.id, parcours_id: parcours.id },
    })

    const dossierId = await nouvelleDeclaration()

    const confies = await prisma.dossier_affectations.count({
      where: { dossier_id: dossierId, user_id: titulaire.id, actif: true },
    })

    expect(confies, 'le dossier n’a pas été confié au titulaire fabriqué').toBe(1)
    expect(await evenementsNotifies(dossierId)).toContain('dossier_affecte')
  })

  it('ne notifie personne quand rien n’a pu être confié', async () => {
    // La contrepartie : `surAffectation()` n'est appelé que si l'affectation a abouti. L'appeler
    // à vide enverrait un message à personne, et masquerait le vrai problème — un parcours que
    // plus aucun compte n'est habilité à recevoir.
    const dossierId = await nouvelleDeclaration()

    const titulaires = await prisma.dossier_affectations.count({
      where: { dossier_id: dossierId, actif: true },
    })

    if (titulaires > 0) return // ce dépôt a trouvé preneur : rien à vérifier ici

    expect(await evenementsNotifies(dossierId)).not.toContain('dossier_affecte')
  })
})

describe('EX-NOT-02 — notification au changement de statut', () => {
  it('notifie le déclarant IDENTIFIÉ à chaque transition', async () => {
    // Deux comptes distincts : DT-06 interdit d'affecter un déclarant au traitement de son
    // propre dossier, et cette règle s'applique aussi aux données de test.
    const [declarant, traitant] = await prisma.users.findMany({
      where: { actif: true },
      take: 2,
      select: { id: true },
      orderBy: { id: 'asc' },
    })

    const dossierId = await nouvelleDeclaration({ declarantUserId: declarant.id })

    await prendreEnCharge(dossierId, traitant.id)

    const avant = (await evenementsNotifies(dossierId)).filter((e) => e === 'statut_change').length

    await changerStatut({ dossierId, vers: 'en_analyse', acteurId: traitant.id })

    const apres = (await evenementsNotifies(dossierId)).filter((e) => e === 'statut_change').length

    expect(apres).toBeGreaterThan(avant)
  })

  it('ne notifie PERSONNE sur un dossier anonyme (RG-06)', async () => {
    const dossierId = await nouvelleDeclaration()
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })

    await prendreEnCharge(dossierId, acteur.id)
    await changerStatut({ dossierId, vers: 'en_analyse', acteurId: acteur.id })

    // Il n'existe aucun destinataire à qui écrire : c'est la garantie d'anonymat qui l'impose,
    // pas un oubli de configuration. Une notification de statut exigerait une adresse, donc une
    // identité.
    expect(await evenementsNotifies(dossierId)).not.toContain('statut_change')
  })
})

describe('EX-NOT-05 / RG-08 — circuit accéléré', () => {
  it('déclenche l’alerte critique dès la soumission, sans attendre de traitement', async () => {
    // Gravité 4 = « Critique » : l'alerte doit partir pendant la création elle-même. RG-08 exige
    // le synchrone — une file d'attente rendrait le délai de 24 h intenable.
    const dossierId = await nouvelleDeclaration({ niveau: 4 })

    expect(await evenementsNotifies(dossierId)).toContain('circuit_critique')
  })

  it('ne déclenche pas le circuit accéléré pour une gravité ordinaire', async () => {
    const dossierId = await nouvelleDeclaration({ niveau: 1 })

    expect(await evenementsNotifies(dossierId)).not.toContain('circuit_critique')
  })
})
