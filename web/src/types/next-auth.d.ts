import 'next-auth'

/**
 * La session ne transporte QUE l'identifiant utilisateur : rôles et permissions sont relus en
 * base à chaque vérification (cf. `src/server/authz`). Ne jamais ajouter de rôle ni de
 * permission ici — ce serait réintroduire des droits figés dans le jeton, et une désactivation
 * ou un retrait de rôle ne prendrait plus effet immédiatement.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    }
  }

  interface User {
    id: string
  }
}
