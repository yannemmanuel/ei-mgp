<x-layouts.app title="Tableau de bord">
    <div class="rounded-lg border border-slate-200 bg-white p-6">
        <h1 class="text-lg font-semibold text-slate-900">Bienvenue, {{ auth()->user()->name }}</h1>
        <p class="mt-1 text-sm text-slate-500">
            Connecté avec le(s) rôle(s) :
            <span class="font-medium text-slate-700">{{ auth()->user()->getRoleNames()->join(', ') ?: 'aucun' }}</span>
        </p>
        <p class="mt-4 text-sm text-slate-500">
            Le tableau de bord consolidé (Module 6 — Reporting) sera construit en Phase 12.
            Cette page confirme uniquement que l'authentification et le RBAC fonctionnent.
        </p>
    </div>
</x-layouts.app>
