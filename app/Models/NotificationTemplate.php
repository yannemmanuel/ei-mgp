<?php

namespace App\Models;

use App\Enums\CanalNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'evenement_code',
        'parcours_id',
        'canal',
        'objet',
        'corps',
        'actif',
    ];

    protected function casts(): array
    {
        return [
            'canal' => CanalNotification::class,
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
