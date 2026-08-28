<?php

namespace App\Services\Audit;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Point d'entrée UNIQUE de toute écriture dans `audit_logs` (CDC §15, docs/exigences-audit.md §1) :
 * un `INSERT` pur, jamais de update()/delete() (garantis impossibles par ailleurs, cf.
 * App\Models\AuditLog). Alimenté par App\Observers\AuditObserver (générique) pour les modèles
 * concernés, et par des appels explicites là où l'action n'a pas de modèle dédié (notification
 * envoyée, connexion/déconnexion, modification de rôles).
 */
class AuditLogger
{
    /**
     * @param  array<string, mixed>  $anciennesValeurs
     * @param  array<string, mixed>  $nouvellesValeurs
     */
    public function enregistrer(
        string $action,
        ?Model $auditable = null,
        array $anciennesValeurs = [],
        array $nouvellesValeurs = [],
        ?User $acteur = null,
    ): void {
        $enConsole = app()->runningInConsole();

        AuditLog::create([
            'user_id' => $acteur !== null ? $acteur->id : Auth::id(),
            'action' => $action,
            'auditable_type' => $auditable?->getMorphClass(),
            'auditable_id' => $auditable?->getKey(),
            'old_values' => $anciennesValeurs === [] ? null : $anciennesValeurs,
            'new_values' => $nouvellesValeurs === [] ? null : $nouvellesValeurs,
            'ip_address' => $enConsole ? null : request()->ip(),
            'user_agent' => $enConsole ? null : request()->userAgent(),
            'url' => $enConsole ? null : request()->fullUrl(),
        ]);
    }
}
