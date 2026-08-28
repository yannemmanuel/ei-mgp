<?php

namespace App\Livewire\Dossiers;

use App\Enums\StatutDossierCode;
use App\Models\Dossier;
use App\Models\User;
use App\Services\Dossier\AffectationService;
use App\Services\Workflow\DelaiService;
use App\Services\Workflow\DossierWorkflowService;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;

/**
 * Vue détaillée d'un dossier + actions de gestion (EX-GES-03/04/05/06). Chaque action est
 * revérifiée côté serveur par la Policy correspondante au moment de l'exécution, jamais
 * seulement masquée côté vue (prompt §7/§25/§34).
 */
class DossierDetailPage extends Component
{
    public Dossier $dossier;

    // Réaffectation
    public string $nouvelUtilisateurId = '';

    public string $motifReaffectation = '';

    // Changement de statut
    public string $nouveauStatutCode = '';

    public string $commentaireStatut = '';

    // Clôture
    public string $syntheseResolution = '';

    // Réouverture
    public string $motifReouverture = '';

    // Rejet
    public string $motifRejet = '';

    public function mount(Dossier $dossier): void
    {
        $this->authorize('view', $dossier);
        $this->dossier = $dossier;
    }

    protected function rafraichir(): void
    {
        $this->dossier->refresh();
        $this->reset(['nouvelUtilisateurId', 'motifReaffectation', 'nouveauStatutCode', 'commentaireStatut', 'syntheseResolution', 'motifReouverture', 'motifRejet']);
    }

    public function reaffecter(AffectationService $service): void
    {
        $this->authorize('reassign', $this->dossier);

        $this->validate([
            'nouvelUtilisateurId' => ['required', 'exists:users,id'],
            'motifReaffectation' => ['required', 'string', 'min:5', 'max:1000'],
        ], [], ['nouvelUtilisateurId' => 'nouvel utilisateur', 'motifReaffectation' => 'motif']);

        $service->reaffecter(
            $this->dossier,
            User::findOrFail($this->nouvelUtilisateurId),
            Auth::user(),
            $this->motifReaffectation,
        );

        $this->rafraichir();
        session()->flash('status', 'Dossier réaffecté.');
    }

    public function changerStatut(DossierWorkflowService $workflow): void
    {
        $this->authorize('updateStatus', $this->dossier);

        $this->validate(['nouveauStatutCode' => ['required', 'string']]);

        $workflow->changerStatut(
            $this->dossier,
            StatutDossierCode::from($this->nouveauStatutCode),
            Auth::user(),
            $this->commentaireStatut ?: null,
        );

        $this->rafraichir();
        session()->flash('status', 'Statut mis à jour.');
    }

    public function rejeter(DossierWorkflowService $workflow): void
    {
        $this->authorize('updateStatus', $this->dossier);

        $this->validate(['motifRejet' => ['required', 'string', 'min:5', 'max:1000']]);

        $workflow->rejeter($this->dossier, Auth::user(), $this->motifRejet);

        $this->rafraichir();
        session()->flash('status', 'Dossier rejeté (non recevable).');
    }

    public function cloturer(DossierWorkflowService $workflow): void
    {
        $this->authorize('close', $this->dossier);

        $this->validate(['syntheseResolution' => ['required', 'string', 'min:10', 'max:2000']]);

        try {
            $workflow->cloturer($this->dossier, Auth::user(), $this->syntheseResolution);
        } catch (\RuntimeException $e) {
            $this->addError('syntheseResolution', $e->getMessage());

            return;
        }

        $this->rafraichir();
        session()->flash('status', 'Dossier clôturé.');
    }

    public function reouvrir(DossierWorkflowService $workflow): void
    {
        $this->authorize('reopen', $this->dossier);

        $this->validate(['motifReouverture' => ['required', 'string', 'min:5', 'max:1000']]);

        $workflow->reouvrir($this->dossier, Auth::user(), $this->motifReouverture);

        $this->rafraichir();
        session()->flash('status', 'Dossier réouvert.');
    }

    public function getTransitionsDisponiblesProperty()
    {
        return app(DossierWorkflowService::class)->transitionsManuelles($this->dossier);
    }

    public function getHistoriqueProperty()
    {
        return $this->dossier->historiqueStatuts()
            ->with(['statutPrecedent', 'statutSuivant', 'effectuePar'])
            ->orderByDesc('created_at')
            ->get();
    }

    public function getAffectationsActivesProperty()
    {
        return $this->dossier->affectationsActives()->with('utilisateur')->get();
    }

    public function getPeutVoirIdentiteProperty(): bool
    {
        // acteurs.md : le Comité éthique / Syndicats a un accès "sans données nominatives".
        return ! Auth::user()->hasRole('comite_ethique');
    }

    public function getUtilisateursDisponiblesProperty()
    {
        return User::query()->where('actif', true)->orderBy('name')->get();
    }

    /** @return int|null Jours restants avant l'échéance de l'étape courante (négatif si dépassée). */
    public function getJoursRestantsProperty(): ?int
    {
        return app(DelaiService::class)->joursRestants($this->dossier);
    }

    public function render()
    {
        return view('livewire.dossiers.dossier-detail-page');
    }
}
