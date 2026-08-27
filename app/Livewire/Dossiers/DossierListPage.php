<?php

namespace App\Livewire\Dossiers;

use App\Models\Categorie;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use App\Models\Parcours;
use App\Models\StatutDossier;
use App\Models\User;
use App\Support\RoleParcoursScope;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

/**
 * EX-GES-01 : liste des dossiers, filtrable par parcours/catégorie/statut/gravité/période. Le
 * périmètre visible (quels dossiers apparaissent avant même tout filtre) reflète exactement
 * DossierPolicy::view() — ne jamais afficher ici un dossier que la Policy refuserait à l'unité.
 */
class DossierListPage extends Component
{
    use WithPagination;

    #[Url]
    public string $parcoursId = '';

    #[Url]
    public string $categorieId = '';

    #[Url]
    public string $statutId = '';

    #[Url]
    public string $niveauGraviteId = '';

    #[Url]
    public string $periodeDebut = '';

    #[Url]
    public string $periodeFin = '';

    public function mount(): void
    {
        $this->authorize('viewAny', Dossier::class);
    }

    public function updated(): void
    {
        $this->resetPage();
    }

    public function resetFiltres(): void
    {
        $this->reset(['parcoursId', 'categorieId', 'statutId', 'niveauGraviteId', 'periodeDebut', 'periodeFin']);
    }

    protected function perimetre(): Builder
    {
        /** @var User $user */
        $user = Auth::user();

        if ($user->hasRole('employe_declarant')) {
            return Dossier::query()->where('declarant_user_id', $user->id)->where('is_anonymous', false);
        }

        if ($user->can('dossiers.view.all')) {
            return Dossier::query();
        }

        if ($user->can('dossiers.view') || $user->can('dossiers.view.own')) {
            $codes = array_map(fn ($c) => $c->value, RoleParcoursScope::parcoursAutorises($user));

            return Dossier::query()->whereHas('parcours', fn ($q) => $q->whereIn('code', $codes));
        }

        return Dossier::query()->whereRaw('1 = 0');
    }

    public function getDossiersProperty(): LengthAwarePaginator
    {
        return $this->perimetre()
            ->with(['parcours', 'categorie', 'niveauGravite', 'statut'])
            ->when($this->parcoursId !== '', fn (Builder $q) => $q->where('parcours_id', $this->parcoursId))
            ->when($this->categorieId !== '', fn (Builder $q) => $q->where('categorie_id', $this->categorieId))
            ->when($this->statutId !== '', fn (Builder $q) => $q->where('statut_id', $this->statutId))
            ->when($this->niveauGraviteId !== '', fn (Builder $q) => $q->where('niveau_gravite_id', $this->niveauGraviteId))
            ->when($this->periodeDebut !== '', fn (Builder $q) => $q->whereDate('created_at', '>=', $this->periodeDebut))
            ->when($this->periodeFin !== '', fn (Builder $q) => $q->whereDate('created_at', '<=', $this->periodeFin))
            ->orderByDesc('created_at')
            ->paginate(20);
    }

    public function getParcoursDisponiblesProperty()
    {
        return Parcours::query()->actif()->orderBy('ordre')->get();
    }

    public function getCategoriesDisponiblesProperty()
    {
        if ($this->parcoursId === '') {
            return Categorie::query()->actif()->orderBy('libelle')->get();
        }

        return Categorie::query()->where('parcours_id', $this->parcoursId)->actif()->orderBy('ordre')->get();
    }

    public function getStatutsDisponiblesProperty()
    {
        return StatutDossier::query()->orderBy('ordre')->get();
    }

    public function getNiveauxGraviteDisponiblesProperty()
    {
        return NiveauGravite::query()->actif()->orderBy('niveau')->get();
    }

    public function render()
    {
        return view('livewire.dossiers.dossier-list-page');
    }
}
