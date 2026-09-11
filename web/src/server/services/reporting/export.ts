import { prisma } from '@/lib/prisma'
import { clauseFiltre, type FiltreReporting } from './filtre'

/**
 * EX-REP-04/06 : lignes d'export des dossiers — port de `App\Exports\DossiersExport`.
 *
 * RG-14 : les colonnes nominatives ne sont produites que si `inclureNominatif` est vrai. Ce
 * module **ne vérifie aucune autorisation** : il obéit au drapeau reçu. La décision appartient à
 * l'appelant, après vérification de `peutExporterNominatif()` — un seul endroit qui décide, un
 * seul endroit à auditer.
 *
 * Pour un dossier anonyme il n'existe aucune ligne `declaration_identites` : les colonnes
 * nominatives y sont vides par construction, et non par filtrage — RG-06 ne dépend donc pas de
 * la correction de ce module.
 */

export type LigneExport = {
  reference: string
  parcours: string
  categorie: string
  gravite: string
  statut: string
  anonyme: string
  soumisLe: string
  clotureLe: string
  nomDeclarant?: string
  email?: string
  telephone?: string
}

export const COLONNES_BASE = [
  'Référence',
  'Parcours',
  'Catégorie',
  'Gravité',
  'Statut',
  'Anonyme',
  'Date de soumission',
  'Date de clôture',
] as const

export const COLONNES_NOMINATIVES = ['Nom du déclarant', 'Email', 'Téléphone'] as const

export function colonnes(inclureNominatif: boolean): string[] {
  return inclureNominatif
    ? [...COLONNES_BASE, ...COLONNES_NOMINATIVES]
    : [...COLONNES_BASE]
}

export function cellules(ligne: LigneExport, inclureNominatif: boolean): string[] {
  const base = [
    ligne.reference,
    ligne.parcours,
    ligne.categorie,
    ligne.gravite,
    ligne.statut,
    ligne.anonyme,
    ligne.soumisLe,
    ligne.clotureLe,
  ]

  return inclureNominatif
    ? [...base, ligne.nomDeclarant ?? '', ligne.email ?? '', ligne.telephone ?? '']
    : base
}

const dateFr = (date: Date | null | undefined): string =>
  date ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' }).format(date) : '—'

export async function lignesExport(
  filtre: FiltreReporting,
  inclureNominatif: boolean
): Promise<LigneExport[]> {
  const dossiers = await prisma.dossiers.findMany({
    where: clauseFiltre(filtre),
    orderBy: { reference: 'asc' },
    select: {
      reference: true,
      is_anonymous: true,
      created_at: true,
      date_cloture: true,
      parcours: { select: { libelle: true } },
      categories: { select: { libelle: true } },
      niveaux_gravite: { select: { libelle: true } },
      statuts_dossier: { select: { libelle_interne: true } },
      // La jointure elle-même est conditionnée : sans autorisation nominative, les identités ne
      // sont même pas lues. Une donnée jamais chargée ne peut pas fuiter par un oubli d'affichage.
      declaration_identites: inclureNominatif
        ? { select: { nom_prenom: true, contact_email: true, contact_telephone: true } }
        : false,
    },
  })

  return dossiers.map((d) => ({
    reference: d.reference,
    parcours: d.parcours.libelle,
    categorie: d.categories.libelle,
    gravite: d.niveaux_gravite?.libelle ?? 'À qualifier',
    statut: d.statuts_dossier.libelle_interne,
    anonyme: d.is_anonymous ? 'Oui' : 'Non',
    soumisLe: dateFr(d.created_at),
    clotureLe: dateFr(d.date_cloture),
    ...(inclureNominatif
      ? {
          nomDeclarant: d.declaration_identites?.nom_prenom ?? '',
          email: d.declaration_identites?.contact_email ?? '',
          telephone: d.declaration_identites?.contact_telephone ?? '',
        }
      : {}),
  }))
}
