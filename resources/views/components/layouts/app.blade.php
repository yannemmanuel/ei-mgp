<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? config('app.name') }}</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="min-h-screen bg-brand-bg font-sans text-slate-900 antialiased" x-data="{ sidebarOpen: false }">
<div class="flex min-h-screen">
    <div x-show="sidebarOpen" x-cloak x-transition.opacity x-on:click="sidebarOpen = false"
         class="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"></div>

    <aside class="fixed inset-y-0 left-0 z-40 w-64 shrink-0 -translate-x-full transform border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:static lg:translate-x-0"
           :class="{ 'translate-x-0': sidebarOpen }">
        <div class="flex h-16 items-center gap-2 border-b border-slate-100 px-4">
            <a href="{{ route('dashboard') }}" wire:navigate class="flex items-center gap-2">
                <span class="flex h-6 w-6 items-center justify-center rounded-md bg-brand-green text-[10px] font-bold text-white">EI</span>
                <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Digitalisation EI / MGP</span>
            </a>
        </div>
        <nav class="space-y-4 px-3 py-4 text-sm">
            @auth
                {{-- Reporting : jamais masqué, DashboardConsolide se ramifie en interne selon reporting.view (DT-31) --}}
                <div>
                    <a href="{{ route('dashboard') }}" wire:navigate
                       class="flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors {{ request()->routeIs('dashboard') ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900' }}">
                        <x-icons.chart-bar class="h-5 w-5 shrink-0" />
                        Tableau de bord
                    </a>
                </div>

                @if (auth()->user()->can('dossiers.view') || auth()->user()->can('dossiers.view.own') || auth()->user()->can('dossiers.view.all'))
                    <div>
                        <p class="px-3 text-label text-slate-400">Mon activité</p>
                        <div class="mt-1 space-y-1">
                            @can('viewAny', App\Models\Dossier::class)
                                <a href="{{ route('dossiers.index', ['assigneAMoi' => true]) }}" wire:navigate
                                   class="flex items-center gap-2 rounded-md px-3 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
                                    <x-icons.folder class="h-5 w-5 shrink-0" />
                                    Mes dossiers
                                </a>
                            @endcan
                            @can('viewAny', App\Models\Investigation::class)
                                <a href="{{ route('investigations.index', ['enqueteurId' => auth()->id()]) }}" wire:navigate
                                   class="flex items-center gap-2 rounded-md px-3 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
                                    <x-icons.clipboard-document-check class="h-5 w-5 shrink-0" />
                                    Mes investigations
                                </a>
                            @endcan
                            @can('viewAny', App\Models\ActionCorrective::class)
                                <a href="{{ route('actions-correctives.index', ['responsableId' => auth()->id()]) }}" wire:navigate
                                   class="flex items-center gap-2 rounded-md px-3 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
                                    <x-icons.wrench-screwdriver class="h-5 w-5 shrink-0" />
                                    Mes actions
                                </a>
                            @endcan
                        </div>
                    </div>
                @endif

                @can('viewAny', App\Models\Dossier::class)
                    <div>
                        <p class="px-3 text-label text-slate-400">Dossiers</p>
                        <div class="mt-1 space-y-1">
                            <a href="{{ route('dossiers.index') }}" wire:navigate
                               class="flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors {{ request()->routeIs('dossiers.*') ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900' }}">
                                <x-icons.folder class="h-5 w-5 shrink-0" />
                                Tous les dossiers
                            </a>
                        </div>
                    </div>
                @endcan

                @if (auth()->user()->can('investigations.view') || auth()->user()->can('actions.view'))
                    <div>
                        <p class="px-3 text-label text-slate-400">Analyse</p>
                        <div class="mt-1 space-y-1">
                            @can('viewAny', App\Models\Investigation::class)
                                <a href="{{ route('investigations.index') }}" wire:navigate
                                   class="flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors {{ request()->routeIs('investigations.*') ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900' }}">
                                    <x-icons.clipboard-document-check class="h-5 w-5 shrink-0" />
                                    Investigations
                                </a>
                            @endcan
                            @can('viewAny', App\Models\ActionCorrective::class)
                                <a href="{{ route('actions-correctives.index') }}" wire:navigate
                                   class="flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors {{ request()->routeIs('actions-correctives.*') ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900' }}">
                                    <x-icons.wrench-screwdriver class="h-5 w-5 shrink-0" />
                                    Actions correctives
                                </a>
                            @endcan
                        </div>
                    </div>
                @endif

                @if (auth()->user()->canAny(['users.manage', 'referentiels.categories.manage', 'referentiels.statuts.manage', 'referentiels.sites.manage', 'canaux.manage', 'notifications.templates.manage', 'qrcodes.manage']) || auth()->user()->can('audit.view'))
                    <div>
                        <p class="px-3 text-label text-slate-400">Administration</p>
                        <div class="mt-1 space-y-1">
                            @if (auth()->user()->canAny(['users.manage', 'referentiels.categories.manage', 'referentiels.statuts.manage', 'referentiels.sites.manage', 'canaux.manage', 'notifications.templates.manage', 'qrcodes.manage']))
                                <a href="{{ route('administration.index') }}" wire:navigate
                                   class="flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors {{ request()->routeIs('administration.*') ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900' }}">
                                    <x-icons.cog-6-tooth class="h-5 w-5 shrink-0" />
                                    Administration
                                </a>
                            @endif
                            @can('audit.view')
                                <a href="{{ route('audit.index') }}" wire:navigate
                                   class="flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors {{ request()->routeIs('audit.*') ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900' }}">
                                    <x-icons.shield-check class="h-5 w-5 shrink-0" />
                                    Audit
                                </a>
                            @endcan
                        </div>
                    </div>
                @endif
            @endauth
        </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur">
            <button type="button" x-on:click="sidebarOpen = true"
                    class="-m-2.5 flex h-11 w-11 items-center justify-center text-slate-500 lg:hidden" aria-label="Ouvrir le menu">
                <x-icons.bars-3 class="h-6 w-6" />
            </button>
            <div class="hidden lg:block"></div>

            @auth
                <div class="flex items-center gap-4 text-sm text-slate-600">
                    <livewire:notifications.notification-center />
                    <span>{{ auth()->user()->name }}</span>
                    <span class="badge badge-slate">
                        {{ auth()->user()->getRoleNames()->join(', ') ?: 'aucun rôle' }}
                    </span>
                    <form method="POST" action="{{ route('logout') }}">
                        @csrf
                        <button type="submit" class="text-sm font-medium text-slate-500 hover:text-slate-900">
                            Déconnexion
                        </button>
                    </form>
                </div>
            @endauth
        </header>

        <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {{ $slot }}
        </main>

        <x-toast-container />
    </div>
</div>

    @livewireScripts
</body>
</html>
