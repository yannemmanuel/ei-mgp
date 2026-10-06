import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EtatVide } from '@/components/ui/etat-vide'
import { EtiquetteStatut } from '@/components/ui/etiquette-statut'
import { BarreFiltres, type ChampFiltre } from '@/components/layout/barre-filtres'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import {
  aPermission,
  aUnePermissionParmi,
  parcoursAutorises,
  peutExporter,
  peutExporterNominatif,
  type UtilisateurAutorise,
} from '@/server/authz'
import { calculerIndicateurs, type LigneRepartition } from '@/server/services/reporting/indicateurs'
import { filtreDepuisParametres } from '@/server/services/reporting/filtre'
import { historiqueMensuel } from '@/server/services/reporting/statistiques-mensuelles'
import {
  aTraiter,
  dossiersATraiter,
  type ADTraiter,
} from '@/server/services/reporting/a-traiter'
import {
  santeAdministration,
  type AlerteAdministration,
} from '@/server/services/reporting/sante-administration'
import { PERMISSIONS_CONSOLES } from '../administration/page'
import { BoutonsExport } from './boutons-export'

export const metadata: Metadata = { title: 'Tableau de bord' }

// Les indicateurs reflètent l'état courant de la base : jamais de rendu figé à la compilation.
export const dynamic = 'force-dynamic'

/**
 * EX-REP-01/02/03/05 : tableau de bord consolidé.
 *
 * `/dashboard` est la page d'atterrissage de TOUS les comptes authentifiés : elle ne renvoie
 * jamais un refus. Le contenu se ramifie selon `reporting.view` (DT-31) — vue consolidée pour
 * les rôles transverses, résumé personnel pour les rôles de traitement.
 *
 * Ce qui est à SOI passe avant ce qui est agrégé : on ouvre cet écran le matin pour savoir quoi
 * faire, pas pour lire un taux. Et une carte vide n'est pas affichée — un directeur, qui n'a
 * jamais de dossier affecté, voyait chaque jour un encadré lui annonçant qu'il n'en avait pas.
 */
