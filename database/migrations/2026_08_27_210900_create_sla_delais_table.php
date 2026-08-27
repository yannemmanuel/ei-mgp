<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * cf. docs/decisions-techniques.md DT-04 : certaines lignes (analyse préliminaire EI,
 * traitement/enquête EI, mise en œuvre des mesures) restent "est_valide_metier = false"
 * tant que le métier n'a pas confirmé le délai chiffré (CDC §1.8 point 4).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sla_delais', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parcours_id')->constrained('parcours')->restrictOnDelete();
            $table->string('etape_code');
            $table->unsignedInteger('valeur');
            $table->string('unite');
            $table->boolean('est_valide_metier')->default(false);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['parcours_id', 'etape_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sla_delais');
    }
};
