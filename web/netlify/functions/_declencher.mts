/**
 * Appel d'une tâche planifiée depuis une fonction programmée Netlify.
 *
 * La fonction ne fait qu'APPELER `/api/taches/{nom}` : elle ne réimplémente aucune règle et ne
 * touche pas à la base. Toute l'autorisation reste dans la route — un seul endroit décide, un
 * seul endroit à auditer.
 *
 * L'échec est journalisé ET propagé : une fonction programmée qui « réussit » toujours ne
 * déclencherait aucune alerte le jour où la tâche échoue.
 */
export async function declencher(tache: string): Promise<Response> {
  const secret = process.env.TACHES_SECRET
  const base = process.env.URL ?? process.env.DEPLOY_URL

  if (!secret) {
    console.error(`TACHES_SECRET absent : la tâche « ${tache} » n'a pas été déclenchée.`)
    return new Response('Secret non configuré.', { status: 503 })
  }

  if (!base) {
    console.error(`URL du site indisponible : la tâche « ${tache} » n'a pas été déclenchée.`)
    return new Response('URL du site indisponible.', { status: 503 })
  }

  const reponse = await fetch(`${base}/api/taches/${tache}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })

  const corps = await reponse.text()

  if (!reponse.ok) {
    console.error(`Tâche « ${tache} » en échec (HTTP ${reponse.status}) : ${corps}`)
    return new Response(corps, { status: reponse.status })
  }

  console.info(`Tâche « ${tache} » exécutée : ${corps}`)
  return new Response(corps, { status: 200 })
}
