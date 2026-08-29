<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PostgreSQL n'indexe jamais automatiquement une colonne de clé étrangère (contrairement à
 * MySQL/InnoDB) : seule la contrainte est créée par `foreignUlid()->constrained()`. Les tables
 * soeurs de `investigations`/`actions_correctives` (`historique_statuts`, `messages`,
 * `dossier_affectations`) ont toutes un index explicite sur `dossier_id` depuis leur création —
 * ces deux tables l'avaient omis alors qu'elles sont interrogées par `dossier_id` sur chaque
 * chargement de la fiche dossier (InvestigationPanel, ActionCorrectivePanel).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('investigations', function (Blueprint $table) {
            $table->index('dossier_id');
        });

        Schema::table('actions_correctives', function (Blueprint $table) {
            $table->index('dossier_id');
        });
    }

    public function down(): void
    {
        Schema::table('investigations', function (Blueprint $table) {
            $table->dropIndex(['dossier_id']);
        });

        Schema::table('actions_correctives', function (Blueprint $table) {
            $table->dropIndex(['dossier_id']);
        });
    }
};
