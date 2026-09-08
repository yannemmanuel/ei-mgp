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
    assigneAMoi: lire('assigneAMoi') === '1',
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
    filtres.assigneAMoi ||
    filtres.aMoiDAgir ||
    filtres.nonAffectes

  return (
    <div className="space-y-5">
      <EnTetePage
        titre="Dossiers"
        lede="Les déclarations de votre périmètre, de la plus récente à la plus ancienne."
        compteur={`${resultat.total} ${resultat.total > 1 ? 'dossiers' : 'dossier'}`}
      />

      <BarreFiltres
        base="/dossiers"
        champs={champs}
        valeurs={{
          ...filtres,
          assigneAMoi: filtres.assigneAMoi ? '1' : undefined,
          aMoiDAgir: filtres.aMoiDAgir ? '1' : undefined,
          nonAffectes: filtres.nonAffectes ? '1' : undefined,
        }}
        bascule={{ cle: 'assigneAMoi', libelleTous: 'Tous', libelleMiens: 'Les miens' }}
        interrupteur={{
          cle: 'aMoiDAgir',
          libelle: 'À moi d’agir',
          aide: 'Dossiers dont l’étape courante revient à votre rôle',
        }}
      />

      <Card className="overflow-hidden p-0">
        {resultat.dossiers.length === 0 ? (
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
        ) : (
          <div className="overflow-x-auto">
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
                      <EtiquetteStatut ton={tonGravite(d.niveaux_gravite.niveau)}>
                        {d.niveaux_gravite.libelle}
                      </EtiquetteStatut>
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
          </div>
        )}
      </Card>

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
