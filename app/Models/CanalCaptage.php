<?php

namespace App\Models;

use App\Enums\CanalCaptageCode;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CanalCaptage extends Model
{
    use HasFactory;

    protected $table = 'canaux_captage';

    protected $fillable = [
        'code',
        'libelle',
        'actif',
    ];

    protected function casts(): array
    {
        return [
            'code' => CanalCaptageCode::class,
            'actif' => 'boolean',
        ];
    }

    public function scopeActif(Builder $query): Builder
    {
        return $query->where('actif', true);
    }

    public function dossiers(): HasMany
    {
        return $this->hasMany(Dossier::class, 'canal_captage_id');
    }
}
