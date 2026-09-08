import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { utilisateurCourant } from '@/server/auth'
import { peutVoirDossier, type ParcoursCode } from '@/server/authz'
import type { StatutCode } from '@/server/services/dossier/statuts'
import { magasinNomme } from '@/server/services/stockage/magasin'

/**
 * Téléchargement d'une pièce jointe — port de `PieceJointeDownloadController` (Laravel).
 *
 * `docs/exigences-securite.md` §3 : **aucune pièce n'est jamais servie par une URL de stockage
 * publique**. Le fichier transite par cette route, qui revérifie la Policy du DOSSIER parent —
 * que la pièce soit attachée au dossier lui-même, à une investigation ou à une action corrective.
 *
 * Un gestionnaire de route n'est couvert par aucun layout : l'authentification et l'autorisation
 * se font ici, explicitement.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODELE_DOSSIER = String.raw`App\Models\Dossier`
const MODELE_INVESTIGATION = String.raw`App\Models\Investigation`
const MODELE_ACTION = String.raw`App\Models\ActionCorrective`

/**
 * Remonte au dossier parent.
 *
 * `pieces_jointes` est polymorphe et Prisma ne modélise pas ces relations : la résolution est
 * explicite, et tout type inattendu est traité comme introuvable plutôt que laissé passer.
 */
async function dossierParent(type: string, id: string) {
  if (type === MODELE_DOSSIER) return id

  if (type === MODELE_INVESTIGATION) {
    const investigation = await prisma.investigations.findUnique({
      where: { id },
      select: { dossier_id: true },
    })
    return investigation?.dossier_id ?? null
  }

  if (type === MODELE_ACTION) {
    const action = await prisma.actions_correctives.findUnique({
      where: { id },
      select: { dossier_id: true },
    })
    return action?.dossier_id ?? null
  }

  return null
}

export async function GET(
  _requete: NextRequest,
  contexte: RouteContext<'/api/pieces-jointes/[id]'>
): Promise<Response> {
  const utilisateur = await utilisateurCourant()

  if (!utilisateur) {
    return new Response('Authentification requise.', { status: 401 })
  }

  const { id } = await contexte.params

  const piece = await prisma.pieces_jointes.findUnique({
    where: { id },
    select: {
      attachable_type: true,
      attachable_id: true,
      disque: true,
      chemin: true,
      nom_original: true,
      mime_type: true,
      taille_octets: true,
    },
  })

  if (!piece) {
    return new Response('Pièce jointe introuvable.', { status: 404 })
  }

  const dossierId = await dossierParent(piece.attachable_type, piece.attachable_id)

  if (!dossierId) {
    return new Response('Pièce jointe introuvable.', { status: 404 })
  }

  const dossier = await prisma.dossiers.findUnique({
    where: { id: dossierId },
    select: {
      is_anonymous: true,
      declarant_user_id: true,
      parcours: { select: { code: true } },
      statuts_dossier: { select: { code: true } },
      dossier_affectations: {
        where: { user_id: utilisateur.id, actif: true },
        select: { id: true },
        take: 1,
      },
    },
  })

  // Un dossier hors périmètre et une pièce inexistante répondent la MÊME chose : distinguer les
  // deux confirmerait l'existence du dossier à qui n'y a pas droit.
  if (
    !dossier ||
    !peutVoirDossier(utilisateur, {
      parcoursCode: dossier.parcours.code as ParcoursCode,
      statutCode: dossier.statuts_dossier.code as StatutCode,
      isAnonymous: dossier.is_anonymous,
      declarantUserId: dossier.declarant_user_id,
      estAffecteAuLecteur: dossier.dossier_affectations.length > 0,
    })
  ) {
    return new Response('Pièce jointe introuvable.', { status: 404 })
  }

  let octets: Buffer

  try {
    octets = await magasinNomme(piece.disque).lire(piece.chemin)
  } catch (erreur) {
    console.error(`Lecture de la pièce jointe ${id} en échec`, erreur)
    return new Response('Pièce jointe indisponible.', { status: 500 })
  }

  return new Response(new Uint8Array(octets), {
    headers: {
      'Content-Type': piece.mime_type,
      // `attachment` et non `inline` : un fichier téléversé par un tiers ne doit jamais être
      // rendu dans le contexte de l'application.
      'Content-Disposition': `attachment; filename="${piece.nom_original.replace(/"/g, '')}"`,
      'Content-Length': String(piece.taille_octets),
      'Cache-Control': 'no-store, private',
      // Défense supplémentaire contre l'interprétation d'un type deviné par le navigateur.
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
