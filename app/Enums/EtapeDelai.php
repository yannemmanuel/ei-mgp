<?php

namespace App\Enums;

/**
 * Étapes porteuses d'un délai maximal (CDC §11.2). "Captage" n'est volontairement pas incluse :
 * l'accusé de réception est généré de façon synchrone à la soumission (Phase 4), ce délai est
 * donc toujours satisfait par construction pour les déclarations directes et n'est pas une
 * échéance à surveiller après coup (cf. docs/decisions-techniques.md).
 */
enum EtapeDelai: string
{
    case AnalysePreliminaire = 'analyse_preliminaire';
    case TraitementEnquete = 'traitement_enquete';
    case RetourInformation = 'retour_information';
    case MiseEnOeuvreMesures = 'mise_en_oeuvre_mesures';
    case RetourResolution = 'retour_resolution';
    case Cloture = 'cloture';
}
