<?php

namespace App\Livewire\Declaration;

use App\Enums\ParcoursCode;

/**
 * Formulaire Grief / plainte Employé (CDC §9.2).
 */
class GriefEmployeForm extends DeclarationFormBase
{
    public string $nomPrenom = '';

    public string $matricule = '';

    public string $posteOccupe = '';

    public string $ancienneteAnnees = '';

    public string $contactEmail = '';

    public string $contactTelephone = '';

    public string $caractereRepetitif = '';

    public string $dateHeureFaits = '';

    public string $lieu = '';

    public string $personnesImpliquees = '';

    public string $temoinsEventuels = '';

    public string $resultatSouhaite = '';

    public bool $souhaitEtreRecontacte = false;

    public string $preferenceCanalRetour = '';

    protected function parcoursCode(): ParcoursCode
    {
        return ParcoursCode::GriefEmploye;
    }

    protected function reglesSpecifiques(): array
    {
        return [
            'nomPrenom' => ['nullable', 'string', 'max:255'],
            'matricule' => ['nullable', 'string', 'max:255'],
            'posteOccupe' => ['nullable', 'string', 'max:255'],
            'ancienneteAnnees' => ['nullable', 'integer', 'min:0', 'max:60'],
            'contactEmail' => ['nullable', 'email', 'max:255'],
            'contactTelephone' => ['nullable', 'string', 'max:50'],
            'caractereRepetitif' => ['required', 'in:premiere_fois,deja_signale,recurrent'],
            'dateHeureFaits' => ['required', 'date', 'before_or_equal:now'],
            'lieu' => ['required', 'string', 'max:255'],
            'personnesImpliquees' => ['nullable', 'string', 'max:2000'],
            'temoinsEventuels' => ['nullable', 'string', 'max:2000'],
            'resultatSouhaite' => ['nullable', 'in:resolution,mediation,sanction,signalement_simple'],
            'souhaitEtreRecontacte' => ['required', 'boolean'],
            'preferenceCanalRetour' => ['nullable', 'in:,email,telephone,entretien,page_de_suivi'],
        ];
    }

    protected function messagesSpecifiques(): array
    {
        return [
            'caractereRepetitif.required' => 'Merci d\'indiquer si ces faits sont déjà survenus.',
            'dateHeureFaits.required' => 'Merci d\'indiquer la date et l\'heure des faits.',
            'dateHeureFaits.before_or_equal' => 'La date des faits ne peut pas être dans le futur.',
            'lieu.required' => 'Merci d\'indiquer le lieu des faits.',
        ];
    }

    protected function donneesDossierSpecifiques(): array
    {
        return [
            'lieu' => $this->lieu,
            'date_survenance' => $this->dateHeureFaits,
            'caractere_repetitif' => $this->caractereRepetitif,
            'attentes_declarant' => $this->resultatSouhaite ?: null,
        ];
    }

    protected function donneesIdentiteSpecifiques(): array
    {
        return [
            'nom_prenom' => $this->nomPrenom ?: null,
            'matricule' => $this->matricule ?: null,
            'fonction' => $this->posteOccupe ?: null,
            'anciennete_annees' => $this->ancienneteAnnees !== '' ? (int) $this->ancienneteAnnees : null,
            'contact_email' => $this->contactEmail ?: null,
            'contact_telephone' => $this->contactTelephone ?: null,
            'personnes_impliquees' => $this->personnesImpliquees ?: null,
            'temoins' => $this->temoinsEventuels ?: null,
            'souhait_recontact' => $this->souhaitEtreRecontacte,
            'canal_retour_prefere' => $this->preferenceCanalRetour ?: null,
        ];
    }

    protected function champsIdentiteSpecifiques(): array
    {
        return ['nomPrenom', 'matricule', 'posteOccupe', 'ancienneteAnnees', 'contactEmail', 'contactTelephone'];
    }

    protected function champsContexteSpecifiques(): array
    {
        return [
            'caractereRepetitif', 'dateHeureFaits', 'lieu',
            'personnesImpliquees', 'temoinsEventuels', 'souhaitEtreRecontacte', 'preferenceCanalRetour',
        ];
    }

    protected function champsNatureSpecifiques(): array
    {
        return ['resultatSouhaite'];
    }

    public function render()
    {
        return view('livewire.declaration.grief-employe-form')
            ->layout('components.layouts.guest', [
                'title' => 'Grief / plainte — Employé',
                'maxWidth' => 'max-w-2xl',
                'heroTitle' => 'Exprimer un désaccord, sans crainte de représailles.',
                'heroSubtitle' => 'Ce canal est protégé : votre plainte est traitée avec discrétion, que vous choisissiez de vous identifier ou non.',
                'steps' => DeclarationFormBase::ETAPES,
                ...$this->donneesProgressionLayout(),
            ]);
    }
}
