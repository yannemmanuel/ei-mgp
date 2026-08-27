<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Données agrégées et anonymisées, conservées sans limitation de durée (RG-12). Aucune
 * référence à un dossier individuel : uniquement des compteurs/moyennes par période.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('statistiques_mensuelles', function (Blueprint $table) {
            $table->id();
            $table->date('periode');
            $table->foreignId('parcours_id')->nullable()->constrained('parcours')->restrictOnDelete();
            $table->foreignId('categorie_id')->nullable()->constrained('categories')->restrictOnDelete();
            $table->foreignId('niveau_gravite_id')->nullable()->constrained('niveaux_gravite')->restrictOnDelete();
            $table->unsignedInteger('nb_declarations')->default(0);
            $table->unsignedInteger('nb_resolues')->default(0);
            $table->unsignedInteger('nb_cloturees')->default(0);
            $table->decimal('delai_moyen_jours', 6, 2)->nullable();
            $table->decimal('taux_resolution', 5, 2)->nullable();
            $table->decimal('taux_cloture', 5, 2)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('statistiques_mensuelles');
    }
};
