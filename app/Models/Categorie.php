<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Categorie extends Model
{
    use HasFactory;

    protected $table = 'categories';

    protected $fillable = [
        'parcours_id',
        'code',
        'libelle',
        'is_autre',
        'actif',
        'ordre',
    ];

    protected function casts(): array
    {
        return [
            'is_autre' => 'boolean',
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

    public function dossiers(): HasMany
    {
        return $this->hasMany(Dossier::class, 'categorie_id');
    }
}
