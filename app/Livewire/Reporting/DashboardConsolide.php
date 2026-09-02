<?php

namespace App\Livewire\Reporting;

use App\Exports\DossiersExport;
use App\Models\ActionCorrective;
use App\Models\Categorie;
use App\Models\Direction;
use App\Models\Dossier;
use App\Models\DossierAffectation;
use App\Models\Investigation;
use App\Models\NiveauGravite;
use App\Models\Parcours;
use App\Models\Site;
use App\Models\StatistiqueMensuelle;
use App\Models\StatutDossier;
use App\Services\Reporting\IndicateurService;
use App\Support\LigneHistoriqueMensuel;
use App\Support\ReportingFilter;
use App\Support\RoleParcoursScope;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Livewire\Attributes\Url;
use Livewire\Component;
use Maatwebsite\Excel\Facades\Excel;

/**
 * EX-REP-01/02 : tableau de bord consolidé, seul point d'entrée post-connexion (`/dashboard`,
 * accessible à tous les utilisateurs authentifiés). Le contenu se ramifie selon la permission
 * `reporting.view` — jamais un 403 sur la page d'atterrissage elle-même : un rôle de traitement
 * sans vue transverse voit un résumé personnel, `service_mgp`/`dg`/`auditeur` voient le tableau
 * de bord consolidé complet (docs/decisions-techniques.md DT-31).
 */
class DashboardConsolide extends Component
{
    #[Url]
    public string $parcoursId = '';

    #[Url]
    public string $categorieId = '';

    #[Url]
    public string $statutId = '';

    #[Url]
    public string $niveauGraviteId = '';

    #[Url]
    public string $siteId = '';

    #[Url]
    public string $directionId = '';

    #[Url]
    public string $periodeDebut = '';

    #[Url]
    public string $periodeFin = '';

    public bool $inclureNominatif = false;

    public function resetFiltres(): void
    {
        $this->reset([
            'parcoursId', 'categorieId', 'statutId', 'niveauGraviteId',
            'siteId', 'directionId', 'periodeDebut', 'periodeFin',
        ]);
    }

    protected function filtre(): ReportingFilter
    {
        return new ReportingFilter(
            parcoursId: $this->parcoursId ?: null,
            categorieId: $this->categorieId ?: null,
            statutId: $this->statutId ?: null,
            niveauGraviteId: $this->niveauGraviteId ?: null,
            siteId: $this->siteId ?: null,
            directionId: $this->directionId ?: null,
            periodeDebut: $this->periodeDebut ?: null,
            periodeFin: $this->periodeFin ?: null,
        );
    }

    public function getPeutVoirRapportProperty(): bool
    {
        return $this->utilisateurPeutVoirRapport();
    }

    public function getPeutExporterProperty(): bool
    {
        return $this->utilisateurPeutExporter();
    }

    public function getPeutExporterNominatifProperty(): bool
    {
        return $this->utilisateurPeutExporterNominatif();
    }

    /**
     * Vérifications brutes (méthodes classiques, pas des "computed properties" Livewire) : Larastan
     * ne résout pas l'accès magique `$this->peutVoirRapport` (uniquement possible en dehors de
     * cette classe, ex. depuis la vue Blade, hors du périmètre analysé). Les méthodes get*Property()
     * ci-dessus restent l'API destinée à la vue ; le code PHP de cette classe appelle toujours les
     * méthodes ci-dessous directement.
     */
    private function utilisateurPeutVoirRapport(): bool
    {
        return Auth::user()->can('reporting.view');
    }

    private function utilisateurPeutExporter(): bool
    {
        return Gate::allows('export-rapports');
    }

    private function utilisateurPeutExporterNominatif(): bool
    {
        return Gate::allows('export-rapports-nominatif');
    }

