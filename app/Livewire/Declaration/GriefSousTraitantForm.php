<?php

namespace App\Livewire\Declaration;

use App\Enums\ParcoursCode;

/**
 * Formulaire Grief / plainte Sous-traitant (CDC §9.3). Accès libre sans compte, anonymat
 * possible (EX-DEC-05) — mais le consentement RGPD reste une exigence explicite et bloquante
 * pour ce parcours uniquement lorsque l'identité est renseignée (RG-15).
 */
class GriefSousTraitantForm extends DeclarationFormBase
{
    public string $nomPrenom = '';

    public string $entreprise = '';

    public string $fonction = '';

    public string $contactEmail = '';

    public string $contactTelephone = '';

    public bool $consentementRgpd = false;

    public string $lieuSite = '';

    public string $dateHeureFaits = '';

    public string $personnesOuServicesImpliques = '';

    public string $temoinsEventuels = '';

    public bool $souhaitEtreInforme = false;

    public string $canalRetourSouhaite = '';

    protected function parcoursCode(): ParcoursCode
    {
        return ParcoursCode::GriefSousTraitant;
    }

    protected function reglesSpecifiques(): array
    {
        return [
            'nomPrenom' => ['nullable', 'string', 'max:255'],
            'entreprise' => ['nullable', 'string', 'max:255'],
            'fonction' => ['nullable', 'string', 'max:255'],
            'contactEmail' => ['nullable', 'email', 'max:255'],
            'contactTelephone' => ['nullable', 'string', 'max:50'],
            // RG-15 : consentement RGPD obligatoire pour ce parcours, sauf déclaration anonyme
            // (aucune donnée personnelle collectée, le consentement est alors sans objet).
            'consentementRgpd' => [$this->anonymat ? 'nullable' : 'accepted'],
            'lieuSite' => ['required', 'string', 'max:255'],
            'dateHeureFaits' => ['required', 'date', 'before_or_equal:now'],
            'personnesOuServicesImpliques' => ['nullable', 'string', 'max:2000'],
            'temoinsEventuels' => ['nullable', 'string', 'max:2000'],
            'souhaitEtreInforme' => ['required', 'boolean'],
            'canalRetourSouhaite' => ['nullable', 'string', 'max:100'],
        ];
    }

    protected function messagesSpecifiques(): array
    {
        return [
            'consentementRgpd.accepted' => 'Le consentement au traitement des données est obligatoire pour soumettre une déclaration identifiée (RG-15). Cochez « Je souhaite rester anonyme » si vous préférez ne pas y consentir.',
            'lieuSite.required' => 'Merci d\'indiquer le lieu ou site concerné.',
            'dateHeureFaits.required' => 'Merci d\'indiquer la date et l\'heure des faits.',
        ];
    }

    protected function donneesDossierSpecifiques(): array
    {
        return [
            'lieu' => $this->lieuSite,
            'date_survenance' => $this->dateHeureFaits,
        ];
    }

    protected function donneesIdentiteSpecifiques(): array
    {
        return [
            'nom_prenom' => $this->nomPrenom ?: null,
            'entreprise' => $this->entreprise ?: null,
            'fonction' => $this->fonction ?: null,
            'contact_email' => $this->contactEmail ?: null,
            'contact_telephone' => $this->contactTelephone ?: null,
            'consentement_rgpd' => $this->consentementRgpd,
            'personnes_impliquees' => $this->personnesOuServicesImpliques ?: null,
            'temoins' => $this->temoinsEventuels ?: null,
            'souhait_recontact' => $this->souhaitEtreInforme,
            'canal_retour_prefere' => $this->canalRetourSouhaite ?: null,
        ];
    }

    protected function champsIdentiteSpecifiques(): array
    {
        return ['nomPrenom', 'entreprise', 'fonction', 'contactEmail', 'contactTelephone', 'consentementRgpd'];
    }

    protected function champsContexteSpecifiques(): array
    {
        return [
            'lieuSite', 'dateHeureFaits', 'personnesOuServicesImpliques',
            'temoinsEventuels', 'souhaitEtreInforme', 'canalRetourSouhaite',
        ];
    }

    public function render()
    {
        return view('livewire.declaration.grief-sous-traitant-form')
            ->layout('components.layouts.guest', [
                'title' => 'Grief / plainte — Sous-traitant',
                'maxWidth' => 'max-w-2xl',
                'heroTitle' => 'Un canal direct pour les entreprises sous-traitantes.',
                'heroSubtitle' => 'Signalez une difficulté liée à votre contrat ou à vos conditions de travail sur site.',
                'steps' => DeclarationFormBase::ETAPES,
                ...$this->donneesProgressionLayout(),
            ]);
    }
}
