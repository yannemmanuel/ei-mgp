import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, difference, journaliser, sansChangement, type ValeursAudit } from '../audit/journal'

/**
 * Niveaux de gravité administrables — cités par `docs/exigences-audit.md` §2 parmi les
 * référentiels modifiables, mais sans écran dans la baseline.
 *
 * **Ce qui reste immuable et pourquoi :**
 *
 * - `niveau` (1 à 4) ordonne l'échelle et sert de clé dans tout le code ; en changer la valeur
 *   réordonnerait silencieusement des dossiers déjà classés.
 * - `code` est une clé technique référencée ailleurs.
 * - `effet_circuit` commande le circuit accéléré (RG-08) : le passer à `accelere` sur un niveau
 *   bas déclencherait l'alerte Direction sur des déclarations ordinaires ; l'en retirer
 *   étoufferait l'alerte sur les déclarations critiques. Il reste modifiable — c'est bien une
 *   décision métier — mais l'écran l'annonce explicitement.
 */

type Acteur = { id: bigint }

export const EFFETS_CIRCUIT = ['standard', 'accelere'] as const
export type EffetCircuit = (typeof EFFETS_CIRCUIT)[number]

export const LIBELLES_EFFET: Record<EffetCircuit, string> = {
  standard: 'Circuit standard',
  accelere: 'Circuit accéléré (RG-08) — alerte immédiate de la Direction',
}

export type DonneesGravite = {
  libelle: string
  couleur: string | null
  effetCircuit: EffetCircuit
  actif: boolean
}

export async function listerGravites() {
  return prisma.niveaux_gravite.findMany({
    orderBy: { niveau: 'asc' },
    select: {
      id: true,
      niveau: true,
      code: true,
      libelle: true,
      couleur: true,
      effet_circuit: true,
      actif: true,
    },
  })
}

/** Couleur au format hexadécimal, ou rien : elle est injectée en style inline sur le tableau de bord. */
const COULEUR_VALIDE = /^#[0-9a-fA-F]{6}$/

export async function modifierGravite(
  acteur: Acteur,
  graviteId: bigint,
  donnees: DonneesGravite
): Promise<void> {
  if (donnees.libelle.trim() === '') {
    throw new ErreurWorkflow('Le libellé est obligatoire.')
  }

  if (donnees.couleur !== null && !COULEUR_VALIDE.test(donnees.couleur)) {
    // Rendue en style inline : une valeur libre y serait un vecteur d'injection.
    throw new ErreurWorkflow('La couleur doit être au format hexadécimal, par exemple #d4380d.')
  }

  if (!EFFETS_CIRCUIT.includes(donnees.effetCircuit)) {
    throw new ErreurWorkflow('Effet de circuit inconnu.')
  }

  const avant = await prisma.niveaux_gravite.findUniqueOrThrow({ where: { id: graviteId } })

  // Au moins un niveau doit rester actif : le formulaire de déclaration exige une gravité, et
  // désactiver le dernier rendrait toute déclaration impossible.
  if (avant.actif && !donnees.actif) {
    const autresActifs = await prisma.niveaux_gravite.count({
      where: { actif: true, NOT: { id: graviteId } },
    })

    if (autresActifs === 0) {
      throw new ErreurWorkflow(
        'Au moins un niveau de gravité doit rester actif : sans lui, aucune déclaration ne peut être déposée.'
      )
    }
  }

  const valeurs = {
    libelle: donnees.libelle.trim(),
    couleur: donnees.couleur,
    effet_circuit: donnees.effetCircuit,
    actif: donnees.actif,
  }

  await prisma.niveaux_gravite.update({
    where: { id: graviteId },
    data: { ...valeurs, updated_at: new Date() },
  })

  const ecart = difference(avant as unknown as ValeursAudit, valeurs)

  if (sansChangement(ecart)) return

  await journaliser({
    action: 'niveau_gravite.modifie',
    acteurId: acteur.id,
    auditableType: MODELES.niveauGravite,
    auditableId: String(graviteId),
    anciennes: ecart.anciennes,
    nouvelles: ecart.nouvelles,
  })
}
