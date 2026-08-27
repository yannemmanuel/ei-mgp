<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property Parcours $parcours
 */
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
