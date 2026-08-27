<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Historique append-only des transitions de statut (RG-04). Ne remplace pas audit_logs
 * (généraliste) : cette table est la source lisible directement pour la frise chronologique
 * d'un dossier (cf. docs/exigences-audit.md §1).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('historique_statuts', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('dossier_id')->constrained('dossiers')->restrictOnDelete();
            $table->foreignId('statut_precedent_id')->nullable()->constrained('statuts_dossier')->restrictOnDelete();
            $table->foreignId('statut_suivant_id')->constrained('statuts_dossier')->restrictOnDelete();
            $table->text('commentaire')->nullable();
            $table->foreignId('effectue_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['dossier_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('historique_statuts');
    }
};
