<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use LogicException;

/**
 * Journal d'audit append-only (CDC §15, docs/exigences-audit.md §3). Défense en profondeur :
 * même un appel accidentel à update()/delete() depuis le code applicatif échoue explicitement.
 * Aucune route, aucun contrôleur, aucune Policy n'autorise jamais de modification de cette
 * table — cette classe est le dernier filet de sécurité, pas le seul.
 *
 * Créer une ligne UNIQUEMENT via App\Services\Audit\AuditLogger::record() (Phase 11), jamais
 * par AuditLog::create() dispersé dans le code, pour garder un point d'entrée unique et
 * homogène (contenu, redaction des dossiers anonymes, etc.).
 */
class AuditLog extends Model
{
    use HasFactory;

    const UPDATED_AT = null;

    protected $table = 'audit_logs';

    protected $fillable = [
        'user_id',
        'action',
        'auditable_type',
        'auditable_id',
        'old_values',
        'new_values',
        'ip_address',
        'user_agent',
        'url',
    ];

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
        ];
    }

    public function utilisateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function auditable(): MorphTo
    {
        return $this->morphTo();
    }

    public function update(array $attributes = [], array $options = []): bool
    {
        throw new LogicException('audit_logs est append-only : la modification d\'une entrée est interdite (CDC §15, exigences-audit.md §3).');
    }

    public function delete(): ?bool
    {
        throw new LogicException('audit_logs est append-only : la suppression d\'une entrée est interdite (CDC §15, exigences-audit.md §3).');
    }
}
