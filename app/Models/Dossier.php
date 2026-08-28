<?php

namespace App\Models;

use App\Observers\DossierObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * Cœur métier du dispositif (CDC §7, §8 module 2). Aucune colonne d'identité ici : voir
 * declaration_identites (RG-06). Pas de suppression possible (RG-03) : ce modèle n'utilise
 * volontairement pas SoftDeletes, et aucune méthode delete() ne doit être exposée dans
 * l'application au-delà de cette classe.
 *
 * @property Parcours $parcours
 * @property Categorie $categorie
 * @property NiveauGravite $niveauGravite
 * @property StatutDossier $statut
 * @property CanalCaptage $canalCaptage
 */
#[ObservedBy(DossierObserver::class)]
class Dossier extends Model
{
    use HasFactory, HasUlids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'reference',
        'parcours_id',
        'categorie_id',
        'categorie_autre_precision',
        'niveau_gravite_id',
        'statut_id',
        'canal_captage_id',
        'is_anonymous',
        'access_code_hash',
        'site_id',
        'direction_id',
        'declarant_user_id',
        'description',
        'lieu',
        'date_survenance',
        'attentes_declarant',
        'caractere_repetitif',
        'proposition_mesure_corrective',
        'synthese_resolution',
        'motif_reouverture',
        'motif_rejet',
        'date_cloture',
        'contentieux',
        'archive_le',
        'anonymise_le',
    ];

    protected function casts(): array
    {
        return [
            'is_anonymous' => 'boolean',
            'date_survenance' => 'datetime',
            'date_cloture' => 'datetime',
            'contentieux' => 'boolean',
            'archive_le' => 'datetime',
            'anonymise_le' => 'datetime',
        ];
    }

    protected $hidden = [
        'access_code_hash',
    ];

    public function parcours(): BelongsTo
    {
        return $this->belongsTo(Parcours::class);
    }

    public function categorie(): BelongsTo
    {
        return $this->belongsTo(Categorie::class);
    }

    public function niveauGravite(): BelongsTo
    {
        return $this->belongsTo(NiveauGravite::class);
    }

    public function statut(): BelongsTo
    {
        return $this->belongsTo(StatutDossier::class, 'statut_id');
    }

    public function canalCaptage(): BelongsTo
    {
        return $this->belongsTo(CanalCaptage::class, 'canal_captage_id');
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function direction(): BelongsTo
    {
        return $this->belongsTo(Direction::class);
    }

    public function declarant(): BelongsTo
    {
        return $this->belongsTo(User::class, 'declarant_user_id');
    }

    /** Absente si le dossier est anonyme (RG-06) : ne jamais créer cette relation par défaut. */
    public function identite(): HasOne
    {
        return $this->hasOne(DeclarationIdentite::class);
    }

    public function piecesJointes(): MorphMany
    {
        return $this->morphMany(PieceJointe::class, 'attachable');
    }

    public function affectations(): HasMany
    {
        return $this->hasMany(DossierAffectation::class);
    }

    public function affectationsActives(): HasMany
    {
        return $this->affectations()->where('actif', true);
    }

    public function historiqueStatuts(): HasMany
    {
        return $this->hasMany(HistoriqueStatut::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function investigations(): HasMany
    {
        return $this->hasMany(Investigation::class);
    }

    public function actionsCorrectives(): HasMany
    {
        return $this->hasMany(ActionCorrective::class);
    }

    public function estAnonyme(): bool
    {
        return $this->is_anonymous;
    }
}
