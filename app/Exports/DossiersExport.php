<?php

namespace App\Exports;

use App\Models\Dossier;
use App\Support\ReportingFilter;
use Illuminate\Database\Eloquent\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;

/**
 * EX-REP-04/06 : export Excel des dossiers selon le filtre courant du tableau de bord. Les
 * colonnes nominatives ne sont incluses que si `$inclureNominatif` est vrai — décidé par
 * l'appelant après vérification de `Gate::allows('export-rapports-nominatif')`, jamais ici
 * (cette classe ne vérifie aucune autorisation, elle se contente d'obéir au drapeau reçu).
 */
class DossiersExport implements FromQuery, WithHeadings, WithMapping
{
    public function __construct(
        private readonly ReportingFilter $filtre,
        private readonly bool $inclureNominatif = false,
    ) {}

    public function query(): Builder
    {
        return $this->filtre->appliquer(Dossier::query())
            ->with(['parcours', 'categorie', 'niveauGravite', 'statut', 'identite']);
    }

    /** @return list<string> */
    public function headings(): array
    {
        $colonnes = ['Référence', 'Parcours', 'Catégorie', 'Gravité', 'Statut', 'Anonyme', 'Date de soumission', 'Date de clôture'];

        if ($this->inclureNominatif) {
            array_push($colonnes, 'Nom du déclarant', 'Email', 'Téléphone');
        }

        return $colonnes;
    }

    /** @return list<string|null> */
    public function map($dossier): array
    {
        $colonnes = [
            $dossier->reference,
            $dossier->parcours->libelle,
            $dossier->categorie->libelle,
            $dossier->niveauGravite->libelle,
            $dossier->statut->libelle_interne,
            $dossier->is_anonymous ? 'Oui' : 'Non',
            $dossier->created_at->format('d/m/Y'),
            $dossier->date_cloture?->format('d/m/Y'),
        ];

        if ($this->inclureNominatif) {
            array_push(
                $colonnes,
                $dossier->identite->nom_prenom ?? null,
                $dossier->identite->contact_email ?? null,
                $dossier->identite->contact_telephone ?? null,
            );
        }

        return $colonnes;
    }
}
