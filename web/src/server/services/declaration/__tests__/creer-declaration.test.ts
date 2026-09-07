import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../creer-declaration'
import { verifierCodeAcces } from '../code-acces'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from './aide-base'

/**
 * Port de `tests/Feature/Services/DeclarationServiceTest.php` (Laravel).
 *
 * Chaque cas reproduit une assertion existante, afin que toute divergence de comportement entre
 * les deux applications soit détectée ici plutôt qu'en production.
 */
const creesPendantLeTest: string[] = []

async function declarer(options: {
  parcours?: 'ei_employe' | 'grief_employe' | 'grief_sous_traitant' | 'grief_communaute'
  anonyme?: boolean
  categorieAutre?: boolean
  niveau?: number
  declarantUserId?: bigint | null
  identite?: Record<string, unknown>
}) {
  const parcours = options.parcours ?? 'ei_employe'
  const categorie = await categoriePour(parcours, { autre: options.categorieAutre })
  const gravite = await graviteParNiveau(options.niveau ?? 1)

  const resultat = await creerDeclaration({
    parcours,
    canalCaptageCode: 'qr_code',
    anonyme: options.anonyme ?? true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
      lieu: 'Atelier de concassage',
      dateSurvenance: new Date(),
      declarantUserId: options.declarantUserId ?? null,
      categorieAutrePrecision: options.categorieAutre ? 'Précision requise' : null,
    },
    donneesIdentite: options.identite,
  })

  creesPendantLeTest.push(resultat.dossierId)
  return resultat
}

