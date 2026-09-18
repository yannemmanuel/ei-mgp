import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wrench } from 'lucide-react'
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
import { peutVoirListeActions } from '@/server/authz'
import type { StatutAction } from '@/server/services/action-corrective/action-corrective'
import {
  joursAvantEcheance,
  LIBELLES_STATUT_ACTION,
  listerActions,
  referentielsActions,
} from '@/server/services/action-corrective/liste'

export const metadata: Metadata = { title: 'Actions correctives' }
export const dynamic = 'force-dynamic'

const dateFr = (d: Date) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(d)

const TONS: Record<StatutAction, TonStatut> = {
  non_demarree: 'neutre',
  en_cours: 'encours',
  realisee: 'succes',
  en_retard: 'alerte',
}

/**
 * Vue transverse des actions correctives — port de
 * `App\Livewire\ActionsCorrectives\ActionCorrectiveListPage`.
 *
 * L'écheance est la colonne qui commande : c'est un écran de travail, trié du plus urgent au plus
 * lointain. Le décompte de jours est calculé au rendu et non lu depuis `statut`, qui ne bascule
 * en « en retard » qu'au passage quotidien de la tâche planifiée.
 */
export default async function PageActionsCorrectives({
  searchParams,
}: PageProps<'/actions-correctives'>) {
  const utilisateur = await exigerUtilisateur()

  if (!peutVoirListeActions(utilisateur)) {
    redirect('/acces-refuse?droit=actions.view')
  }

  const params = await searchParams
  const lire = (cle: string) => {
    const v = params[cle]
    return typeof v === 'string' && v !== '' ? v : undefined
  }

  const filtres = {
    statut: lire('statut'),
    responsable: lire('responsable'),
    parcoursId: lire('parcoursId'),
    echeanceDebut: lire('echeanceDebut'),
    echeanceFin: lire('echeanceFin'),
  }

  const pageDemandee = Number(lire('page') ?? '1')
  const [resultat, referentiels] = await Promise.all([
    listerActions(
      utilisateur,
      filtres,
      Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1
    ),
    referentielsActions(),
  ])

  const champs: ChampFiltre[] = [
    {
      type: 'select',
      cle: 'statut',
      libelle: 'Statut',
      tous: 'Tous',
      options: Object.entries(LIBELLES_STATUT_ACTION).map(([valeur, libelle]) => ({
        valeur,
        libelle,
      })),
    },
    {
      type: 'select',
      cle: 'parcoursId',
      libelle: 'Parcours',
      tous: 'Tous',
      options: referentiels.parcours.map((p) => ({ valeur: String(p.id), libelle: p.libelle })),
    },
    {
      type: 'select',
      cle: 'responsable',
      libelle: 'Responsable',
      tous: 'Tous',
      // Les noms saisis sur les actions existantes : le responsable n'est plus un compte.
      options: referentiels.responsables.map((nom) => ({ valeur: nom, libelle: nom })),
    },
    { type: 'date', cle: 'echeanceDebut', libelle: 'Échéance à partir du' },
    { type: 'date', cle: 'echeanceFin', libelle: 'Jusqu’au' },
  ]

  const filtree = champs.some((c) => filtres[c.cle as keyof typeof filtres])

  return (
    <div className="space-y-5">
      <EnTetePage
        titre="Actions correctives"
        lede="Les actions décidées après investigation, par échéance la plus proche."
        compteur={`${resultat.total} ${resultat.total > 1 ? 'actions' : 'action'}`}
      />

      {/*
        ⚠️ Plus de bascule « Les miennes » : le responsable est saisi à la main et n'est plus
        rattaché à un compte. Voir `FiltresActions` pour le détail.
      */}
      <BarreFiltres base="/actions-correctives" champs={champs} valeurs={filtres} />

      <Card className="overflow-hidden p-0">
        {resultat.actions.length === 0 ? (
          <EtatVide
            icone={Wrench}
            titre={
              filtree
                ? 'Aucune action ne correspond à ces critères.'
                : 'Aucune action corrective enregistrée.'
            }
            description={
              filtree
                ? 'Retirez un filtre pour élargir la recherche.'
                : 'Une action se crée depuis un dossier passé en action corrective.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Dossier</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultat.actions.map((action) => {
                  const statut = action.statut as StatutAction
                  const restants = joursAvantEcheance(action.echeance)
                  const aboutie = statut === 'realisee'

                  return (
                    <TableRow
                      key={action.id}
                      className="relative cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="max-w-xs">
                        <Link
                          href={`/dossiers/${action.dossiers.id}#actions-correctives`}
                          className="block truncate text-sm font-medium text-secondary-900 underline-offset-2 after:absolute after:inset-0 hover:underline"
                          title={action.intitule}
                        >
                          {action.intitule}
                        </Link>
                        <span className="text-caption text-muted-foreground">
                          {action.dossiers.categories.libelle}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-caption text-muted-foreground">
                          {action.dossiers.reference}
                        </span>
                        <span className="block text-caption text-muted-foreground">
                          {action.dossiers.parcours.libelle}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {action.responsable_nom ?? action.users?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {dateFr(action.echeance)}
                        {/* Le décompte n'a de sens que tant que l'action court : une action
                            réalisée dont l'échéance est passée n'est pas « en retard de 12 j ». */}
                        {!aboutie && (
                          <span
                            className={
                              restants < 0
                                ? 'block text-caption font-medium text-destructive'
                                : restants <= 3
                                  ? 'block text-caption font-medium text-accent-700'
                                  : 'block text-caption text-muted-foreground'
                            }
                          >
                            {restants < 0
                              ? `${Math.abs(restants)} j de retard`
                              : restants === 0
                                ? 'Aujourd’hui'
                                : `dans ${restants} j`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <EtiquetteStatut ton={TONS[statut] ?? 'neutre'}>
                          {LIBELLES_STATUT_ACTION[statut] ?? action.statut}
                        </EtiquetteStatut>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Pagination
        base="/actions-correctives"
        parametres={params}
        page={resultat.page}
        pages={resultat.pages}
        total={resultat.total}
        unite={resultat.total > 1 ? 'actions' : 'action'}
      />
    </div>
  )
}
