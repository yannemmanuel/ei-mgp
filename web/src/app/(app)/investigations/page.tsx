import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'
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
import { peutVoirListeInvestigations } from '@/server/authz'
import {
  LIBELLES_STATUT_INVESTIGATION,
  listerInvestigations,
  referentielsInvestigations,
} from '@/server/services/investigation/liste'
import type { StatutInvestigation } from '@/server/services/investigation/investigation'

export const metadata: Metadata = { title: 'Investigations' }
export const dynamic = 'force-dynamic'

const dateFr = (d: Date) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(d)

const TONS: Record<StatutInvestigation, TonStatut> = {
  en_cours: 'encours',
  en_attente_validation: 'attention',
  validee: 'succes',
}

/**
 * Vue transverse des investigations — port de `App\Livewire\Investigations\InvestigationListPage`.
 *
 * Chaque ligne mène au dossier, à sa section « Investigations » : c'est là que la fiche se
 * consulte, se modifie et se valide. Rouvrir une seconde surface d'édition à cette adresse
 * ferait exister deux chemins pour le même geste, qui divergeraient tôt ou tard — et la
 * validation hiérarchique (RGI-06) est précisément une règle qu'on ne veut pas voir dupliquée.
 */
export default async function PageInvestigations({
  searchParams,
}: PageProps<'/investigations'>) {
  const utilisateur = await exigerUtilisateur()

  // Vérification serveur, indépendante du masquage du lien dans la navigation.
  if (!peutVoirListeInvestigations(utilisateur)) {
    redirect('/acces-refuse?droit=investigations.view')
  }

  const params = await searchParams
  const lire = (cle: string) => {
    const v = params[cle]
    return typeof v === 'string' && v !== '' ? v : undefined
  }

  const filtres = {
    statut: lire('statut'),
    enqueteurId: lire('enqueteurId'),
    parcoursId: lire('parcoursId'),
    periodeDebut: lire('periodeDebut'),
    periodeFin: lire('periodeFin'),
    miennes: lire('miennes') === '1',
  }

  const pageDemandee = Number(lire('page') ?? '1')
  const [resultat, referentiels] = await Promise.all([
    listerInvestigations(
      utilisateur,
      filtres,
      Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1
    ),
    referentielsInvestigations(),
  ])

  const champs: ChampFiltre[] = [
    {
      type: 'select',
      cle: 'statut',
      libelle: 'Statut',
      tous: 'Tous',
      options: Object.entries(LIBELLES_STATUT_INVESTIGATION).map(([valeur, libelle]) => ({
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
      cle: 'enqueteurId',
      libelle: 'Enquêteur',
      tous: 'Tous',
      options: referentiels.enqueteurs.map((u) => ({ valeur: String(u.id), libelle: u.name })),
    },
    { type: 'date', cle: 'periodeDebut', libelle: 'Ouverte à partir du' },
    { type: 'date', cle: 'periodeFin', libelle: 'Jusqu’au' },
  ]

  const filtree = champs.some((c) => filtres[c.cle as keyof typeof filtres]) || filtres.miennes

  return (
    <div className="space-y-5">
      <EnTetePage
        titre="Investigations"
        lede="Les investigations en cours, de la plus récente à la plus ancienne."
        compteur={`${resultat.total} ${resultat.total > 1 ? 'fiches' : 'fiche'}`}
      />

      <BarreFiltres
        base="/investigations"
        champs={champs}
        valeurs={{ ...filtres, miennes: filtres.miennes ? '1' : undefined }}
        bascule={{ cle: 'miennes', libelleTous: 'Toutes', libelleMiens: 'Les miennes' }}
      />

      <Card className="overflow-hidden p-0">
        {resultat.investigations.length === 0 ? (
          <EtatVide
            icone={ClipboardCheck}
            titre={
              filtree
                ? 'Aucune investigation ne correspond à ces critères.'
                : 'Aucune investigation ouverte.'
            }
            description={
              filtree
                ? 'Retirez un filtre pour élargir la recherche.'
                : 'Une fiche s’ouvre depuis un dossier passé en investigation.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dossier</TableHead>
                  <TableHead>Parcours</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Enquêteur</TableHead>
                  <TableHead>Ouverte le</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultat.investigations.map((investigation) => {
                  const statut = investigation.statut as StatutInvestigation

                  return (
                    <TableRow
                      key={investigation.id}
                      className="relative cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <TableCell>
                        {/* Lien étiré : un seul vrai lien pour les lecteurs d'écran et le clavier,
                            mais toute la ligne devient cliquable à la souris. */}
                        <Link
                          href={`/dossiers/${investigation.dossiers.id}#investigations`}
                          className="font-mono text-sm text-primary-700 underline-offset-2 after:absolute after:inset-0 hover:underline"
                        >
                          {investigation.dossiers.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {investigation.dossiers.parcours.libelle}
                      </TableCell>
                      <TableCell className="text-sm">
                        {investigation.dossiers.categories.libelle}
                      </TableCell>
                      <TableCell className="text-sm">
                        {investigation.users_investigations_enqueteur_idTousers.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dateFr(investigation.date_ouverture)}
                      </TableCell>
                      <TableCell>
                        <EtiquetteStatut ton={TONS[statut] ?? 'neutre'}>
                          {LIBELLES_STATUT_INVESTIGATION[statut] ?? investigation.statut}
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
        base="/investigations"
        parametres={params}
        page={resultat.page}
        pages={resultat.pages}
        total={resultat.total}
        unite={resultat.total > 1 ? 'fiches' : 'fiche'}
      />
    </div>
  )
}