    /** @return array<string, mixed>|null Null si l'utilisateur n'a pas reporting.view. */
    private function calculerIndicateurs(): ?array
    {
        if (! $this->utilisateurPeutVoirRapport()) {
            return null;
        }

        $service = app(IndicateurService::class);
        $filtre = $this->filtre();

        return [
            'total' => $service->nbDeclarations($filtre),
            'tauxResolution' => $service->tauxResolution($filtre),
            'tauxCloture' => $service->tauxCloture($filtre),
            'delaiMoyen' => $service->delaiMoyenJours($filtre),
            'parParcours' => $service->repartitionParParcours($filtre),
            'parStatut' => $service->repartitionParStatut($filtre),
            'parGravite' => $service->repartitionParGravite($filtre),
        ];
    }

    /** @return array<string, mixed>|null Null si l'utilisateur n'a pas reporting.view. */
    public function getIndicateursProperty(): ?array
    {
        return $this->calculerIndicateurs();
    }

    /**
     * EX-REP-05 : historique des 12 derniers mois archivés, du plus récent au plus ancien.
     *
     * @return SupportCollection<int, LigneHistoriqueMensuel>
     */
    private function chargerHistoriqueMensuel(): SupportCollection
    {
        if (! $this->utilisateurPeutVoirRapport()) {
            return new SupportCollection;
        }

        return StatistiqueMensuelle::query()
            ->selectRaw('periode, sum(nb_declarations) as total, sum(nb_cloturees) as cloturees, avg(delai_moyen_jours) as delai_moyen, avg(taux_resolution) as taux_resolution')
            ->groupBy('periode')
            ->orderByDesc('periode')
            ->limit(12)
            ->get()
            ->map(LigneHistoriqueMensuel::depuisAgregat(...))
            ->values();
    }

    /** @return SupportCollection<int, LigneHistoriqueMensuel> */
    public function getHistoriqueMensuelProperty(): SupportCollection
    {
        return $this->chargerHistoriqueMensuel();
    }

    /**
     * Repousse les séries vers Chart.js après chaque changement de filtre. Appelle les méthodes
     * privées ci-dessus, jamais les "computed properties" magiques `$this->indicateurs` /
     * `$this->historiqueMensuel` : celles-ci ne sont résolues que hors de cette classe (depuis la
     * vue Blade), cf. le commentaire de utilisateurPeutVoirRapport() et DT-31.
     */
    public function updated(): void
    {
        $indicateurs = $this->calculerIndicateurs();

        if ($indicateurs === null) {
            return;
        }

        $parGravite = collect($indicateurs['parGravite'])
            ->map(fn ($ligne) => ['libelle' => $ligne->libelle, 'total' => $ligne->total, 'couleur' => $ligne->couleur ?? null])
            ->values()
            ->toArray();

        $historiqueMensuel = $this->chargerHistoriqueMensuel()
            ->reverse()
            ->values()
            ->map(fn (LigneHistoriqueMensuel $ligne) => $ligne->jsonSerialize())
            ->toArray();

        $this->dispatch('graphiques-actualises', parGravite: $parGravite, historiqueMensuel: $historiqueMensuel);
    }

    /** Dossiers actuellement affectés à l'utilisateur courant — repli pour les rôles sans reporting.view. */
    public function getMesDossiersAffectesProperty(): int
    {
        return DossierAffectation::query()->where('user_id', Auth::id())->where('actif', true)->count();
    }

    /**
     * Aperçu court des dossiers assignés (profil "Traitement de dossier",
     * docs/page-redesign-map.md §1) — borné par construction (les affectations d'un seul
     * utilisateur), donc sans le risque de N+1 qui interdit un calcul d'échéance agrégé sur
     * l'ensemble du périmètre (cf. note sur getBlocATraiterProperty ci-dessous).
     *
     * @return Collection<int, Dossier>
     */
    public function getMesDossiersATraiterProperty(): Collection
    {
        return Dossier::query()
            ->whereHas('affectations', fn ($q) => $q->where('user_id', Auth::id())->where('actif', true))
            ->with(['parcours', 'categorie', 'statut'])
            ->latest('updated_at')
            ->limit(5)
            ->get();
    }

