import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../creer-declaration'
import {
  ErreurPieceJointe,
  MAX_FICHIERS,
  MAX_OCTETS_TOTAL,
  verifierLot,
} from '../pieces-jointes'
import { CANAUX_RELAIS } from '../soumission'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from './aide-base'
import { dateLimite, etapeActuelle } from '../../dossier/delais'
import { changerStatut, rejeter } from '../../dossier/workflow'
import { reaffecter } from '../../dossier/affectation'

/**
 * Non-régression (étape 13) — exigences dont le comportement existait sans être couvert par un
 * test nommé.
 *
 * Chaque cas cite l'identifiant qu'il protège : la traçabilité entre le cahier des charges et la
 * suite se vérifie par recherche, elle ne repose pas sur la mémoire de qui a écrit le test.
 */
const dossiersCrees: string[] = []

async function declaration(options: {
  parcours?: 'ei_employe' | 'grief_employe'
  canal?: string
  categorieAutre?: boolean
  televersePar?: bigint | null
} = {}) {
  const parcours = options.parcours ?? 'ei_employe'
  const gravite = await graviteParNiveau(1)

  const categorie = options.categorieAutre
    ? await prisma.categories.findFirstOrThrow({
        where: { is_autre: true, parcours: { code: parcours } },
      })
    : await categoriePour(parcours)

  const resultat = await creerDeclaration({
    parcours,
    canalCaptageCode: options.canal ?? 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
      ...(options.categorieAutre ? { categorieAutrePrecision: 'Précision de test' } : {}),
    },
    televersePar: options.televersePar ?? null,
  })

  dossiersCrees.push(resultat.dossierId)
  return resultat
}

/** Amène un dossier jusqu'à « En analyse », seul état depuis lequel un rejet est possible. */
async function amenerEnAnalyse(dossierId: string, acteurId: bigint): Promise<void> {
  const actuel = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { statuts_dossier: { select: { code: true } } },
  })

  if (actuel.statuts_dossier.code === 'recu') {
    await reaffecter({
      dossierId,
      nouvelUtilisateurId: acteurId,
      effectueParId: acteurId,
      motif: 'Prise en charge pour test.',
    })
  }

  await changerStatut({ dossierId, vers: 'en_analyse', acteurId })
}

afterEach(async () => {
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('EX-DEC-10 / RG-13 — saisie relais', () => {
  it('trace le canal d’origine réellement reçu', async () => {
    for (const canal of CANAUX_RELAIS) {
      const { dossierId } = await declaration({ canal })

      const dossier = await prisma.dossiers.findUniqueOrThrow({
        where: { id: dossierId },
        select: { canaux_captage: { select: { code: true } } },
      })

      expect(dossier.canaux_captage.code).toBe(canal)
    }
  })

  it('n’enregistre JAMAIS l’agent relais comme déclarant', async () => {
    const agent = await prisma.users.findFirstOrThrow({ select: { id: true } })

    const { dossierId } = await declaration({ canal: 'ligne_verte', televersePar: agent.id })

    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { declarant_user_id: true },
    })

    // L'agent transcrit la parole d'un tiers : le confondre avec le déclarant attribuerait à un
    // salarié une déclaration qui n'est pas la sienne.
    expect(dossier.declarant_user_id).toBeNull()
  })

  it('suit le même workflow qu’une déclaration directe', async () => {
    const direct = await declaration({ canal: 'qr_code' })
    const relais = await declaration({ canal: 'agent_local' })

    const statuts = await prisma.dossiers.findMany({
      where: { id: { in: [direct.dossierId, relais.dossierId] } },
      select: { statuts_dossier: { select: { code: true } } },
    })

    // RG-13 : aucune branche de workflow différenciée. Les deux entrent au même statut.
    expect(new Set(statuts.map((d) => d.statuts_dossier.code)).size).toBe(1)
  })
})

