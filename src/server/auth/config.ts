import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifierIdentifiants } from "./identifiants";
import { autoriserConnexion, reinitialiserConnexionCompte } from "./throttle";
import {
  identifiantUtilisateurAuth,
  journaliserConnexion,
  journaliserDeconnexion,
  journaliserEchecConnexion,
} from "./audit-authentification";

/**
 * Auth.js v5 — stratégie JWT.
 *
 * Choix structurant : le jeton ne porte QUE l'identité (l'identifiant utilisateur). Ni rôle ni
 * permission n'y est stocké — ils sont relus depuis la base à chaque vérification par
 * `src/server/authz`. Une désactivation ou un changement de rôle prend ainsi effet
 * immédiatement, sans attendre l'expiration du jeton.
 *
 * ⚠️ LA RAISON D'ORIGINE DE LA STRATÉGIE JWT A DISPARU, PAS LA STRATÉGIE. Elle avait été imposée
 * par une contrainte : la base était partagée avec une application encore en service et ne devait
 * recevoir aucune table nouvelle, alors que les adaptateurs Auth.js exigent
 * `Session`/`Account`/`VerificationToken`. Cette contrainte est levée.
 *
 * Le choix se tient désormais par lui-même : un jeton sans état évite une lecture de session à
 * chaque requête, là où les droits sont de toute façon relus en base. En changer demanderait
 * trois tables et une migration, pour un gain qui reste à démontrer.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
    // Deux heures d'inactivité — durée reprise du dispositif précédent, et jamais remise en
    // cause depuis. Un poste partagé ne doit pas rester ouvert sur des déclarations nominatives.
    maxAge: 120 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Adresse e-mail", type: "email" },
        password: { label: "Mot de passe", type: "password" },
        // Transmise par l'action de connexion : le fournisseur n'a pas accès à la requête.
        ip: { type: "text" },
      },
      async authorize(identifiants) {
        const email =
          typeof identifiants?.email === "string" ? identifiants.email : "";
        const motDePasse =
          typeof identifiants?.password === "string"
            ? identifiants.password
            : "";
        const ip =
          typeof identifiants?.ip === "string" ? identifiants.ip : "inconnue";

        if (email === "" || motDePasse === "") {
          return null;
        }

        if (!(await autoriserConnexion(email, ip))) {
          await journaliserEchecConnexion(email, "trop_de_tentatives");
          throw new Error("TROP_DE_TENTATIVES");
        }

        const resultat = await verifierIdentifiants(email, motDePasse);

        if (resultat.statut !== "ok") {
          await journaliserEchecConnexion(email, resultat.statut);
          // Message générique côté interface : ne jamais révéler si le compte existe, s'il est
          // désactivé, ou si seul le mot de passe est faux.
          return null;
        }

        // Le succès prouve le contrôle du compte : ses échecs antérieurs ne doivent plus le
        // bloquer. Le compteur IP, lui, reste global et ne peut pas être remis à zéro en se
        // connectant avec un seul compte connu avant de reprendre un balayage.
        await reinitialiserConnexionCompte(email);

        // `id` doit être une chaîne pour Auth.js ; les identifiants sont des bigint en base.
        return { id: resultat.userId.toString() };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      const utilisateurId = identifiantUtilisateurAuth(user.id);
      if (utilisateurId !== null) await journaliserConnexion(utilisateurId);
    },
    async signOut(message) {
      const utilisateurId = identifiantUtilisateurAuth(
        "token" in message ? message.token?.sub : message.session?.userId,
      );
      if (utilisateurId !== null) await journaliserDeconnexion(utilisateurId);
    },
  },
});
