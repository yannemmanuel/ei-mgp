import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { MODELES } from '@/server/modeles'
import { magasinCourant } from '../../stockage/magasin'
import { creerDeclaration } from '../../declaration/creer-declaration'
import {
  categoriePour,
  graviteParNiveau,
  nettoyerAudit,
  nettoyerDossiers,
} from '../../declaration/__tests__/aide-base'
import { anonymiser } from '../conservation'
import { MENTION_EFFACE, effacerDonneesPersonnelles } from '../effacement'

/**
 * L'anonymisation efface-t-elle RÉELLEMENT ce qui identifie ?
 *
 * ⚠️ CE FICHIER EXISTE PARCE QUE LA RÉPONSE ÉTAIT NON. `anonymiser()` supprimait la ligne
 * `declaration_identites`, marquait `anonymise_le`, et s'arrêtait là. Survivaient les pièces
 * jointes — fichiers compris —, les messages, `investigations.personnes_rencontrees` qui est une
 * liste de personnes, `actions_correctives.responsable_nom` qui est un nom, l'entreprise du
 * sous-traitant, les quatre colonnes de poste et tous les champs libres.
 *
 * Le dossier était donc déclaré anonymisé alors qu'il restait ré-identifiable, et la trace
 * juridique affirmait que l'obligation était tenue. Les cas ci-dessous ne vérifient pas que la
 * fonction s'exécute : ils vérifient, ligne par ligne, que la donnée n'y est PLUS.
 *
 * ⚠️ CES CAS ÉCRIVENT DE VRAIS FICHIERS dans le magasin et les relisent pour prouver qu'ils sont
 * partis. Se contenter de compter les lignes en base laisserait passer exactement le défaut le
 * plus grave — des fichiers orphelins qu'aucune ligne ne désigne plus, donc que plus rien ne
 * nettoiera jamais.
 */
const dossiersCrees: string[] = []

/** Un PNG minimal, authentique aux octets d'en-tête : le contrôle de type l'exige. */
const PNG_MINIMAL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function dossierComplet(): Promise<string> {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme: false,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Jean Dupont a glissé devant le poste de garde, témoin Marie Kouassi.',
      entreprise: 'Sous-traitance Dupont & Fils',
      poste: 'Technicien réseau',
    },
    donneesIdentite: {
      nomPrenom: 'Jean Dupont',
      contactEmail: 'jean.dupont@example.test',
    },
    fichiers: [{ nom: 'photo-jean-dupont.png', octets: PNG_MINIMAL }],
  })

  dossiersCrees.push(dossierId)
  return dossierId
}

/** Attache au dossier ce que la création ne pose pas : message, investigation, action. */
async function garnir(dossierId: string): Promise<void> {
  const maintenant = new Date()
  const { ulid } = await import('ulid')

  const statut = await prisma.statuts_dossier.findFirstOrThrow({ select: { id: true } })
  const compte = await prisma.users.findFirstOrThrow({ select: { id: true } })

  await prisma.messages.create({
    data: {
      id: ulid().toLowerCase(),
      dossier_id: dossierId,
      expediteur_type: 'declarant',
      corps: 'Mon numéro est le 07 00 00 00 00, rappelez-moi.',
      created_at: maintenant,
    },
  })

  await prisma.historique_statuts.create({
    data: {
      dossier_id: dossierId,
      statut_suivant_id: statut.id,
      commentaire: 'Vu avec Jean Dupont en direct.',
      created_at: maintenant,
    },
  })

  await prisma.investigations.create({
    data: {
      id: ulid().toLowerCase(),
      dossier_id: dossierId,
      enqueteur_id: compte.id,
      date_ouverture: maintenant,
      statut: 'en_cours',
      personnes_rencontrees: 'Jean Dupont, Marie Kouassi',
      faits_constates: 'Sol humide non signalé.',
      recommandations: 'Signaler les sols humides.',
      created_at: maintenant,
      updated_at: maintenant,
    },
  })

  await prisma.actions_correctives.create({
    data: {
      id: ulid().toLowerCase(),
      dossier_id: dossierId,
      intitule: 'Poser une signalétique',
      description: 'Confiée à Jean Dupont.',
      responsable_nom: 'Jean Dupont',
      echeance: maintenant,
      statut: 'a_faire',
      created_at: maintenant,
      updated_at: maintenant,
    },
  })
}

