'use server'

import { headers } from 'next/headers'
import { schemaParcours } from '@/lib/validations/formulaire-parcours'
import { prisma } from '@/lib/prisma'
import { creerDeclaration, type DonneesIdentite } from '@/server/services/declaration/creer-declaration'
import { ErreurPieceJointe, type FichierAValider } from '@/server/services/declaration/pieces-jointes'
import {
  PARCOURS,
  champsVisibles,
  estParcoursValide,
  type Champ,
} from '@/server/services/declaration/parcours-config'
import { autoriserTentative, cleThrottle } from '@/server/auth/throttle'

/**
 * Soumission d'une déclaration publique.
 *
 * Toute la validation qui compte est ici : le formulaire est public, non authentifié, et rien de
 * ce qui vient du navigateur n'est digne de confiance. C'est la surface d'abus la plus large de
 * l'application (docs/exigences-securite.md §4).
 */

export type EtatSoumission = {
  succes?: { reference: string; codeAcces: string }
  erreurs?: Record<string, string>
  erreurGenerale?: string
}

const DELAI_MINIMAL_SECONDES = 3

async function adresseIp(): Promise<string> {
  const entetes = await headers()
  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ?? entetes.get('x-real-ip') ?? 'inconnue'
  )
}

function valeurBrute(donnees: FormData, champ: Champ): unknown {
  if (champ.type === 'case') {
    return donnees.get(champ.nom) === 'on' || donnees.get(champ.nom) === 'true'
  }
  const valeur = donnees.get(champ.nom)
  return typeof valeur === 'string' ? valeur : undefined
}

