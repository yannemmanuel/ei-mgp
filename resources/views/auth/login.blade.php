<x-layouts.guest title="Connexion">
    <h1 class="mb-6 text-lg font-semibold text-slate-900">Connexion</h1>

    @session('status')
        <div class="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {{ $value }}
        </div>
    @endsession

    @if ($errors->any())
        <div class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <ul class="list-inside list-disc">
                @foreach ($errors->all() as $error)
                    <li>{{ $error }}</li>
                @endforeach
            </ul>
        </div>
    @endif

    <form method="POST" action="{{ route('login') }}" class="space-y-4">
        @csrf

        <div>
            <label for="email" class="block text-sm font-medium text-slate-700">Adresse email</label>
            <input id="email" type="email" name="email" value="{{ old('email') }}" required autofocus
                   class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm">
        </div>

        <div>
            <label for="password" class="block text-sm font-medium text-slate-700">Mot de passe</label>
            <input id="password" type="password" name="password" required
                   class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm">
        </div>

        <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="remember" class="rounded border-slate-300">
                Se souvenir de moi
            </label>
        </div>

        <button type="submit"
                class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Se connecter
        </button>
    </form>
</x-layouts.guest>