/*
  ⚠️ LA LISTE N'EST JAMAIS VIDÉE EN COURS DE ROUTE.

  Une première version la remettait à zéro dans un `beforeEach` : `afterAll` ne voyait alors que
  les dossiers du DERNIER cas, et tous les autres restaient en base — avec leurs fichiers dans le
  magasin. Une exécution de la suite ajoutait ainsi une douzaine de lignes et neuf fichiers que
  plus rien ne désignait. Un test qui salit la base qu'il interroge finit par se mettre lui-même
  en échec, une exécution plus tard, pour une raison sans rapport.
*/
afterAll(async () => {
  await nettoyerDossiers(dossiersCrees)
  await nettoyerAudit(MODELES.dossier, dossiersCrees)
})

describe('⚠️ L’effacement RGPD atteint tout ce qui identifie', () => {
  it('⚠️ efface le FICHIER d’une pièce jointe, pas seulement sa ligne', async () => {
    const id = await dossierComplet()

    const piece = await prisma.pieces_jointes.findFirstOrThrow({
      where: { attachable_type: MODELES.dossier, attachable_id: id },
      select: { disque: true, chemin: true },
    })

    // Le fichier existe bien avant : sans cette vérification, le cas passerait aussi le jour où
    // la création cesserait d'écrire quoi que ce soit.
    await expect(magasinCourant().lire(piece.chemin)).resolves.toBeInstanceOf(Buffer)

    await effacerDonneesPersonnelles(id)

    await expect(
      magasinCourant().lire(piece.chemin),
      'le fichier est toujours dans le magasin'
    ).rejects.toThrow()

    expect(
      await prisma.pieces_jointes.count({
        where: { attachable_type: MODELES.dossier, attachable_id: id },
      }),
      'la ligne de pièce jointe survit'
    ).toBe(0)
  })

  it('⚠️ efface les personnes rencontrées et le nom du responsable', async () => {
    const id = await dossierComplet()
    await garnir(id)

    await effacerDonneesPersonnelles(id)

    const investigation = await prisma.investigations.findFirstOrThrow({
      where: { dossier_id: id },
      select: { personnes_rencontrees: true, faits_constates: true },
    })
    expect(investigation.personnes_rencontrees, 'une liste de personnes survit').toBeNull()
    expect(investigation.faits_constates).toBe(MENTION_EFFACE)

    const action = await prisma.actions_correctives.findFirstOrThrow({
      where: { dossier_id: id },
      select: { responsable_nom: true, intitule: true },
    })
    expect(action.responsable_nom, 'un nom survit').toBeNull()

    // L'intitulé reste : il décrit une MESURE, pas une personne, et sa disparition rendrait le
    // suivi des actions correctives illisible sans rien protéger.
    expect(action.intitule).toBe('Poser une signalétique')
  })

  it('vide le corps des messages en conservant la ligne', async () => {
    const id = await dossierComplet()
    await garnir(id)

    await effacerDonneesPersonnelles(id)

    const messages = await prisma.messages.findMany({
      where: { dossier_id: id },
      select: { corps: true },
    })

    // La ligne survit : le FAIT qu'un échange ait eu lieu, et combien, reste une donnée
    // d'instruction — c'est le contenu qui part.
    expect(messages.length, 'la ligne de message a disparu').toBe(1)
    expect(messages[0].corps).toBe(MENTION_EFFACE)
  })

  it('⚠️ ne laisse subsister AUCUN des noms semés dans le dossier', async () => {
    /*
      Le cas d'ensemble, et le plus sévère : plutôt que d'énumérer les colonnes une à une, il
      relit le dossier entier et cherche les chaînes qu'il a lui-même plantées. Une colonne
      nominative ajoutée demain et oubliée dans `effacement.ts` fera échouer ce cas — c'est
      exactement ce qu'aucun test ne faisait.
    */
    const id = await dossierComplet()
    await garnir(id)

    await effacerDonneesPersonnelles(id)

    const [dossier, investigations, actions, messages, historique, identites] = await Promise.all([
      prisma.dossiers.findUniqueOrThrow({ where: { id } }),
      prisma.investigations.findMany({ where: { dossier_id: id } }),
      prisma.actions_correctives.findMany({ where: { dossier_id: id } }),
      prisma.messages.findMany({ where: { dossier_id: id } }),
      prisma.historique_statuts.findMany({ where: { dossier_id: id } }),
      prisma.declaration_identites.findMany({ where: { dossier_id: id } }),
    ])

    // Les identifiants sont des BigInt, que `JSON.stringify` refuse de sérialiser. Ils sont
    // rendus en chaîne : ce cas cherche des NOMS, la forme des identifiants lui est indifférente.
    const tout = JSON.stringify(
      { dossier, investigations, actions, messages, historique, identites },
      (_cle, valeur) => (typeof valeur === 'bigint' ? String(valeur) : valeur)
    )

    for (const trace of [
      'Jean Dupont',
      'Marie Kouassi',
      'jean.dupont@example.test',
      'Sous-traitance Dupont',
      'Technicien réseau',
      '07 00 00 00 00',
    ]) {
      expect(tout, `« ${trace} » est encore lisible après anonymisation`).not.toContain(trace)
    }

    // Et le dossier existe toujours : RG-03 interdit sa suppression, RG-12 exige que les
    // statistiques restent calculables.
    expect(dossier.reference).toBeTruthy()
    expect(dossier.parcours_id).toBeTruthy()
    expect(dossier.niveau_gravite_id).toBeTruthy()
  })

  it('est REJOUABLE sans échouer', async () => {
    /*
      L'invariant qui rend la reprise possible. Un effacement interrompu laisse des fichiers déjà
      partis ; si le second passage levait dessus, le dossier resterait à demi anonymisé pour
      toujours — et c'est précisément le cas que la borne par lot rend fréquent.
    */
    const id = await dossierComplet()
    await garnir(id)

    await effacerDonneesPersonnelles(id)
    await expect(effacerDonneesPersonnelles(id)).resolves.toBeDefined()
  })
})

