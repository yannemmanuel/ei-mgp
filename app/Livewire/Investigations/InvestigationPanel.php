<?php

namespace App\Livewire\Investigations;

use App\Enums\StatutDossierCode;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Services\Investigation\InvestigationService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;

/**
 * Panneau "Investigations" affiché sur la fiche dossier (EX-INV-01) : liste des fiches déjà
 * ouvertes pour ce dossier + formulaire d'ouverture d'une nouvelle fiche, visible uniquement
 * lorsque le dossier est "En investigation" et que l'utilisateur porte investigations.create
 * pour ce parcours (RoleParcoursScope, via InvestigationPolicy::create).
 */
class InvestigationPanel extends Component
{
    public Dossier $dossier;

    public string $dateOuverture = '';

    public string $faitsConstates = '';

    public string $personnesRencontrees = '';

    public string $causeImmediate = '';

    public string $causesRacines = '';

    public string $recommandations = '';

    public function mount(Dossier $dossier): void
    {
        $this->dossier = $dossier;
        $this->dateOuverture = now()->toDateString();
    }

    public function ouvrir(InvestigationService $service): void
    {
        $this->authorize('create', $this->investigationVierge());

        $this->validate([
            'dateOuverture' => ['required', 'date'],
            'faitsConstates' => ['required', 'string', 'min:10', 'max:5000'],
            'personnesRencontrees' => ['nullable', 'string', 'max:2000'],
            'causeImmediate' => ['nullable', 'string', 'max:2000'],
            'causesRacines' => ['nullable', 'string', 'max:2000'],
            'recommandations' => ['required', 'string', 'min:10', 'max:5000'],
        ], [], [
            'dateOuverture' => 'date d\'ouverture',
            'faitsConstates' => 'constats',
            'recommandations' => 'recommandations',
        ]);

        try {
            $service->ouvrir($this->dossier, Auth::user(), [
                'date_ouverture' => $this->dateOuverture,
                'faits_constates' => $this->faitsConstates,
                'personnes_rencontrees' => $this->personnesRencontrees,
                'cause_immediate' => $this->causeImmediate,
                'causes_racines' => $this->causesRacines,
                'recommandations' => $this->recommandations,
            ]);
        } catch (\RuntimeException $e) {
            $this->addError('dateOuverture', $e->getMessage());

            return;
        }

        $this->reset(['faitsConstates', 'personnesRencontrees', 'causeImmediate', 'causesRacines', 'recommandations']);
        $this->dateOuverture = now()->toDateString();

        session()->flash('status', 'Investigation ouverte.');
    }

    private function investigationVierge(): Investigation
    {
        $investigation = new Investigation(['dossier_id' => $this->dossier->id]);
        $investigation->setRelation('dossier', $this->dossier);

        return $investigation;
    }

    public function getPeutOuvrirProperty(): bool
    {
        return $this->dossier->statut->code === StatutDossierCode::EnInvestigation
            && Auth::user()->can('create', $this->investigationVierge());
    }

    /**
     * @return Collection<int, Investigation>
     *
     * cf. docs/decisions-techniques.md DT-25 : amorcée depuis Investigation::query() plutôt que
     * $this->dossier->investigations() pour éviter la perte de type générique Larastan observée
     * sur les relations Eloquent chaînées.
     */
    public function getInvestigationsProperty(): Collection
    {
        return Investigation::query()
            ->where('dossier_id', $this->dossier->id)
            ->with(['enqueteur', 'validateur'])
            ->orderByDesc('date_ouverture')
            ->get()
            ->each(fn (Investigation $investigation) => $investigation->setRelation('dossier', $this->dossier))
            ->filter(fn (Investigation $investigation) => Auth::user()->can('view', $investigation))
            ->values();
    }

    public function render()
    {
        return view('livewire.investigations.investigation-panel');
    }
}
