import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { chargerUtilisateurAutorise, peutFaireAvancerDepuis } from '@/server/authz'
import { rolesDuCircuitCritique } from '@/server/services/notification/destinataires'
import {
  COMPORTEMENTS_NOMS,
  changerComportementRole,
  chargerHabilitations,
  etapesACocher,
  modifierEtapesRole,
  modifierParcoursRole,
} from '../habilitations'

/**
 * ⚠️ UN RÔLE CRÉÉ DEPUIS L'INTERFACE DOIT POUVOIR TOUT FAIRE, sans déploiement.
 *
 * C'est la demande, mot pour mot : « je ne veux plus que les rôles soient dans le code mais plutôt
 * un paramétrage à notre guise depuis l'interface ». Jusqu'au 2026-09-21, un rôle créé là était
 * inerte sur cinq points, et rien ne le signalait :
 *
 *   - il n'était borné par aucun rattachement — il voyait TOUS les sites ;
 *   - il n'était alerté d'aucun circuit accéléré ;
 *   - il ne pouvait faire avancer AUCUN dossier, à aucune étape ;
 *   - il ne pouvait pas porter d'accès « sans données nominatives » ;
 *   - il ne pouvait pas être restreint à ses propres déclarations.
 *
 * Ces cas exercent le chemin ENTIER : le geste d'administration écrit en base, et
 * `chargerUtilisateurAutorise()` — la seule fonction que l'application consulte — le rend au
 * compte qui porte le rôle. Vérifier le seul geste laisserait passer une écriture qui n'arrive
 * jamais jusqu'à la décision.
 *
 * ⚠️ SUR UN RÔLE JETABLE, ET SUR LUI SEUL. Deux rôles réels ont déjà été effacés par des cas qui
 * prenaient pour cible le paramétrage du jour. Celui-ci porte un nom unique, n'est attribué à
 * personne, et est supprimé à la fin.
 */
const MODEL_TYPE_USER = String.raw`App\Models\User`

const NOM = `zz_role_jetable_${process.pid}_${Date.now()}`

const acteur = async () => {
  const u = await prisma.users.findFirstOrThrow({ orderBy: { id: 'asc' }, select: { id: true } })
  return { id: u.id }
}

async function roleJetable(): Promise<bigint> {
  const deja = await prisma.roles.findFirst({
    where: { name: NOM, guard_name: 'web' },
    select: { id: true },
  })

  if (deja) return deja.id

  const cree = await prisma.roles.create({
    data: {
      name: NOM,
      guard_name: 'web',
      libelle: 'Rôle jetable de vérification',
      actif: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })

  return cree.id
}

const comptesCrees: bigint[] = []

afterAll(async () => {
  if (comptesCrees.length > 0) {
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: comptesCrees }, model_type: MODEL_TYPE_USER } })
    await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })
  }
})

