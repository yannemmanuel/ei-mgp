<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasRoles, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'matricule',
        'poste',
        'direction_id',
        'site_id',
        'sso_subject_id',
        'actif',
        'responsable_hierarchique_id',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'actif' => 'boolean',
        ];
    }

    public function direction(): BelongsTo
    {
        return $this->belongsTo(Direction::class);
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    /** EX-NOT-04 : cible de l'escalade "N+1" (cf. docs/decisions-techniques.md DT-28). */
    public function responsableHierarchique(): BelongsTo
    {
        return $this->belongsTo(self::class, 'responsable_hierarchique_id');
    }

    /** Dossiers déclarés par cet employé identifié (jamais renseigné pour une déclaration anonyme). */
    public function dossiersDeclares(): HasMany
    {
        return $this->hasMany(Dossier::class, 'declarant_user_id');
    }

    public function affectations(): HasMany
    {
        return $this->hasMany(DossierAffectation::class);
    }
}
