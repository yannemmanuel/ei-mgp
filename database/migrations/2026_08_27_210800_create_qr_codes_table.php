<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qr_codes', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('parcours_id')->constrained('parcours')->restrictOnDelete();
            $table->string('token')->unique();
            $table->text('url_cible');
            $table->boolean('actif')->default(true);
            $table->foreignId('genere_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('genere_le')->useCurrent();
            $table->timestamp('desactive_le')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qr_codes');
    }
};
