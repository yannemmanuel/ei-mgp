<x-layouts.app title="Administration">
    <h1 class="mb-6 text-lg font-semibold text-slate-900">Administration</h1>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @can('users.manage')
            <a href="{{ route('administration.utilisateurs') }}" class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-sm font-semibold text-slate-900">Utilisateurs</h2>
                <p class="mt-1 text-xs text-slate-500">Comptes, rôles et rattachements.</p>
            </a>
        @endcan

        @can('referentiels.categories.manage')
            <a href="{{ route('administration.categories') }}" class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-sm font-semibold text-slate-900">Catégories</h2>
                <p class="mt-1 text-xs text-slate-500">Catégories de déclaration par parcours.</p>
            </a>
        @endcan

        @can('referentiels.statuts.manage')
            <a href="{{ route('administration.statuts') }}" class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-sm font-semibold text-slate-900">Statuts</h2>
                <p class="mt-1 text-xs text-slate-500">Libellés internes et affichés au déclarant.</p>
            </a>
        @endcan

        @can('referentiels.sites.manage')
            <a href="{{ route('administration.sites') }}" class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-sm font-semibold text-slate-900">Sites</h2>
                <p class="mt-1 text-xs text-slate-500">Sites de rattachement des dossiers et utilisateurs.</p>
            </a>
        @endcan

        @can('canaux.manage')
            <a href="{{ route('administration.canaux') }}" class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-sm font-semibold text-slate-900">Canaux de captage</h2>
                <p class="mt-1 text-xs text-slate-500">Libellés et statut des canaux de déclaration.</p>
            </a>
        @endcan

        @can('notifications.templates.manage')
            <a href="{{ route('administration.notifications') }}" class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-sm font-semibold text-slate-900">Modèles de notification</h2>
                <p class="mt-1 text-xs text-slate-500">Contenu des notifications outil/email par évènement.</p>
            </a>
        @endcan

        @can('qrcodes.manage')
            <a href="{{ route('administration.qr-codes') }}" class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-sm font-semibold text-slate-900">QR codes</h2>
                <p class="mt-1 text-xs text-slate-500">Génération et redirection des QR codes par parcours.</p>
            </a>
        @endcan
    </div>
</x-layouts.app>
