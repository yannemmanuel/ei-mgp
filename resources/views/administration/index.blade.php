<x-layouts.app title="Administration">
    <h1 class="mb-6 text-h1 text-slate-900">Administration</h1>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @can('users.manage')
            <a href="{{ route('administration.utilisateurs') }}" wire:navigate class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-h3 text-slate-900">Utilisateurs</h2>
                <p class="mt-1 text-xs text-slate-500">Comptes, rôles et rattachements.</p>
                <p class="mt-3 text-2xl font-semibold text-slate-900">{{ $nbUtilisateurs }}</p>
                <p class="text-xs text-slate-400">compte(s) actif(s)</p>
            </a>
        @endcan

        @can('referentiels.categories.manage')
            <a href="{{ route('administration.categories') }}" wire:navigate class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-h3 text-slate-900">Catégories</h2>
                <p class="mt-1 text-xs text-slate-500">Catégories de déclaration par parcours.</p>
                <p class="mt-3 text-2xl font-semibold text-slate-900">{{ $nbCategories }}</p>
                <p class="text-xs text-slate-400">catégorie(s) active(s)</p>
            </a>
        @endcan

        @can('referentiels.statuts.manage')
            <a href="{{ route('administration.statuts') }}" wire:navigate class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-h3 text-slate-900">Statuts</h2>
                <p class="mt-1 text-xs text-slate-500">Libellés internes et affichés au déclarant.</p>
                <p class="mt-3 text-2xl font-semibold text-slate-900">{{ $nbStatuts }}</p>
                <p class="text-xs text-slate-400">statut(s) configuré(s)</p>
            </a>
        @endcan

        @can('referentiels.sites.manage')
            <a href="{{ route('administration.sites') }}" wire:navigate class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-h3 text-slate-900">Sites</h2>
                <p class="mt-1 text-xs text-slate-500">Sites de rattachement des dossiers et utilisateurs.</p>
                <p class="mt-3 text-2xl font-semibold text-slate-900">{{ $nbSites }}</p>
                <p class="text-xs text-slate-400">site(s) actif(s)</p>
            </a>
        @endcan

        @can('canaux.manage')
            <a href="{{ route('administration.canaux') }}" wire:navigate class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-h3 text-slate-900">Canaux de captage</h2>
                <p class="mt-1 text-xs text-slate-500">Libellés et statut des canaux de déclaration.</p>
                <p class="mt-3 text-2xl font-semibold text-slate-900">{{ $nbCanaux }}</p>
                <p class="text-xs text-slate-400">canal(aux) actif(s)</p>
            </a>
        @endcan

        @can('notifications.templates.manage')
            <a href="{{ route('administration.notifications') }}" wire:navigate class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-h3 text-slate-900">Modèles de notification</h2>
                <p class="mt-1 text-xs text-slate-500">Contenu des notifications outil/email par évènement.</p>
                <p class="mt-3 text-2xl font-semibold text-slate-900">{{ $nbNotifications }}</p>
                <p class="text-xs text-slate-400">modèle(s) configuré(s)</p>
            </a>
        @endcan

        @can('qrcodes.manage')
            <a href="{{ route('administration.qr-codes') }}" wire:navigate class="card p-5 transition-shadow hover:shadow-md">
                <h2 class="text-h3 text-slate-900">QR codes</h2>
                <p class="mt-1 text-xs text-slate-500">Génération et redirection des QR codes par parcours.</p>
                <p class="mt-3 text-2xl font-semibold text-slate-900">{{ $nbQrCodes }}</p>
                <p class="text-xs text-slate-400">QR code(s) généré(s)</p>
            </a>
        @endcan
    </div>
</x-layouts.app>
