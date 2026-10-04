import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FolderOpen } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EtatVide } from '@/components/ui/etat-vide'
import { EtiquetteStatut, type TonStatut } from '@/components/ui/etiquette-statut'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BarreFiltres, type ChampFiltre } from '@/components/layout/barre-filtres'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { Pagination } from '@/components/layout/pagination'
import { exigerUtilisateur } from '@/server/auth'
import { peutVoirListeDossiers } from '@/server/authz'
import { listerDossiers, referentielsFiltres } from '@/server/services/dossier/liste'

export const metadata: Metadata = { title: 'Dossiers' }

/*
  ⚠️ RENDU À LA DEMANDE, comme toutes les autres listes.

  C'était la SEULE à ne pas le déclarer. Elle l'était de fait — elle lit `searchParams` —, mais
  l'écrire la met à l'abri du jour où ce ne serait plus le cas : une liste de dossiers servie
  depuis un cache montrerait des statuts périmés sans que rien ne le signale, et c'est exactement
  le reproche qui a été fait à l'application.
*/
export const dynamic = 'force-dynamic'

const dateFr = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(d) : '—'

/** Échelle de gravité 1-4 (CDC §11.1). */
function tonGravite(niveau: number): TonStatut {
  if (niveau >= 4) return 'alerte'
  if (niveau === 3) return 'attention'
  return 'neutre'
}

