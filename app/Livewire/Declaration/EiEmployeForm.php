<?php

namespace App\Livewire\Declaration;

use App\Enums\ParcoursCode;
use App\Models\Direction;
use Illuminate\Database\Eloquent\Collection;

/**
 * Formulaire EI Employé (CDC §9.1).
 */
class EiEmployeForm extends DeclarationFormBase
{
    public string $matricule = '';

    public string $nomPrenom = '';

    public string $directionId = '';

    public string $posteOccupe = '';

    public string $contactEmail = '';

    public string $contactTelephone = '';

    public string $dateSurvenance = '';

    public string $lieu = '';

    public string $propositionMesureCorrective = '';

    protected function parcoursCode(): ParcoursCode
    {
        return ParcoursCode::EiEmploye;
    }

    public function getDirectionsDisponiblesProperty(): Collection
    {
        return Direction::query()->actif()->orderBy('libelle')->get();
    }

    protected function reglesSpecifiques(): array
    {
        // CDC §9.1 : seule la Direction est réellement obligatoire (Oui*) quand la déclaration
        // n'est pas anonyme ; matricule et nom/prénom restent facultatifs (Non*) même identifié,
        // l'identification effective passant par la connexion au compte professionnel.
        $directionRequise = ! $this->anonymat;

        return [
            'matricule' => ['nullable', 'string', 'max:100'],
            'nomPrenom' => ['nullable', 'string', 'max:255'],
            'directionId' => [$directionRequise ? 'required' : 'nullable', 'exists:directions,id'],
            'posteOccupe' => ['nullable', 'string', 'max:255'],
            'contactEmail' => ['nullable', 'email', 'max:255'],
            'contactTelephone' => ['nullable', 'string', 'max:50'],
            'dateSurvenance' => ['required', 'date', 'before_or_equal:today'],
            'lieu' => ['required', 'string', 'max:255'],
            'propositionMesureCorrective' => ['nullable', 'string', 'max:2000'],
        ];
    }

    protected function messagesSpecifiques(): array
    {
        return [
            'directionId.required' => 'Merci de sélectionner votre direction, ou de cocher l\'anonymat.',
            'dateSurvenance.required' => 'Merci d\'indiquer la date de l\'évènement.',
            'dateSurvenance.before_or_equal' => 'La date ne peut pas être postérieure à aujourd\'hui.',
            'lieu.required' => 'Merci d\'indiquer le lieu de l\'évènement.',
        ];
    }

    protected function donneesDossierSpecifiques(): array
    {
        return [
            'lieu' => $this->lieu,
            'date_survenance' => $this->dateSurvenance,
            'proposition_mesure_corrective' => $this->propositionMesureCorrective ?: null,
            'direction_id' => $this->directionId ?: null,
        ];
    }

    protected function donneesIdentiteSpecifiques(): array
    {
        return [
            'nom_prenom' => $this->nomPrenom ?: null,
            'matricule' => $this->matricule ?: null,
            'fonction' => $this->posteOccupe ?: null,
            'contact_email' => $this->contactEmail ?: null,
            'contact_telephone' => $this->contactTelephone ?: null,
        ];
    }

    public function render()
    {
        return view('livewire.declaration.ei-employe-form');
    }
}