    /**
     * Bloc "à traiter" du tableau de bord consolidé (docs/page-redesign-map.md §1, réponse à
     * l'audit UX "le dashboard répond à combien mais pas à quoi faire"). Volontairement limité
     * à des compteurs déjà indexables en SQL : `actions_correctives.statut = 'en_retard'` est
     * recalculé quotidiennement par App\Console\Commands\RecalculerRetardActionsCorrectives (le
     * même mécanisme que consomme déjà ActionCorrectiveListPage), et
     * `investigations.statut = 'en_attente_validation'` est une simple colonne. Un compteur
     * "dossiers en retard" agrégé sur tout le périmètre n'a délibérément pas été ajouté ici :
     * DelaiService::estEnRetard() interroge historique_statuts par dossier (pas une colonne
     * SQL), l'exécuter sur potentiellement des centaines de dossiers à chaque chargement de la
     * page d'atterrissage post-connexion créerait un vrai risque de N+1 sur l'écran le plus
     * visité de l'application — à traiter via une colonne recalculée (sur le modèle
     * d'ActionCorrective) si ce compteur est demandé, pas via un calcul à la volée ici.
     */
    public function getBlocATraiterProperty(): ?array
    {
        if (! $this->utilisateurPeutVoirRapport()) {
            return null;
        }

        $codes = array_map(fn ($c) => $c->value, RoleParcoursScope::parcoursAutorises(Auth::user()));

        return [
            'actionsEnRetard' => ActionCorrective::query()
                ->whereHas('dossier.parcours', fn ($q) => $q->whereIn('code', $codes))
                ->where('statut', 'en_retard')
                ->count(),
            'investigationsEnAttente' => Investigation::query()
                ->whereHas('dossier.parcours', fn ($q) => $q->whereIn('code', $codes))
                ->where('statut', 'en_attente_validation')
                ->count(),
        ];
    }

    public function exporterExcel()
    {
        abort_unless($this->utilisateurPeutExporter(), 403);

        return Excel::download(
            new DossiersExport($this->filtre(), $this->inclureNominatif && $this->utilisateurPeutExporterNominatif()),
            'rapport-dossiers.xlsx',
        );
    }

    public function exporterPdf()
    {
        abort_unless($this->utilisateurPeutExporter(), 403);

        $inclureNominatif = $this->inclureNominatif && $this->utilisateurPeutExporterNominatif();

        $dossiers = $this->filtre()
            ->appliquer(Dossier::query())
            ->with(['parcours', 'categorie', 'niveauGravite', 'statut', 'identite'])
            ->get();

        return Pdf::loadView('exports.dossiers-pdf', [
            'dossiers' => $dossiers,
            'inclureNominatif' => $inclureNominatif,
        ])->download('rapport-dossiers.pdf');
    }

    /** @return Collection<int, Parcours> */
    public function getParcoursDisponiblesProperty(): Collection
    {
        return Parcours::query()->actif()->orderBy('ordre')->get();
    }

    /** @return Collection<int, Categorie> */
    public function getCategoriesDisponiblesProperty(): Collection
    {
        if ($this->parcoursId === '') {
            return Categorie::query()->actif()->orderBy('libelle')->get();
        }

        return Categorie::query()->where('parcours_id', $this->parcoursId)->actif()->orderBy('ordre')->get();
    }

    /** @return Collection<int, StatutDossier> */
    public function getStatutsDisponiblesProperty(): Collection
    {
        return StatutDossier::query()->orderBy('ordre')->get();
    }

    /** @return Collection<int, NiveauGravite> */
    public function getNiveauxGraviteDisponiblesProperty(): Collection
    {
        return NiveauGravite::query()->actif()->orderBy('niveau')->get();
    }

    /** @return Collection<int, Site> */
    public function getSitesDisponiblesProperty(): Collection
    {
        return Site::query()->actif()->orderBy('libelle')->get();
    }

    /** @return Collection<int, Direction> */
    public function getDirectionsDisponiblesProperty(): Collection
    {
        return Direction::query()->actif()->orderBy('libelle')->get();
    }

    public function render()
    {
        return view('livewire.reporting.dashboard-consolide')
            ->layout('components.layouts.app', ['title' => 'Tableau de bord']);
    }
}
