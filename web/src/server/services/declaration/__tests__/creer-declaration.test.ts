import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { chargerUtilisateurAutorise, peutVoirParcours } from '@/server/authz'
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

/** Comptes fabriqués par les cas d'affectation — supprimés en fin de fichier. */
const comptesDeTest: bigint[] = []

/**
 * Un compte de captage `rgp`, habilité sur les parcours demandés.
 *
 * Écrit directement en base plutôt que par `enregistrerUtilisateur()` : ce fichier teste la
 * création de déclaration, et passer par la console des comptes y ferait entrer ses règles, ses
 * journaux d'audit et ses messages d'erreur — autant de raisons d'échouer sans rapport.
 */
async function compteDeCaptage(parcours: readonly string[]): Promise<bigint> {
  const role = await prisma.roles.findFirstOrThrow({ where: { name: 'rgp', guard_name: 'web' } })

  const compte = await prisma.users.create({
    data: {
      name: 'Captage de test',
      email: `test-captage-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
      // Empreinte inutilisable : ce compte ne sert qu'à recevoir une affectation, jamais à
      // s'authentifier. Aucun mot de passe en clair n'existe donc nulle part.
      password: 'x'.repeat(60),
      actif: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })

  comptesDeTest.push(compte.id)

  await prisma.model_has_roles.create({
    data: { role_id: role.id, model_type: String.raw`App\Models\User`, model_id: compte.id },
  })

  if (parcours.length > 0) {
    const codes = await prisma.parcours.findMany({ where: { code: { in: [...parcours] } } })
    await prisma.utilisateur_parcours.createMany({
      data: codes.map((p) => ({ user_id: compte.id, parcours_id: p.id })),
    })
  }

  return compte.id
}

afterEach(async () => {
  await nettoyerDossiers(creesPendantLeTest)
  creesPendantLeTest.length = 0
})

afterAll(async () => {
  // ⚠️ Borné aux comptes fabriqués ici : jamais de suppression large sur `users`.
  if (comptesDeTest.length > 0) {
    await prisma.utilisateur_parcours.deleteMany({ where: { user_id: { in: comptesDeTest } } })
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: comptesDeTest } } })
    await prisma.users.deleteMany({ where: { id: { in: comptesDeTest } } })
  }

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

    /*
      Et surtout : chaque destinataire doit POUVOIR ouvrir ce qu'on lui confie.

      Porter le rôle de captage ne suffit plus — encore faut-il être habilité sur le parcours.
      Un dossier affecté à quelqu'un qui ne le voit pas serait le pire cas : il aurait un
      responsable au registre, personne pour le traiter, et ne figurerait dans aucune liste de
      dossiers non affectés.

      ⚠️ Cette boucle ne prouve rien si `affectations` est vide — ce qui est le cas tant qu'aucun
      compte de captage n'est habilité. Le cas suivant construit donc l'état lui-même.
    */
    for (const affectation of affectations) {
      const destinataire = await chargerUtilisateurAutorise(affectation.user_id)

      expect(
        peutVoirParcours(destinataire!, 'grief_employe'),
        `le compte ${affectation.user_id} est affecté à un dossier qu’il ne peut pas ouvrir`
      ).toBe(true)
    }
  })

  it('n’affecte QUE les comptes de captage habilités sur le parcours', async () => {
    /*
      Deux comptes, le même rôle de captage, une seule différence : l'un s'est vu confier le
      parcours, l'autre non. Seul le premier doit recevoir le dossier.

      Les comptes sont créés ici plutôt qu'empruntés à la base : le cas doit valoir quelle que
      soit la configuration du jour, et ne modifier l'habilitation de personne.
    */
    const [habilite, sansParcours] = await Promise.all([
      compteDeCaptage(['grief_employe']),
      compteDeCaptage([]),
    ])

    const { dossierId } = await declarer({ parcours: 'grief_employe' })

    const affectes = (
      await prisma.dossier_affectations.findMany({
        where: { dossier_id: dossierId, actif: true },
        select: { user_id: true },
      })
    ).map((a) => a.user_id)

    expect(affectes, 'le compte habilité n’a pas reçu le dossier').toContainEqual(habilite)
    expect(affectes, 'un compte sans habilitation a reçu un dossier qu’il ne peut pas ouvrir').not.toContainEqual(
      sansParcours
    )
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
      select: { model_id: true, roles: { select: { name: true } } },
    })

    /*
      RG-09 se vérifie compte par compte : CHAQUE destinataire doit porter `service_mgp`.

      La première écriture de ce cas listait tous les rôles des destinataires et exigeait que
      `rqse` et `secretaire_csst` n'y figurent pas. Elle confondait deux choses : le rôle qui a
      DÉCLENCHÉ l'affectation, et les rôles que la personne porte par ailleurs. Le jour où
      quelqu'un a cumulé « Service MGP » et « Secrétaire CSST » — ce qui est permis —, le cas est
      passé au rouge sans qu'aucune règle n'ait été enfreinte : le dossier était bien allé au
      service MGP, par la bonne porte.
    */
    const rolesParCompte = new Map<string, string[]>()
    for (const lien of roles) {
      const cle = String(lien.model_id)
      rolesParCompte.set(cle, [...(rolesParCompte.get(cle) ?? []), lien.roles.name])
    }

    expect(rolesParCompte.size).toBeGreaterThan(0)
    for (const [compte, noms] of rolesParCompte) {
      expect(noms, `le compte ${compte} a été affecté sans porter service_mgp`).toContain(
        'service_mgp'
      )
    }
  })

  it('signale une déclaration de gravité Critique pour le circuit accéléré (RG-08)', async () => {
    const standard = await declarer({ niveau: 1 })
    expect(standard.estCritique).toBe(false)

    const critique = await declarer({ niveau: 4 })
    expect(critique.estCritique).toBe(true)
  })
})
