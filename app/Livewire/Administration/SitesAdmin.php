<?php

namespace App\Livewire\Administration;

use App\Models\Site;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Livewire\Component;

/** Référentiel « sites » (`referentiels.sites.manage`, DT-02 : référentiel métier, `service_mgp`). */
class SitesAdmin extends Component
{
    public ?int $siteEnEditionId = null;

    public string $code = '';

    public string $libelle = '';

    public bool $actif = true;

    public function mount(): void
    {
        abort_unless(Auth::user()->can('referentiels.sites.manage'), 403);
    }

    public function modifier(int $siteId): void
    {
        $site = Site::findOrFail($siteId);

        $this->siteEnEditionId = $site->id;
        $this->code = $site->code;
        $this->libelle = $site->libelle;
        $this->actif = $site->actif;
        $this->dispatch('open-modal', name: 'site-form');
    }

    public function annulerEdition(): void
    {
        $this->reset(['siteEnEditionId', 'code', 'libelle']);
        $this->actif = true;
        $this->dispatch('close-modal', name: 'site-form');
    }

    public function enregistrer(): void
    {
        $this->validate([
            'code' => ['required', 'string', 'max:100', Rule::unique('sites', 'code')->ignore($this->siteEnEditionId)],
            'libelle' => ['required', 'string', 'max:255'],
        ]);

        $donnees = ['code' => $this->code, 'libelle' => $this->libelle, 'actif' => $this->actif];

        if ($this->siteEnEditionId !== null) {
            Site::findOrFail($this->siteEnEditionId)->update($donnees);
            $this->dispatch('toast', message: 'Site mis à jour.', type: 'success');
        } else {
            Site::create($donnees);
            $this->dispatch('toast', message: 'Site créé.', type: 'success');
        }

        $this->annulerEdition();
    }

    /** @return Collection<int, Site> */
    public function getSitesProperty(): Collection
    {
        return Site::query()->orderBy('libelle')->get();
    }

    public function render()
    {
        return view('livewire.administration.sites-admin')
            ->layout('components.layouts.app', ['title' => 'Administration — Sites']);
    }
}
