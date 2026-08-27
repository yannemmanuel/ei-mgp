<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('actions_correctives', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('dossier_id')->constrained('dossiers')->restrictOnDelete();
            $table->foreignUlid('investigation_id')->nullable()->constrained('investigations')->nullOnDelete();
            $table->string('intitule');
            $table->text('description');
            $table->foreignId('responsable_id')->constrained('users')->restrictOnDelete();
            $table->date('echeance');
            $table->string('statut');
            $table->boolean('verification_efficacite')->nullable();
            $table->text('verification_commentaire')->nullable();
            $table->timestamp('date_cloture')->nullable();
            $table->timestamps();

            $table->index(['echeance', 'statut']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('actions_correctives');
    }
};
