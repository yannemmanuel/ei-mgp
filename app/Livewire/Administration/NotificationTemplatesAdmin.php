<?php

namespace App\Livewire\Administration;

use App\Enums\CanalNotification;
use App\Models\NotificationTemplate;
use App\Models\Parcours;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;

/**
 * Console des gabarits de notification (`notifications.templates.manage`, DT-02 : référentiel
 * métier, `service_mgp`). Sert notamment à corriger les valeurs indicatives semées en Phase 9
 * (`destinataires_email_supplementaires` de Service Prévention/toutes les Directions,
 * cf. docs/decisions-techniques.md DT-28) sans nouveau déploiement — même principe que DT-04.
 */
class NotificationTemplatesAdmin extends Component
{
    public ?int $templateEnEditionId = null;

    public string $evenementCode = '';

    public string $parcoursId = '';

    public string $canal = 'outil';

    public string $objet = '';

    public string $corps = '';

    public string $destinatairesSupplementaires = '';

    public bool $actif = true;

    public function mount(): void
    {
        abort_unless(Auth::user()->can('notifications.templates.manage'), 403);
    }

    public function modifier(int $templateId): void
    {
        $template = NotificationTemplate::findOrFail($templateId);

        $this->templateEnEditionId = $template->id;
        $this->evenementCode = $template->evenement_code;
        $this->parcoursId = (string) ($template->parcours_id ?? '');
        $this->canal = $template->canal->value;
        $this->objet = $template->objet;
        $this->corps = $template->corps;
        $this->destinatairesSupplementaires = implode(', ', $template->destinataires_email_supplementaires ?? []);
        $this->actif = $template->actif;
    }

    public function annulerEdition(): void
    {
        $this->reset(['templateEnEditionId', 'evenementCode', 'parcoursId', 'objet', 'corps', 'destinatairesSupplementaires']);
        $this->canal = 'outil';
        $this->actif = true;
    }

    public function enregistrer(): void
    {
        $this->validate([
            'evenementCode' => ['required', 'string', 'max:100'],
            'parcoursId' => ['nullable', 'exists:parcours,id'],
            'canal' => ['required', 'in:outil,email'],
            'objet' => ['required', 'string', 'max:255'],
            'corps' => ['required', 'string', 'max:5000'],
        ], [], ['evenementCode' => 'code évènement', 'parcoursId' => 'parcours']);

        $emails = collect(explode(',', $this->destinatairesSupplementaires))
            ->map(fn ($e) => trim($e))
            ->filter()
            ->values();

        if ($emails->contains(fn ($e) => ! filter_var($e, FILTER_VALIDATE_EMAIL))) {
            $this->addError('destinatairesSupplementaires', 'Une ou plusieurs adresses email sont invalides.');

            return;
        }

        $donnees = [
            'evenement_code' => $this->evenementCode,
            'parcours_id' => $this->parcoursId ?: null,
            'canal' => $this->canal,
            'objet' => $this->objet,
            'corps' => $this->corps,
            'destinataires_email_supplementaires' => $emails->isEmpty() ? null : $emails->all(),
            'actif' => $this->actif,
        ];

        if ($this->templateEnEditionId !== null) {
            NotificationTemplate::findOrFail($this->templateEnEditionId)->update($donnees);
            session()->flash('status', 'Gabarit mis à jour.');
        } else {
            NotificationTemplate::create($donnees);
            session()->flash('status', 'Gabarit créé.');
        }

        $this->annulerEdition();
    }

    /** @return Collection<int, NotificationTemplate> */
    public function getTemplatesProperty(): Collection
    {
        return NotificationTemplate::query()->with('parcours')->orderBy('evenement_code')->orderBy('canal')->get();
    }

    /** @return Collection<int, Parcours> */
    public function getParcoursListeProperty(): Collection
    {
        return Parcours::query()->orderBy('ordre')->get();
    }

    /** @return list<CanalNotification> */
    public function getCanauxProperty(): array
    {
        return CanalNotification::cases();
    }

    public function render()
    {
        return view('livewire.administration.notification-templates-admin');
    }
}
