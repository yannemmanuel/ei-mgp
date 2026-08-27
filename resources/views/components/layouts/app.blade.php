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
    <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <span class="text-sm font-semibold uppercase tracking-wide text-slate-500">Digitalisation EI / MGP</span>

            @auth
                <div class="flex items-center gap-4 text-sm text-slate-600">
                    <span>{{ auth()->user()->name }}</span>
                    <span class="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
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

    <main class="mx-auto max-w-6xl px-4 py-8">
        {{ $slot }}
    </main>

    @livewireScripts
</body>
</html>
