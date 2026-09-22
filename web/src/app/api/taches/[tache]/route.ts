import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { journaliser } from '@/server/services/audit/journal'
import { TACHES, estTacheConnue } from '@/server/services/taches/registre'

/**
 * Déclencheur des tâches planifiées
 *
 * Next.js n'a pas d'ordonnanceur : ces traitements sont appelés par un cron EXTERNE.
 *
 * Sécurité — ce point d'entrée exécute des traitements de masse (anonymisation comprise) :
 *
 * - **POST uniquement.** Un GET serait déclenchable par un préchargement de navigateur, un
 *   robot d'indexation ou un lien collé dans une conversation.
 * - **Secret partagé obligatoire.** Sans `TACHES_SECRET` configuré, la route refuse tout :
 *   elle échoue fermée, jamais ouverte.
 * - **Comparaison à temps constant**, pour ne pas laisser deviner le secret octet par octet.
 * - **Aucune session utilisateur.** Ce n'est pas une action d'acteur : les traces d'audit
 *   produites portent `user_id = NULL` : aucune personne n'est à l'origine du geste.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function secretAttendu(): string | null {
  const valeur = process.env.TACHES_SECRET

  return valeur && valeur.length >= 32 ? valeur : null
}

/** `timingSafeEqual` exige des longueurs égales : comparées d'abord, ce qui ne fuite rien d'utile. */
function secretValide(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni)
  const b = Buffer.from(attendu)

  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

function jetonDeLaRequete(requete: NextRequest): string {
  const entete = requete.headers.get('authorization') ?? ''

  return entete.startsWith('Bearer ') ? entete.slice('Bearer '.length) : ''
}

export async function POST(
  requete: NextRequest,
  contexte: RouteContext<'/api/taches/[tache]'>
): Promise<Response> {
  const attendu = secretAttendu()

  if (!attendu) {
    // Journalisé côté serveur : une tâche qui ne part jamais parce qu'un secret manque est
    // exactement le genre de panne silencieuse qui reste invisible des mois.
    console.error(
      'TACHES_SECRET absent ou trop court (32 caractères minimum) : les tâches planifiées sont désactivées.'
    )
    return Response.json({ erreur: 'Déclencheur non configuré.' }, { status: 503 })
  }

  if (!secretValide(jetonDeLaRequete(requete), attendu)) {
    return Response.json({ erreur: 'Jeton invalide.' }, { status: 401 })
  }

  const { tache } = await contexte.params

  if (!estTacheConnue(tache)) {
    return Response.json({ erreur: 'Tâche inconnue.' }, { status: 404 })
  }

  const definition = TACHES[tache]
  const debut = Date.now()

  try {
    const resultat = await definition.executer()

    await journaliser({
      action: 'tache.executee',
      nouvelles: {
        tache,
        resume: resultat.resume,
        duree_ms: Date.now() - debut,
        ...resultat.details,
      },
    })

    return Response.json({
      tache,
      libelle: definition.libelle,
      resume: resultat.resume,
      details: resultat.details,
      duree_ms: Date.now() - debut,
    })
  } catch (erreur) {
    console.error(`Tâche planifiée « ${tache} » en échec`, erreur)

    // L'échec est tracé : sans cela, une tâche qui échoue chaque nuit est indiscernable d'une
    // tâche qui n'a rien à faire.
    await journaliser({
      action: 'tache.echouee',
      nouvelles: { tache, duree_ms: Date.now() - debut },
    })

    return Response.json({ erreur: 'La tâche a échoué.', tache }, { status: 500 })
  }
}
