import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Inbox, ShieldCheck } from 'lucide-react'
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

      <BandeUrgences urgences={urgences} peutVoirTout={aPermission(utilisateur, 'dossiers.view.all')} />

      {administre && <BandeAdministration alertes={alertes} traiteDesDossiers={traiteDesDossiers} />}

      {mesDossiers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-h3">Vos dossiers à traiter</CardTitle>
            <Link
              href="/dossiers?assigneAMoi=1"
              className="flex items-center gap-1 text-caption text-primary-700 underline-offset-2 hover:underline"
            >
              Voir tous les miens
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {mesDossiers.map((d) => (
                <li key={d.id} className="relative flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/dossiers/${d.id}`}
                    className="min-w-0 text-sm after:absolute after:inset-0 hover:underline"
                  >
                    <span className="font-mono text-muted-foreground">{d.reference}</span>{' '}
                    <span className="text-secondary-900">{d.categories.libelle}</span>
                  </Link>
                  <EtiquetteStatut ton="encours">
                    {d.statuts_dossier.libelle_interne}
                  </EtiquetteStatut>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
        traiteDesDossiers &&
        mesDossiers.length === 0 &&
        urgences.enRetard === 0 &&
        urgences.nonAffectes === 0 && (
          <Card className="p-0">
            {/*
              « Affecté » ne dit pas tout : un évènement indésirable n'est affecté à personne et
              revient au chargé de sécurité par son rattachement. Le libellé parlait d'affectation
              là où la charge peut venir des deux, et laissait croire à un oubli de paramétrage.
            */}
            <EtatVide
              icone={Inbox}
              titre="Aucun dossier ne vous revient pour l’instant."
              description="Ceux qui vous seront confiés — par affectation, ou par votre rattachement pour un évènement indésirable — apparaîtront ici."
            />
          </Card>
        )
      )}
    </div>
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
      libelle: 'Vos dossiers en retard',
      valeur: urgences.miensEnRetard,
      href: '/dossiers?assigneAMoi=1',
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
      libelle: 'Vos dossiers en cours',
      valeur: urgences.miens,
      href: '/dossiers?assigneAMoi=1',
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cartes.map((carte) => (
        <Link
          key={carte.cle}
          href={carte.href}
          className="group block rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Card
            className={`h-full p-4 transition-shadow group-hover:shadow-sm ${
              carte.grave ? 'ring-destructive/30 group-hover:ring-destructive/50' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-caption text-muted-foreground">{carte.libelle}</p>
              {carte.grave && (
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
              )}
            </div>
            <p
              className={`mt-1 text-h1 ${carte.grave ? 'text-destructive' : 'text-secondary-900'}`}
            >
              {carte.valeur}
            </p>
            <p className="mt-1 text-caption text-muted-foreground">{carte.aide}</p>
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
    <>
      <BarreFiltres base="/dashboard" champs={champs} valeurs={valeurs} />

      {/*
        Un « 0 % » sans contexte se lit comme un mauvais résultat, alors qu'il dit souvent qu'il
        n'y a rien à mesurer : aucun dossier clôturé, donc aucun délai moyen. Nommer la cause évite
        de faire passer un dispositif qui démarre pour un dispositif qui échoue.
      */}
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

      <div className="grid gap-4 sm:grid-cols-2">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Historique mensuel</CardTitle>
        </CardHeader>
        <CardContent>
          {historique.length === 0 ? (
<p className="text-sm text-muted-foreground">
              {filtre.siteDuLecteur != null || filtre.directionDuLecteur != null
                ? 'L’historique mensuel n’est pas disponible pour un compte rattaché à un site ou à une direction : le récapitulatif est agrégé par parcours, sans distinguer les rattachements. Les chiffres du haut de cette page, eux, sont bien limités au vôtre.'
                : 'Le récapitulatif du mois est établi au début du mois suivant. Une ligne apparaîtra ici dès le premier récapitulatif.'}
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
    prisma.parcours.findMany({ where: { actif: true }, orderBy: { ordre: 'asc' } }),
    prisma.categories.findMany({
      where: { actif: true, ...(parcoursId ? { parcours_id: parcoursId } : {}) },
      orderBy: [{ parcours: { ordre: 'asc' } }, { libelle: 'asc' }],
      select: { id: true, libelle: true, parcours: { select: { libelle: true } } },
    }),
    prisma.statuts_dossier.findMany({ orderBy: { ordre: 'asc' } }),
    prisma.niveaux_gravite.findMany({ where: { actif: true }, orderBy: { niveau: 'asc' } }),
    prisma.sites.findMany({ where: { actif: true }, orderBy: { libelle: 'asc' } }),
    prisma.directions.findMany({ where: { actif: true }, orderBy: { libelle: 'asc' } }),
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
  /** Ce que le chiffre ne dit pas : pourquoi il vaut zéro, ou pourquoi il n'existe pas. */
  note?: string
}) {
  return (
    <Card className="p-5">
      <p className="text-caption text-muted-foreground">{libelle}</p>
      <p className="mt-1 text-h1 text-secondary-900">{valeur}</p>
      {note && <p className="mt-1 text-caption text-muted-foreground">{note}</p>}
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
  const contenu = (
    <>
      <p className="text-caption text-muted-foreground">{libelle}</p>
      <p
        className={`mt-1 text-h2 ${alerte && valeur > 0 ? 'text-destructive' : 'text-secondary-900'}`}
      >
        {valeur}
      </p>
    </>
  )

  if (href === null || valeur === 0) {
    return <div>{contenu}</div>
  }

  return (
    <Link
      href={href}
      className="group -m-2 rounded-lg p-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {contenu}
      <span className="mt-0.5 flex items-center gap-1 text-caption text-primary-700 opacity-0 transition-opacity group-hover:opacity-100">
        Voir la liste
        <ArrowRight className="h-3 w-3" aria-hidden />
      </span>
    </Link>
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
          <p className="text-sm text-muted-foreground">Aucune donnée.</p>
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
