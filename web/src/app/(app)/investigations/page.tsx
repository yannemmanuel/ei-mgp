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
  listerInvestigations,
  referentielsInvestigations,
} from '@/server/services/investigation/liste'

export const metadata: Metadata = { title: 'Investigations' }
export const dynamic = 'force-dynamic'

const dateFr = (d: Date) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(d)

/**
 * Où en est le DOSSIER — le seul statut que porte désormais une investigation.
 *
 * ⚠️ La colonne « Où en est la fiche » A ÉTÉ RETIRÉE : une investigation n'est soumise à aucune
 * validation (décision métier du 2026-09-18), et ses trois états n'étaient que les étapes de
 * cette validation. Elle aurait affiché le même badge sur chaque ligne.
 *
 * Une fiche reste dans ce registre après que le dossier a poursuivi son chemin : une fiche sur un
 * dossier depuis longtemps résolu est une ligne parfaitement normale. Encore faut-il pouvoir le
 * lire — le ton neutre distingue d'un coup d'œil ce qui est encore ouvert de ce qui ne l'est plus.
 */
const TONS_DOSSIER: Record<string, TonStatut> = {
  en_investigation: 'encours',
  en_attente_information: 'attention',
  action_corrective_en_cours: 'attention',
  reouvert: 'attention',
  resolu: 'succes',
  cloture: 'neutre',
  rejete: 'neutre',
}

/**
 * Vue transverse des investigations.
 *
 * Chaque ligne mène au dossier, à sa section « Investigations » : c'est là que la fiche se
 * consulte et se modifie. Rouvrir une seconde surface d'édition à cette adresse ferait exister
 * deux chemins pour le même geste, qui divergeraient tôt ou tard.
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
    statutDossierId: lire('statutDossierId'),
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
      cle: 'statutDossierId',
      libelle: 'Où en est le dossier',
      tous: 'Peu importe',
      options: referentiels.statutsDossier.map((s) => ({
        valeur: String(s.id),
        libelle: s.libelle_interne,
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
        lede="Toutes les fiches ouvertes à ce jour, y compris sur des dossiers qui ont depuis avancé. Filtrez sur « Où en est le dossier » pour ne voir que ceux encore en investigation."
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
                  <TableHead>Où en est le dossier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultat.investigations.map((investigation) => {
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
                        <EtiquetteStatut
                          ton={TONS_DOSSIER[investigation.dossiers.statuts_dossier.code] ?? 'neutre'}
                        >
                          {investigation.dossiers.statuts_dossier.libelle_interne}
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