export async function soumettreDeclaration(
  _precedent: EtatSoumission,
  donnees: FormData
): Promise<EtatSoumission> {
  const codeParcours = String(donnees.get('parcours') ?? '')

  if (!estParcoursValide(codeParcours)) {
    return { erreurGenerale: 'Parcours inconnu.' }
  }

  const config = PARCOURS[codeParcours]
  const anonyme = donnees.get('anonymat') === 'on' || donnees.get('anonymat') === 'true'

  // Anti-spam silencieux (DT-14) : un robot qui remplit le champ piège reçoit un faux succès,
  // sans qu'aucune écriture n'ait lieu. Ne jamais lui signaler qu'il a été détecté.
  if (String(donnees.get('piegeAraignee') ?? '') !== '') {
    return { succes: { reference: 'EI-0000-000000', codeAcces: '000000' } }
  }

  const horodatage = Number(donnees.get('horodatageAffichage') ?? 0)
  if (Math.floor(Date.now() / 1000) - horodatage < DELAI_MINIMAL_SECONDES) {
    return { erreurGenerale: 'Le formulaire a été soumis trop rapidement. Merci de réessayer.' }
  }

  // Débit contrôlé par IP : 5 soumissions par fenêtre (docs/exigences-securite.md §4).
  if (!autoriserTentative(cleThrottle('declaration', await adresseIp()))) {
    return {
      erreurGenerale:
        'Trop de déclarations envoyées depuis cette connexion. Merci de réessayer plus tard.',
    }
  }

  const visibles = champsVisibles(config, anonyme)
  const brut: Record<string, unknown> = {
    anonymat: anonyme,
    categorieId: String(donnees.get('categorieId') ?? ''),
    categorieAutrePrecision: String(donnees.get('categorieAutrePrecision') ?? '') || undefined,
    niveauGraviteId: String(donnees.get('niveauGraviteId') ?? ''),
    description: String(donnees.get('description') ?? ''),
    attentesDeclarant: String(donnees.get('attentesDeclarant') ?? '') || undefined,
    horodatageAffichage: horodatage,
  }

  for (const champ of visibles) {
    const valeur = valeurBrute(donnees, champ)
    if (valeur !== undefined && valeur !== '') brut[champ.nom] = valeur
    else if (champ.type === 'case') brut[champ.nom] = false
  }

  const resultat = schemaParcours(config, anonyme).safeParse(brut)

  if (!resultat.success) {
    const erreurs: Record<string, string> = {}
    for (const probleme of resultat.error.issues) {
      const cle = String(probleme.path[0] ?? 'erreurGenerale')
      erreurs[cle] ??= probleme.message
    }
    return { erreurs }
  }

  const valide = resultat.data as Record<string, unknown>

  // RG-09 : la précision est obligatoire dès que la catégorie choisie est « Autre ». Vérifié
  // ici et non dans le schéma, qui ne connaît pas le référentiel.
  const categorie = await prisma.categories.findUnique({
    where: { id: BigInt(String(valide.categorieId)) },
    select: { id: true, is_autre: true, parcours_id: true },
  })

  const parcours = await prisma.parcours.findFirstOrThrow({ where: { code: codeParcours } })

  // Une catégorie doit appartenir au parcours soumis : sans ce contrôle, un identifiant forgé
  // permettrait de rattacher une déclaration à la catégorie d'un autre parcours.
  if (!categorie || categorie.parcours_id !== parcours.id) {
    return { erreurs: { categorieId: 'Catégorie invalide pour ce parcours.' } }
  }

  if (categorie.is_autre && String(valide.categorieAutrePrecision ?? '').trim() === '') {
    return { erreurs: { categorieAutrePrecision: 'Merci de préciser la catégorie « Autre ».' } }
  }

  const fichiers = await lireFichiers(donnees)

  const identite: DonneesIdentite = {}
  const dossierSpecifique: Record<string, unknown> = {}

  for (const champ of visibles) {
    const valeur = valide[champ.nom]
    if (valeur === undefined || valeur === '') continue

    if (champ.identite && champ.colonne) {
      ;(identite as Record<string, unknown>)[champ.colonne] = valeur
    } else if (!champ.identite) {
      dossierSpecifique[champ.nom] = valeur
    }
  }

  try {
    const cree = await creerDeclaration({
      parcours: codeParcours,
      canalCaptageCode: 'qr_code',
      anonyme,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: BigInt(String(valide.niveauGraviteId)),
        description: String(valide.description),
        categorieAutrePrecision: (valide.categorieAutrePrecision as string) ?? null,
        attentesDeclarant: (valide.attentesDeclarant as string) ?? null,
        lieu: (dossierSpecifique.lieu ?? dossierSpecifique.lieuSite ?? null) as string | null,
        dateSurvenance: (dossierSpecifique.dateSurvenance ??
          dossierSpecifique.dateHeureFaits ??
          null) as Date | null,
        caractereRepetitif: (dossierSpecifique.caractereRepetitif ?? null) as string | null,
        propositionMesureCorrective: (dossierSpecifique.propositionMesureCorrective ?? null) as
          | string
          | null,
        // Le rattachement à la direction n'existe que pour une déclaration identifiée.
        directionId:
          !anonyme && valide.directionId ? BigInt(String(valide.directionId)) : null,
      },
      donneesIdentite: anonyme ? undefined : identite,
      fichiers,
    })

    return { succes: { reference: cree.reference, codeAcces: cree.codeAcces } }
  } catch (erreur) {
    if (erreur instanceof ErreurPieceJointe) {
      return { erreurs: { fichiers: erreur.message } }
    }
    console.error('Échec de création de déclaration', erreur)
    return {
      erreurGenerale:
        "Votre déclaration n'a pas pu être enregistrée. Aucune donnée n'a été perdue : merci de réessayer.",
    }
  }
}

async function lireFichiers(donnees: FormData): Promise<FichierAValider[]> {
  const fichiers: FichierAValider[] = []

  for (const entree of donnees.getAll('fichiers')) {
    if (entree instanceof File && entree.size > 0) {
      fichiers.push({
        nom: entree.name,
        octets: Buffer.from(await entree.arrayBuffer()),
      })
    }
  }

  return fichiers
}
