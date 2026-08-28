<?php

namespace App\Observers;

use App\Services\Audit\AuditLogger;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

/**
 * Observer d'audit générique (CDC §15, docs/exigences-audit.md §1) : écrit une ligne
 * `audit_logs` à la création et à la modification d'un modèle, sans connaître ses règles
 * métier. Réutilisable tel quel pour tout modèle qui n'a pas besoin d'un traitement spécifique
 * (cf. App\Observers\DossierObserver pour l'exception documentée).
 *
 * Exclut systématiquement les attributs listés dans `$model->getHidden()` (ex. `password`,
 * `remember_token` sur User) : jamais de valeur sensible dans un champ JSON d'audit, même
 * hachée — réutilise une métadonnée de modèle déjà correcte plutôt que redéfinir une liste
 * d'exclusion propre à l'audit.
 */
class AuditObserver
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function created(Model $model): void
    {
        $this->auditLogger->enregistrer(
            $this->action($model, 'cree'),
            $model,
            [],
            Arr::except($model->getAttributes(), $model->getHidden()),
        );
    }

    public function updated(Model $model): void
    {
        $nouvelles = Arr::except($model->getChanges(), array_merge($model->getHidden(), ['updated_at']));

        if ($nouvelles === []) {
            return;
        }

        $anciennes = [];
        foreach (array_keys($nouvelles) as $cle) {
            $anciennes[$cle] = $model->getOriginal($cle);
        }

        $this->auditLogger->enregistrer($this->action($model, 'modifie'), $model, $anciennes, $nouvelles);
    }

    private function action(Model $model, string $verbe): string
    {
        return Str::snake(class_basename($model)).'.'.$verbe;
    }
}
