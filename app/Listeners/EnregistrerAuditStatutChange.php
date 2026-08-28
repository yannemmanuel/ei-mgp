<?php

namespace App\Listeners;

use App\Events\StatutDossierChange;
use App\Services\Audit\AuditLogger;

/**
 * cf. docs/exigences-audit.md §1 : « Historique complet des statuts... Table dédiée
 * historique_statuts (Phase 5) EN PLUS de audit_logs généraliste ». Toute transition est déjà
 * tracée dans historique_statuts ; cette ligne audit_logs supplémentaire l'intègre au journal
 * généraliste consultable par auditeur/dpo/service_mgp aux côtés des autres actions.
 */
class EnregistrerAuditStatutChange
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function handle(StatutDossierChange $event): void
    {
        $this->auditLogger->enregistrer(
            'dossier.statut_change',
            $event->dossier,
            ['statut' => $event->precedent->code->value],
            ['statut' => $event->suivant->code->value],
        );
    }
}
