<?php

namespace App\Livewire\ActionsCorrectives;

use App\Models\ActionCorrective;
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
 * Vue transverse de toutes les actions correctives (tous dossiers confondus), filtrable par
 * statut/responsable/parcours/échéance. Même règle que InvestigationListPage : périmètre
 * RoleParcoursScope pushé en SQL avant pagination.
 *
 * "en_retard" est recalculé quotidiennement par App\Console\Commands\DetecterRetards (cf.
 * routes/console.php) : un filtre sur ce statut peut donc retarder jusqu'à ~24h par rapport à une
 * action qui vient tout juste de dépasser son échéance — non bloquant, juste une limite connue.
 */
class ActionCorrectiveListPage extends Component
{
    use WithPagination;

    #[Url]
    public string $statut = '';

    #[Url]
    public string $responsableId = '';

    #[Url]
    public string $parcoursId = '';

    #[Url]
    public string $echeanceDebut = '';

    #[Url]
    public string $echeanceFin = '';

    public function mount(): void
    {
        $this->authorize('viewAny', ActionCorrective::class);
    }

    public function updated(): void
    {
        $this->resetPage();
    }

    public function resetFiltres(): void
    {
        $this->reset(['statut', 'responsableId', 'parcoursId', 'echeanceDebut', 'echeanceFin']);
    }

    public function getActionsProperty(): LengthAwarePaginator
    {
        $codes = array_map(fn ($c) => $c->value, RoleParcoursScope::parcoursAutorises(Auth::user()));

        return ActionCorrective::query()
            ->whereHas('dossier.parcours', fn (Builder $q) => $q->whereIn('code', $codes))
            ->with(['dossier.parcours', 'dossier.categorie', 'responsable'])
            ->when($this->statut !== '', fn (Builder $q) => $q->where('statut', $this->statut))
            ->when($this->responsableId !== '', fn (Builder $q) => $q->where('responsable_id', $this->responsableId))
            ->when($this->parcoursId !== '', fn (Builder $q) => $q->whereHas('dossier', fn (Builder $q2) => $q2->where('parcours_id', $this->parcoursId)))
            ->when($this->echeanceDebut !== '', fn (Builder $q) => $q->whereDate('echeance', '>=', $this->echeanceDebut))
            ->when($this->echeanceFin !== '', fn (Builder $q) => $q->whereDate('echeance', '<=', $this->echeanceFin))
            ->orderBy('echeance')
            ->paginate(20);
    }

    /** @return Collection<int, Parcours> */
    public function getParcoursDisponiblesProperty(): Collection
    {
        return Parcours::query()->actif()->orderBy('ordre')->get();
    }

    /** @return Collection<int, User> */
    public function getResponsablesDisponiblesProperty(): Collection
    {
        return User::query()->where('actif', true)->orderBy('name')->get();
    }

    /** @return int Jours restants avant l'échéance (négatif si dépassée). */
    public function joursRestants(ActionCorrective $action): int
    {
        return (int) now()->startOfDay()->diffInDays($action->echeance, false);
    }

    public function render()
    {
        return view('livewire.actions-correctives.action-corrective-list-page')
            ->layout('components.layouts.app', ['title' => 'Actions correctives']);
    }
}
