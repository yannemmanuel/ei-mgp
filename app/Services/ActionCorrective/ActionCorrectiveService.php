<?php

namespace App\Services\ActionCorrective;

use App\Enums\StatutActionCorrective;
use App\Enums\StatutDossierCode;
use App\Enums\StatutInvestigation;
use App\Models\ActionCorrective;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Models\User;
use App\Services\Workflow\DossierWorkflowService;
use Illuminate\Support\Carbon;
use RuntimeException;

/**
 * Point d'entrée unique du cycle de vie d'une action corrective (CDC §9.6, EX-ACT-01 à 05).
 * Chaque règle citée est revérifiée ici, pas seulement côté formulaire ou Policy — même principe
 * que InvestigationService/AffectationService/DossierWorkflowService (Phases 5/6/7).
 *
 * cf. docs/decisions-techniques.md DT-27 : la transition automatique du dossier "Action corrective
 * en cours" → "Résolu" (workflows.md §1, "Système, EX-ACT-05") est déclenchée ici, en réaction à la
 * clôture de la dernière action encore ouverte — jamais par une tâche planifiée indépendante.
 */
class ActionCorrectiveService
{
    /** @var array<string, list<string>> */
    private const TRANSITIONS_AUTORISEES = [
        'non_demarree' => ['en_cours'],
        'en_cours' => ['realisee'],
        'en_retard' => ['en_cours', 'realisee'],
    ];

    public function __construct(private readonly DossierWorkflowService $workflow) {}

    /**
     * @param  array{investigation_id: ?string, intitule: string, description: string, responsable_id: int|string, echeance: string}  $donnees
     */
    public function creer(Dossier $dossier, array $donnees): ActionCorrective
    {
        if ($dossier->statut->code !== StatutDossierCode::ActionCorrectiveEnCours) {
            throw new RuntimeException('Une action corrective ne peut être créée que sur un dossier "Action corrective en cours".');
        }

        $investigation = null;

        if (! empty($donnees['investigation_id'])) {
            $investigation = Investigation::query()
                ->where('dossier_id', $dossier->id)
                ->where('id', $donnees['investigation_id'])
                ->firstOrFail();

            // EX-ACT-01 : « depuis recommandations validées ».
            if ($investigation->statut !== StatutInvestigation::Validee) {
                throw new RuntimeException('Une action corrective ne peut être rattachée qu\'à une investigation validée (EX-ACT-01).');
            }
        }

        $echeance = Carbon::parse($donnees['echeance']);

        // RGI-07 : revérifié ici (pas seulement côté formulaire).
        if ($echeance->startOfDay()->lte(Carbon::now()->startOfDay())) {
            throw new RuntimeException('La date d\'échéance doit être postérieure à la date de création (RGI-07).');
        }

        return ActionCorrective::create([
            'dossier_id' => $dossier->id,
            'investigation_id' => $investigation?->id,
            'intitule' => $donnees['intitule'],
            'description' => $donnees['description'],
            'responsable_id' => $donnees['responsable_id'],
            'echeance' => $echeance->toDateString(),
            'statut' => StatutActionCorrective::NonDemarree,
        ]);
    }

    public function changerStatut(ActionCorrective $action, StatutActionCorrective $nouveau): void
    {
        $autorises = self::TRANSITIONS_AUTORISEES[$action->statut->value] ?? [];

        if (! in_array($nouveau->value, $autorises, true)) {
            throw new RuntimeException("Transition non autorisée : {$action->statut->value} → {$nouveau->value}.");
        }

        $action->update(['statut' => $nouveau]);
    }

    /** EX-ACT-04 : vérification d'efficacité, uniquement après mise en œuvre (statut "réalisée"). */
    public function verifierEfficacite(ActionCorrective $action, bool $efficace, ?string $commentaire): void
    {
        if ($action->statut !== StatutActionCorrective::Realisee) {
            throw new RuntimeException('L\'efficacité ne peut être vérifiée qu\'une fois l\'action réalisée (EX-ACT-04).');
        }

        // RGI-08 : revérifié ici (pas seulement côté formulaire).
        if ($efficace && trim((string) $commentaire) === '') {
            throw new RuntimeException('Un commentaire est obligatoire pour une vérification d\'efficacité positive (RGI-08).');
        }

        $action->update([
            'verification_efficacite' => $efficace,
            'verification_commentaire' => $commentaire,
        ]);
    }

    /**
     * RGI-09 : la clôture n'est possible qu'après une vérification d'efficacité positive.
     * EX-ACT-05 : dès que toutes les actions du dossier sont closes, le dossier "Action corrective
     * en cours" avance automatiquement à "Résolu" (workflows.md §1).
     */
    public function cloturer(ActionCorrective $action, User $acteur): void
    {
        if ($action->verification_efficacite !== true) {
            throw new RuntimeException('Une action ne peut être clôturée qu\'après une vérification d\'efficacité positive (RGI-09).');
        }

        $action->update(['date_cloture' => now()]);

        $this->avancerDossierSiToutesActionsClosees($action->dossier, $acteur);
    }

    private function avancerDossierSiToutesActionsClosees(Dossier $dossier, User $acteur): void
    {
        if ($dossier->statut->code !== StatutDossierCode::ActionCorrectiveEnCours) {
            return;
        }

        $resteOuvertes = ActionCorrective::query()
            ->where('dossier_id', $dossier->id)
            ->where(fn ($q) => $q->whereNull('date_cloture')->orWhere('verification_efficacite', '!=', true))
            ->exists();

        if ($resteOuvertes) {
            return;
        }

        $this->workflow->changerStatut(
            $dossier,
            StatutDossierCode::Resolu,
            $acteur,
            'Transition automatique : toutes les actions correctives sont closes et vérifiées efficaces (EX-ACT-05).'
        );
    }

    /** EX-ACT-03 : « job de recalcul du retard », exécuté par RecalculerRetardActionsCorrectives. */
    public function recalculerRetards(): int
    {
        return ActionCorrective::query()
            ->whereIn('statut', [StatutActionCorrective::NonDemarree->value, StatutActionCorrective::EnCours->value])
            ->whereDate('echeance', '<', Carbon::now()->toDateString())
            ->update(['statut' => StatutActionCorrective::EnRetard->value]);
    }
}
