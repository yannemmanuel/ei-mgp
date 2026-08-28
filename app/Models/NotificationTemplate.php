<?php

namespace App\Models;

use App\Enums\CanalNotification;
use App\Observers\AuditObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property CanalNotification $canal cf. docs/decisions-techniques.md DT-19/DT-25 (annotation
 *                                    explicite requise pour que Larastan reconnaisse le cast enum au travers des appels
 *                                    inter-fichiers, ex. App\Services\Notification\NotificationService).
 * @property array<int, string>|null $destinataires_email_supplementaires
 *
 * cf. docs/exigences-audit.md §2 : modification des référentiels d'administration auditée.
 */
#[ObservedBy(AuditObserver::class)]
class NotificationTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'evenement_code',
        'parcours_id',
        'canal',
        'destinataires_email_supplementaires',
        'objet',
        'corps',
        'actif',
    ];

    protected function casts(): array
    {
        return [
            'canal' => CanalNotification::class,
            'destinataires_email_supplementaires' => 'array',
            'actif' => 'boolean',
        ];
    }

    public function scopeActif(Builder $query): Builder
    {
        return $query->where('actif', true);
    }

    public function parcours(): BelongsTo
    {
        return $this->belongsTo(Parcours::class);
    }
}
