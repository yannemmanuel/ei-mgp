<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 4 a mis au jour deux champs de formulaire (CDC §9) sans colonne dédiée en Phase 2 :
 * "Caractère répétitif" (Grief Employé, §9.2) et "Proposition de mesure corrective" (EI
 * Employé, §9.1). Les deux sont propres à un seul parcours chacun mais rattachés au dossier
 * (pas à declaration_identites : ce ne sont pas des données d'identité).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dossiers', function (Blueprint $table) {
            $table->string('caractere_repetitif')->nullable()->after('attentes_declarant');
            $table->text('proposition_mesure_corrective')->nullable()->after('caractere_repetitif');
        });
    }

    public function down(): void
    {
        Schema::table('dossiers', function (Blueprint $table) {
            $table->dropColumn(['caractere_repetitif', 'proposition_mesure_corrective']);
        });
    }
};