afterEach(async () => {
  await nettoyerDossiers(creesPendantLeTest)
  creesPendantLeTest.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Création de déclaration', () => {
  it('génère une référence au format RG-01 et un accusé de réception (EX-DEC-08)', async () => {
    const { reference, dossierId } = await declarer({ parcours: 'ei_employe' })

    expect(reference).toMatch(/^EI-\d{4}-\d{6}$/)

    const dossier = await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })
    expect(dossier.reference).toBe(reference)
    // ULID minuscule sur 26 caractères, comme Laravel (HasUlids).
    expect(dossier.id).toMatch(/^[0-9a-z]{26}$/)
  })

  it('utilise le préfixe propre à chaque parcours (RG-01)', async () => {
    const attendus = {
      ei_employe: 'EI',
      grief_employe: 'GEM',
      grief_sous_traitant: 'GST',
      grief_communaute: 'GCO',
    } as const

    for (const [parcours, prefixe] of Object.entries(attendus)) {
      const { reference } = await declarer({ parcours: parcours as keyof typeof attendus })
      expect(reference.startsWith(`${prefixe}-`), `${parcours} -> ${reference}`).toBe(true)
    }
  })

  it('incrémente la séquence indépendamment par parcours (RG-01)', async () => {
    const a = await declarer({ parcours: 'ei_employe' })
    const b = await declarer({ parcours: 'ei_employe' })

    const numero = (r: string) => Number.parseInt(r.slice(-6), 10)
    expect(numero(b.reference)).toBe(numero(a.reference) + 1)
  })

  it("ne crée AUCUNE ligne d'identité pour une déclaration anonyme (RG-06)", async () => {
    const { dossierId } = await declarer({
      anonyme: true,
      // Identité fournie volontairement : elle doit être ignorée, pas seulement masquée.
      identite: { nomPrenom: 'Awa Koffi', contactEmail: 'awa@example.test' },
    })

    const identite = await prisma.declaration_identites.findFirst({ where: { dossier_id: dossierId } })
    expect(identite).toBeNull()

    const dossier = await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })
    expect(dossier.is_anonymous).toBe(true)
  })

  it("ne rattache jamais un compte connecté à une déclaration anonyme (RG-06, EX-DEC-04)", async () => {
    const utilisateur = await prisma.users.findFirstOrThrow({ select: { id: true } })

    const { dossierId } = await declarer({ anonyme: true, declarantUserId: utilisateur.id })

    const dossier = await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })
    expect(dossier.declarant_user_id).toBeNull()
  })

  it("crée la ligne d'identité pour une déclaration identifiée", async () => {
    const { dossierId } = await declarer({
      anonyme: false,
      identite: { nomPrenom: 'Awa Koffi', contactEmail: 'awa@example.test' },
    })

    const identite = await prisma.declaration_identites.findFirstOrThrow({
      where: { dossier_id: dossierId },
    })
    expect(identite.nom_prenom).toBe('Awa Koffi')
  })

  it('génère un code d’accès vérifiable et jamais stocké en clair (RG-02, EX-DEC-09)', async () => {
    const { dossierId, codeAcces } = await declarer({})

    expect(codeAcces).toMatch(/^\d{6}$/)

    const dossier = await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })
    expect(dossier.access_code_hash).not.toBeNull()
    expect(dossier.access_code_hash).not.toBe(codeAcces)
    expect(await verifierCodeAcces(codeAcces, dossier.access_code_hash!)).toBe(true)
    expect(await verifierCodeAcces('000000', dossier.access_code_hash!)).toBe(false)
  })

  it("génère un code d'accès même pour une déclaration identifiée (DT-28)", async () => {
    const { codeAcces } = await declarer({ anonyme: false, identite: { nomPrenom: 'Awa Koffi' } })

    expect(codeAcces).toMatch(/^\d{6}$/)
  })

  it("enregistre l'entrée d'historique initiale (RG-04)", async () => {
    const { dossierId } = await declarer({})

    const historique = await prisma.historique_statuts.findMany({
      where: { dossier_id: dossierId },
      orderBy: { created_at: 'asc' },
      include: { statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: true },
    })

    expect(historique.length).toBeGreaterThanOrEqual(1)
    expect(historique[0].statut_precedent_id).toBeNull()
    expect(historique[0].commentaire).toBe('Déclaration reçue.')
  })

  it('affecte automatiquement aux rôles de captage du parcours et passe à « Affecté » (EX-GES-02)', async () => {
    const { dossierId } = await declarer({ parcours: 'grief_employe' })

    const affectations = await prisma.dossier_affectations.findMany({
      where: { dossier_id: dossierId, actif: true },
    })

    // Le résultat dépend des comptes réellement présents : on vérifie la cohérence entre
    // affectation et statut, pas un nombre figé.
    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      include: { statuts_dossier: true },
    })

    if (affectations.length > 0) {
      expect(dossier.statuts_dossier.code).toBe('affecte')
      expect(affectations.every((a) => a.type === 'automatique')).toBe(true)
    } else {
      expect(dossier.statuts_dossier.code).toBe('recu')
    }
  })

  it('oriente une déclaration « Autre » vers service_mgp plutôt que vers les rôles de captage (RG-09)', async () => {
    const { dossierId } = await declarer({ parcours: 'ei_employe', categorieAutre: true })

    const affectations = await prisma.dossier_affectations.findMany({
      where: { dossier_id: dossierId, actif: true },
      select: { user_id: true },
    })

    if (affectations.length === 0) return // aucun service_mgp actif en base

    const roles = await prisma.model_has_roles.findMany({
      where: { model_id: { in: affectations.map((a) => a.user_id) } },
      select: { roles: { select: { name: true } } },
    })

    const noms = roles.map((r) => r.roles.name)
    expect(noms).toContain('service_mgp')
    // Les rôles de captage EI ne doivent PAS avoir été affectés.
    expect(noms).not.toContain('rqse')
    expect(noms).not.toContain('secretaire_csst')
  })

  it('signale une déclaration de gravité Critique pour le circuit accéléré (RG-08)', async () => {
    const standard = await declarer({ niveau: 1 })
    expect(standard.estCritique).toBe(false)

    const critique = await declarer({ niveau: 4 })
    expect(critique.estCritique).toBe(true)
  })
})
