<?php

namespace App\Enums;

/**
 * Canaux de captage d'une déclaration (CDC §6.7).
 */
enum CanalCaptageCode: string
{
    case QrCode = 'qr_code';
    case LigneVerte = 'ligne_verte';
    case BoiteSuggestions = 'boite_suggestions';
    case AgentLocal = 'agent_local';
}
