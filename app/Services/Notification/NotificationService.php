<?php

namespace App\Services\Notification;

use App\Enums\CanalNotification;
use App\Models\Dossier;
use App\Models\NotificationTemplate;
use App\Models\User;
use App\Notifications\DossierEvenementNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

/**
 * Point d'entrée unique de l'envoi de notifications pilotées par gabarit (Module 5, EX-NOT-01 à
 * 05) : résout le(s) gabarit(s) actif(s) pour un évènement + parcours, substitue les paramètres
 * de contexte, et distribue vers les canaux "outil" (Notifiable::notify(), table notifications)
 * et "email" (mail, y compris des adresses brutes hors RBAC — cf. docs/decisions-techniques.md
 * DT-28). La résolution des DESTINATAIRES (qui reçoit quoi) reste la responsabilité de l'appelant
 * (Listener/commande), pas de ce service.
 */
class NotificationService
{
    /**
     * Mise en file (comportement par défaut de DossierEvenementNotification) — EX-NOT-01 à 04.
     *
     * @param  iterable<int, User|string>  $destinataires  Utilisateurs (canal outil+email) ou adresses email brutes (canal email uniquement).
     * @param  array<string, string>  $contexte  Jetons de substitution additionnels (au-delà de {reference}/{parcours}, toujours fournis).
     */
    public function envoyer(string $evenementCode, Dossier $dossier, iterable $destinataires, array $contexte = []): void
    {
        $this->distribuer($evenementCode, $dossier, $destinataires, $contexte, immediat: false);
    }

    /** RG-08 / EX-NOT-05 : contourne explicitement la file (Notification::sendNow()), jamais de queue pour le circuit accéléré. */
    public function envoyerImmediat(string $evenementCode, Dossier $dossier, iterable $destinataires, array $contexte = []): void
    {
        $this->distribuer($evenementCode, $dossier, $destinataires, $contexte, immediat: true);
    }

    /** @param  iterable<int, User|string>  $destinataires */
    private function distribuer(string $evenementCode, Dossier $dossier, iterable $destinataires, array $contexte, bool $immediat): void
    {
        $templateParCanal = $this->templatesActifsParCanal($evenementCode, $dossier->parcours_id);

        if ($templateParCanal === []) {
            Log::warning("NotificationService : aucun gabarit actif pour l'évènement « {$evenementCode} ».", [
                'dossier_id' => $dossier->id,
            ]);

            return;
        }

        $destinataires = is_array($destinataires) ? $destinataires : iterator_to_array($destinataires);
        $jetons = $this->jetons($dossier, $contexte);

        foreach ($templateParCanal as $template) {
            $notification = new DossierEvenementNotification(
                $template->canal,
                strtr($template->objet, $jetons),
                strtr($template->corps, $jetons),
                $evenementCode,
            );

            if ($template->canal === CanalNotification::Outil) {
                foreach ($destinataires as $destinataire) {
                    if ($destinataire instanceof User) {
                        $this->envoyerA($destinataire, $notification, $immediat);
                    }
                }

                continue;
            }

            foreach ($destinataires as $destinataire) {
                $cible = $destinataire instanceof User ? $destinataire : Notification::route('mail', $destinataire);
                $this->envoyerA($cible, $notification, $immediat);
            }

            foreach ($template->destinataires_email_supplementaires ?? [] as $email) {
                $this->envoyerA(Notification::route('mail', $email), $notification, $immediat);
            }
        }
    }

    private function envoyerA(object $notifiable, DossierEvenementNotification $notification, bool $immediat): void
    {
        if ($immediat) {
            Notification::sendNow($notifiable, $notification);

            return;
        }

        $notifiable->notify($notification);
    }

    /** @return list<NotificationTemplate> Un seul gabarit actif par canal : le spécifique au parcours prime sur le global. */
    private function templatesActifsParCanal(string $evenementCode, int $parcoursId): array
    {
        $templates = NotificationTemplate::query()
            ->where('evenement_code', $evenementCode)
            ->where('actif', true)
            ->where(fn ($q) => $q->where('parcours_id', $parcoursId)->orWhereNull('parcours_id'))
            ->get();

        $parCanal = [];

        foreach ($templates->sortBy(fn (NotificationTemplate $t) => $t->parcours_id === null ? 0 : 1) as $template) {
            $parCanal[$template->canal->value] = $template;
        }

        return array_values($parCanal);
    }

    /** @return array<string, string> */
    private function jetons(Dossier $dossier, array $contexte): array
    {
        $base = [
            'reference' => $dossier->reference,
            'parcours' => $dossier->parcours->libelle,
        ];

        $valeurs = array_merge($base, $contexte);

        $jetons = [];
        foreach ($valeurs as $cle => $valeur) {
            $jetons['{'.$cle.'}'] = $valeur;
        }

        return $jetons;
    }
}
