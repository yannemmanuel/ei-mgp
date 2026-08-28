<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * RG-11 : politique de conservation des données personnelles d'un dossier clôturé (24 mois de
 * consultation active, puis archivage 5-10 ans, puis anonymisation sauf contentieux). `contentieux`
 * est le seul levier empêchant l'anonymisation automatique — jamais de suppression physique du
 * dossier lui-même (RG-03, RG-12 : les statistiques agrégées doivent rester calculables sans
 * limitation de durée, donc la ligne `dossiers` doit survivre à l'anonymisation).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dossiers', function (Blueprint $table) {
            $table->boolean('contentieux')->default(false)->after('date_cloture');
            $table->timestamp('archive_le')->nullable()->after('contentieux');
            $table->timestamp('anonymise_le')->nullable()->after('archive_le');
        });
    }

    public function down(): void
    {
        Schema::table('dossiers', function (Blueprint $table) {
            $table->dropColumn(['contentieux', 'archive_le', 'anonymise_le']);
        });
    }
};
