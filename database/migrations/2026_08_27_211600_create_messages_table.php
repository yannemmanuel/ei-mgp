<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Messagerie sécurisée liée au dossier (EX-NOT-07). expediteur_user_id reste NULL côté
 * déclarant anonyme, quel que soit l'expéditeur réel (RG-06) : l'identité ne doit jamais
 * transiter par cette table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('dossier_id')->constrained('dossiers')->restrictOnDelete();
            $table->string('expediteur_type');
            $table->foreignId('expediteur_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('corps');
            $table->timestamp('lu_le')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['dossier_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
    }
};
