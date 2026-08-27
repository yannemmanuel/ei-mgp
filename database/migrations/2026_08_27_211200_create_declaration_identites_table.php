<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Table volontairement séparée de "dossiers" (RG-06) : elle ne contient aucune ligne pour un
 * dossier anonyme, garantissant structurellement l'absence de collecte d'identité plutôt qu'un
 * simple masquage d'affichage. Cf. docs/exigences-securite.md §1.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('declaration_identites', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('dossier_id')->unique()->constrained('dossiers')->restrictOnDelete();
            $table->string('nom_prenom')->nullable();
            $table->string('matricule')->nullable();
            $table->string('entreprise')->nullable();
            $table->string('fonction')->nullable();
            $table->smallInteger('anciennete_annees')->nullable();
            $table->string('localite')->nullable();
            $table->string('statut_plaignant')->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_telephone')->nullable();
            $table->boolean('souhait_recontact')->nullable();
            $table->string('canal_retour_prefere')->nullable();
            $table->text('personnes_impliquees')->nullable();
            $table->text('temoins')->nullable();
            $table->boolean('consentement_rgpd')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('declaration_identites');
    }
};
