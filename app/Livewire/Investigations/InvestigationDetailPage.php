<?php

namespace App\Livewire\Investigations;

use App\Models\Dossier;
use App\Models\Investigation;
use App\Services\Investigation\InvestigationService;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;
use RuntimeException;

/**
 * Fiche d'investigation (EX-INV-02/03/04/05). Édition réservée à l'enquêteur (ou tout acteur
 * portant investigations.update pour ce parcours) tant que le statut est "en_cours" ; validation
 * hiérarchique réservée à un acteur distinct de l'enquêteur (RGI-06, InvestigationPolicy).
 */
class InvestigationDetailPage extends Component
{
    public Dossier $dossier;

    public Investigation $investigation;

    public string $faitsConstates = '';

    public string $personnesRencontrees = '';

    public string $causeImmediate = '';

    public string $causesRacines = '';

    public string $recommandations = '';

    public function mount(Dossier $dossier, Investigation $investigation): void
    {
        abort_unless($investigation->dossier_id === $dossier->id, 404);

        $this->authorize('view', $investigation);

        $this->dossier = $dossier;
        $this->investigation = $investigation;
        $this->remplirFormulaire();
    }

    private function remplirFormulaire(): void
    {
        $this->faitsConstates = $this->investigation->faits_constates;
        $this->personnesRencontrees = (string) $this->investigation->personnes_rencontrees;
        $this->causeImmediate = (string) $this->investigation->cause_immediate;
        $this->causesRacines = (string) $this->investigation->causes_racines;
        $this->recommandations = $this->investigation->recommandations;
    }

    public function enregistrer(InvestigationService $service): void
    {
        $this->authorize('update', $this->investigation);

        $this->validate([
            'faitsConstates' => ['required', 'string', 'min:10', 'max:5000'],
            'personnesRencontrees' => ['nullable', 'string', 'max:2000'],
            'causeImmediate' => ['nullable', 'string', 'max:2000'],
            'causesRacines' => ['nullable', 'string', 'max:2000'],
            'recommandations' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        $service->mettreAJour($this->investigation, [
            'faits_constates' => $this->faitsConstates,
            'personnes_rencontrees' => $this->personnesRencontrees,
            'cause_immediate' => $this->causeImmediate,
            'causes_racines' => $this->causesRacines,
            'recommandations' => $this->recommandations,
        ]);

        $this->investigation->refresh();
        session()->flash('status', 'Investigation mise à jour.');
    }

    public function soumettrePourValidation(InvestigationService $service): void
    {
        $this->authorize('update', $this->investigation);

        try {
            $service->soumettrePourValidation($this->investigation);
        } catch (RuntimeException $e) {
            $this->addError('recommandations', $e->getMessage());

            return;
        }

        $this->investigation->refresh();
        session()->flash('status', 'Investigation soumise pour validation hiérarchique.');
    }

    public function valider(InvestigationService $service): void
    {
        $this->authorize('validateInvestigation', $this->investigation);

        $service->valider($this->investigation, Auth::user());

        $this->investigation->refresh();
        session()->flash('status', 'Investigation validée.');
    }

    public function render()
    {
        return view('livewire.investigations.investigation-detail-page');
    }
}
