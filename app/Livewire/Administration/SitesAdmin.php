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
    }

    public function annulerEdition(): void
    {
        $this->reset(['siteEnEditionId', 'code', 'libelle']);
        $this->actif = true;
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
            session()->flash('status', 'Site mis à jour.');
        } else {
            Site::create($donnees);
            session()->flash('status', 'Site créé.');
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
        return view('livewire.administration.sites-admin');
    }
}
