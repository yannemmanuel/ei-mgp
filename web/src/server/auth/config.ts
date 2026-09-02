import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { verifierIdentifiants } from './identifiants'
import { autoriserTentative, cleThrottle, reinitialiserTentatives } from './throttle'

/**
 * Auth.js v5 — stratégie JWT.
 *
 * Choix structurant : le jeton ne porte QUE l'identité (l'identifiant utilisateur). Ni rôle ni
 * permission n'y est stocké — ils sont relus depuis la base à chaque vérification par
 * `src/server/authz`. C'est la sémantique de spatie/laravel-permission : une désactivation ou un
 * changement de rôle prend effet immédiatement, sans attendre l'expiration du jeton.
 *
 * La stratégie JWT (plutôt qu'un adaptateur base de données) est imposée par une contrainte du
 * projet : la base est partagée avec Laravel encore en service et ne doit recevoir aucune table
 * nouvelle — or les adaptateurs Auth.js exigent `Session`/`Account`/`VerificationToken`.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: 'jwt',
    // Aligné sur SESSION_LIFETIME de Laravel (120 minutes).
    maxAge: 120 * 60,
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Adresse e-mail', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
        // Transmise par l'action de connexion : le fournisseur n'a pas accès à la requête.
        ip: { type: 'text' },
      },
      async authorize(identifiants) {
        const email = typeof identifiants?.email === 'string' ? identifiants.email : ''
        const motDePasse = typeof identifiants?.password === 'string' ? identifiants.password : ''
        const ip = typeof identifiants?.ip === 'string' ? identifiants.ip : 'inconnue'

        if (email === '' || motDePasse === '') {
          return null
        }

        const cle = cleThrottle(email, ip)

        if (!autoriserTentative(cle)) {
          throw new Error('TROP_DE_TENTATIVES')
        }

        const resultat = await verifierIdentifiants(email, motDePasse)

        if (resultat.statut !== 'ok') {
          // Message générique côté interface : ne jamais révéler si le compte existe, s'il est
          // désactivé, ou si seul le mot de passe est faux.
          return null
        }

        reinitialiserTentatives(cle)

        // `id` doit être une chaîne pour Auth.js ; les identifiants sont des bigint en base.
        return { id: resultat.userId.toString() }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id
      }
      return token
    },
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
})
