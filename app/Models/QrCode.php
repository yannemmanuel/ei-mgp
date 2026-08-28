<?php

namespace App\Models;

use App\Observers\AuditObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property Parcours $parcours
 *
 * cf. docs/exigences-audit.md §2 : modification des référentiels d'administration auditée.
 */
#[ObservedBy(AuditObserver::class)]
class QrCode extends Model
{
    use HasFactory, HasUlids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'qr_codes';

    protected $fillable = [
        'parcours_id',
        'token',
        'url_cible',
        'actif',
        'genere_par',
        'genere_le',
        'desactive_le',
    ];

    protected function casts(): array
    {
        return [
            'actif' => 'boolean',
            'genere_le' => 'datetime',
            'desactive_le' => 'datetime',
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

    public function generateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'genere_par');
    }
}
