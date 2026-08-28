<?php

namespace App\Observers;

use Illuminate\Database\Eloquent\Model;

/**
 * Spécialisation de AuditObserver pour Dossier : ignore les modifications ne portant QUE sur
 * `statut_id`, déjà auditées avec un contexte plus riche (libellés précédent/suivant) par
 * App\Listeners\EnregistrerAuditStatutChange sur l'évènement App\Events\StatutDossierChange
 * (Phase 9/11) — évite un doublon dans `audit_logs` pour la même transition.
 *
 * Composition plutôt qu'héritage (pas d'extends AuditObserver) : surcharger updated() avec un
 * paramètre typé Dossier violerait la covariance des paramètres (LSP) vis-à-vis de la signature
 * Model $model du parent.
 */
class DossierObserver
{
    public function __construct(private readonly AuditObserver $auditObserver) {}

    public function created(Model $dossier): void
    {
        $this->auditObserver->created($dossier);
    }

    public function updated(Model $dossier): void
    {
        $champsModifies = array_diff(array_keys($dossier->getChanges()), ['updated_at']);

        if ($champsModifies === ['statut_id']) {
            return;
        }

        $this->auditObserver->updated($dossier);
    }
}
