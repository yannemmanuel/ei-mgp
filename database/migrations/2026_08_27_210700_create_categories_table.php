<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parcours_id')->constrained('parcours')->restrictOnDelete();
            $table->string('code');
            $table->string('libelle');
            $table->boolean('is_autre')->default(false);
            $table->boolean('actif')->default(true);
            $table->smallInteger('ordre')->default(0);
            $table->timestamps();

            $table->unique(['parcours_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
