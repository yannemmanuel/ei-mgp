<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cœur métier du dispositif (cf. docs/modele-donnees.md §4). Aucune colonne d'identité du
 * déclarant ici : elles vivent exclusivement dans declaration_identites, créée uniquement si
 * is_anonymous = false (RG-06). Pas de colonne "deleted_at" : une déclaration validée ne peut
 * jamais être supprimée (RG-03).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dossiers', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('reference')->unique();
            $table->foreignId('parcours_id')->constrained('parcours')->restrictOnDelete();
            $table->foreignId('categorie_id')->constrained('categories')->restrictOnDelete();
            $table->string('categorie_autre_precision')->nullable();
            $table->foreignId('niveau_gravite_id')->constrained('niveaux_gravite')->restrictOnDelete();
            $table->foreignId('statut_id')->constrained('statuts_dossier')->restrictOnDelete();
            $table->foreignId('canal_captage_id')->constrained('canaux_captage')->restrictOnDelete();
            $table->boolean('is_anonymous');
            $table->string('access_code_hash')->nullable();
            $table->foreignId('site_id')->nullable()->constrained('sites')->nullOnDelete();
            $table->foreignId('direction_id')->nullable()->constrained('directions')->nullOnDelete();
            $table->foreignId('declarant_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('description');
            $table->string('lieu')->nullable();
            $table->timestamp('date_survenance')->nullable();
            $table->string('attentes_declarant')->nullable();
            $table->text('synthese_resolution')->nullable();
            $table->text('motif_reouverture')->nullable();
            $table->text('motif_rejet')->nullable();
            $table->timestamp('date_cloture')->nullable();
            $table->timestamps();

            $table->index(['parcours_id', 'statut_id']);
            $table->index('niveau_gravite_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dossiers');
    }
};