describe('⚠️ Un effacement en échec ne marque pas le dossier', () => {
  it('⚠️ laisse le dossier éligible plutôt que de le déclarer en règle', async () => {
    /*
      LE CAS LE PLUS IMPORTANT DE CE FICHIER.

      Marquer un dossier dont l'effacement a échoué produirait exactement le défaut que toute
      cette reprise corrige : un dossier ré-identifiable portant une trace juridique qui affirme
      le contraire, et qu'aucun passage ultérieur ne reprendrait.

      Le défaut est provoqué en corrompant le chemin d'une pièce jointe vers un magasin inconnu :
      `magasinNomme()` lève, l'effacement échoue, et le dossier doit rester intact.
    */
    const id = await dossierComplet()

    await prisma.dossiers.update({
      where: { id },
      data: { date_cloture: new Date(Date.now() - 11 * 365 * 24 * 3600 * 1000) },
    })

    const vrai = await prisma.pieces_jointes.findFirstOrThrow({
      where: { attachable_type: MODELES.dossier, attachable_id: id },
      select: { disque: true },
    })

    await prisma.pieces_jointes.updateMany({
      where: { attachable_type: MODELES.dossier, attachable_id: id },
      data: { disque: 'magasin-qui-nexiste-pas' },
    })

    const bilan = await anonymiser()

    /*
      ⚠️ LE MAGASIN EST RENDU AVANT TOUTE ASSERTION.

      Sans cela, le nettoyage de fin de fichier ne peut plus atteindre le fichier — il ne sait pas
      où chercher — et le laisse sur le disque, orphelin. Ce cas fabriquait donc, à chaque
      exécution, exactement le défaut que l'audit relève par ailleurs. Restauré ici plutôt que
      dans un `finally` : les assertions qui suivent ne portent plus sur cette colonne.
    */
    await prisma.pieces_jointes.updateMany({
      where: { attachable_type: MODELES.dossier, attachable_id: id },
      data: { disque: vrai.disque },
    })

    expect(bilan.echecs, 'l’échec n’a pas été compté').toBeGreaterThan(0)

    const apres = await prisma.dossiers.findUniqueOrThrow({
      where: { id },
      select: { anonymise_le: true, description: true },
    })

    expect(apres.anonymise_le, '⚠️ le dossier a été MARQUÉ malgré l’échec').toBeNull()
    expect(apres.description, 'le dossier a été partiellement effacé puis abandonné').not.toBe(
      MENTION_EFFACE
    )
  })
})
