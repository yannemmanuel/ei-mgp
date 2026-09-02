<?php

namespace App\Livewire\Administration;

use App\Models\StatutDossier;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;

/**
 * Référentiel « statuts affichés » (`referentiels.statuts.manage`, DT-02 : référentiel métier,
 * `service_mgp`). Édition des libellés et de l'ordre d'affichage uniquement : `code` est contraint
 * par l'énum `StatutDossierCode`, colonne pivot du graphe de transitions
 * (App\Services\Workflow\DossierWorkflowService, Phase 6) — créer/supprimer un statut casserait ce
 * graphe, donc non proposé ici. `libelle_affiche` reste la source de la projection simplifiée
 * montrée au déclarant (RGI-10) : la modifier ici la modifie partout, immédiatement.
 */
class StatutsAdmin extends Component
{
    public ?int $statutEnEditionId = null;

    public string $libelleInterne = '';

    public string $libelleAffiche = '';

    public string $ordre = '1';

    public function mount(): void
    {
        abort_unless(Auth::user()->can('referentiels.statuts.manage'), 403);
    }

    public function modifier(int $statutId): void
    {
        $statut = StatutDossier::findOrFail($statutId);

        $this->statutEnEditionId = $statut->id;
        $this->libelleInterne = $statut->libelle_interne;
        $this->libelleAffiche = $statut->libelle_affiche;
        $this->ordre = (string) $statut->ordre;
        $this->dispatch('open-modal', name: 'statut-form');
    }

    public function annulerEdition(): void
    {
        $this->reset(['statutEnEditionId', 'libelleInterne', 'libelleAffiche']);
        $this->ordre = '1';
        $this->dispatch('close-modal', name: 'statut-form');
    }

    public function enregistrer(): void
    {
        $this->validate([
            'libelleInterne' => ['required', 'string', 'max:255'],
            'libelleAffiche' => ['required', 'string', 'max:255'],
            'ordre' => ['required', 'integer', 'min:1'],
        ]);

        StatutDossier::findOrFail($this->statutEnEditionId)->update([
            'libelle_interne' => $this->libelleInterne,
            'libelle_affiche' => $this->libelleAffiche,
            'ordre' => (int) $this->ordre,
        ]);

        $this->dispatch('toast', message: 'Statut mis à jour.', type: 'success');
        $this->annulerEdition();
    }

    /** @return Collection<int, StatutDossier> */
    public function getStatutsProperty(): Collection
    {
        return StatutDossier::query()->orderBy('ordre')->get();
    }

    public function render()
    {
        return view('livewire.administration.statuts-admin')
            ->layout('components.layouts.app', ['title' => 'Administration — Statuts affichés']);
    }
}
