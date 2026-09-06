<?php

namespace App\Services\Workflow;

use App\Enums\StatutDossierCode;
use App\Events\StatutDossierChange;
use App\Models\ActionCorrective;
use App\Models\Dossier;
use App\Models\HistoriqueStatut;
use App\Models\StatutDossier;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Machine à états des dossiers (CDC §7.1, docs/workflows.md). Point d'entrée unique de toute
 * transition de statut : ni les composants Livewire, ni un futur job, ne doivent modifier
 * dossiers.statut_id directement — c'est la seule façon de garantir que historique_statuts
 * reste complet (RG-04) et que les règles de transition/clôture (RG-10) sont toujours vérifiées.
 *
 * Les transitions marquées "Système" dans docs/workflows.md §1 (Reçu → Affecté, Action
 * corrective en cours → Résolu) restent atteignables via ce service — elles seront déclenchées
 * automatiquement par les modules Affectation (Phase 5) et Actions correctives (Phase 8), mais
 * rien n'empêche un acteur habilité de les déclencher manuellement pour un dossier sans action
 * corrective formelle.
 */
class DossierWorkflowService
{
    /**
     * Graphe des transitions manuelles autorisées (docs/workflows.md §1). Rejet, clôture et
     * réouverture ont chacun une méthode dédiée ci-dessous car ils exigent des données
     * supplémentaires (motif, synthèse) et des règles propres (RG-07, RG-10).
     *
     * @var array<string, list<string>>
     */
    private const TRANSITIONS_AUTORISEES = [
        'recu' => ['affecte'],
        'affecte' => ['en_analyse'],
        'en_analyse' => ['en_investigation'],
        'en_investigation' => ['en_attente_information', 'action_corrective_en_cours'],
        'en_attente_information' => ['en_investigation'],
        'action_corrective_en_cours' => ['resolu'],
        'reouvert' => ['en_investigation', 'action_corrective_en_cours'],
    ];

    /** @return Collection<int, StatutDossier> */
    public function transitionsManuelles(Dossier $dossier): Collection
    {
        $codes = self::TRANSITIONS_AUTORISEES[$dossier->statut->code->value] ?? [];

        return StatutDossier::query()->whereIn('code', $codes)->orderBy('ordre')->get();
    }

    public function changerStatut(Dossier $dossier, StatutDossierCode $nouveau, User $acteur, ?string $commentaire = null): void
    {
        $codesAutorises = self::TRANSITIONS_AUTORISEES[$dossier->statut->code->value] ?? [];

        if (! in_array($nouveau->value, $codesAutorises, true)) {
            throw new RuntimeException("Transition non autorisée : {$dossier->statut->code->value} → {$nouveau->value}.");
        }

        $this->appliquerTransition($dossier, $nouveau, $acteur, $commentaire);
    }

    /**
     * RG-10 / EX-ACT-05 : un dossier ne peut être clôturé tant que ses actions correctives ne
     * sont pas toutes closes et leur efficacité vérifiée. N'exige pas qu'il existe des actions :
     * un dossier sans action corrective formelle reste clôturable.
     */
    public function cloturer(Dossier $dossier, User $acteur, string $syntheseResolution): void
    {
        if ($dossier->statut->code !== StatutDossierCode::Resolu) {
            throw new RuntimeException('Seul un dossier "Résolu" peut être clôturé.');
        }

        $actionsNonCloses = ActionCorrective::query()
            ->where('dossier_id', $dossier->id)
            ->where(fn ($q) => $q->whereNull('date_cloture')->orWhere('verification_efficacite', '!=', true))
            ->exists();

        if ($actionsNonCloses) {
            throw new RuntimeException('Toutes les actions correctives doivent être closes et leur efficacité vérifiée avant clôture (RG-10).');
        }

        DB::transaction(function () use ($dossier, $acteur, $syntheseResolution) {
            // date_cloture n'est renseignée QUE par cette méthode, jamais par rejeter() : DT-31
            // (délai moyen de traitement), EX-REP-05 (statistiques mensuelles) et RG-11
            // (politique de conservation) s'appuient tous les trois sur ce champ pour distinguer
            // un dossier mené à terme d'un dossier rejeté. Son absence rendait ces trois
            // fonctionnalités silencieusement inopérantes.
            $dossier->update([
                'synthese_resolution' => $syntheseResolution,
                'date_cloture' => now(),
            ]);
            $this->appliquerTransition($dossier, StatutDossierCode::Cloture, $acteur, 'Dossier clôturé.');
        });
    }

    /** RG-07 : réservé par DossierPolicy::reopen() aux rôles porteurs de dossiers.reopen. */
    public function reouvrir(Dossier $dossier, User $acteur, string $motif): void
    {
        if ($dossier->statut->code !== StatutDossierCode::Cloture) {
            throw new RuntimeException('Seul un dossier "Clôturé" peut être réouvert.');
        }

        DB::transaction(function () use ($dossier, $acteur, $motif) {
            $dossier->update(['motif_reouverture' => $motif]);
            $this->appliquerTransition($dossier, StatutDossierCode::Reouvert, $acteur, 'Dossier réouvert : '.$motif);
        });
    }

    public function rejeter(Dossier $dossier, User $acteur, string $motifRejet): void
    {
        if ($dossier->statut->code !== StatutDossierCode::EnAnalyse) {
            throw new RuntimeException('Seul un dossier "En analyse" peut être rejeté.');
        }

        DB::transaction(function () use ($dossier, $acteur, $motifRejet) {
            $dossier->update(['motif_rejet' => $motifRejet]);
            $this->appliquerTransition($dossier, StatutDossierCode::Rejete, $acteur, 'Dossier jugé non recevable : '.$motifRejet);
        });
    }

    private function appliquerTransition(Dossier $dossier, StatutDossierCode $nouveau, User $acteur, ?string $commentaire): void
    {
        DB::transaction(function () use ($dossier, $nouveau, $acteur, $commentaire) {
            $statutPrecedent = $dossier->statut;
            $statutSuivant = StatutDossier::query()->where('code', $nouveau->value)->firstOrFail();

            $dossier->update(['statut_id' => $statutSuivant->id]);

            HistoriqueStatut::create([
                'dossier_id' => $dossier->id,
                'statut_precedent_id' => $statutPrecedent->id,
                'statut_suivant_id' => $statutSuivant->id,
                'commentaire' => $commentaire,
                'effectue_par' => $acteur->id,
            ]);

            event(new StatutDossierChange($dossier, $statutPrecedent, $statutSuivant));
        });
    }
}
