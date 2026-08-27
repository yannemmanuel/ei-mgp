<?php

namespace App\Enums;

/**
 * Canaux de notification pris en charge (CDC §12.2 : "Notification outil + email").
 */
enum CanalNotification: string
{
    case Outil = 'outil';
    case Email = 'email';
}
