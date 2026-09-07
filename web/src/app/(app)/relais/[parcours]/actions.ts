'use server'

import { utilisateurCourant } from '@/server/auth'
import { aPermission } from '@/server/authz'
import {
  traiterSoumission,
  type EtatSoumission,
} from '@/server/services/declaration/soumission'

/**
 * EX-DEC-10 : saisie relais — un agent transcrit la déclaration d'un tiers reçue par ligne
 * verte, boîte à suggestions ou en direct.
 *
 * RG-13 : le canal d'origine est tracé, et la déclaration suit ensuite le MÊME workflow qu'une
 * déclaration directe. C'est pourquoi cette action ne fait qu'authentifier puis déléguer à
 * `traiterSoumission`, partagé avec le formulaire public.
 *
 * L'agent n'est jamais enregistré comme déclarant : il est tracé comme téléverseur des pièces.
 * Confondre les deux attribuerait à un salarié une déclaration qui n'est pas la sienne.
 */
export async function soumettreDeclarationRelais(
  _precedent: EtatSoumission,
  donnees: FormData
): Promise<EtatSoumission> {
  const utilisateur = await utilisateurCourant()

  // Revérifié ici et pas seulement à l'affichage de la page : une action serveur est une entrée
  // réseau à part entière.
  if (!utilisateur || !aPermission(utilisateur, 'dossiers.create')) {
    return { erreurGenerale: "Vous n'êtes pas autorisé à saisir une déclaration." }
  }

  return traiterSoumission(donnees, { viaRelais: true, agentId: utilisateur.id })
}
