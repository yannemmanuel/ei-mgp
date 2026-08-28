<?php

namespace App\Livewire\ActionsCorrectives;

use App\Enums\StatutActionCorrective;
use App\Enums\StatutDossierCode;
use App\Enums\StatutInvestigation;
use App\Models\ActionCorrective;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Models\User;
use App\Services\ActionCorrective\ActionCorrectiveService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;
use RuntimeException;

/**
 * Panneau "Actions correctives" affiché sur la fiche dossier (EX-ACT-01 à 05) : liste des actions
 * déjà créées + formulaire de création, visible uniquement lorsque le dossier est "Action
 * corrective en cours" et que l'utilisateur porte actions.create pour ce parcours.
 */
class ActionCorrectivePanel extends Component
{
    public Dossier $dossier;

    // Création
    public string $investigationId = '';

    public string $intitule = '';

    public string $description = '';

    public string $responsableId = '';

    public string $echeance = '';

    // Vérification d'efficacité (formulaire en ligne, une action à la fois)
    public ?string $actionEnVerificationId = null;

    public bool $efficace = true;

    public string $commentaireVerification = '';

    public function mount(Dossier $dossier): void
    {
        $this->dossier = $dossier;
    }

    public function creer(ActionCorrectiveService $service): void
    {
        $this->authorize('create', $this->actionViergePourCreation());

        $this->validate([
            'investigationId' => ['nullable', 'string'],
            'intitule' => ['required', 'string', 'max:255'],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'responsableId' => ['required', 'exists:users,id'],
            'echeance' => ['required', 'date'],
        ], [], [
            'intitule' => 'intitulé',
            'responsableId' => 'responsable',
            'echeance' => 'échéance',
        ]);

        try {
            $service->creer($this->dossier, [
                'investigation_id' => $this->investigationId ?: null,
                'intitule' => $this->intitule,
                'description' => $this->description,
                'responsable_id' => $this->responsableId,
                'echeance' => $this->echeance,
            ]);
        } catch (RuntimeException $e) {
            $this->addError('echeance', $e->getMessage());

            return;
        }

        $this->reset(['investigationId', 'intitule', 'description', 'responsableId', 'echeance']);
        session()->flash('status', 'Action corrective créée.');
    }

    public function demarrer(string $actionId, ActionCorrectiveService $service): void
    {
        $action = $this->actionAutorisee($actionId, 'update');
        $service->changerStatut($action, StatutActionCorrective::EnCours);
        session()->flash('status', 'Action corrective démarrée.');
    }

    public function marquerRealisee(string $actionId, ActionCorrectiveService $service): void
    {
        $action = $this->actionAutorisee($actionId, 'update');
        $service->changerStatut($action, StatutActionCorrective::Realisee);
        session()->flash('status', 'Action corrective marquée réalisée.');
    }

    public function ouvrirVerification(string $actionId): void
    {
        $this->actionAutorisee($actionId, 'verifyEfficacite');
        $this->actionEnVerificationId = $actionId;
        $this->efficace = true;
        $this->commentaireVerification = '';
    }

    public function soumettreVerification(ActionCorrectiveService $service): void
    {
        $action = $this->actionAutorisee((string) $this->actionEnVerificationId, 'verifyEfficacite');

        $this->validate([
            'commentaireVerification' => ['nullable', 'string', 'max:2000'],
        ]);

        try {
            $service->verifierEfficacite($action, $this->efficace, $this->commentaireVerification ?: null);
        } catch (RuntimeException $e) {
            $this->addError('commentaireVerification', $e->getMessage());

            return;
        }

        $this->actionEnVerificationId = null;
        $this->commentaireVerification = '';
        session()->flash('status', 'Efficacité de l\'action corrective vérifiée.');
    }

    public function cloturerAction(string $actionId, ActionCorrectiveService $service): void
    {
        $action = $this->actionAutorisee($actionId, 'close');
        $service->cloturer($action, Auth::user());
        session()->flash('status', 'Action corrective clôturée.');
    }

    private function actionViergePourCreation(): ActionCorrective
    {
        $action = new ActionCorrective(['dossier_id' => $this->dossier->id]);
        $action->setRelation('dossier', $this->dossier);

        return $action;
    }

    private function actionAutorisee(string $actionId, string $capacite): ActionCorrective
    {
        $action = ActionCorrective::query()
            ->where('dossier_id', $this->dossier->id)
            ->where('id', $actionId)
            ->firstOrFail();

        $action->setRelation('dossier', $this->dossier);

        $this->authorize($capacite, $action);

        return $action;
    }

    public function getPeutCreerProperty(): bool
    {
        return $this->dossier->statut->code === StatutDossierCode::ActionCorrectiveEnCours
            && Auth::user()->can('create', $this->actionViergePourCreation());
    }

    /** @return Collection<int, Investigation> Investigations validées du dossier, sources possibles (EX-ACT-01). */
    public function getInvestigationsValideesProperty(): Collection
    {
        return Investigation::query()
            ->where('dossier_id', $this->dossier->id)
            ->where('statut', StatutInvestigation::Validee->value)
            ->get();
    }

    /** @return Collection<int, User> */
    public function getResponsablesDisponiblesProperty(): Collection
    {
        return User::query()->where('actif', true)->orderBy('name')->get();
    }

    /** @return Collection<int, ActionCorrective> */
    public function getActionsProperty(): Collection
    {
        return ActionCorrective::query()
            ->where('dossier_id', $this->dossier->id)
            ->with('responsable')
            ->orderBy('echeance')
            ->get()
            ->each(fn (ActionCorrective $action) => $action->setRelation('dossier', $this->dossier))
            ->filter(fn (ActionCorrective $action) => Auth::user()->can('view', $action))
            ->values();
    }

    public function render()
    {
        return view('livewire.actions-correctives.action-corrective-panel');
    }
}
