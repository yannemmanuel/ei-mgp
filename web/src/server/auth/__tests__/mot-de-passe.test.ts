import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { nettoyerAudit } from '@/server/services/declaration/__tests__/aide-base'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  enregistrerUtilisateur,
  regenererMotDePasse,
} from '@/server/services/administration/utilisateurs'
import { verifier } from '../hachage'
import { changerMotDePasse, LONGUEUR_MINIMALE, OCTETS_MAXIMUM } from '../mot-de-passe'

/**
 * Changement de mot de passe par son porteur.
 *
 * L'écran existe pour une raison précise : un mot de passe créé par un administrateur lui reste
 * connu, et l'est peut-être resté du canal par lequel il a été transmis. Tant qu'il n'a pas été
 * remplacé, une action faite sous ce compte n'est imputable à personne avec certitude.
 */
const MODEL_TYPE_USER = String.raw`App\Models\User`
const comptesCrees: bigint[] = []

const VALIDE = 'phrase de passe assez longue'

async function acteur() {
  const utilisateur = await prisma.users.findFirstOrThrow({ select: { id: true } })
  return { id: utilisateur.id }
}

async function creerCompte() {
  const resultat = await enregistrerUtilisateur(await acteur(), {
    name: 'Compte de test — mot de passe',
    email: `test-mdp-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
    matricule: null,
    poste: null,
    directionId: null,
    siteId: null,
    responsableHierarchiqueId: null,
    actif: true,
    roles: [],
    parcours: [],
  })

  comptesCrees.push(resultat.utilisateurId)
  return resultat
}

const etat = (id: bigint) =>
  prisma.users.findUniqueOrThrow({
    where: { id },
    select: { password: true, doit_changer_mot_de_passe: true },
  })

afterEach(async () => {
  if (comptesCrees.length === 0) return

  await prisma.audit_logs.deleteMany({ where: { user_id: { in: comptesCrees } } })
  await nettoyerAudit(MODEL_TYPE_USER, comptesCrees)
  await prisma.model_has_roles.deleteMany({
    where: { model_type: MODEL_TYPE_USER, model_id: { in: comptesCrees } },
  })
  await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })
  comptesCrees.length = 0
})

describe('Un mot de passe fixé par un tiers est provisoire', () => {
  it('marque le compte créé comme devant changer', async () => {
    const { utilisateurId } = await creerCompte()

    expect((await etat(utilisateurId)).doit_changer_mot_de_passe).toBe(true)
  })

  it('remarque le compte après une régénération, même une fois l’obligation levée', async () => {
    const { utilisateurId, motDePasseInitial } = await creerCompte()

    await changerMotDePasse({
      utilisateurId,
      actuel: motDePasseInitial!,
      nouveau: VALIDE,
      confirmation: VALIDE,
    })
    expect((await etat(utilisateurId)).doit_changer_mot_de_passe).toBe(false)

    await regenererMotDePasse(await acteur(), utilisateurId)

    // Une régénération n'est pas une première connexion, mais appelle la même correction : la
    // valeur vient d'être lue par quelqu'un d'autre.
    expect((await etat(utilisateurId)).doit_changer_mot_de_passe).toBe(true)
  })
})

describe('Changement', () => {
  it('remplace le mot de passe et lève l’obligation', async () => {
    const { utilisateurId, motDePasseInitial } = await creerCompte()
    expect(motDePasseInitial).not.toBeNull()

    await changerMotDePasse({
      utilisateurId,
      actuel: motDePasseInitial!,
      nouveau: VALIDE,
      confirmation: VALIDE,
    })

    const apres = await etat(utilisateurId)

    expect(apres.doit_changer_mot_de_passe).toBe(false)
    expect(await verifier(VALIDE, apres.password!)).toBe(true)
    expect(await verifier(motDePasseInitial!, apres.password!)).toBe(false)
    // Compatibilité PHP : le préfixe doit rester `$2y$`, comme partout ailleurs.
    expect(apres.password!.startsWith('$2y$')).toBe(true)
  })

  it('exige le mot de passe actuel, même sur une session ouverte', async () => {
    // Sans cela, un poste laissé déverrouillé quelques secondes suffirait à s'approprier le
    // compte : le voleur en changerait la clé sans avoir jamais connu l'ancienne.
    const { utilisateurId, motDePasseInitial } = await creerCompte()

    await expect(
      changerMotDePasse({
        utilisateurId,
        actuel: 'ce-n-est-pas-le-bon',
        nouveau: VALIDE,
        confirmation: VALIDE,
      })
    ).rejects.toThrow(ErreurWorkflow)

    // Rien n'a bougé : ni la valeur, ni l'obligation.
    const apres = await etat(utilisateurId)
    expect(await verifier(motDePasseInitial!, apres.password!)).toBe(true)
    expect(apres.doit_changer_mot_de_passe).toBe(true)
  })

  it('refuse une confirmation divergente, une valeur trop courte, ou la même qu’avant', async () => {
    const { utilisateurId, motDePasseInitial } = await creerCompte()
    const commun = { utilisateurId, actuel: motDePasseInitial! }

    await expect(
      changerMotDePasse({ ...commun, nouveau: VALIDE, confirmation: VALIDE + 'x' })
    ).rejects.toThrow(/correspondent pas/i)

    await expect(
      changerMotDePasse({
        ...commun,
        nouveau: 'a'.repeat(LONGUEUR_MINIMALE - 1),
        confirmation: 'a'.repeat(LONGUEUR_MINIMALE - 1),
      })
    ).rejects.toThrow(new RegExp(`${LONGUEUR_MINIMALE} caractères`))

    await expect(
      changerMotDePasse({ ...commun, nouveau: motDePasseInitial!, confirmation: motDePasseInitial! })
    ).rejects.toThrow(/différent/i)
  })

  it('refuse au-delà de la borne bcrypt, mesurée en OCTETS', async () => {
    /**
     * bcrypt ignore silencieusement tout ce qui dépasse 72 octets. Accepter plus long donnerait
     * l'illusion d'une phrase robuste dont seuls les 72 premiers octets comptent — et deux valeurs
     * différant après cette borne ouvriraient le même compte.
     */
    const { utilisateurId, motDePasseInitial } = await creerCompte()

    // 40 caractères accentués = 80 octets en UTF-8 : sous la limite en caractères, au-dessus en
    // octets. C'est le cas que compter les caractères laisserait passer.
    const accents = 'é'.repeat(40)
    expect(accents.length).toBeLessThan(OCTETS_MAXIMUM)
    expect(new TextEncoder().encode(accents).length).toBeGreaterThan(OCTETS_MAXIMUM)

    await expect(
      changerMotDePasse({
        utilisateurId,
        actuel: motDePasseInitial!,
        nouveau: accents,
        confirmation: accents,
      })
    ).rejects.toThrow(/octets/i)
  })

  it('journalise le fait, jamais la valeur ni son empreinte', async () => {
    const { utilisateurId, motDePasseInitial } = await creerCompte()

    await changerMotDePasse({
      utilisateurId,
      actuel: motDePasseInitial!,
      nouveau: VALIDE,
      confirmation: VALIDE,
    })

    const traces = await prisma.audit_logs.findMany({
      where: {
        action: 'user.mot_de_passe_change',
        auditable_type: MODEL_TYPE_USER,
        auditable_id: String(utilisateurId),
      },
      orderBy: { id: 'asc' },
      select: { user_id: true, old_values: true, new_values: true },
    })

    expect(traces).toHaveLength(1)
    // L'auteur est le porteur lui-même : c'est ce qui distingue ce geste d'une régénération.
    expect(traces[0].user_id).toBe(utilisateurId)

    const contenu = JSON.stringify({ old: traces[0].old_values, new: traces[0].new_values })
    expect(contenu).not.toContain(VALIDE)
    expect(contenu).not.toContain(motDePasseInitial!)
    expect(contenu).not.toContain('$2y$')
  })
})

describe('Le passage obligé, et l’absence de boucle', () => {
  it('la coquille du back-office redirige, et l’écran vit HORS de cette coquille', async () => {
    /**
     * Deux propriétés qui n'ont de sens qu'ensemble, et qu'aucun test d'exécution ne peut
     * atteindre — un layout ne s'appelle pas hors requête.
     *
     * Si l'écran vivait sous `(app)`, la redirection le renverrait vers lui-même : boucle
     * infinie, et un compte définitivement inaccessible. C'est le genre de défaut qui ne se voit
     * qu'en production, sur le premier compte créé.
     */
    const source = await import('node:fs/promises')
    const layout = await source.readFile('src/app/(app)/layout.tsx', 'utf8')

    expect(layout).toContain('utilisateur.doitChangerMotDePasse')
    expect(layout).toContain("redirect('/mot-de-passe')")

    const { existsSync } = await import('node:fs')
    expect(existsSync('src/app/mot-de-passe/page.tsx'), 'écran attendu hors du groupe (app)').toBe(true)
    expect(existsSync('src/app/(app)/mot-de-passe/page.tsx'), 'écran placé sous la coquille : boucle').toBe(false)
  })

  it('l’action vise le compte de la session, jamais un identifiant reçu du formulaire', async () => {
    // Accepter une cible de l'extérieur ferait de cet écran un moyen de s'emparer du compte
    // d'autrui, quelle que soit la vérification qui l'accompagnerait.
    const source = await import('node:fs/promises')
    const action = await source.readFile('src/app/mot-de-passe/actions.ts', 'utf8')

    expect(action).toContain('utilisateurId: utilisateur.id')
    expect(action).not.toMatch(/donnees\.get\('utilisateurId'\)/)
    expect(action).toContain('exigerUtilisateur()')
  })
})