export default async function PageDossiers({ searchParams }: PageProps<'/dossiers'>) {
  const utilisateur = await exigerUtilisateur()

  // Vérification serveur, indépendante du masquage du lien dans la navigation.
  if (!peutVoirListeDossiers(utilisateur)) {
    redirect('/acces-refuse?droit=dossiers.view')
  }

  const params = await searchParams
  const lire = (cle: string) => {
    const v = params[cle]
    return typeof v === 'string' && v !== '' ? v : undefined
  }

  const filtres = {
    parcoursId: lire('parcoursId'),
    categorieId: lire('categorieId'),
    statutId: lire('statutId'),
    niveauGraviteId: lire('niveauGraviteId'),
    periodeDebut: lire('periodeDebut'),
    periodeFin: lire('periodeFin'),
    aMoiDAgir: lire('aMoiDAgir') === '1',
    nonAffectes: lire('nonAffectes') === '1',
  }

  const page = Number(lire('page') ?? '1')
  const [resultat, referentiels] = await Promise.all([
    listerDossiers(utilisateur, filtres, Number.isFinite(page) && page > 0 ? page : 1),
    referentielsFiltres(filtres.parcoursId),
  ])

  const champs: ChampFiltre[] = [
    {
      type: 'select',
      cle: 'parcoursId',
      libelle: 'Parcours',
      tous: 'Tous',
      options: referentiels.parcours.map((p) => ({ valeur: String(p.id), libelle: p.libelle })),
      // La catégorie appartient à un parcours : la garder en changeant de parcours donnerait un
      // couple impossible, donc une liste vide sans cause apparente.
      invalide: ['categorieId'],
    },
    {
      type: 'select',
      cle: 'categorieId',
      libelle: 'Catégorie',
      tous: 'Toutes',
      options: referentiels.categories.map((c) => ({ valeur: String(c.id), libelle: c.libelle })),
    },
    {
      type: 'select',
      cle: 'statutId',
      libelle: 'Statut',
      tous: 'Tous',
      options: referentiels.statuts.map((s) => ({
        valeur: String(s.id),
        libelle: s.libelle_interne,
      })),
    },
    {
      type: 'select',
      cle: 'niveauGraviteId',
      libelle: 'Gravité',
      tous: 'Toutes',
      options: referentiels.gravites.map((g) => ({ valeur: String(g.id), libelle: g.libelle })),
    },
    { type: 'date', cle: 'periodeDebut', libelle: 'Reçu à partir du' },
    { type: 'date', cle: 'periodeFin', libelle: 'Jusqu’au' },
  ]

  const filtree =
    champs.some((c) => lire(c.cle)) ||
    filtres.aMoiDAgir ||
    filtres.nonAffectes

  return (
    <div className="space-y-5">
      <EnTetePage
        titre="Dossiers"
        lede="Les déclarations que vous suivez, de la plus récente à la plus ancienne."
        compteur={`${resultat.total} ${resultat.total > 1 ? 'dossiers' : 'dossier'}`}
      />

      <BarreFiltres
        base="/dossiers"
        champs={champs}
        valeurs={{
          ...filtres,
          aMoiDAgir: filtres.aMoiDAgir ? '1' : undefined,
          nonAffectes: filtres.nonAffectes ? '1' : undefined,
        }}
        interrupteur={{
          cle: 'aMoiDAgir',
          libelle: 'À moi d’agir',
          aide: 'Dossiers dont l’étape courante revient à votre rôle',
        }}
      />

      {resultat.dossiers.length === 0 ? (
        <Card className="overflow-hidden p-0">
          <EtatVide
            icone={FolderOpen}
            titre={
              filtree ? 'Aucun dossier ne correspond à ces critères.' : 'Aucun dossier à afficher.'
            }
            description={
              filtree
                ? 'Retirez un filtre pour élargir la recherche.'
                : 'Les déclarations reçues apparaîtront ici.'
            }
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-3 md:hidden" aria-label="Liste des dossiers">
            {resultat.dossiers.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dossiers/${d.id}`}
                  className="block rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors hover:border-primary-300 hover:bg-primary-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-primary-700">
                        {d.reference}
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-secondary-900">
                        {d.categories.libelle}
                      </p>
                    </div>
                    <EtiquetteStatut ton="encours">
                      {d.statuts_dossier.libelle_interne}
                    </EtiquetteStatut>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {d.niveaux_gravite ? (
                      <EtiquetteStatut ton={tonGravite(d.niveaux_gravite.niveau)}>
                        {d.niveaux_gravite.libelle}
                      </EtiquetteStatut>
                    ) : (
                      <EtiquetteStatut ton="attention">À qualifier</EtiquetteStatut>
                    )}
                    {d.is_anonymous && (
                      <span className="text-caption text-muted-foreground">Anonyme</span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span className="truncate">{d.parcours.libelle}</span>
                    <span className="shrink-0">Reçu le {dateFr(d.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <Card className="hidden overflow-hidden p-0 md:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Parcours</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Gravité</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Reçu le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultat.dossiers.map((d) => (
                  <TableRow
                    key={d.id}
                    className="relative cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <TableCell>
                      {/* Lien étiré : un seul vrai lien pour le clavier et les lecteurs d'écran,
                          mais toute la ligne devient cliquable à la souris. Viser une référence
                          de douze caractères était la manœuvre la plus répétée de l'écran. */}
                      <Link
                        href={`/dossiers/${d.id}`}
                        className="font-mono text-sm text-primary-700 underline-offset-2 after:absolute after:inset-0 hover:underline"
                      >
                        {d.reference}
                      </Link>
                      {d.is_anonymous && (
                        <span className="ml-2 text-caption text-muted-foreground">Anonyme</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{d.parcours.libelle}</TableCell>
                    <TableCell className="text-sm">{d.categories.libelle}</TableCell>
                    <TableCell>
                      {d.niveaux_gravite ? (
                        <EtiquetteStatut ton={tonGravite(d.niveaux_gravite.niveau)}>
                          {d.niveaux_gravite.libelle}
                        </EtiquetteStatut>
                      ) : (
                        <EtiquetteStatut ton="attention">À qualifier</EtiquetteStatut>
                      )}
                    </TableCell>
                    <TableCell>
                      <EtiquetteStatut ton="encours">
                        {d.statuts_dossier.libelle_interne}
                      </EtiquetteStatut>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dateFr(d.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Pagination
        base="/dossiers"
        parametres={params}
        page={resultat.page}
        pages={resultat.pages}
        total={resultat.total}
        unite={resultat.total > 1 ? 'dossiers' : 'dossier'}
      />
    </div>
  )
}
