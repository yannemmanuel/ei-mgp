<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Rôles et permissions applicatifs (docs/acteurs.md). Référentiel fonctionnel exécuté dans
 * tous les environnements (comme les seeders de Phase 2) : sans lui, aucune autorisation ne
 * fonctionne. Ne pas confondre avec DemoUsersSeeder, qui lui est guardé hors production.
 */
class RolePermissionSeeder extends Seeder
{
    /**
     * Catalogue de permissions (docs/acteurs.md §3). Convention : ressource.action[.portée].
     *
     * @var list<string>
     */
    private const PERMISSIONS = [
        // Dossiers
        'dossiers.view', 'dossiers.view.own', 'dossiers.view.all', 'dossiers.create',
        'dossiers.assign', 'dossiers.reassign', 'dossiers.status.update', 'dossiers.close', 'dossiers.reopen',
        // Investigations
        'investigations.view', 'investigations.create', 'investigations.update', 'investigations.validate',
        // Actions correctives
        'actions.view', 'actions.create', 'actions.update', 'actions.verify_efficacite', 'actions.close',
        // Messagerie sécurisée
        'messagerie.view', 'messagerie.send',
        // Notifications
        'notifications.templates.manage',
        // Référentiels métier
        'referentiels.categories.manage', 'referentiels.statuts.manage', 'referentiels.sites.manage',
        // Référentiels techniques
        'qrcodes.manage', 'users.manage', 'roles.manage', 'canaux.manage',
        // Reporting
        'reporting.view', 'reporting.export', 'reporting.export.nominatif',
        // Audit (lecture seule : aucune permission audit.update/audit.delete n'existe, cf. exigences-audit.md §3)
        'audit.view',
        // RGPD
        'rgpd.conservation.manage', 'rgpd.acces.view',
    ];

    /**
     * Rôles applicatifs (docs/acteurs.md §2) et leurs permissions. Le cloisonnement par
     * PARCOURS (RQSE ne voit que l'EI, etc.) n'est pas une permission distincte : il est
     * appliqué par App\Support\RoleParcoursScope dans les Policies, pas ici.
     *
     * @var array<string, list<string>>
     */
    private const ROLES = [
        'employe_declarant' => [
            'dossiers.view.own', 'messagerie.view', 'messagerie.send',
        ],
        'agent_relais' => [
            'dossiers.create',
        ],
        'secretaire_csst' => [
            'dossiers.view', 'dossiers.status.update',
            'investigations.view', 'investigations.create', 'investigations.update',
            'actions.view', 'actions.create', 'actions.update', 'actions.verify_efficacite', 'actions.close',
        ],
        'rqse' => [
            'dossiers.view', 'dossiers.status.update',
            'investigations.view', 'investigations.create', 'investigations.update',
            'actions.view', 'actions.create', 'actions.update',
        ],
        'rgp' => [
            'dossiers.create', 'dossiers.view.own',
        ],
        'responsable_grief_employe' => [
            'dossiers.view', 'dossiers.status.update',
            'investigations.view', 'investigations.validate',
            'actions.view', 'actions.create', 'actions.update',
        ],
        'correspondant_mgp' => [
            'dossiers.view', 'dossiers.status.update',
            'investigations.view', 'investigations.create', 'investigations.update',
            'actions.view', 'actions.create', 'actions.update',
            'messagerie.view', 'messagerie.send',
        ],
        'service_mgp' => [
            'dossiers.view.all', 'dossiers.assign', 'dossiers.reassign', 'dossiers.status.update',
            'dossiers.close', 'dossiers.reopen',
            'investigations.view', 'investigations.validate',
            'actions.view', 'actions.create', 'actions.update', 'actions.verify_efficacite', 'actions.close',
            'messagerie.view', 'messagerie.send',
            'notifications.templates.manage',
            'referentiels.categories.manage', 'referentiels.statuts.manage', 'referentiels.sites.manage',
            'reporting.view', 'reporting.export', 'reporting.export.nominatif',
        ],
        'comite_ethique' => [
            'dossiers.view',
        ],
        'captage_grief_communaute' => [
            'dossiers.create', 'dossiers.view.own',
        ],
        'captage_grief_soustraitant' => [
            'dossiers.create', 'dossiers.view.own',
        ],
        'dg' => [
            'dossiers.view.all', 'dossiers.status.update', 'dossiers.reopen',
            'reporting.view', 'reporting.export',
        ],
        'dpo' => [
            'dossiers.view.all', 'rgpd.conservation.manage', 'rgpd.acces.view', 'audit.view',
        ],
        'administrateur_digital' => [
            'qrcodes.manage', 'users.manage', 'roles.manage', 'canaux.manage',
        ],
        'auditeur' => [
            'dossiers.view.all', 'audit.view', 'reporting.view', 'reporting.export',
        ],
    ];

    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (self::PERMISSIONS as $permission) {
            Permission::query()->firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        foreach (self::ROLES as $roleName => $permissions) {
            $role = Role::query()->firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
            $role->syncPermissions($permissions);
        }

        Cache::forget('spatie.permission.cache');
    }
}
