<?php

namespace App\Livewire\Notifications;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;

/**
 * Centre de notifications (docs/page-redesign-map.md §6). Ne crée aucune nouvelle donnée :
 * App\Notifications\DossierEvenementNotification écrit déjà dans la table `notifications`
 * standard de Laravel (canal "outil", cf. NotificationService) à chaque affectation, changement
 * de statut, circuit critique — ce composant est le premier écran qui la lit. Nested dans la
 * topbar de components/layouts/app.blade.php, pas une page dédiée : pas de ->layout() ici.
 */
class NotificationCenter extends Component
{
    /** @return Collection<int, DatabaseNotification> */
    public function getNotificationsProperty()
    {
        return Auth::user()->notifications()->latest()->limit(8)->get();
    }

    public function getNombreNonLuesProperty(): int
    {
        return Auth::user()->unreadNotifications()->count();
    }

    public function marquerLu(string $id): void
    {
        Auth::user()->notifications()->where('id', $id)->first()?->markAsRead();
    }

    public function toutMarquerLu(): void
    {
        Auth::user()->unreadNotifications->markAsRead();
    }

    public function render()
    {
        return view('livewire.notifications.notification-center');
    }
}
