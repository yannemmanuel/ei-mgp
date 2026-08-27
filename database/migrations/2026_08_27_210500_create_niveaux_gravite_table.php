<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Échelle unique à 4 niveaux (CDC §11.1). Le nombre de niveaux est verrouillé par un CHECK
 * applicatif ; seuls les libellés/couleurs restent administrables (cf. docs/modele-donnees.md §9).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('niveaux_gravite', function (Blueprint $table) {
            $table->id();
            $table->smallInteger('niveau')->unique();
            $table->string('code')->unique();
            $table->string('libelle');
            $table->string('effet_circuit');
            $table->string('couleur')->nullable();
            $table->boolean('actif')->default(true);
            $table->timestamps();
        });

        DB::statement('ALTER TABLE niveaux_gravite ADD CONSTRAINT niveaux_gravite_niveau_check CHECK (niveau BETWEEN 1 AND 4)');
    }

    public function down(): void
    {
        Schema::dropIfExists('niveaux_gravite');
    }
};
