import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { chargerUtilisateurAutorise, parcoursAutorises } from '@/server/authz'
import { perimetreDossiers } from '@/server/services/dossier/liste'
import { enregistrerUtilisateur, listerUtilisateurs } from '../utilisateurs'

/**
 * L'attribution des parcours, de bout en bout : formulaire → base → décision d'accès.
 *
 * Les cas de `authz/__tests__/parcours.test.ts` exercent la règle sur des utilisateurs fabriqués.
 * Ceux-ci vérifient le reste de la chaîne, qu'aucun objet de test ne peut prouver : que l'écriture
 * atteint bien la base, que `chargerUtilisateurAutorise()` la relit, et que le périmètre SQL des
 * dossiers s'en trouve réellement réduit. C'est ce dernier point qui protège d'un appel direct à
 * l'API : la restriction est dans la clause `where`, pas dans l'affichage.
 */
const comptesCrees: bigint[] = []

async function acteur() {
  const utilisateur = await prisma.users.findFirstOrThrow({
    where: { actif: true },
    select: { id: true },
  })

  return { id: utilisateur.id }
}

function adresseUnique(): string {
  return `test-parcours-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`
}

async function creerCompte(roles: string[], parcours: string[]) {
  const resultat = await enregistrerUtilisateur(await acteur(), {
    name: 'Compte parcours',
    email: adresseUnique(),
    matricule: null,
    poste: null,
    directionId: null,
    siteId: null,
    responsableHierarchiqueId: null,
    actif: true,
    roles,
    parcours,
  })

  comptesCrees.push(resultat.utilisateurId)
  return resultat.utilisateurId
}

// ⚠️ Ne supprime QUE les comptes créés ici, jamais un compte réel : ce fichier tourne sur la base
// de travail, et un `deleteMany` sans borne y détruirait des données de production.
afterAll(async () => {
  if (comptesCrees.length === 0) return

  await prisma.utilisateur_parcours.deleteMany({ where: { user_id: { in: comptesCrees } } })
  await prisma.model_has_roles.deleteMany({ where: { model_id: { in: comptesCrees } } })
  await prisma.audit_logs.deleteMany({
    where: {
      auditable_type: String.raw`App\Models\User`,
      // Borné aux comptes créés ici : l'audit d'un compte réel ne doit jamais être effacé par une
      // exécution de tests.
      auditable_id: { in: comptesCrees.map(String) },
    },
  })
  await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })
})

describe('L’attribution voyage jusqu’à la décision d’accès', () => {
  it('confie un parcours, le relit, puis le retire', async () => {
    const id = await creerCompte(['correspondant_drh'], ['grief_employe'])

    const apresCreation = await chargerUtilisateurAutorise(id)
    expect(parcoursAutorises(apresCreation!)).toEqual(['grief_employe'])

    // Le retrait doit couper l'accès, pas seulement masquer la case dans l'écran.
    await enregistrerUtilisateur(
      await acteur(),
      {
        name: 'Compte parcours',
        email: (await prisma.users.findUniqueOrThrow({ where: { id } })).email,
        matricule: null,
        poste: null,
        directionId: null,
        siteId: null,
        responsableHierarchiqueId: null,
        actif: true,
        roles: ['correspondant_drh'],
        parcours: [],
      },
      id
    )

    const apresRetrait = await chargerUtilisateurAutorise(id)
    expect(parcoursAutorises(apresRetrait!)).toEqual([])
  })

  it('réduit RÉELLEMENT la liste des dossiers en base', async () => {
    /*
      Le test qui compte : la restriction doit être dans la clause SQL, pas dans l'affichage.
      C'est elle, et elle seule, qui tient face à un appel direct à l'API.

      Deux comptes, le MÊME rôle, une seule différence — l'un s'est vu confier le parcours,
      l'autre non. Le rôle retenu est `comite_ethique` parce qu'il passe par `dossiers.view`,
      donc par le cloisonnement. Les rôles qui détiennent `dossiers.view.all` court-circuitent ce
      chemin par conception (cas suivant) : les prendre ici ferait dépendre le résultat d'une
      configuration administrable, et le test cesserait de mesurer ce code.
    */
    const [idHabilite, idSansParcours] = await Promise.all([
      creerCompte(['comite_ethique'], ['grief_employe']),
      creerCompte(['comite_ethique'], []),
    ])

    const [habilite, sansParcours] = await Promise.all([
      chargerUtilisateurAutorise(idHabilite),
      chargerUtilisateurAutorise(idSansParcours),
    ])

    const visibles = (u: NonNullable<Awaited<ReturnType<typeof chargerUtilisateurAutorise>>>) =>
      prisma.dossiers.count({
        where: { AND: [perimetreDossiers(u), { parcours: { code: 'grief_employe' } }] },
      })

    expect(await visibles(sansParcours!), 'un compte sans attribution voit des dossiers').toBe(0)

    /*
      Contrôle de pertinence. Sans dossier de grief employé en base, l'assertion ci-dessus
      passerait pour la mauvaise raison — un zéro qui ne prouve rien. On vérifie donc que le
      compte HABILITÉ, lui, en voit : c'est ce qui distingue « la restriction fonctionne » de
      « il n'y avait rien à voir ».
    */
    const total = await prisma.dossiers.count({ where: { parcours: { code: 'grief_employe' } } })

    expect(total, 'aucun dossier de grief employé : le cas ne prouverait rien').toBeGreaterThan(0)
    expect(await visibles(habilite!), 'le parcours confié est devenu invisible').toBe(total)
  })

  it('⚠️ `dossiers.view.all` court-circuite le cloisonnement par parcours', async () => {
    /*
      Une propriété du code, énoncée ici pour qu'elle ne surprenne personne.

      `perimetreDossiers()` et `peutVoirDossier()` rendent « tout » dès que le compte détient
      `dossiers.view.all`, sans consulter ni le rôle ni l'attribution. C'est cohérent — la
      permission dit littéralement « voir TOUS les dossiers » — mais cela signifie qu'attribuer un
      parcours à un compte qui la détient ne restreint RIEN.

      Conséquence pratique : pour qu'une personne ne voie que son type de grief, son rôle doit
      passer par `dossiers.view`, pas par `dossiers.view.all`.
    */
    const id = await creerCompte(['comite_ethique'], [])
    const compte = (await chargerUtilisateurAutorise(id))!

    const cloisonne = perimetreDossiers(compte)
    const toutVoir = perimetreDossiers({
      ...compte,
      permissions: new Set([...compte.permissions, 'dossiers.view.all' as const]),
    })

    // Sans attribution, le périmètre est une clause qui ne ramène rien ; avec `view.all`, il
    // devient la clause vide — c'est-à-dire aucune restriction du tout.
    expect(cloisonne).not.toEqual({})
    expect(toutVoir).toEqual({})
  })

  it('refuse un code de parcours fabriqué', async () => {
    // Le formulaire n'offre que des cases valides ; un appel direct peut en envoyer d'autres.
    const id = await creerCompte(['correspondant_drh'], ['grief_employe', 'parcours_invente'])

    const compte = (await listerUtilisateurs()).find((c) => c.id === id)
    expect(compte?.parcours).toEqual(['grief_employe'])
  })
})
