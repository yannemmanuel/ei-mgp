import { afterEach, describe, expect, it } from 'vitest'
import { TACHES, estTacheConnue } from '../registre'
import { POST } from '@/app/api/taches/[tache]/route'

/**
 * Déclencheur des tâches planifiées.
 *
 * Ce point d'entrée exécute des traitements de masse, dont l'anonymisation définitive de données
 * personnelles. Sa seule protection est un secret partagé : ces cas vérifient qu'il échoue
 * FERMÉ — jamais ouvert — dans toutes les configurations dégradées.
 */
const SECRET_VALIDE = 'a'.repeat(40)

function requete(jeton?: string): Request {
  return new Request('http://localhost/api/taches/relancer-echeances', {
    method: 'POST',
    headers: jeton === undefined ? {} : { authorization: `Bearer ${jeton}` },
  })
}

function contexte(tache: string) {
  return { params: Promise.resolve({ tache }) }
}

const secretInitial = process.env.TACHES_SECRET

afterEach(() => {
  if (secretInitial === undefined) delete process.env.TACHES_SECRET
  else process.env.TACHES_SECRET = secretInitial
})

describe('Registre', () => {
  it('couvre les 5 tâches de `routes/console.php`, plus l’entretien propre au portage', () => {
    expect(Object.keys(TACHES)).toEqual([
      'recalculer-retard-actions',
      'relancer-echeances',
      'detecter-retards',
      'calculer-statistiques-mensuelles',
      // Aucun framework ne purge cette table : c'est cette tâche qui s'en charge.
      'purger-compteurs-debit',
      'appliquer-politique-conservation',
    ])
  })

  it('ne reconnaît pas un nom fabriqué', () => {
    expect(estTacheConnue('relancer-echeances')).toBe(true)
    expect(estTacheConnue('constructor')).toBe(false)
    expect(estTacheConnue('__proto__')).toBe(false)
  })
})

describe('Échec fermé', () => {
  it('refuse tout si le secret n’est pas configuré', async () => {
    delete process.env.TACHES_SECRET

    const reponse = await POST(
      requete(SECRET_VALIDE) as never,
      contexte('relancer-echeances') as never
    )

    // 503 et non 401 : ce n'est pas l'appelant qui est en faute, c'est le déploiement.
    expect(reponse.status).toBe(503)
  })

  it('refuse un secret trop court pour être sérieux', async () => {
    // 31 caractères : un secret court est devinable, mieux vaut désactiver la route.
    process.env.TACHES_SECRET = 'b'.repeat(31)

    const reponse = await POST(
      requete('b'.repeat(31)) as never,
      contexte('relancer-echeances') as never
    )

    expect(reponse.status).toBe(503)
  })
})

describe('Authentification', () => {
  it('refuse une requête sans jeton', async () => {
    process.env.TACHES_SECRET = SECRET_VALIDE

    const reponse = await POST(requete() as never, contexte('relancer-echeances') as never)

    expect(reponse.status).toBe(401)
  })

  it('refuse un jeton de bonne longueur mais faux', async () => {
    process.env.TACHES_SECRET = SECRET_VALIDE

    const reponse = await POST(
      requete('c'.repeat(40)) as never,
      contexte('relancer-echeances') as never
    )

    expect(reponse.status).toBe(401)
  })

  it('refuse un préfixe correct du secret', async () => {
    process.env.TACHES_SECRET = SECRET_VALIDE

    // Une comparaison par préfixe laisserait deviner le secret caractère par caractère.
    const reponse = await POST(
      requete(SECRET_VALIDE.slice(0, 39)) as never,
      contexte('relancer-echeances') as never
    )

    expect(reponse.status).toBe(401)
  })

  it('refuse une tâche inconnue même avec le bon jeton', async () => {
    process.env.TACHES_SECRET = SECRET_VALIDE

    const reponse = await POST(requete(SECRET_VALIDE) as never, contexte('rm-rf') as never)

    expect(reponse.status).toBe(404)
  })
})
