<?php

namespace App\Enums;

/**
 * Statut d'une fiche d'investigation (CDC §9.5).
 */
enum StatutInvestigation: string
{
    case EnCours = 'en_cours';
    case EnAttenteValidation = 'en_attente_validation';
    case Validee = 'validee';
}
