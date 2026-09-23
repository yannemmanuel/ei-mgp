import type { Prisma } from '@prisma/client'
import type { ParcoursCode } from '@/server/authz'

/**
 * RG-01 : numéro de référence unique par parcours, au format {PRÉFIXE}-{ANNÉE}-{NNNNNN}.
 *
 * Port de `App\Services\Declaration\ReferenceGeneratorService`.
 *
 * DOIT être appelé à l'intérieur de la transaction de création : le verrou de ligne
 * (`FOR UPDATE`) n'a d'effet que dans une transaction. La contrainte UNIQUE sur
 * `dossiers.reference` reste le filet de sécurité final en cas de course sur la toute première
 * référence d'une nouvelle combinaison parcours/année.
 */
const PREFIXES: Record<ParcoursCode, string> = {
  ei_employe: 'EI',
  grief_employe: 'GEM',
  grief_sous_traitant: 'GST',
  grief_communaute: 'GCO',
}

export async function referenceSuivante(
  tx: Prisma.TransactionClient,
  parcours: ParcoursCode,
  maintenant: Date = new Date()
): Promise<string> {
  const racine = `${PREFIXES[parcours]}-${maintenant.getFullYear()}-`

  // Prisma n'expose pas `FOR UPDATE` : requête brute indispensable ici. Sans ce verrou, deux
  // déclarations simultanées sur le même parcours liraient la même dernière référence et
  // tenteraient d'écrire le même numéro.
  const lignes = await tx.$queryRaw<{ reference: string }[]>`
    SELECT reference FROM ei_mgp.dossiers
    WHERE reference LIKE ${racine + '%'}
    ORDER BY reference DESC
    LIMIT 1
    FOR UPDATE
  `

  const dernier = lignes[0]?.reference
  const prochain = dernier ? Number.parseInt(dernier.slice(-6), 10) + 1 : 1

  return racine + String(prochain).padStart(6, '0')
}
