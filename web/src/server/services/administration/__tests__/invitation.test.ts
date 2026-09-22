import { afterAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { verifier } from '@/server/auth/hachage'
import { verifierIdentifiants } from '@/server/auth/identifiants'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  VALIDITE_HEURES,
  consommerInvitation,
  creerInvitation,
  verifierInvitation,
} from '../invitation'
import { MODELES } from '@/server/modeles'

/**
 * Le lien de première connexion.
 *
 * Il remplace l'envoi du mot de passe lui-même : ce qui est vérifié ici, c'est qu'il ouvre le
 * compte UNE fois, qu'il se referme derrière, et qu'il ne laisse rien d'exploitable en base.
 */
const MOT_DE_PASSE = 'une phrase de passe bien assez longue'
const comptesCrees: bigint[] = []

async function compteSansMotDePasse(): Promise<bigint> {
  const compte = await prisma.users.create({
    data: {
      name: 'Invité de test',
      email: `test-invit-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
      // Le cœur du procédé : aucun mot de passe. Le lien est la seule porte.
      password: null,
      actif: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })

  comptesCrees.push(compte.id)
  return compte.id
}

// ⚠️ Borné aux comptes fabriqués ici : jamais de suppression large sur `users`.
afterAll(async () => {
  if (comptesCrees.length === 0) return

  await prisma.invitations_connexion.deleteMany({ where: { user_id: { in: comptesCrees } } })
  await prisma.audit_logs.deleteMany({
    where: {
      auditable_type: MODELES.utilisateur,
      auditable_id: { in: comptesCrees.map(String) },
    },
  })
  await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })
})

describe('Le lien ouvre le compte, une fois', () => {
  it('fixe le mot de passe choisi et permet de se connecter', async () => {
    const id = await compteSansMotDePasse()
    const compte = await prisma.users.findUniqueOrThrow({ where: { id }, select: { email: true } })

    // Avant : aucun mot de passe n'ouvre ce compte, pas même une chaîne vide.
    expect((await verifierIdentifiants(compte.email, MOT_DE_PASSE)).statut).toBe(
      'identifiants_invalides'
    )

    const jeton = await creerInvitation(id)
    await consommerInvitation({
      jeton,
      motDePasse: MOT_DE_PASSE,
      confirmation: MOT_DE_PASSE,
    })

    // Après : il ouvre, et l'obligation de changement est levée — la personne a choisi sa valeur.
    const apres = await prisma.users.findUniqueOrThrow({
      where: { id },
      select: { password: true, doit_changer_mot_de_passe: true },
    })

    expect(apres.doit_changer_mot_de_passe).toBe(false)
    expect(await verifier(MOT_DE_PASSE, apres.password!)).toBe(true)
    expect((await verifierIdentifiants(compte.email, MOT_DE_PASSE)).statut).toBe('ok')
  })

  it('⚠️ refuse la SECONDE utilisation', async () => {
    // Le lien circule par courriel : il traîne dans une boîte de réception. S'il restait
    // réutilisable, quiconque remettrait la main sur le message reprendrait le compte.
    const jeton = await creerInvitation(await compteSansMotDePasse())

    await consommerInvitation({ jeton, motDePasse: MOT_DE_PASSE, confirmation: MOT_DE_PASSE })

    expect(await verifierInvitation(jeton)).toEqual({ etat: 'deja_utilise' })
    await expect(
      consommerInvitation({ jeton, motDePasse: 'un autre mot de passe long', confirmation: 'un autre mot de passe long' })
    ).rejects.toThrow(ErreurWorkflow)
  })

  it('⚠️ réémettre COUPE le lien précédent', async () => {
    /*
      Réémettre est le geste qu'on fait quand on craint qu'un message se soit perdu. S'il
      ajoutait une clé au lieu de remplacer la précédente, chaque doute multiplierait les portes
      ouvertes — et l'ancien courriel, peut-être égaré, resterait valable trois jours.
    */
    const id = await compteSansMotDePasse()
    const ancien = await creerInvitation(id)
    const nouveau = await creerInvitation(id)

    expect((await verifierInvitation(ancien)).etat).toBe('expire')
    expect((await verifierInvitation(nouveau)).etat).toBe('valide')
  })

  it('refuse un jeton inconnu, sans dire si un compte existe', async () => {
    expect(await verifierInvitation('jeton-totalement-invente')).toEqual({ etat: 'invalide' })
  })

  it('refuse le lien d’un compte désactivé', async () => {
    // Désactiver un compte doit couper toutes ses portes, y compris celle qu'on lui a ouverte
    // la veille et qu'il n'a pas encore franchie.
    const id = await compteSansMotDePasse()
    const jeton = await creerInvitation(id)

    await prisma.users.update({ where: { id }, data: { actif: false } })

    expect(await verifierInvitation(jeton)).toEqual({ etat: 'invalide' })
  })

  it('refuse un lien expiré', async () => {
    const id = await compteSansMotDePasse()
    const jeton = await creerInvitation(id)

    // On avance l'échéance plutôt que l'horloge : plus simple, et cela exerce la même comparaison.
    await prisma.invitations_connexion.updateMany({
      where: { user_id: id },
      data: { expire_le: new Date(Date.now() - 1000) },
    })

    expect(await verifierInvitation(jeton)).toEqual({ etat: 'expire' })
  })
})

describe('Ce que la base retient', () => {
  it('⚠️ ne stocke JAMAIS le jeton en clair', async () => {
    /*
      Une base exportée, une sauvegarde égarée : si le jeton y figurait tel quel, chaque ligne
      encore valable serait une clé prête à l'emploi. Seule son empreinte est retenue.
    */
    const id = await compteSansMotDePasse()
    const jeton = await creerInvitation(id)

    const ligne = await prisma.invitations_connexion.findFirstOrThrow({
      where: { user_id: id },
      select: { token_hash: true, expire_le: true, utilise_le: true },
    })

    expect(ligne.token_hash, 'le jeton est stocké tel quel').not.toBe(jeton)
    expect(ligne.token_hash).toBe(createHash('sha256').update(jeton).digest('hex'))
    expect(ligne.utilise_le).toBeNull()
  })

  it('pose l’échéance à la durée annoncée', async () => {
    const id = await compteSansMotDePasse()
    await creerInvitation(id)

    const ligne = await prisma.invitations_connexion.findFirstOrThrow({
      where: { user_id: id },
      select: { expire_le: true },
    })

    const heures = (ligne.expire_le.getTime() - Date.now()) / 3_600_000

    /*
      Tolérance des deux côtés, et pas seulement vers le bas.

      `expire_le` est un `TIMESTAMP(0)` : Postgres arrondit à la seconde la plus proche, vers le
      HAUT au-delà d'une demi-seconde. L'échéance stockée peut donc dépasser très légèrement la
      durée annoncée — une borne stricte à `<= VALIDITE_HEURES` échouait une fois sur deux, selon
      la milliseconde d'écriture.
    */
    const UNE_SECONDE = 1 / 3600

    expect(heures).toBeGreaterThan(VALIDITE_HEURES - UNE_SECONDE * 60)
    expect(heures).toBeLessThan(VALIDITE_HEURES + UNE_SECONDE)
  })

  it('conserve la ligne après usage, pour distinguer consommé d’inconnu', async () => {
    const id = await compteSansMotDePasse()
    const jeton = await creerInvitation(id)

    await consommerInvitation({ jeton, motDePasse: MOT_DE_PASSE, confirmation: MOT_DE_PASSE })

    const ligne = await prisma.invitations_connexion.findFirstOrThrow({
      where: { user_id: id },
      select: { utilise_le: true },
    })

    expect(ligne.utilise_le, 'la ligne a été supprimée : « déjà servi » devient « inconnu »').not.toBeNull()
  })
})

describe('Les règles du mot de passe sont celles de partout ailleurs', () => {
  it('refuse trop court, et les deux saisies divergentes', async () => {
    const jeton = await creerInvitation(await compteSansMotDePasse())

    await expect(
      consommerInvitation({ jeton, motDePasse: 'court', confirmation: 'court' })
    ).rejects.toThrow(/12 caractères/)

    await expect(
      consommerInvitation({ jeton, motDePasse: MOT_DE_PASSE, confirmation: 'autre chose encore' })
    ).rejects.toThrow(/ne correspondent pas/)

    // ⚠️ Et le lien n'a PAS été consommé par ces refus : une faute de frappe ne doit pas
    // condamner le compte.
    expect((await verifierInvitation(jeton)).etat).toBe('valide')
  })
})

describe('Réattribuer un mot de passe ferme le lien', () => {
  it('⚠️ expire l’invitation en attente', async () => {
    /*
      Sans cela, le compte aurait DEUX portes : le mot de passe que l'administrateur vient de
      lire, et un lien encore valable qui traîne dans une boîte de réception.

      Le cas se produit à chaque échec d'envoi : la création bascule alors sur un mot de passe, et
      l'invitation émise juste avant — qui n'a atteint personne — doit cesser de valoir.
    */
    const { regenererMotDePasse } = await import('../utilisateurs')

    const id = await compteSansMotDePasse()
    const jeton = await creerInvitation(id)

    expect((await verifierInvitation(jeton)).etat, 'le lien n’est pas valide au départ').toBe('valide')

    const acteur = await prisma.users.findFirstOrThrow({
      where: { actif: true, NOT: { id } },
      select: { id: true },
    })
    await regenererMotDePasse({ id: acteur.id }, id)

    expect((await verifierInvitation(jeton)).etat, 'le lien survit au nouveau mot de passe').toBe(
      'expire'
    )
  })
})
