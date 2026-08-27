<?php

namespace App\Models;

use App\Enums\TypeAffectation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DossierAffectation extends Model
{
    use HasFactory;

    protected $fillable = [
        'dossier_id',
        'user_id',
        'affecte_par',
        'motif',
        'type',
        'actif',
        'affecte_le',
        'desaffecte_le',
    ];

    protected function casts(): array
    {
        return [
            'type' => TypeAffectation::class,
            'actif' => 'boolean',
            'affecte_le' => 'datetime',
            'desaffecte_le' => 'datetime',
        ];
    }

    public function scopeActif(Builder $query): Builder
    {
        return $query->where('actif', true);
    }

    public function dossier(): BelongsTo
    {
        return $this->belongsTo(Dossier::class);
    }

    public function utilisateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function affectePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'affecte_par');
    }
}
