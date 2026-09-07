import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import { aPermission, parcoursAutorises, peutExporter, peutExporterNominatif } from '@/server/authz'
import { calculerIndicateurs, type LigneRepartition } from '@/server/services/reporting/indicateurs'
import { filtreDepuisParametres } from '@/server/services/reporting/filtre'
import { historiqueMensuel } from '@/server/services/reporting/statistiques-mensuelles'
import { FiltresReporting } from './filtres'
import { BoutonsExport } from './boutons-export'

export const metadata: Metadata = { title: 'Tableau de bord' }

// Les indicateurs reflètent l'état courant de la base : jamais de rendu figé à la compilation.
export const dynamic = 'force-dynamic'

/**
 * EX-REP-01/02/03/05 : tableau de bord consolidé — port de
 * `App\Livewire\Reporting\DashboardConsolide`.
 *
 * `/dashboard` est la page d'atterrissage de TOUS les comptes authentifiés : elle ne renvoie
 * jamais un refus. Le contenu se ramifie selon `reporting.view` (DT-31) — vue consolidée pour
 * les rôles transverses, résumé personnel pour les rôles de traitement.
 */
export default async function PageTableauDeBord({ searchParams }: PageProps<'/dashboard'>) {
  const utilisateur = await exigerUtilisateur()
  const parametres = await searchParams

  const voitLeRapport = aPermission(utilisateur, 'reporting.view')
  const filtre = filtreDepuisParametres(parametres)

  const [mesDossiers, mesAffectations] = await Promise.all([
    dossiersATraiter(utilisateur.id),
    prisma.dossier_affectations.count({ where: { user_id: utilisateur.id, actif: true } }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-secondary-900">Tableau de bord</h1>
        {voitLeRapport && peutExporter(utilisateur) && (
          <BoutonsExport peutNominatif={peutExporterNominatif(utilisateur)} />
        )}
      </div>

      {voitLeRapport ? (
        <VueConsolidee filtre={filtre} parametres={parametres} roles={utilisateur.roles} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Votre activité</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-secondary-700">
              {mesAffectations === 0
                ? 'Aucun dossier ne vous est actuellement affecté.'
                : `${mesAffectations} dossier(s) vous sont actuellement affectés.`}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Vos dossiers à traiter</CardTitle>
        </CardHeader>
        <CardContent>
          {mesDossiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun dossier affecté.</p>
          ) : (
            <ul className="divide-y divide-border">
              {mesDossiers.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/dossiers/${d.id}`} className="text-sm hover:underline">
                    <span className="font-mono text-muted-foreground">{d.reference}</span>{' '}
                    <span className="text-secondary-900">{d.categories.libelle}</span>
                  </Link>
                  <Badge variant="secondary">{d.statuts_dossier.libelle_interne}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Aperçu borné par construction (les affectations d'un seul compte) : pas de risque de N+1. */
async function dossiersATraiter(utilisateurId: bigint) {
  return prisma.dossiers.findMany({
    where: { dossier_affectations: { some: { user_id: utilisateurId, actif: true } } },
    orderBy: { updated_at: 'desc' },
    take: 5,
    select: {
      id: true,
      reference: true,
      categories: { select: { libelle: true } },
      statuts_dossier: { select: { libelle_interne: true } },
    },
  })
}

async function VueConsolidee({
  filtre,
  parametres,
  roles,
}: {
  filtre: ReturnType<typeof filtreDepuisParametres>
  parametres: Record<string, string | string[] | undefined>
  roles: readonly string[]
}) {
  const codes = parcoursAutorises(roles as Parameters<typeof parcoursAutorises>[0])

  const [indicateurs, historique, referentiels, aTraiter] = await Promise.all([
    calculerIndicateurs(filtre),
    historiqueMensuel(),
    chargerReferentiels(filtre.parcoursId ?? null),
    blocATraiter(codes),
  ])

  const valeurs = Object.fromEntries(
    Object.entries(parametres).map(([cle, valeur]) => [
      cle,
      Array.isArray(valeur) ? valeur[0] : valeur,
    ])
  )

  return (
    <>
      <FiltresReporting referentiels={referentiels} valeurs={valeurs} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicateur libelle="Déclarations" valeur={String(indicateurs.total)} />
        <Indicateur libelle="Taux de résolution" valeur={pourcent(indicateurs.tauxResolution)} />
        <Indicateur libelle="Taux de clôture" valeur={pourcent(indicateurs.tauxCloture)} />
        <Indicateur
          libelle="Délai moyen"
          valeur={indicateurs.delaiMoyen === null ? '—' : `${indicateurs.delaiMoyen} j`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">À traiter</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-caption text-muted-foreground">
                  Actions correctives en retard
                </dt>
                <dd className="text-h2 text-secondary-900">{aTraiter.actionsEnRetard}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Investigations à valider</dt>
                <dd className="text-h2 text-secondary-900">{aTraiter.investigationsEnAttente}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Repartition titre="Par gravité" lignes={indicateurs.parGravite} total={indicateurs.total} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Repartition
          titre="Par parcours"
          lignes={indicateurs.parParcours}
          total={indicateurs.total}
        />
        <Repartition titre="Par statut" lignes={indicateurs.parStatut} total={indicateurs.total} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Historique mensuel</CardTitle>
        </CardHeader>
        <CardContent>
          {historique.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune période archivée. L’historisation mensuelle (EX-REP-05) est alimentée par une
              tâche planifiée.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 font-medium text-muted-foreground">Période</th>
                    <th className="py-2 font-medium text-muted-foreground">Déclarations</th>
                    <th className="py-2 font-medium text-muted-foreground">Clôturées</th>
                    <th className="py-2 font-medium text-muted-foreground">Délai moyen</th>
                    <th className="py-2 font-medium text-muted-foreground">Taux de résolution</th>
                  </tr>
                </thead>
                <tbody>
                  {historique.map((ligne) => (
                    <tr key={ligne.periode} className="border-b border-border/50">
                      <td className="py-2 text-secondary-900">{moisFr(ligne.periode)}</td>
                      <td className="py-2 text-secondary-800">{ligne.total}</td>
                      <td className="py-2 text-secondary-800">{ligne.cloturees}</td>
                      <td className="py-2 text-secondary-800">
                        {ligne.delaiMoyen === null ? '—' : `${ligne.delaiMoyen} j`}
                      </td>
                      <td className="py-2 text-secondary-800">{pourcent(ligne.tauxResolution)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/**
 * Compteurs volontairement limités à ce qui est déjà indexable en SQL.
 *
 * Un compteur « dossiers en retard » agrégé sur tout le périmètre n'est PAS ajouté ici : le
 * calcul d'échéance interroge `historique_statuts` dossier par dossier, et l'exécuter sur
 * l'ensemble du périmètre à chaque chargement de la page la plus visitée créerait un vrai risque
 * de N+1. Il faudrait une colonne recalculée, sur le modèle de `actions_correctives.statut`.
 */
async function blocATraiter(codes: string[]) {
  const [actionsEnRetard, investigationsEnAttente] = await Promise.all([
    prisma.actions_correctives.count({
      where: { statut: 'en_retard', dossiers: { parcours: { code: { in: codes } } } },
    }),
    prisma.investigations.count({
      where: {
        statut: 'en_attente_validation',
        dossiers: { parcours: { code: { in: codes } } },
      },
    }),
  ])

  return { actionsEnRetard, investigationsEnAttente }
}

async function chargerReferentiels(parcoursId: bigint | null) {
  const [parcours, categories, statuts, gravites, sites, directions] = await Promise.all([
    prisma.parcours.findMany({ where: { actif: true }, orderBy: { ordre: 'asc' } }),
    prisma.categories.findMany({
      where: { actif: true, ...(parcoursId ? { parcours_id: parcoursId } : {}) },
      orderBy: { libelle: 'asc' },
    }),
    prisma.statuts_dossier.findMany({ orderBy: { ordre: 'asc' } }),
    prisma.niveaux_gravite.findMany({ where: { actif: true }, orderBy: { niveau: 'asc' } }),
    prisma.sites.findMany({ where: { actif: true }, orderBy: { libelle: 'asc' } }),
    prisma.directions.findMany({ where: { actif: true }, orderBy: { libelle: 'asc' } }),
  ])

  const option = (l: { id: bigint; libelle: string }) => ({ id: String(l.id), libelle: l.libelle })

  return {
    parcours: parcours.map(option),
    categories: categories.map(option),
    statuts: statuts.map((s) => ({ id: String(s.id), libelle: s.libelle_interne })),
    gravites: gravites.map(option),
    sites: sites.map(option),
    directions: directions.map(option),
  }
}

function Indicateur({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <Card className="p-5">
      <p className="text-caption text-muted-foreground">{libelle}</p>
      <p className="mt-1 text-h1 text-secondary-900">{valeur}</p>
    </Card>
  )
}

/**
 * Répartition en barres proportionnelles.
 *
 * La version Laravel s'appuie sur Chart.js ; ici la barre est du CSS pur — même lecture, sans
 * dépendance de graphique, et le rendu reste entièrement serveur (donc imprimable et lisible
 * sans JavaScript).
 */
function Repartition({
  titre,
  lignes,
  total,
}: {
  titre: string
  lignes: LigneRepartition[]
  total: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">{titre}</CardTitle>
      </CardHeader>
      <CardContent>
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune donnée sur ce périmètre.</p>
        ) : (
          <ul className="space-y-2">
            {lignes.map((ligne) => {
              const part = total > 0 ? Math.round((ligne.total / total) * 100) : 0

              return (
                <li key={ligne.libelle}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-secondary-800">{ligne.libelle}</span>
                    <span className="text-caption text-muted-foreground">
                      {ligne.total} · {part} %
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary-600"
                      style={{
                        width: `${part}%`,
                        ...(ligne.couleur ? { backgroundColor: ligne.couleur } : {}),
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const pourcent = (valeur: number | null) => (valeur === null ? '—' : `${valeur} %`)

const moisFr = (periode: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(periode)
  )
