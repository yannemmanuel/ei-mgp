<?php

namespace App\Listeners;

use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Auth\Events\Logout;

/** cf. docs/decisions-techniques.md DT-08 : déconnexions journalisées dans audit_logs. */
class EnregistrerAuditDeconnexion
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function handle(Logout $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        $this->auditLogger->enregistrer('auth.deconnexion', $event->user, [], [], $event->user);
    }
}
