<?php

namespace App\Livewire\Investigations;

use App\Models\Investigation;
use App\Models\Parcours;
use App\Models\User;
use App\Support\RoleParcoursScope;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

/**
 * Vue transverse de toutes les investigations (tous dossiers confondus), filtrable par
 * statut/enquêteur/parcours/période. Le périmètre respecte RoleParcoursScope, poussé dans la
 * requête SQL (whereHas) avant pagination — ne jamais filtrer en PHP après ->get() ici, cette
 * liste peut couvrir un grand nombre de dossiers contrairement à InvestigationPanel (scopé à un
 * seul dossier).
 */
class InvestigationListPage extends Component
{
    use WithPagination;

    #[Url]
    public string $statut = '';

    #[Url]
    public string $enqueteurId = '';

    #[Url]
    public string $parcoursId = '';

    #[Url]
    public string $periodeDebut = '';

    #[Url]
    public string $periodeFin = '';

    public function mount(): void
    {
        $this->authorize('viewAny', Investigation::class);
    }

    public function updated(): void
    {
        $this->resetPage();
    }

    public function resetFiltres(): void
    {
        $this->reset(['statut', 'enqueteurId', 'parcoursId', 'periodeDebut', 'periodeFin']);
    }

    public function getInvestigationsProperty(): LengthAwarePaginator
    {
        $codes = array_map(fn ($c) => $c->value, RoleParcoursScope::parcoursAutorises(Auth::user()));

        return Investigation::query()
            ->whereHas('dossier.parcours', fn (Builder $q) => $q->whereIn('code', $codes))
            ->with(['dossier.parcours', 'dossier.categorie', 'enqueteur', 'validateur'])
            ->when($this->statut !== '', fn (Builder $q) => $q->where('statut', $this->statut))
            ->when($this->enqueteurId !== '', fn (Builder $q) => $q->where('enqueteur_id', $this->enqueteurId))
            ->when($this->parcoursId !== '', fn (Builder $q) => $q->whereHas('dossier', fn (Builder $q2) => $q2->where('parcours_id', $this->parcoursId)))
            ->when($this->periodeDebut !== '', fn (Builder $q) => $q->whereDate('date_ouverture', '>=', $this->periodeDebut))
            ->when($this->periodeFin !== '', fn (Builder $q) => $q->whereDate('date_ouverture', '<=', $this->periodeFin))
            ->orderByDesc('date_ouverture')
            ->paginate(20);
    }

    /** @return Collection<int, Parcours> */
    public function getParcoursDisponiblesProperty(): Collection
    {
        return Parcours::query()->actif()->orderBy('ordre')->get();
    }

    /** @return Collection<int, User> */
    public function getEnqueteursDisponiblesProperty(): Collection
    {
        return User::query()->where('actif', true)->orderBy('name')->get();
    }

    public function render()
    {
        return view('livewire.investigations.investigation-list-page')
            ->layout('components.layouts.app', ['title' => 'Investigations']);
    }
}