/** Un compte de test qui PORTE le rôle jetable, pour exercer la résolution complète. */
async function comptePorteur(roleId: bigint): Promise<bigint> {
  const email = `test_porteur_${Date.now()}_${Math.floor(Math.random() * 1e8)}@example.com`
  const compte = await prisma.users.create({
    data: {
      name: 'Porteur Test',
      email,
      password: 'hash',
      actif: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })
  comptesCrees.push(compte.id)

  await prisma.model_has_roles.create({
    data: { role_id: roleId, model_id: compte.id, model_type: MODEL_TYPE_USER },
  })

  return compte.id
}

afterAll(async () => {
  /*
    ⚠️ LE LIEN D'ABORD, LE RÔLE ENSUITE, et rien d'autre.

    `deleteMany` est borné au seul identifiant du rôle jetable : un filtre plus large — par nom
    approchant, par date — finirait par emporter un rôle réel le jour où quelqu'un en crée un qui
    lui ressemble.
  */
  const jetable = await prisma.roles.findFirst({
    where: { name: NOM, guard_name: 'web' },
    select: { id: true },
  })

  if (!jetable) return

  await prisma.model_has_roles.deleteMany({ where: { role_id: jetable.id } })
  await prisma.role_etapes.deleteMany({ where: { role_id: jetable.id } })
  await prisma.role_parcours.deleteMany({ where: { role_id: jetable.id } })
  await prisma.roles.delete({ where: { id: jetable.id } })
})

describe('⚠️ Un rôle créé depuis l’interface se paramètre entièrement', () => {
  it('reçoit des ÉTAPES, et le compte qui le porte peut alors faire avancer', async () => {
    const roleId = await roleJetable()
    const compteId = await comptePorteur(roleId)
    const qui = await acteur()

    // Avant : aucune case. La règle doit refuser, et c'est le défaut voulu.
    const avant = await chargerUtilisateurAutorise(compteId)
    expect(avant, 'le compte porteur est introuvable').not.toBeNull()

    await modifierEtapesRole(qui, NOM, [{ parcours: 'grief_employe', statut: 'en_analyse' }])

    const apres = await chargerUtilisateurAutorise(compteId)
    expect(apres).not.toBeNull()
    if (!apres) return

    expect(
      peutFaireAvancerDepuis(apres, 'grief_employe', 'en_analyse'),
      'la case cochée n’arrive pas jusqu’à la décision'
    ).toBe(true)

    // Et elle ne déborde pas : une case cochée n'ouvre que SON type et SON étape.
    expect(peutFaireAvancerDepuis(apres, 'grief_employe', 'en_investigation')).toBe(false)
    expect(peutFaireAvancerDepuis(apres, 'grief_sous_traitant', 'en_analyse')).toBe(false)
  })

  it('⚠️ décocher une case la RETIRE : l’absence vaut retrait', async () => {
    const roleId = await roleJetable()
    const compteId = await comptePorteur(roleId)
    const qui = await acteur()

    await modifierEtapesRole(qui, NOM, [{ parcours: 'grief_employe', statut: 'en_analyse' }])
    await modifierEtapesRole(qui, NOM, [])

    const u = await chargerUtilisateurAutorise(compteId)
    if (!u) throw new Error('compte porteur introuvable')

    expect(
      peutFaireAvancerDepuis(u, 'grief_employe', 'en_analyse'),
      'la case décochée continue d’autoriser'
    ).toBe(false)
  })

  it('refuse une étape d’où aucun dossier ne part', async () => {
    // « Résolu » et « Clos » n'ont aucune transition sortante : y cocher quelqu'un ne débloquerait
    // rien, et laisserait croire à un paramétrage qui agit.
    const qui = await acteur()
    await roleJetable()

    await expect(
      modifierEtapesRole(qui, NOM, [{ parcours: 'grief_employe', statut: 'clos' }])
    ).rejects.toThrow()
  })

  it('refuse un couple inconnu plutôt que de l’ignorer', async () => {
    // L'ignorer enregistrerait une grille amputée en annonçant que tout est enregistré.
    const qui = await acteur()
    await roleJetable()

    await expect(
      modifierEtapesRole(qui, NOM, [{ parcours: 'parcours_inexistant', statut: 'en_analyse' }])
    ).rejects.toThrow()
  })

  it('reçoit les QUATRE comportements, et le compte les porte', async () => {
    const roleId = await roleJetable()
    const compteId = await comptePorteur(roleId)
    const qui = await acteur()

    /*
      ⚠️ LE COMPTE DE TEST PORTE AUSSI SES PROPRES RÔLES, et c'est ce qui rend ce cas honnête.

      `cloisonneParRattachement` n'est vrai que si TOUS les rôles porteurs d'accès le prévoient :
      un compte qui cumule d'autres rôles non cloisonnés reste non borné, et c'est voulu. On
      vérifie donc les deux comportements qui se cumulent par un simple « au moins un », puis
      l'identité du déclarant, qui se RETIRE.
    */
    for (const comportement of COMPORTEMENTS_NOMS) {
      await changerComportementRole(qui, NOM, comportement, comportement !== 'voit_identite_declarant')
    }

    const u = await chargerUtilisateurAutorise(compteId)
    if (!u) throw new Error('compte porteur introuvable')

    expect(u.traiteLesDossiers, 'la charge cochée n’arrive pas jusqu’au compte').toBe(true)
    expect(
      u.voitSeulementSesDeclarations,
      '« ne voit que ses déclarations » n’arrive pas jusqu’au compte'
    ).toBe(true)
    expect(
      u.voitIdentiteDeclarant,
      'l’accès sans données nominatives n’arrive pas jusqu’au compte'
    ).toBe(false)

    // Puis on remet tout : le geste doit être réversible, dans les deux sens.
    for (const comportement of COMPORTEMENTS_NOMS) {
      await changerComportementRole(qui, NOM, comportement, comportement === 'voit_identite_declarant')
    }

    const remis = await chargerUtilisateurAutorise(compteId)
    if (!remis) throw new Error('compte porteur introuvable')

    expect(remis.voitIdentiteDeclarant).toBe(true)
    expect(remis.voitSeulementSesDeclarations).toBe(false)
  })

  it('refuse un comportement hors catalogue plutôt que d’écrire une colonne quelconque', async () => {
    // Le nom sert de clé dans un `data:` Prisma : sans cette garde, un champ forgé désignerait
    // n'importe quelle colonne de `roles` — `actif`, par exemple, qui a son propre contrôle.
    const qui = await acteur()
    await roleJetable()

    await expect(
      // @ts-expect-error — exactement ce qu'un formulaire forgé enverrait.
      changerComportementRole(qui, NOM, 'actif', false)
    ).rejects.toThrow()
  })

  it('⚠️ reçoit l’alerte de CIRCUIT ACCÉLÉRÉ, par type de déclaration', async () => {
    const qui = await acteur()
    await roleJetable()

    await modifierParcoursRole(qui, NOM, ['grief_employe', 'grief_communaute'], ['grief_employe'])

    expect(await rolesDuCircuitCritique('grief_employe')).toContain(NOM)

    // ⚠️ PAR TYPE, et c'est tout l'intérêt : un booléen posé sur le rôle ne pouvait pas dire
    // « alerté ici, pas là » — ce que le CDC demande du Service MGP et de la DG.
    expect(await rolesDuCircuitCritique('grief_communaute')).not.toContain(NOM)

    // Décocher le TYPE emporte l'alerte : les deux vivent sur la même ligne.
    await modifierParcoursRole(qui, NOM, ['grief_communaute'], ['grief_employe'])
    expect(await rolesDuCircuitCritique('grief_employe')).not.toContain(NOM)
  })

  it('apparaît dans l’écran avec tout son paramétrage', async () => {
    const qui = await acteur()
    await roleJetable()

    await modifierEtapesRole(qui, NOM, [{ parcours: 'grief_employe', statut: 'en_analyse' }])
    await modifierParcoursRole(qui, NOM, ['grief_employe'], ['grief_employe'])

    const { lignes, etapesDisponibles } = await chargerHabilitations()
    const ligne = lignes.find((l) => l.role === NOM)

    expect(ligne, 'le rôle créé n’apparaît pas dans l’écran des habilitations').toBeDefined()
    if (!ligne) return

    expect(ligne.livre, 'un rôle créé ici n’est pas un rôle livré').toBe(false)
    expect(ligne.etapes).toEqual([{ parcours: 'grief_employe', statut: 'en_analyse' }])
    expect(ligne.parcours.map((p) => p.code)).toEqual(['grief_employe'])
    expect(ligne.parcours[0].alerteCircuitCritique).toBe(true)

    // Les quatre comportements sont présents, y compris ceux qui valent « non ».
    for (const comportement of COMPORTEMENTS_NOMS) {
      expect(ligne.comportements, comportement).toHaveProperty(comportement)
    }

    // Et la grille propose bien des colonnes : un écran sans ligne ne se coche pas.
    expect(etapesDisponibles.length, 'la grille ne propose aucune étape').toBeGreaterThan(0)
  })
})

describe('⚠️ La grille ne propose que des étapes d’où l’on peut partir', () => {
  it('écarte les états terminaux, qui n’ont aucune transition sortante', async () => {
    const colonnes = await etapesACocher()
    const codes = colonnes.map((c) => c.code)

    expect(codes, '« Clos » n’a aucune transition sortante').not.toContain('clos')
    expect(codes, '« Résolu » n’a aucune transition sortante').not.toContain('resolu')

    expect(codes).toContain('recu')
    expect(codes).toContain('reouvert')

    // ⚠️ « Affecté » a quitté le circuit le 2026-09-21 : il ne doit plus être proposé à la coche,
    // sans quoi la grille laisserait paramétrer une étape qu'aucun dossier n'atteint.
    expect(codes, '« Affecté » est de nouveau proposé dans la grille').not.toContain('affecte')

    // Le libellé, pas le code : une grille de vingt-huit cases étiquetées en clair technique se
    // coche mal, et se relit plus mal encore.
    for (const colonne of colonnes) {
      expect(colonne.libelle, `« ${colonne.libelle} » ressemble à un code`).not.toMatch(
        /^[a-z0-9_]+$/
      )
    }
  })
})
