<?php

namespace App\Listeners;

use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Auth\Events\Login;

/** cf. docs/decisions-techniques.md DT-08 : connexions journalisées dans audit_logs. */
class EnregistrerAuditConnexion
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function handle(Login $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        $this->auditLogger->enregistrer('auth.connexion', $event->user, [], [], $event->user);
    }
}
