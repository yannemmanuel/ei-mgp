<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dossier_affectations', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('dossier_id')->constrained('dossiers')->restrictOnDelete();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('affecte_par')->nullable()->constrained('users')->nullOnDelete();
            $table->text('motif')->nullable();
            $table->string('type');
            $table->boolean('actif')->default(true);
            $table->timestamp('affecte_le')->useCurrent();
            $table->timestamp('desaffecte_le')->nullable();
            $table->timestamps();

            $table->index(['dossier_id', 'actif']);
            $table->index(['user_id', 'actif']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dossier_affectations');
    }
};
