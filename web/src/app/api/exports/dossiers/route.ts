import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { utilisateurCourant } from '@/server/auth'
import { peutExporter, peutExporterNominatif } from '@/server/authz'
import { filtreDepuisParametres } from '@/server/services/reporting/filtre'
import { lignesExport } from '@/server/services/reporting/export'
import { classeurDossiers } from '@/server/services/reporting/classeur'
import { rapportPdf } from '@/server/services/reporting/document-pdf'

/**
 * EX-REP-04/06 : téléchargement du rapport des dossiers, au format Excel ou PDF.
 *
 * Une route et non une Server Action : une action ne peut pas renvoyer un fichier en pièce
 * jointe, et le navigateur doit recevoir un `Content-Disposition`.
 *
 * ⚠️ Un gestionnaire de route n'est couvert par AUCUN layout : la vérification d'authentification
 * du groupe `(app)` ne s'y applique pas. Tout se vérifie donc ici, explicitement.
 *
 * RG-14 : `nominatif=1` est une DEMANDE, jamais une décision. L'inclusion effective dépend
 * uniquement de la permission détenue en base — exactement ce que
 * `docs/exigences-securite.md` §6 exige : « aucun paramètre d'URL ne doit permettre de forcer
 * l'inclusion de données nominatives sans revérification de la permission côté serveur ».
 */

// Génération de fichiers : exceljs et @react-pdf/renderer exigent l'exécution Node.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function GET(requete: NextRequest): Promise<Response> {
  const utilisateur = await utilisateurCourant()

  if (!utilisateur) {
    return new Response('Authentification requise.', { status: 401 })
  }

  if (!peutExporter(utilisateur)) {
    return new Response('Export non autorisé.', { status: 403 })
  }

  const parametres = Object.fromEntries(requete.nextUrl.searchParams)
  const format = parametres.format === 'pdf' ? 'pdf' : 'xlsx'

  const demandeNominatif = parametres.nominatif === '1'
  const inclureNominatif = demandeNominatif && peutExporterNominatif(utilisateur)

  // Même plafond que le tableau de bord : un export ne doit pas ouvrir ce que l'écran ferme.
  const filtre = filtreDepuisParametres(parametres, utilisateur)
  const lignes = await lignesExport(filtre, inclureNominatif)

  // Un export de données nominatives sort des données personnelles
  // du système sans laisser aucune trace côté baseline. Le DPO doit pouvoir savoir qui a extrait
  // quoi. Seul l'export nominatif est journalisé — un export anonyme ne sort aucune identité.
  if (inclureNominatif) {
    await prisma.audit_logs.create({
      data: {
        user_id: utilisateur.id,
        action: 'rapport.export_nominatif',
        // Tous les paramètres reçus, et non le seul filtre : pour le DPO, la question est
        // « qu'est-ce qui a été demandé », y compris ce qui a été refusé.
        new_values: { format, nb_lignes: lignes.length, parametres },
        ip_address: adresseIp(requete),
        created_at: new Date(),
      },
    })
  }

  const horodatage = new Date().toISOString().slice(0, 10)

  if (format === 'pdf') {
    const pdf = await rapportPdf(lignes, inclureNominatif)

    return fichier(pdf, 'application/pdf', `rapport-dossiers-${horodatage}.pdf`)
  }

  const classeur = await classeurDossiers(lignes, inclureNominatif)

  return fichier(classeur, TYPE_XLSX, `rapport-dossiers-${horodatage}.xlsx`)
}

function fichier(contenu: Buffer, type: string, nom: string): Response {
  return new Response(new Uint8Array(contenu), {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${nom}"`,
      'Content-Length': String(contenu.length),
      // Un rapport peut contenir des données nominatives : jamais de mise en cache partagée.
      'Cache-Control': 'no-store, private',
    },
  })
}

function adresseIp(requete: NextRequest): string {
  return (
    requete.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    requete.headers.get('x-real-ip') ??
    'inconnue'
  )
}
