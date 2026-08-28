<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * EX-NOT-04 : l'alerte d'escalade à échéance dépassée cible le « N+1 » du responsable actuel du
 * dossier — une notion absente du schéma (Phase 2) et de docs/acteurs.md, qui ne définit aucun
 * rôle « responsable hiérarchique » distinct. Ajout minimal et nullable : si non renseigné pour
 * un utilisateur donné, l'escalade N+1 le concernant est simplement absente (aucune alerte
 * fictive), pas une déduction silencieuse (cf. docs/decisions-techniques.md DT-28).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('responsable_hierarchique_id')->nullable()->after('direction_id')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('responsable_hierarchique_id');
        });
    }
};