describe('EX-DEC-06 / RGI-04 — limites des pièces jointes', () => {
  /**
   * `verifierLot` contrôle le type RÉEL du contenu, pas l'extension : un fichier de test doit
   * donc porter une vraie signature PNG, sans quoi c'est ce contrôle-là qui échoue et la limite
   * de nombre n'est jamais atteinte.
   */
  const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ENTETE_IHDR = Buffer.from([
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00,
  ])

  const fichier = (octets: number) => ({
    nom: 'piece.png',
    octets: Buffer.concat([
      SIGNATURE_PNG,
      ENTETE_IHDR,
      Buffer.alloc(Math.max(0, octets - SIGNATURE_PNG.length - ENTETE_IHDR.length)),
    ]),
  })

  it('accepte exactement 5 fichiers, refuse le sixième', async () => {
    await expect(
      verifierLot(Array.from({ length: MAX_FICHIERS }, () => fichier(64)))
    ).resolves.toBeUndefined()

    await expect(
      verifierLot(Array.from({ length: MAX_FICHIERS + 1 }, () => fichier(64)))
    ).rejects.toBeInstanceOf(ErreurPieceJointe)
  })

  it('refuse un lot dépassant 50 Mo au total', async () => {
    // La limite porte sur le TOTAL, pas sur chaque fichier : deux pièces acceptables séparément
    // peuvent être refusées ensemble.
    await expect(
      verifierLot([fichier(MAX_OCTETS_TOTAL / 2), fichier(MAX_OCTETS_TOTAL / 2 + 64)])
    ).rejects.toBeInstanceOf(ErreurPieceJointe)
  })

  it('accepte un lot vide', async () => {
    await expect(verifierLot([])).resolves.toBeUndefined()
  })
})

describe('RGI-10 / RGI-11 — projection du statut montrée au déclarant', () => {
  it('n’expose jamais plus de 5 libellés distincts', async () => {
    const statuts = await prisma.statuts_dossier.findMany({ select: { libelle_affiche: true } })
    const distincts = new Set(statuts.map((s) => s.libelle_affiche))

    // RGI-10 : la projection est simplifiée, jamais l'inverse — plusieurs statuts internes
    // partagent volontairement un même libellé public.
    expect(distincts.size).toBeLessThanOrEqual(5)
  })

  it('affiche « Clôturé » pour un dossier rejeté', async () => {
    const { dossierId } = await declaration()
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })

    await amenerEnAnalyse(dossierId, acteur.id)
    await rejeter({ dossierId, acteurId: acteur.id, motif: 'Hors périmètre du dispositif.' })

    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { statuts_dossier: { select: { code: true, libelle_affiche: true } } },
    })

    // RGI-11 : le rejet reste visible en interne, mais le déclarant ne lit que « Clôturé » —
    // lui annoncer un rejet dans une projection publique serait une décision de communication
    // que le CDC ne prend pas.
    expect(dossier.statuts_dossier.code).toBe('rejete')
    expect(dossier.statuts_dossier.libelle_affiche).toBe('Clôturé')
  })
})

