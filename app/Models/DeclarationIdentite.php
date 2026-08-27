<?php

namespace App\Models;

use App\Enums\StatutPlaignant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * N'existe QUE pour un dossier non-anonyme (RG-06). Ne jamais créer d'instance sans avoir
 * vérifié au préalable que Dossier::is_anonymous est false.
 */
class DeclarationIdentite extends Model
{
    use HasFactory;

    protected $table = 'declaration_identites';

    protected $fillable = [
        'dossier_id',
        'nom_prenom',
        'matricule',
        'entreprise',
        'fonction',
        'anciennete_annees',
        'localite',
        'statut_plaignant',
        'contact_email',
        'contact_telephone',
        'souhait_recontact',
        'canal_retour_prefere',
        'personnes_impliquees',
        'temoins',
        'consentement_rgpd',
    ];

    protected function casts(): array
    {
        return [
            'statut_plaignant' => StatutPlaignant::class,
            'souhait_recontact' => 'boolean',
            'consentement_rgpd' => 'boolean',
        ];
    }

    public function dossier(): BelongsTo
    {
        return $this->belongsTo(Dossier::class);
    }
}
