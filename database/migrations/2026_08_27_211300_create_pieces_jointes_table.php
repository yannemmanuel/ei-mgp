<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Polymorphe : dossiers | investigations | actions_correctives (tous en ULID, cf. ulidMorphs).
 * Aucune contrainte FK réelle sur le polymorphisme (standard Laravel) : le contrôle d'accès au
 * fichier se fait exclusivement via la Policy du modèle parent au moment du téléchargement.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pieces_jointes', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->ulidMorphs('attachable');
            $table->string('disque');
            $table->string('chemin');
            $table->string('nom_original');
            $table->string('mime_type');
            $table->unsignedBigInteger('taille_octets');
            $table->string('checksum_sha256');
            $table->foreignId('televerse_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pieces_jointes');
    }
};
