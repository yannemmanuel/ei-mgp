<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * EX-NOT-05 / docs/decisions-techniques.md DT-07 : la matrice du circuit accéléré (§6.5) cite des
 * destinataires sans rôle applicatif (« Service Prévention », « toutes les Directions ») — DT-07
 * anticipait déjà leur résolution via « des groupes de diffusion configurables dans
 * notification_templates ». Colonne ajoutée ici pour honorer ce plan : liste d'adresses email
 * statiques, indépendante du RBAC, utilisée uniquement en complément des destinataires résolus
 * par rôle.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_templates', function (Blueprint $table) {
            $table->json('destinataires_email_supplementaires')->nullable()->after('canal');
        });
    }

    public function down(): void
    {
        Schema::table('notification_templates', function (Blueprint $table) {
            $table->dropColumn('destinataires_email_supplementaires');
        });
    }
};
