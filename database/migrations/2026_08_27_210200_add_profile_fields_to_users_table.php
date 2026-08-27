<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * cf. docs/modele-donnees.md §2 et docs/decisions-techniques.md DT-01 (préparation SSO).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('matricule')->nullable()->after('name');
            $table->string('poste')->nullable()->after('matricule');
            $table->foreignId('direction_id')->nullable()->after('poste')
                ->constrained('directions')->nullOnDelete();
            $table->foreignId('site_id')->nullable()->after('direction_id')
                ->constrained('sites')->nullOnDelete();
            $table->string('sso_subject_id')->nullable()->unique()->after('site_id');
            $table->boolean('actif')->default(true)->after('sso_subject_id');
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('direction_id');
            $table->dropConstrainedForeignId('site_id');
            $table->dropColumn(['matricule', 'poste', 'sso_subject_id', 'actif']);
            $table->string('password')->nullable(false)->change();
        });
    }
};
