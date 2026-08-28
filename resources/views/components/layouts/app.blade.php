<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? config('app.name') }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
<div class="flex min-h-screen flex-col">
    <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div class="flex items-center gap-6">
                <a href="{{ route('dashboard') }}" class="flex items-center gap-2">
                    <span class="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">EI</span>
                    <span class="text-sm font-semibold uppercase tracking-wide text-slate-500">Digitalisation EI / MGP</span>
                </a>
                @can('viewAny', App\Models\Dossier::class)
                    <a href="{{ route('dossiers.index') }}"
                       class="text-sm font-medium transition-colors {{ request()->routeIs('dossiers.*') ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900' }}">
                        Dossiers
                    </a>
                @endcan
                @auth
                    @if (auth()->user()->canAny(['users.manage', 'referentiels.categories.manage', 'referentiels.statuts.manage', 'referentiels.sites.manage', 'canaux.manage', 'notifications.templates.manage', 'qrcodes.manage']))
                        <a href="{{ route('administration.index') }}"
                           class="text-sm font-medium transition-colors {{ request()->routeIs('administration.*') ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900' }}">
                            Administration
                        </a>
                    @endif
                    @can('audit.view')
                        <a href="{{ route('audit.index') }}"
                           class="text-sm font-medium transition-colors {{ request()->routeIs('audit.*') ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900' }}">
                            Audit
                        </a>
                    @endcan
                @endauth
            </div>

            @auth
                <div class="flex items-center gap-4 text-sm text-slate-600">
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
        </div>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {{ $slot }}
    </main>
</div>

    @livewireScripts
</body>
</html>
