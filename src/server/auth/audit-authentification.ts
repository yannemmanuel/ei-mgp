import { createHash } from 'node:crypto'
import { MODELES, journaliser } from '@/server/services/audit/journal'

export type MotifEchecConnexion =
  | 'identifiants_invalides'
  | 'compte_desactive'
  | 'trop_de_tentatives'

/** Une adresse saisie à la connexion ne doit jamais être recopiée en clair dans le journal. */
function empreinteIdentifiant(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export function journaliserConnexion(utilisateurId: bigint): Promise<void> {
  return journaliser({
    action: 'auth.connexion',
    acteurId: utilisateurId,
    auditableType: MODELES.utilisateur,
    auditableId: String(utilisateurId),
  })
}

export function journaliserDeconnexion(utilisateurId: bigint): Promise<void> {
  return journaliser({
    action: 'auth.deconnexion',
    acteurId: utilisateurId,
    auditableType: MODELES.utilisateur,
    auditableId: String(utilisateurId),
  })
}

export function journaliserEchecConnexion(
  email: string,
  motif: MotifEchecConnexion
): Promise<void> {
  return journaliser({
    action: 'auth.tentative_echouee',
    nouvelles: {
      motif,
      identifiant_empreinte: empreinteIdentifiant(email),
    },
  })
}

/** Convertit prudemment l'identifiant porté par Auth.js ; un jeton incomplet n'est pas audité. */
export function identifiantUtilisateurAuth(valeur: unknown): bigint | null {
  if (typeof valeur !== 'string' || !/^\d+$/.test(valeur)) return null

  try {
    return BigInt(valeur)
  } catch {
    return null
  }
}
