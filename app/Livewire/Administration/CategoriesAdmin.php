<?php

namespace App\Livewire\Administration;

use App\Models\Categorie;
use App\Models\Parcours;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Livewire\Component;

/**
 * Référentiel « catégories » (`referentiels.categories.manage`, DT-02 : référentiel métier
 * réservé à `service_mgp`). Pas de suppression : une catégorie déjà référencée par un dossier ne
 * peut pas être retirée sans casser l'intégrité historique — seule la désactivation (`actif`) est
 * proposée, cohérent avec le principe déjà appliqué aux dossiers (RG-03).
 */
class CategoriesAdmin extends Component
{
    public ?int $categorieEnEditionId = null;

    public string $parcoursId = '';

    public string $code = '';

    public string $libelle = '';

    public bool $isAutre = false;

    public bool $actif = true;

    public string $ordre = '1';

    public function mount(): void
    {
        abort_unless(Auth::user()->can('referentiels.categories.manage'), 403);
    }

    public function modifier(int $categorieId): void
    {
        $categorie = Categorie::findOrFail($categorieId);

        $this->categorieEnEditionId = $categorie->id;
        $this->parcoursId = (string) $categorie->parcours_id;
        $this->code = $categorie->code;
        $this->libelle = $categorie->libelle;
        $this->isAutre = $categorie->is_autre;
        $this->actif = $categorie->actif;
        $this->ordre = (string) $categorie->ordre;
        $this->dispatch('open-modal', name: 'categorie-form');
    }

    public function annulerEdition(): void
    {
        $this->reset(['categorieEnEditionId', 'parcoursId', 'code', 'libelle', 'isAutre', 'ordre']);
        $this->actif = true;
        $this->ordre = '1';
        $this->dispatch('close-modal', name: 'categorie-form');
    }

    public function enregistrer(): void
    {
        $this->validate([
            'parcoursId' => ['required', 'exists:parcours,id'],
            'code' => ['required', 'string', 'max:100', Rule::unique('categories', 'code')->ignore($this->categorieEnEditionId)->where('parcours_id', $this->parcoursId)],
            'libelle' => ['required', 'string', 'max:255'],
            'ordre' => ['required', 'integer', 'min:1'],
        ], [], ['parcoursId' => 'parcours']);

        $donnees = [
            'parcours_id' => $this->parcoursId,
            'code' => $this->code,
            'libelle' => $this->libelle,
            'is_autre' => $this->isAutre,
            'actif' => $this->actif,
            'ordre' => (int) $this->ordre,
        ];

        if ($this->categorieEnEditionId !== null) {
            Categorie::findOrFail($this->categorieEnEditionId)->update($donnees);
            $this->dispatch('toast', message: 'Catégorie mise à jour.', type: 'success');
        } else {
            Categorie::create($donnees);
            $this->dispatch('toast', message: 'Catégorie créée.', type: 'success');
        }

        $this->annulerEdition();
    }

    /** @return Collection<int, Categorie> */
    public function getCategoriesProperty(): Collection
    {
        return Categorie::query()->with('parcours')->orderBy('parcours_id')->orderBy('ordre')->get();
    }

    /** @return Collection<int, Parcours> */
    public function getParcoursListeProperty(): Collection
    {
        return Parcours::query()->orderBy('ordre')->get();
    }

    public function render()
    {
        return view('livewire.administration.categories-admin')
            ->layout('components.layouts.app', ['title' => 'Administration — Catégories']);
    }
}
