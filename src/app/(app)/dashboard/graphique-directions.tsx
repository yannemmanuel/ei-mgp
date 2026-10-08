import Link from 'next/link'
import { AlertTriangle, Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  avancement,
  ETAPES,
  type CleEtape,
  type Etapes,
  type ProgressionDirections,
} from '@/server/services/reporting/repartition-directions'

/**
 * Progression des déclarations par direction : une colonne empilée par direction, découpée par
 * étape de traitement, et au-dessus la progression globale de la sélection.
 *
 * Les étapes sont ORDONNÉES (le circuit va de « À instruire » à « Clos ») : elles portent une
 * seule teinte, du clair au foncé — plus c'est foncé, plus c'est avancé. Rampe validée (contraste
 * du pas le plus clair ≥ 2:1, luminosité monotone, écarts visibles entre pas).
 *
 * Critiques et retards sont dits en TEXTE avec une icône, jamais par la seule couleur. Rendu
 * serveur, CSS pur ; le survol détaille chaque colonne et un tableau donne toutes les valeurs.
 */

const COULEUR: Record<CleEtape, string> = {
  a_instruire: 'var(--secondary-300)',
  investigation: 'var(--secondary-400)',
  action_corrective: 'var(--secondary-500)',
  resolu: 'var(--secondary-600)',
  clos: 'var(--secondary-900)',
}

/** Empilement de bas en haut : le plus avancé à la base, ce qui reste à instruire au sommet. */
const DU_BAS_VERS_LE_HAUT = [...ETAPES].reverse()

const HAUTEUR = 176 // px, zone de tracé

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export type OngletParcours = { code: string; libelle: string }

