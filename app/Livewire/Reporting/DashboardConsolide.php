<?php

namespace App\Livewire\Reporting;

use App\Exports\DossiersExport;
use App\Models\Categorie;
use App\Models\Direction;
use App\Models\Dossier;
use App\Models\DossierAffectation;
use App\Models\NiveauGravite;
use App\Models\Parcours;
use App\Models\Site;
use App\Models\StatistiqueMensuelle;
use App\Models\StatutDossier;
use App\Services\Reporting\IndicateurService;
use App\Support\ReportingFilter;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Collection;
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
    public function getIndicateursProperty(): ?array
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

    /** @return Collection<int, StatistiqueMensuelle> EX-REP-05 : historique, 12 derniers mois archivés. */
    public function getHistoriqueMensuelProperty(): Collection
    {
        if (! $this->utilisateurPeutVoirRapport()) {
            return new Collection;
        }

        return StatistiqueMensuelle::query()
            ->selectRaw('periode, sum(nb_declarations) as total, sum(nb_cloturees) as cloturees')
            ->groupBy('periode')
            ->orderByDesc('periode')
            ->limit(12)
            ->get();
    }

    /** Dossiers actuellement affectés à l'utilisateur courant — repli pour les rôles sans reporting.view. */
    public function getMesDossiersAffectesProperty(): int
    {
        return DossierAffectation::query()->where('user_id', Auth::id())->where('actif', true)->count();
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
        return view('livewire.reporting.dashboard-consolide');
    }
}