describe('RG-05 / RGI-13 — délais suivis automatiquement', () => {
  it('calcule une échéance pour l’étape courante', async () => {
    const { dossierId } = await declaration({ parcours: 'grief_employe' })
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })

    const initial = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { parcours_id: true },
    })

    await amenerEnAnalyse(dossierId, acteur.id)

    expect(etapeActuelle('en_analyse')).not.toBeNull()

    const limite = await dateLimite({
      id: dossierId,
      statutCode: 'en_analyse',
      parcoursId: initial.parcours_id,
    })

    // RG-05 : sans échéance calculable, ni relance ni escalade ne peuvent exister. C'est ce
    // calcul qui rend la table `sla_delais` opérante — elle était vide dans la baseline.
    expect(limite).not.toBeNull()
    expect(limite!.getTime()).toBeGreaterThan(Date.now())
  })

  it('ne produit AUCUNE échéance tant que le délai n’est pas validé par le métier (DT-04)', async () => {
    const { dossierId } = await declaration({ parcours: 'ei_employe' })
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })

    const initial = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { parcours_id: true },
    })

    await amenerEnAnalyse(dossierId, acteur.id)

    const limite = await dateLimite({
      id: dossierId,
      statutCode: 'en_analyse',
      parcoursId: initial.parcours_id,
    })

    // `ei_employe / analyse_preliminaire` porte `est_valide_metier = false` : une valeur
    // indicative ne doit pas déclencher d'escalade. Conséquence à connaître — sur ce parcours,
    // le plus volumineux, aucune relance ni escalade ne partira tant que le métier n'aura pas
    // arrêté ses délais (CDC §1.8 point 4).
    expect(limite).toBeNull()
  })

  it('applique au parcours d’origine le délai d’une catégorie « Autre » (RGI-13)', async () => {
    const ordinaire = await declaration()
    const autre = await declaration({ categorieAutre: true })

    const dossiers = await prisma.dossiers.findMany({
      where: { id: { in: [ordinaire.dossierId, autre.dossierId] } },
      select: { id: true, parcours_id: true, statuts_dossier: { select: { code: true } } },
    })

    const limites = await Promise.all(
      dossiers.map((d) =>
        dateLimite({
          id: d.id,
          statutCode: d.statuts_dossier.code as 'recu',
          parcoursId: d.parcours_id,
        })
      )
    )

    // Les délais sont indexés par parcours, jamais par catégorie : « Autre » suit donc le délai
    // de son parcours d'origine, sans règle dédiée à écrire.
    expect(limites[0]?.toDateString()).toBe(limites[1]?.toDateString())
  })
})

describe('EX-DEC-05 — accès sans compte aux formulaires publics', () => {
  it('déclare publiques les seules routes qui doivent l’être', async () => {
    const source = await import('node:fs/promises')
    const proxy = await source.readFile('src/proxy.ts', 'utf8')

    for (const publique of ['/declarer', '/suivi', '/q']) {
      expect(proxy).toContain(`'${publique}'`)
    }

    // Rien d'autre ne doit s'y ajouter par inadvertance : le back-office reste derrière la
    // session, et la route des tâches porte sa propre authentification.
    const bloc = proxy.split('const ROUTES_PUBLIQUES = [')[1].split(']')[0]

    // Ne retient que les chemins : les commentaires du bloc contiennent des apostrophes
    // françaises, qu'une extraction naïve de chaînes ramasserait au passage.
    const listees = [...bloc.matchAll(/'(\/[a-z/-]*)'/g)].map((m) => m[1]).sort()

    expect(listees).toEqual(['/api/taches', '/declarer', '/login', '/q', '/suivi'])
  })
})

describe('EX-NOT-06 / RGI-12 — la référence et le code sont la SEULE clé de consultation', () => {
  it('n’expose aucune voie de récupération par e-mail ou téléphone', async () => {
    const source = await import('node:fs/promises')
    const suivi = await source.readFile('src/app/(public)/suivi/actions.ts', 'utf8')

    // RGI-12 : ces champs peuvent être absents d'un dossier anonyme. Les accepter comme clé de
    // consultation reviendrait à réserver le suivi aux déclarants identifiés — et à offrir une
    // voie d'énumération à qui connaît une adresse.
    for (const interdit of ['contact_email', 'contact_telephone', 'declaration_identites']) {
      expect(suivi).not.toContain(interdit)
    }

    // La recherche porte sur la référence, et le code est vérifié par comparaison de hachage.
    expect(suivi).toContain('reference')
    expect(suivi).toContain('verifierCodeAcces')
  })

  it('ne renvoie au déclarant que la projection publique du statut', async () => {
    const source = await import('node:fs/promises')
    const suivi = await source.readFile('src/app/(public)/suivi/actions.ts', 'utf8')

    // RGI-10 : le libellé interne ne doit jamais quitter le back-office.
    expect(suivi).toContain('libelle_affiche')
    expect(suivi).not.toContain('libelle_interne')
  })
})