export function GraphiqueDirections({
  progression,
  parcours,
  parcoursActif,
  lienOnglet,
  peutOuvrirListe,
}: {
  progression: ProgressionDirections
  /** Parcours du lecteur. Les onglets n'apparaissent que s'il en a plusieurs. */
  parcours: OngletParcours[]
  parcoursActif: string | null
  /** Construit l'URL d'un onglet (`null` = global), en gardant les autres critères. */
  lienOnglet: (code: string | null) => string
  /** Sans la liste des dossiers, les colonnes ne sont pas des liens. */
  peutOuvrirListe: boolean
}) {
  const { lignes, global } = progression
  const plusieurs = parcours.length > 1
  const actif = parcours.find((p) => p.code === parcoursActif) ?? null
  const portee = actif ? actif.libelle : plusieurs ? 'Tous vos parcours' : (parcours[0]?.libelle ?? '')
  const maximum = Math.max(1, ...lignes.map((l) => l.total))

  return (
    <Card className="min-w-0 rounded-2xl border-border/80 shadow-xs">
      <CardHeader className="space-y-3 border-b border-border/50 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-h3">Progression par direction</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {portee} · {pluriel(global.total, 'déclaration')} accessible
              {global.total > 1 ? 's' : ''} selon votre habilitation
            </p>
          </div>
        </div>

        {plusieurs && (
          <nav aria-label="Parcours affiché">
            <ul className="flex flex-wrap gap-1 rounded-xl border border-border/70 bg-muted/30 p-1 text-xs">
              {[{ code: null, libelle: 'Global' }, ...parcours].map((p) => {
                const courant = (p.code ?? null) === (actif?.code ?? null)
                return (
                  <li key={p.code ?? 'global'}>
                    <Link
                      href={lienOnglet(p.code)}
                      scroll={false}
                      aria-current={courant ? 'page' : undefined}
                      className={cn(
                        'block min-h-9 rounded-lg px-3 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        courant
                          ? 'bg-card text-secondary-900 shadow-xs'
                          : 'text-secondary-600 hover:bg-card/70 hover:text-secondary-900'
                      )}
                    >
                      {p.libelle}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune déclaration dans ce périmètre.</p>
        ) : (
          <>
            <ProgressionGlobale etapes={global.etapes} total={global.total} titre={portee} />

            <div className="overflow-x-auto pb-1">
              <ul
                className="flex min-w-max items-end gap-3 border-b border-secondary-200 px-1"
                style={{ minHeight: HAUTEUR + 40 }}
                aria-label="Déclarations par direction et par étape"
              >
                {lignes.map((ligne, index) => (
                  <Colonne
                    key={ligne.cle}
                    ligne={ligne}
                    maximum={maximum}
                    // Les dernières colonnes ouvrent leur détail à gauche, pour rester visibles.
                    detailAGauche={index >= lignes.length - 2 && lignes.length > 2}
                    href={peutOuvrirListe ? `/dossiers?directionId=${ligne.cle}` : null}
                  />
                ))}
              </ul>
              <ul className="flex min-w-max gap-3 px-1 pt-2" aria-hidden>
                {lignes.map((ligne) => (
                  <li key={ligne.cle} className="w-20 text-center">
                    <span
                      className="line-clamp-2 text-[11px] font-medium leading-tight text-secondary-800"
                      title={ligne.libelle}
                    >
                      {ligne.libelle}
                    </span>
                    {(ligne.critiquesOuverts > 0 || ligne.actionsEnRetard > 0) && (
                      <span className="mt-1 flex flex-wrap justify-center gap-x-2 text-[10px] font-semibold tabular-nums">
                        {ligne.critiquesOuverts > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-destructive">
                            <Siren className="h-3 w-3" aria-hidden />
                            {ligne.critiquesOuverts}
                          </span>
                        )}
                        {ligne.actionsEnRetard > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-amber-700">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            {ligne.actionsEnRetard}
                          </span>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Siren className="h-3 w-3 text-destructive" aria-hidden /> dossiers critiques ouverts
              </span>
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-700" aria-hidden /> actions correctives
                en retard
              </span>
              <span>Le pourcentage au-dessus de chaque colonne est la part résolue ou close.</span>
            </p>

            <TableauDirections progression={progression} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ProgressionGlobale({
  etapes,
  total,
  titre,
}: {
  etapes: Etapes
  total: number
  titre: string
}) {
  const part = avancement({ total, etapes })

  return (
    <div className="rounded-xl border border-border/70 bg-secondary-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-secondary-900">Progression globale — {titre}</p>
        <p className="text-sm text-secondary-700">
          <span className="text-h3 font-heading text-secondary-900">{part ?? '—'}</span>
          {part !== null && ' %'} traités
        </p>
      </div>
      <div className="mt-3 flex h-3.5 gap-0.5" aria-hidden>
        {ETAPES.map(({ cle }) =>
          etapes[cle] > 0 ? (
            <span
              key={cle}
              className="min-w-1 rounded-lg"
              style={{ width: `${(etapes[cle] / total) * 100}%`, background: COULEUR[cle] }}
            />
          ) : null
        )}
      </div>
      {/* Sert aussi de légende aux colonnes : une seule légende, avec les valeurs. */}
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-label="Légende et répartition globale">
        {ETAPES.map(({ cle, libelle }) => (
          <div key={cle} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COULEUR[cle] }} />
            <dt className="text-secondary-700">{libelle}</dt>
            <dd className="font-semibold tabular-nums text-secondary-900">
              {etapes[cle]}
              <span className="font-normal text-muted-foreground">
                {' '}
                · {total > 0 ? Math.round((etapes[cle] / total) * 100) : 0} %
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Colonne({
  ligne,
  maximum,
  href,
  detailAGauche,
}: {
  ligne: ProgressionDirections['lignes'][number]
  maximum: number
  href: string | null
  detailAGauche: boolean
}) {
  const part = avancement(ligne)
  const hauteur = Math.max(6, Math.round((ligne.total / maximum) * HAUTEUR))
  const segments = DU_BAS_VERS_LE_HAUT.filter(({ cle }) => ligne.etapes[cle] > 0)
  const resume = [
    `${ligne.libelle} : ${pluriel(ligne.total, 'déclaration')}, ${part ?? 0} % traités`,
    ...ETAPES.map(({ cle, libelle }) => `${libelle} ${ligne.etapes[cle]}`),
    ...(ligne.critiquesOuverts > 0 ? [pluriel(ligne.critiquesOuverts, 'critique')] : []),
    ...(ligne.actionsEnRetard > 0 ? [`${pluriel(ligne.actionsEnRetard, 'action')} en retard`] : []),
  ].join(', ')

  const barre = (
    <>
      <span className="mb-1 text-[11px] font-semibold tabular-nums text-secondary-800">
        {ligne.total}
        <span className="block text-[10px] font-normal text-muted-foreground">{part ?? 0} %</span>
      </span>
      {/* Pile : 2px d'écart entre segments, sommet arrondi selon le design system, base posée sur l'axe. */}
      <span className="flex w-10 flex-col-reverse gap-0.5" style={{ height: hauteur }}>
        {segments.map(({ cle }, index) => (
          <span
            key={cle}
            className={cn('w-full', index === segments.length - 1 && 'rounded-t-lg')}
            style={{
              flexGrow: ligne.etapes[cle],
              flexBasis: 0,
              minHeight: 2,
              background: COULEUR[cle],
            }}
          />
        ))}
      </span>

      {/* Détail au survol ou au focus clavier, À CÔTÉ de la colonne : au-dessus, il serait coupé
          par la zone de défilement horizontal pour les colonnes les plus hautes. */}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-0 z-10 hidden w-52 rounded-lg border border-border bg-popover p-3 text-left text-xs shadow-lg group-hover:block group-focus-within:block',
          detailAGauche ? 'right-full mr-1' : 'left-full ml-1'
        )}
      >
        <span className="block font-semibold text-secondary-900">{ligne.libelle}</span>
        <span className="mt-0.5 block text-muted-foreground">
          {pluriel(ligne.total, 'déclaration')} · {part ?? 0} % traités
        </span>
        <span className="mt-2 block space-y-1">
          {ETAPES.map(({ cle, libelle }) => (
            <span key={cle} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: COULEUR[cle] }} />
              <span className="text-secondary-700">{libelle}</span>
              <span className="ml-auto font-semibold tabular-nums text-secondary-900">
                {ligne.etapes[cle]}
              </span>
            </span>
          ))}
        </span>
        {(ligne.critiquesOuverts > 0 || ligne.actionsEnRetard > 0) && (
          <span className="mt-2 block border-t border-border pt-2 font-semibold">
            {ligne.critiquesOuverts > 0 && (
              <span className="block text-destructive">
                {pluriel(ligne.critiquesOuverts, 'critique')} ouvert
                {ligne.critiquesOuverts > 1 ? 's' : ''}
              </span>
            )}
            {ligne.actionsEnRetard > 0 && (
              <span className="block text-amber-700">
                {pluriel(ligne.actionsEnRetard, 'action')} en retard
              </span>
            )}
          </span>
        )}
      </span>
    </>
  )

  const classes =
    'group relative flex w-20 flex-col items-center justify-end rounded-t-lg pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <li className="flex">
      {href ? (
        <Link
          href={href}
          aria-label={`${resume}. Ouvrir les dossiers de cette direction.`}
          className={cn(classes, 'hover:bg-secondary-50')}
        >
          {barre}
        </Link>
      ) : (
        <span className={classes} role="img" aria-label={resume} tabIndex={0}>
          {barre}
        </span>
      )}
    </li>
  )
}

function TableauDirections({ progression }: { progression: ProgressionDirections }) {
  const cellule = 'px-2 py-1.5 text-right tabular-nums'

  return (
    <details className="group rounded-xl border border-border/70">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-secondary-800 hover:bg-muted/40">
        Voir le tableau détaillé
      </summary>
      <div className="overflow-x-auto border-t border-border/70">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="px-2 py-2 text-left font-medium">Direction</th>
              {ETAPES.map(({ cle, libelle }) => (
                <th key={cle} scope="col" className="px-2 py-2 text-right font-medium">
                  {libelle}
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-right font-medium">Total</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Traités</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Critiques</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Actions en retard</th>
            </tr>
          </thead>
          <tbody>
            {[...progression.lignes, { cle: 'global', libelle: 'Total', ...progression.global }].map(
              (l) => (
                <tr
                  key={l.cle}
                  className={cn(
                    'border-b border-border/50',
                    l.cle === 'global' && 'bg-muted/30 font-semibold'
                  )}
                >
                  <th scope="row" className="px-2 py-1.5 text-left font-medium text-secondary-900">
                    {l.libelle}
                  </th>
                  {ETAPES.map(({ cle }) => (
                    <td key={cle} className={cellule}>
                      {l.etapes[cle]}
                    </td>
                  ))}
                  <td className={cellule}>{l.total}</td>
                  <td className={cellule}>{avancement(l) ?? '—'} %</td>
                  <td className={cn(cellule, l.critiquesOuverts > 0 && 'text-destructive')}>
                    {l.critiquesOuverts}
                  </td>
                  <td className={cn(cellule, l.actionsEnRetard > 0 && 'text-amber-700')}>
                    {l.actionsEnRetard}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </details>
  )
}
