<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('investigations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('dossier_id')->constrained('dossiers')->restrictOnDelete();
            $table->foreignId('enqueteur_id')->constrained('users')->restrictOnDelete();
            $table->date('date_ouverture');
            $table->text('faits_constates');
            $table->text('personnes_rencontrees')->nullable();
            $table->text('cause_immediate')->nullable();
            $table->text('causes_racines')->nullable();
            $table->text('recommandations');
            $table->string('statut');
            $table->foreignId('valide_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('valide_le')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('investigations');
    }
};
