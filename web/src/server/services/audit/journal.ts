import type { Prisma } from '@prisma/client'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'

/**
 * Point d'entrée UNIQUE de toute écriture dans `audit_logs`.
 *
 * `audit_logs` est en AJOUT SEUL (CDC §15) : ce module n'expose ni modification, ni suppression,
 * et il ne doit jamais en exposer. Aucune route, aucune action serveur ne permet d'altérer une
 * ligne existante.
 *
 * Une ligne porte une ACTION — `modele.verbe`, par exemple `statut_dossier.modifie` — et le TYPE
 * de l'objet visé. Les deux se lisent ensemble : l'action dit ce qui s'est passé, le type et
 * l'identifiant disent sur quoi.
 *
 * ⚠️ LES DEUX SE CONTREDISAIENT JUSQU'AU 2026-09-22. L'action disait `statut_dossier.modifie`
 * quand le type disait `App\Models\StatutDossier` : deux vocabulaires pour la même chose, dans
 * la même ligne, qu'une seconde table de correspondance devait réconcilier à l'affichage. Le
 * format de classe PHP se justifiait tant que l'application PHP lisait le même journal ; elle est partie, et
 * les types sont désormais ceux de `@/server/modeles`, alignés sur les préfixes d'action.
 */

/*
  Les codes de type vivent dans `@/server/modeles`, module feuille sans dépendance.

  ⚠️ ILS Y SONT ALLÉS le 2026-09-22, en même temps qu'ils cessaient d'être des noms de classe
  PHP. Ils sont écrits par quatre modules qui n'ont rien à voir avec le journal — l'autorisation,
  le stockage des pièces jointes, la boîte de notifications — et chacun en portait sa propre
  copie littérale. Les héberger ici obligeait ces modules à importer le journal pour une
  constante, ou à la recopier ; ils la recopiaient.

  La ré-exportation garde valides les importations déjà écrites depuis ce module.
*/
import type { ModeleAudite } from '@/server/modeles'

export { MODELES, type ModeleAudite } from '@/server/modeles'

/** Valeurs jamais consignées, même hachées — équivalent de `$model->getHidden()`. */
const CHAMPS_EXCLUS = new Set(['password', 'remember_token', 'access_code_hash', 'updated_at'])

export type ValeursAudit = Record<string, unknown>

async function contexteRequete(): Promise<{ ip: string | null; agent: string | null; url: string | null }> {
  try {
    const entetes = await headers()

    return {
      ip:
        entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ?? entetes.get('x-real-ip') ?? null,
      agent: entetes.get('user-agent'),
      // Reconstitue l'URL demandée : `headers()` ne l'expose pas directement.
      url: entetes.get('referer'),
    }
  } catch {
    // Hors requête (tâche planifiée, script) : il n'y a ni IP, ni agent, ni URL à consigner.
    return { ip: null, agent: null, url: null }
  }
}

export async function journaliser(params: {
  action: string
  acteurId?: bigint | null
  auditableType?: ModeleAudite | null
  auditableId?: string | null
  anciennes?: ValeursAudit | null
  nouvelles?: ValeursAudit | null
}): Promise<void> {
  const contexte = await contexteRequete()

  await prisma.audit_logs.create({
    data: {
      user_id: params.acteurId ?? null,
      action: params.action,
      auditable_type: params.auditableType ?? null,
      auditable_id: params.auditableId ?? null,
      old_values: vide(params.anciennes) ? undefined : serialiser(params.anciennes),
      new_values: vide(params.nouvelles) ? undefined : serialiser(params.nouvelles),
      ip_address: contexte.ip,
      user_agent: contexte.agent?.slice(0, 255) ?? null,
      url: contexte.url?.slice(0, 255) ?? null,
      created_at: new Date(),
    },
  })
}

function vide(valeurs: ValeursAudit | null | undefined): boolean {
  return valeurs == null || Object.keys(valeurs).length === 0
}

/**
 * Les BigInt et les dates ne sont pas sérialisables en JSON : converties en chaînes.
 *
 * Le type de retour est celui qu'attend Prisma pour une colonne JSON — `Record<string, unknown>`
 * y serait refusé, `unknown` pouvant contenir des valeurs non sérialisables.
 */
function serialiser(valeurs: ValeursAudit | null | undefined): Prisma.InputJsonObject {
  // `InputJsonObject` est en lecture seule : l'objet se construit mutable, puis se présente.
  const resultat: Record<string, Prisma.InputJsonValue> = {}

  for (const [cle, valeur] of Object.entries(valeurs ?? {})) {
    if (typeof valeur === 'bigint') resultat[cle] = String(valeur)
    else if (valeur instanceof Date) resultat[cle] = valeur.toISOString()
    else resultat[cle] = valeur as Prisma.InputJsonValue
  }

  return resultat
}

export type Difference = { anciennes: ValeursAudit; nouvelles: ValeursAudit }

/**
 * Différence entre deux états, restreinte aux champs RÉELLEMENT modifiés — équivalent de
 * `$model->getChanges()`.
 *
 * Consigner l'objet entier à chaque enregistrement noierait le changement significatif dans le
 * bruit : un journal que personne ne peut lire ne protège rien.
 */
export function difference(avant: ValeursAudit, apres: ValeursAudit): Difference {
  const anciennes: ValeursAudit = {}
  const nouvelles: ValeursAudit = {}

  for (const [cle, valeurApres] of Object.entries(apres)) {
    if (CHAMPS_EXCLUS.has(cle)) continue

    const valeurAvant = avant[cle]

    // Comparaison lâche assumée : `null` et `undefined` désignent ici la même absence, et un
    // BigInt lu en base se compare à un nombre saisi dans un formulaire.
    if (comparable(valeurAvant) === comparable(valeurApres)) continue

    anciennes[cle] = valeurAvant ?? null
    nouvelles[cle] = valeurApres
  }

  return { anciennes, nouvelles }
}

function comparable(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return ''
  if (valeur instanceof Date) return valeur.toISOString()

  return String(valeur)
}

/** `true` si la différence ne porte sur aucun champ : rien à journaliser. */
export function sansChangement(difference: Difference): boolean {
  return Object.keys(difference.nouvelles).length === 0
}

/** Attributs d'une création, expurgés des champs sensibles. */
export function attributsCrees(valeurs: ValeursAudit): ValeursAudit {
  const resultat: ValeursAudit = {}

  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (CHAMPS_EXCLUS.has(cle)) continue
    resultat[cle] = valeur
  }

  return resultat
}