export default async function PageTableauDeBord({ searchParams }: PageProps<'/dashboard'>) {
  const utilisateur = await exigerUtilisateur()
  const parametres = await searchParams

  const voitLeRapport = aPermission(utilisateur, 'reporting.view')
  // Le périmètre du lecteur plafonne les indicateurs, comme il plafonne déjà sa liste.
  const filtre = filtreDepuisParametres(parametres, utilisateur)

  // Qui administre ne voit pas les mêmes choses que qui traite — et certains, comme
  // l'administrateur digital, ne traitent RIEN par construction (DT-02).
  const administre = aUnePermissionParmi(utilisateur, PERMISSIONS_CONSOLES)
  const traiteDesDossiers = aUnePermissionParmi(utilisateur, [
    'dossiers.view',
    'dossiers.view.all',
    'dossiers.view.own',
  ])

  const [mesDossiers, urgences, alertes] = await Promise.all([
    dossiersATraiter(utilisateur),
    aTraiter(utilisateur),
    administre ? santeAdministration() : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Tableau de bord"
        lede={
          traiteDesDossiers
            ? voitLeRapport
              ? 'Ce qui vous attend, puis la vue d’ensemble.'
              : 'Les dossiers qui vous sont confiés.'
            : 'L’état du paramétrage dont vous répondez.'
        }
        actions={
          voitLeRapport && peutExporter(utilisateur) ? (
            <BoutonsExport peutNominatif={peutExporterNominatif(utilisateur)} />
          ) : null
        }
      />

      <section aria-labelledby="titre-priorites" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
              Espace de décision
            </p>
            <h2 id="titre-priorites" className="mt-1 text-h2 text-secondary-900">
              Priorités du jour
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Traitez d’abord les échéances dépassées, puis les dossiers qui attendent votre rôle.
            </p>
          </div>
          {traiteDesDossiers && (
            <Link
              href="/dossiers?aMoiDAgir=1"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ouvrir ma file de travail
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>

        {traiteDesDossiers && (
          <BandeUrgences
            urgences={urgences}
            peutVoirTout={aPermission(utilisateur, 'dossiers.view.all')}
          />
        )}

        <div
          className={cn(
            'grid gap-5',
            administre && traiteDesDossiers &&
              'xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.75fr)]'
          )}
        >
          {traiteDesDossiers && <FileActions dossiers={mesDossiers} urgences={urgences} />}
          {administre && (
            <BandeAdministration alertes={alertes} traiteDesDossiers={traiteDesDossiers} />
          )}
        </div>
      </section>

      {voitLeRapport ? (
        <VueConsolidee
          filtre={filtre}
          parametres={parametres}
          utilisateur={utilisateur}
          peutVoirInvestigations={aPermission(utilisateur, 'investigations.view')}
          peutVoirActions={aPermission(utilisateur, 'actions.view')}
        />
      ) : (
        /*
          L'attente de dossiers ne se dit qu'à qui peut en recevoir.

          L'administrateur digital n'a accès à aucun dossier, et n'en aura jamais : DT-02 le lui
          refuse délibérément. Lui annoncer que « ceux qui vous seront confiés apparaîtront ici »
          était une promesse que son propre rôle interdit de tenir.
        */
        null
      )}
    </div>
  )
}

function FileActions({
  dossiers,
  urgences,
}: {
  dossiers: Awaited<ReturnType<typeof dossiersATraiter>>
  urgences: ADTraiter
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/70 bg-secondary-50/50 py-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
              <ClipboardCheck className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <CardTitle>Ma file de travail</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {urgences.miens > 0
                  ? `${urgences.miens} dossier${urgences.miens > 1 ? 's' : ''} attend${urgences.miens > 1 ? 'ent' : ''} votre intervention`
                  : 'Aucune intervention requise actuellement'}
              </p>
            </div>
          </div>
        </div>
        {urgences.miens > 0 && (
          <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-bold text-primary-800">
            {urgences.miens}
          </span>
        )}
      </CardHeader>

      {dossiers.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </span>
          <p className="mt-3 font-semibold text-secondary-900">Votre file est à jour</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Aucun dossier n’attend l’intervention de votre rôle pour le moment.
          </p>
        </div>
      ) : (
        <CardContent className="px-0">
          <ul className="divide-y divide-border/70" aria-label="Dossiers en attente de votre action">
            {dossiers.map((d, index) => (
              <li key={d.id} className="group relative">
                <Link
                  href={`/dossiers/${d.id}`}
                  className="flex min-h-16 items-center gap-3 px-5 py-3 transition-colors hover:bg-primary-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary-100 text-xs font-bold text-secondary-600 group-hover:bg-primary-100 group-hover:text-primary-800">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-secondary-900">
                      {d.categories.libelle}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                      {d.reference}
                    </span>
                  </span>
                  <EtiquetteStatut ton="encours">
                    {d.statuts_dossier.libelle_interne}
                  </EtiquetteStatut>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary-700"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-border/70 bg-muted/20 px-5 py-3">
            <Link
              href="/dossiers?aMoiDAgir=1"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
            >
              Voir toute la file
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

/**
 * Ce qui appelle une action, en tête d'écran et pour tous les rôles.
 *
 * Le tableau de bord ouvrait sur quatre taux — de quoi décrire ce qui s'est passé, rien pour
 * décider quoi faire ce matin. Les rôles de traitement, qui n'ont pas `reporting.view`, n'avaient
 * même pas cela : une liste de cinq dossiers, sans compte ni urgence.
 *
 * Cette bande ne s'affiche que si elle a quelque chose à dire. Une carte qui annonce zéro tous les
 * jours cesse d'être lue, et fait passer pour vide un écran qui ne l'est pas.
 */
function BandeUrgences({
  urgences,
  peutVoirTout,
}: {
  urgences: ADTraiter
  peutVoirTout: boolean
}) {
  const cartes = [
    {
      cle: 'miens-retard',
      libelle: 'Vos actions en retard',
      valeur: urgences.miensEnRetard,
      href: '/dossiers?aMoiDAgir=1',
      aide: 'La date limite est passée.',
      grave: true,
    },
    {
      cle: 'retard',
      libelle: 'En retard, tous dossiers',
      valeur: urgences.enRetard,
      href: '/dossiers',
      aide: 'Confiés à quelqu’un ou non.',
      grave: true,
    },
    {
      cle: 'non-affectes',
      libelle: 'Reçus sans destinataire',
      valeur: urgences.nonAffectes,
      href: '/dossiers?nonAffectes=1',
      // Le cas se produit quand aucun compte actif ne porte le rôle de captage du parcours :
      // l'affectation automatique n'a personne à qui confier la déclaration (EX-GES-02).
      aide: 'Personne ne les traite pour l’instant.',
      grave: true,
    },
    {
      cle: 'miens',
      libelle: 'À vous d’agir',
      valeur: urgences.miens,
      href: '/dossiers?aMoiDAgir=1',
      aide: 'Hors dossiers clos.',
      grave: false,
    },
  ].filter((carte) => {
    // « En retard sur le périmètre » double « vos dossiers en retard » pour qui ne voit que les
    // siens : ne la montrer qu'à ceux dont le périmètre dépasse leurs affectations.
    if (carte.cle === 'retard' && !peutVoirTout) return false
    return carte.valeur > 0
  })

  if (cartes.length === 0) return null

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {cartes.map((carte) => (
        <Link
          key={carte.cle}
          href={carte.href}
          className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card
            className={cn(
              'h-full p-5 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
              carte.grave
                ? 'border-destructive/30 bg-gradient-to-br from-rose-50/70 via-card to-rose-50/20 hover:border-destructive/50 shadow-xs'
                : 'border-border/80 bg-gradient-to-br from-card via-card to-secondary-50/40 hover:border-primary/40 shadow-xs'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{carte.libelle}</p>
              {carte.grave && (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive shrink-0">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                </div>
              )}
            </div>
            <p
              className={cn(
                'mt-2 text-chiffre font-heading',
                carte.grave ? 'text-destructive' : 'text-secondary-900'
              )}
            >
              {carte.valeur}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{carte.aide}</p>
          </Card>
        </Link>
      ))}
    </div>
  )
}

/**
 * Ce qui appelle une décision d'administrateur.
 *
 * Même règle que la bande des urgences, et pour la même raison : rien ne s'affiche quand il n'y
 * a rien à dire. Un écran d'administration qui annonce « 0 délai non validé » tous les matins
 * finit par ne plus être lu le jour où le chiffre change.
 *
 * Chaque ligne nomme sa CONSÉQUENCE, jamais ce qu'elle compte : « 3 directions sans site » ne
 * dit rien à qui ne connaît pas le rôle du rattachement, « leurs déclarations n'atteignent aucun
 * secrétaire habilité » se comprend sans rien savoir du modèle de données.
 */
function BandeAdministration({
  alertes,
  traiteDesDossiers,
}: {
  alertes: AlerteAdministration[]
  /** Le lecteur a-t-il par ailleurs des dossiers ? Décide du ton de l'écran quand tout va bien. */
  traiteDesDossiers: boolean
}) {
  if (alertes.length === 0) {
    // Qui traite des dossiers a déjà de quoi lire plus haut : on ne lui ajoute pas une carte
    // pour dire que rien ne cloche. Qui n'administre QUE, si — sans cela son écran serait vide.
    if (traiteDesDossiers) return null

    return (
      <Card className="p-0">
        <EtatVide
          icone={ShieldCheck}
          titre="Le paramétrage est complet."
          description="Rien n’appelle d’intervention de votre part aujourd’hui."
        />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">À régler</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {alertes.map((alerte) => (
            <li key={alerte.cle} className="relative py-3">
              <Link
                href={alerte.href}
                className="flex items-start justify-between gap-3 after:absolute after:inset-0 hover:underline"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    {alerte.bloquant && (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                    )}
                    <span className="text-sm font-medium text-secondary-900">{alerte.libelle}</span>
                  </span>
                  <span className="mt-0.5 block text-caption text-muted-foreground">
                    {alerte.consequence}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-h3 ${alerte.bloquant ? 'text-destructive' : 'text-secondary-900'}`}
                >
                  {alerte.valeur}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

async function VueConsolidee({
  filtre,
  parametres,
  utilisateur,
  peutVoirInvestigations,
  peutVoirActions,
}: {
  filtre: ReturnType<typeof filtreDepuisParametres>
  parametres: Record<string, string | string[] | undefined>
  utilisateur: UtilisateurAutorise
  peutVoirInvestigations: boolean
  peutVoirActions: boolean
}) {
  // Le compte entier, et non ses seuls rôles : le périmètre dépend aussi des parcours qui lui ont
  // été confiés. Deux personnes portant les mêmes rôles n'ont plus les mêmes chiffres.
  const codes = parcoursAutorises(utilisateur)

  const [indicateurs, historique, referentiels, compteurs] = await Promise.all([
    calculerIndicateurs(filtre),
    // Voir `historiqueMensuel` : l'agrégat mensuel ne porte pas le rattachement, il ne peut donc
    // pas être cloisonné. Pour un lecteur borné, il ne renvoie rien plutôt que des chiffres faux.
    historiqueMensuel(codes, filtre.siteDuLecteur != null || filtre.directionDuLecteur != null),
    chargerReferentiels(filtre.parcoursId ?? null),
    blocATraiter(codes),
  ])

  const valeurs = Object.fromEntries(
    Object.entries(parametres).map(([cle, valeur]) => [
      cle,
      Array.isArray(valeur) ? valeur[0] : valeur,
    ])
  )

  // EX-REP-02 : sur-ensemble des filtres de la liste des dossiers (ajoute site et direction).
  const champs: ChampFiltre[] = [
    {
      type: 'select',
      cle: 'parcoursId',
      libelle: 'Parcours',
      tous: 'Tous',
      options: referentiels.parcours,
      invalide: ['categorieId'],
    },
    { type: 'select', cle: 'categorieId', libelle: 'Catégorie', tous: 'Toutes', options: referentiels.categories },
    { type: 'select', cle: 'statutId', libelle: 'Statut', tous: 'Tous', options: referentiels.statuts },
    { type: 'select', cle: 'niveauGraviteId', libelle: 'Gravité', tous: 'Toutes', options: referentiels.gravites },
    { type: 'select', cle: 'siteId', libelle: 'Site', tous: 'Tous', options: referentiels.sites },
    { type: 'select', cle: 'directionId', libelle: 'Direction', tous: 'Toutes', options: referentiels.directions },
    { type: 'date', cle: 'periodeDebut', libelle: 'Soumis à partir du' },
    { type: 'date', cle: 'periodeFin', libelle: 'Jusqu’au' },
  ]

  return (
    <div className="space-y-8">
      <BarreFiltres base="/dashboard" champs={champs} valeurs={valeurs} />

      <nav aria-label="Sections du tableau de bord" className="overflow-x-auto">
        <ul className="flex min-w-max gap-1 rounded-xl border border-border/70 bg-card p-1 text-sm shadow-xs">
          {[
            { href: '#vue-ensemble', libelle: 'Vue d’ensemble' },
            { href: '#repartitions', libelle: 'Répartitions' },
            { href: '#historique', libelle: 'Historique' },
          ].map((section) => (
            <li key={section.href}>
              <a
                href={section.href}
                className="block min-h-10 rounded-lg px-3 py-2.5 font-medium text-secondary-600 transition-colors hover:bg-muted hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {section.libelle}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/*
        Un « 0 % » sans contexte se lit comme un mauvais résultat, alors qu'il dit souvent qu'il
        n'y a rien à mesurer : aucun dossier clôturé, donc aucun délai moyen. Nommer la cause évite
        de faire passer un dispositif qui démarre pour un dispositif qui échoue.
      */}
      <section id="vue-ensemble" aria-labelledby="titre-vue-ensemble" className="scroll-mt-6 space-y-4">
        <div>
          <h2 id="titre-vue-ensemble" className="text-h2 text-secondary-900">
            Vue d’ensemble
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Les volumes, délais et éléments qui appellent une action.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Indicateur libelle="Déclarations" valeur={String(indicateurs.total)} />
          <Indicateur
            libelle="Taux de résolution"
            valeur={pourcent(indicateurs.tauxResolution)}
            note={indicateurs.total === 0 ? 'Aucune déclaration.' : undefined}
          />
          <Indicateur
            libelle="Taux de clôture"
            valeur={pourcent(indicateurs.tauxCloture)}
            note={
              indicateurs.tauxCloture === 0 && indicateurs.total > 0
                ? 'Aucun dossier clôturé.'
                : undefined
            }
          />
          <Indicateur
            libelle="Délai moyen"
            valeur={indicateurs.delaiMoyen === null ? '—' : `${indicateurs.delaiMoyen} j`}
            note={
              indicateurs.delaiMoyen === null
                ? 'Se calcule à la clôture des dossiers.'
                : undefined
            }
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-h3">À traiter</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Ces deux nombres appelaient une action sans y mener : il fallait deviner où
                retrouver les lignes qu'ils comptaient. Ils ouvrent désormais la liste
                correspondante, déjà filtrée. */}
            <div className="grid grid-cols-2 gap-4">
              <CompteurActionnable
                libelle="Actions correctives en retard"
                valeur={compteurs.actionsEnRetard}
                href={peutVoirActions ? '/actions-correctives?statut=en_retard' : null}
                alerte={compteurs.actionsEnRetard > 0}
              />
              {/*
                ⚠️ « Investigations à valider » A ÉTÉ REMPLACÉ : une investigation n'est soumise à
                aucune validation (décision métier du 2026-09-18). Le compteur portait sur un
                état qui n'existe plus et son lien sur un filtre retiré — il serait resté à zéro
                pour toujours, ce qui se lit comme « rien à faire ».

                Ce qui reste vrai et actionnable : les dossiers encore sous investigation.
              */}
              <CompteurActionnable
                libelle="Investigations en cours"
                valeur={compteurs.investigationsEnCours}
                href={
                  peutVoirInvestigations && compteurs.statutEnInvestigationId !== null
                    ? `/investigations?statutDossierId=${compteurs.statutEnInvestigationId}`
                    : null
                }
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="repartitions" aria-labelledby="titre-repartitions" className="scroll-mt-6 space-y-4">
        <div>
          <h2 id="titre-repartitions" className="text-h2 text-secondary-900">
            Répartitions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            La composition des déclarations selon les principaux axes d’analyse.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Repartition titre="Par gravité" lignes={indicateurs.parGravite} total={indicateurs.total} />
          <Repartition
            titre="Par parcours"
            lignes={indicateurs.parParcours}
            total={indicateurs.total}
          />
          <Repartition titre="Par statut" lignes={indicateurs.parStatut} total={indicateurs.total} />
        </div>

      {/*
        ⚠️ SUR TOUTE LA LARGEUR, et non dans la grille à deux colonnes ci-dessus.

        Neuf familles plus la ligne « Non qualifiée » : serrées sur une demi-largeur, les libellés
        passaient à la ligne et le bloc devenait illisible. C'est aussi la répartition la plus
        récente et la moins connue — la mettre en pleine largeur est ce qui lui donne une chance
        d'être lue.
      */}
      {/*
        ⚠️ MASQUÉ QUAND AUCUN TYPE NE QUALIFIE DE FAMILLE. Le bloc porte alors zéro ligne, et un
        graphique vide se lit comme une panne plutôt que comme un réglage.
      */}
      {indicateurs.parFamilleRisque.length > 0 && (
        <Repartition
          titre="Par famille de risque"
          lignes={indicateurs.parFamilleRisque}
          /*
            ⚠️ LE TOTAL DES LIGNES, et non le total des dossiers : la répartition ne porte plus que
            sur les types qui qualifient une famille. Garder le total général aurait affiché des
            pourcentages qui ne font jamais 100 %, sans dire pourquoi.
          */
          total={indicateurs.parFamilleRisque.reduce((somme, l) => somme + l.total, 0)}
        />
      )}
      </section>

      <section id="historique" aria-labelledby="titre-historique" className="scroll-mt-6">
      <Card>
        <CardHeader>
          <CardTitle id="titre-historique" className="text-h3">Historique mensuel</CardTitle>
        </CardHeader>
        <CardContent>
          {historique.length === 0 ? (
<p className="text-sm text-muted-foreground">
              {filtre.siteDuLecteur != null || filtre.directionDuLecteur != null
                ? 'L’historique mensuel n’est pas disponible pour un compte rattaché à un site ou à une direction : le récapitulatif est agrégé par parcours, sans distinguer les rattachements. Les chiffres du haut de cette page, eux, sont bien limités au vôtre.'
                : 'Le récapitulatif du mois est établi au début du mois suivant. Une ligne apparaîtra ici dès le premier récapitulatif.'}
            </p>
          ) : (
            <>
            <GraphiqueHistorique lignes={historique} />
            <ul className="space-y-3 md:hidden" aria-label="Historique mensuel">
              {historique.map((ligne) => (
                <li key={ligne.periode} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <p className="font-semibold capitalize text-secondary-900">{moisFr(ligne.periode)}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Déclarations</dt>
                      <dd className="mt-0.5 text-base font-semibold text-secondary-900">{ligne.total}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Clôturées</dt>
                      <dd className="mt-0.5 text-base font-semibold text-secondary-900">{ligne.cloturees}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Délai moyen</dt>
                      <dd className="mt-0.5 font-medium text-secondary-800">
                        {ligne.delaiMoyen === null ? '—' : `${ligne.delaiMoyen} j`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Résolution</dt>
                      <dd className="mt-0.5 font-medium text-secondary-800">
                        {pourcent(ligne.tauxResolution)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="py-2 font-medium text-muted-foreground">Période</th>
                    <th scope="col" className="py-2 font-medium text-muted-foreground">Déclarations</th>
                    <th scope="col" className="py-2 font-medium text-muted-foreground">Clôturées</th>
                    <th scope="col" className="py-2 font-medium text-muted-foreground">Délai moyen</th>
                    <th scope="col" className="py-2 font-medium text-muted-foreground">Taux de résolution</th>
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
            </>
          )}
        </CardContent>
      </Card>
      </section>
    </div>
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
  const [actionsEnRetard, investigationsEnCours, statutEnInvestigation] = await Promise.all([
    prisma.actions_correctives.count({
      where: { statut: 'en_retard', dossiers: { parcours: { code: { in: codes } } } },
    }),
    // Les fiches dont le DOSSIER est encore en investigation. La fiche, elle, n'a plus d'état :
    // compter sur `investigations.statut` ramènerait toutes les fiches jamais ouvertes, y compris
    // celles de dossiers résolus depuis des mois.
    prisma.investigations.count({
      where: {
        dossiers: {
          parcours: { code: { in: codes } },
          statuts_dossier: { code: 'en_investigation' },
        },
      },
    }),
    // L'identifiant du statut, pour que le lien ouvre EXACTEMENT la liste que le nombre compte.
    // La barre de filtres travaille sur des identifiants, pas sur des codes.
    prisma.statuts_dossier.findFirst({
      where: { code: 'en_investigation' },
      select: { id: true },
    }),
  ])

  return {
    actionsEnRetard,
    investigationsEnCours,
    statutEnInvestigationId: statutEnInvestigation === null ? null : String(statutEnInvestigation.id),
  }
}

/**
 * Référentiels des filtres.
 *
 * Plusieurs catégories portent le même libellé d'un parcours à l'autre — « Autre » quatre fois.
 * Tant qu'aucun parcours n'est choisi, le parcours est accolé au libellé pour les départager ;
 * dès qu'un parcours est retenu, l'ambiguïté disparaît avec lui.
 */
async function chargerReferentiels(parcoursId: bigint | null) {
  const [parcours, categories, statuts, gravites, sites, directions] = await Promise.all([
    prisma.parcours.findMany({
      where: { actif: true },
      orderBy: { ordre: 'asc' },
      select: { id: true, libelle: true },
    }),
    prisma.categories.findMany({
      where: { actif: true, ...(parcoursId ? { parcours_id: parcoursId } : {}) },
      orderBy: [{ parcours: { ordre: 'asc' } }, { libelle: 'asc' }],
      select: { id: true, libelle: true, parcours: { select: { libelle: true } } },
    }),
    prisma.statuts_dossier.findMany({
      orderBy: { ordre: 'asc' },
      select: { id: true, libelle_interne: true },
    }),
    prisma.niveaux_gravite.findMany({
      where: { actif: true },
      orderBy: { niveau: 'asc' },
      select: { id: true, libelle: true },
    }),
    prisma.sites.findMany({
      where: { actif: true },
      orderBy: { libelle: 'asc' },
      select: { id: true, libelle: true },
    }),
    prisma.directions.findMany({
      where: { actif: true, site_id: null },
      orderBy: { libelle: 'asc' },
      select: { id: true, libelle: true },
    }),
  ])

  const option = (l: { id: bigint; libelle: string }) => ({
    valeur: String(l.id),
    libelle: l.libelle,
  })

  return {
    parcours: parcours.map(option),
    categories: categories.map((c) => ({
      valeur: String(c.id),
      libelle: parcoursId ? c.libelle : `${c.libelle} — ${c.parcours.libelle}`,
    })),
    statuts: statuts.map((s) => ({ valeur: String(s.id), libelle: s.libelle_interne })),
    gravites: gravites.map(option),
    sites: sites.map(option),
    directions: directions.map(option),
  }
}

function Indicateur({
  libelle,
  valeur,
  note,
}: {
  libelle: string
  valeur: string
  note?: string
}) {
  return (
    <Card className="p-5 relative overflow-hidden bg-gradient-to-br from-card to-secondary-50/30 border-border/80 shadow-xs hover:shadow-md transition-all duration-200 rounded-2xl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-secondary-500">{libelle}</p>
        <span className="h-2 w-2 rounded-full bg-primary-500/70" />
      </div>
      <p className="mt-2 text-chiffre text-secondary-900 font-heading">{valeur}</p>
      {note && <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{note}</p>}
    </Card>
  )
}

/**
 * Compteur qui mène à ce qu'il compte.
 *
 * `href` vaut `null` quand le rôle n'a pas accès à la liste : le nombre reste affiché — il
 * appartient au pilotage — mais il ne promet pas une destination qui serait refusée.
 */
function CompteurActionnable({
  libelle,
  valeur,
  href,
  alerte = false,
}: {
  libelle: string
  valeur: number
  href: string | null
  alerte?: boolean
}) {
  const estAlerte = alerte && valeur > 0
  const contenu = (
    <div className="flex flex-col">
      <p className="text-xs font-semibold uppercase tracking-wider text-secondary-500">{libelle}</p>
      <p
        className={cn(
          'mt-1 text-titre',
          estAlerte ? 'text-destructive' : 'text-secondary-900'
        )}
      >
        {valeur}
      </p>
    </div>
  )

  if (href === null || valeur === 0) {
    return <div className="p-3.5 rounded-xl border border-border/50 bg-card/60">{contenu}</div>
  }

  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        estAlerte
          ? 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/50'
          : 'border-border/70 bg-card hover:bg-secondary-50/60 hover:border-primary/40 shadow-2xs hover:shadow-xs'
      )}
    >
      {contenu}
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
        Voir la liste
        <ArrowRight className="h-3 w-3" aria-hidden />
      </span>
    </Link>
  )
}

/**
 * Répartition en barres proportionnelles.
 *
 * La barre est du CSS pur, sans bibliothèque de graphique : le rendu reste entièrement serveur,
 * donc imprimable et lisible sans JavaScript.
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
  const lignesTriees = [...lignes].sort((a, b) => b.total - a.total)
  const principale = lignesTriees[0]

  return (
    <Card className="rounded-2xl border-border/80 shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-semibold tracking-tight text-secondary-900">
          {titre}
        </CardTitle>
        {principale && total > 0 && (
          <p className="text-xs text-muted-foreground">
            Principal : <span className="font-semibold text-secondary-800">{principale.libelle}</span>
            {' · '}{Math.round((principale.total / total) * 100)} %
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {lignes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune donnée.</p>
        ) : (
          <ul className="space-y-4">
            {lignesTriees.map((ligne, index) => {
              const part = total > 0 ? Math.round((ligne.total / total) * 100) : 0

              return (
                <li key={ligne.libelle} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-secondary-800">
                      <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="truncate">{ligne.libelle}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-secondary-700">
                      {ligne.total} <span className="font-normal text-muted-foreground">({part} %)</span>
                    </span>
                  </div>
                  <div
                    className="ml-6 h-2.5 overflow-hidden rounded-full bg-secondary-100"
                    role="img"
                    aria-label={`${ligne.libelle} : ${ligne.total}, soit ${part} %`}
                  >
                    <div
                      className="h-full min-w-1 rounded-full bg-gradient-to-r from-primary-700 to-primary-500 transition-[width] duration-500"
                      style={{
                        width: `${part}%`,
                        ...(ligne.couleur ? { background: ligne.couleur } : {}),
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

function GraphiqueHistorique({
  lignes,
}: {
  lignes: Awaited<ReturnType<typeof historiqueMensuel>>
}) {
  const visibles = lignes.slice(-12)
  const maximum = Math.max(1, ...visibles.map((ligne) => ligne.total))

  return (
    <div className="mb-6 hidden rounded-xl border border-border/70 bg-secondary-50/35 p-5 md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-secondary-900">Évolution des volumes</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Les 12 derniers mois disponibles</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground" aria-label="Légende">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary-500" /> Déclarations
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Clôturées
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div
          className="flex h-52 min-w-[42rem] items-end gap-3 border-b border-secondary-200 px-2"
          role="img"
          aria-label="Évolution mensuelle des déclarations et dossiers clôturés"
        >
          {visibles.map((ligne) => {
            const hauteurTotal = Math.max(4, Math.round((ligne.total / maximum) * 168))
            const hauteurCloturees = Math.max(
              ligne.cloturees > 0 ? 3 : 0,
              Math.round((ligne.cloturees / maximum) * 168)
            )

            return (
              <div
                key={ligne.periode}
                className="flex min-w-0 flex-1 flex-col items-center justify-end"
                title={`${moisFr(ligne.periode)} : ${ligne.total} déclarations, ${ligne.cloturees} clôturées`}
              >
                <span className="mb-1 text-[10px] font-semibold tabular-nums text-secondary-700">
                  {ligne.total}
                </span>
                <div className="flex h-[168px] items-end gap-1">
                  <span
                    className="w-3 rounded-t bg-primary-500"
                    style={{ height: `${hauteurTotal}px` }}
                    aria-hidden
                  />
                  <span
                    className="w-3 rounded-t bg-emerald-500"
                    style={{ height: `${hauteurCloturees}px` }}
                    aria-hidden
                  />
                </div>
                <span className="mt-2 whitespace-nowrap text-[10px] capitalize text-muted-foreground">
                  {moisCourtFr(ligne.periode)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Un taux s'affiche arrondi.
 *
 * « 9.09 % » sur 22 dossiers donne à croire à une mesure fine là où deux dossiers de plus
 * changeraient le chiffre de dix points. L'arrondi dit la même chose sans promettre une précision
 * que l'échantillon ne porte pas. La valeur exacte reste celle des exports.
 */
const pourcent = (valeur: number | null) => (valeur === null ? '—' : `${Math.round(valeur)} %`)

const moisFr = (periode: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(periode)
  )

const moisCourtFr = (periode: string) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(periode)
  )
