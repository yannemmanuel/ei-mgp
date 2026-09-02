<?php

namespace App\Livewire\Declaration;

use App\Enums\ParcoursCode;
use App\Enums\StatutPlaignant;

/**
 * Formulaire Grief / plainte Communauté (CDC §9.4).
 */
class GriefCommunauteForm extends DeclarationFormBase
{
    public string $nomPrenom = '';

    public string $contactEmail = '';

    public string $contactTelephone = '';

    public string $localite = '';

    public string $statutPlaignant = '';

    public string $dateSurvenance = '';

    public string $lieu = '';

    public string $personnesBiensAffectes = '';

    public string $solutionSouhaitee = '';

    protected function parcoursCode(): ParcoursCode
    {
        return ParcoursCode::GriefCommunaute;
    }

    protected function reglesSpecifiques(): array
    {
        return [
            'nomPrenom' => ['nullable', 'string', 'max:255'],
            'contactEmail' => ['nullable', 'email', 'max:255'],
            'contactTelephone' => ['nullable', 'string', 'max:50'],
            'localite' => [$this->anonymat ? 'nullable' : 'required', 'string', 'max:255'],
            'statutPlaignant' => ['required', 'in:'.implode(',', array_column(StatutPlaignant::cases(), 'value'))],
            'dateSurvenance' => ['required', 'date', 'before_or_equal:today'],
            'lieu' => ['required', 'string', 'max:255'],
            'personnesBiensAffectes' => ['nullable', 'string', 'max:2000'],
            'solutionSouhaitee' => ['nullable', 'string', 'max:2000'],
        ];
    }

    protected function messagesSpecifiques(): array
    {
        return [
            'localite.required' => 'Merci d\'indiquer votre localité ou village, ou de cocher l\'anonymat.',
            'statutPlaignant.required' => 'Merci de préciser votre statut.',
            'dateSurvenance.required' => 'Merci d\'indiquer la date des faits.',
            'lieu.required' => 'Merci d\'indiquer le lieu des faits.',
        ];
    }

    protected function donneesDossierSpecifiques(): array
    {
        return [
            'lieu' => $this->lieu,
            'date_survenance' => $this->dateSurvenance,
            'attentes_declarant' => $this->solutionSouhaitee ?: null,
        ];
    }

    protected function donneesIdentiteSpecifiques(): array
    {
        return [
            'nom_prenom' => $this->nomPrenom ?: null,
            'contact_email' => $this->contactEmail ?: null,
            'contact_telephone' => $this->contactTelephone ?: null,
            'localite' => $this->localite ?: null,
            'statut_plaignant' => $this->statutPlaignant,
            // "Personnes / biens affectés" (§9.4) réutilise la même colonne que "personnes
            // impliquées" des autres parcours : même finalité (identifier ce qui est concerné
            // par la déclaration), jamais affichée simultanément puisqu'un dossier n'appartient
            // qu'à un seul parcours.
            'personnes_impliquees' => $this->personnesBiensAffectes ?: null,
        ];
    }

    protected function champsIdentiteSpecifiques(): array
    {
        return ['nomPrenom', 'contactEmail', 'contactTelephone', 'localite'];
    }

    protected function champsContexteSpecifiques(): array
    {
        return ['statutPlaignant', 'dateSurvenance', 'lieu', 'personnesBiensAffectes'];
    }

    protected function champsNatureSpecifiques(): array
    {
        return ['solutionSouhaitee'];
    }

    public function render()
    {
        return view('livewire.declaration.grief-communaute-form')
            ->layout('components.layouts.guest', [
                'title' => 'Grief / plainte — Communauté',
                'maxWidth' => 'max-w-2xl',
                'heroTitle' => 'Une préoccupation liée au site ? Nous vous écoutons.',
                'heroSubtitle' => 'Riverains, chefs coutumiers, associations : ce formulaire est ouvert à tous, sans compte à créer.',
                'steps' => DeclarationFormBase::ETAPES,
                ...$this->donneesProgressionLayout(),
            ]);
    }
}
