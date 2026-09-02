<?php

namespace App\Livewire\Administration;

use App\Models\CanalCaptage;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;

/**
 * Référentiel « canaux de captage » (`canaux.manage`, DT-02 : paramétrage technique,
 * `administrateur_digital`). Édition du libellé/statut uniquement : `code` est contraint par
 * l'énum `CanalCaptageCode` (CDC §6.7) — les 4 lignes sont fixées par CanalCaptageSeeder (Phase 2),
 * aucune création/suppression n'est proposée ici.
 */
class CanauxAdmin extends Component
{
    public ?int $canalEnEditionId = null;

    public string $libelle = '';

    public bool $actif = true;

    public function mount(): void
    {
        abort_unless(Auth::user()->can('canaux.manage'), 403);
    }

    public function modifier(int $canalId): void
    {
        $canal = CanalCaptage::findOrFail($canalId);

        $this->canalEnEditionId = $canal->id;
        $this->libelle = $canal->libelle;
        $this->actif = $canal->actif;
        $this->dispatch('open-modal', name: 'canal-form');
    }

    public function annulerEdition(): void
    {
        $this->reset(['canalEnEditionId', 'libelle']);
        $this->actif = true;
        $this->dispatch('close-modal', name: 'canal-form');
    }

    public function enregistrer(): void
    {
        $this->validate(['libelle' => ['required', 'string', 'max:255']]);

        CanalCaptage::findOrFail($this->canalEnEditionId)->update([
            'libelle' => $this->libelle,
            'actif' => $this->actif,
        ]);

        $this->dispatch('toast', message: 'Canal mis à jour.', type: 'success');
        $this->annulerEdition();
    }

    /** @return Collection<int, CanalCaptage> */
    public function getCanauxProperty(): Collection
    {
        return CanalCaptage::query()->orderBy('libelle')->get();
    }

    public function render()
    {
        return view('livewire.administration.canaux-admin')
            ->layout('components.layouts.app', ['title' => 'Administration — Canaux de captage']);
    }
}
