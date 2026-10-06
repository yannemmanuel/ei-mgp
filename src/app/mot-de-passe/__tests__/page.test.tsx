import { describe, expect, it, vi } from 'vitest'

/**
 * ⚠️ RÉGRESSION : la page du mot de passe se redirigeait vers elle-même à l'infini.
 *
 * `exigerUtilisateur()` renvoie vers `/mot-de-passe` tout compte qui doit changer son mot de passe.
 * La page l'appelait elle-même : exactement les comptes qu'elle doit servir — mot de passe fixé
 * par un administrateur — tournaient en boucle sans jamais l'afficher.
 */
const utilisateurAChanger = { id: 1n, actif: true, doitChangerMotDePasse: true }

vi.mock('@/server/auth', () => ({
  exigerUtilisateurAuthentifie: vi.fn(async () => utilisateurAChanger),
  exigerUtilisateur: vi.fn(async () => {
    throw new Error('NEXT_REDIRECT /mot-de-passe : la page se redirige vers elle-même')
  }),
}))
vi.mock('../../(app)/actions', () => ({ seDeconnecter: vi.fn() }))
vi.mock('../formulaire', () => ({ FormulaireMotDePasse: () => null }))

describe('Page /mot-de-passe', () => {
  it('s’affiche pour un compte qui doit changer son mot de passe, sans se rediriger', async () => {
    const { default: PageMotDePasse } = await import('../page')

    await expect(PageMotDePasse()).resolves.toBeTruthy()
  })
})
