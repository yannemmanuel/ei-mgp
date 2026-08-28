<?php

namespace App\Livewire\Messagerie;

use App\Enums\ExpediteurType;
use App\Models\Dossier;
use App\Models\Message;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;

/**
 * Messagerie sécurisée liée à un dossier (EX-NOT-07), partagée entre la vue interne
 * (DossierDetailPage, acteur authentifié — App\Policies\MessagePolicy) et la vue publique
 * (SuiviDossier, déclarant — accès par jeton de session référence+code, jamais par compte,
 * RG-06). Le mode est déterminé par Auth::check() : un déclarant n'est par nature jamais
 * authentifié sur ce composant.
 */
class MessagerieDossier extends Component
{
    public Dossier $dossier;

    public string $corps = '';

    public function mount(Dossier $dossier): void
    {
        $this->dossier = $dossier;

        // Marque comme lus les messages de "l'autre côté" à l'ouverture du panneau.
        $typeAutrePartie = Auth::check() ? ExpediteurType::Declarant : ExpediteurType::Agent;

        Message::query()
            ->where('dossier_id', $dossier->id)
            ->where('expediteur_type', $typeAutrePartie->value)
            ->whereNull('lu_le')
            ->update(['lu_le' => now()]);
    }

    public function envoyer(): void
    {
        if (Auth::check()) {
            $this->authorize('create', $this->messageVierge());
        } else {
            // Déclarant : l'accès à ce dossier a déjà été vérifié par SuiviDossier (jeton de
            // session référence+code) — revérifié ici, ce composant ne fait jamais confiance à
            // son seul montage depuis une vue autorisée (RG-06, exigences-securite.md §4).
            abort_unless(session('suivi_verifie_'.$this->dossier->id) === true, 403);
        }

        $this->validate([
            'corps' => ['required', 'string', 'min:2', 'max:2000'],
        ], [], ['corps' => 'message']);

        Message::create([
            'dossier_id' => $this->dossier->id,
            'expediteur_type' => Auth::check() ? ExpediteurType::Agent : ExpediteurType::Declarant,
            'expediteur_user_id' => Auth::check() ? Auth::id() : null,
            'corps' => $this->corps,
        ]);

        $this->reset('corps');
    }

    private function messageVierge(): Message
    {
        $message = new Message(['dossier_id' => $this->dossier->id]);
        $message->setRelation('dossier', $this->dossier);

        return $message;
    }

    /** @return Collection<int, Message> */
    public function getMessagesProperty(): Collection
    {
        return Message::query()
            ->where('dossier_id', $this->dossier->id)
            ->with('expediteur')
            ->orderBy('created_at')
            ->get();
    }

    public function render()
    {
        return view('livewire.messagerie.messagerie-dossier');
    }
}
