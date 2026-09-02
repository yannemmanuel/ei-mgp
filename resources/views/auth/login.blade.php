<x-layouts.guest title="Connexion"
    hero-title="Un espace de traitement rigoureux et confidentiel."
    hero-subtitle="Connectez-vous avec votre compte professionnel pour accéder aux dossiers qui vous sont confiés.">
    <h1 class="mb-6 font-serif text-2xl text-slate-900">Connexion</h1>

    @session('status')
        <div class="alert alert-success mb-4">
            {{ $value }}
        </div>
    @endsession

    @if ($errors->any())
        <div class="alert alert-error mb-4">
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
                   class="mt-1 block w-full text-sm">
        </div>

        <div>
            <label for="password" class="block text-sm font-medium text-slate-700">Mot de passe</label>
            <input id="password" type="password" name="password" required class="mt-1 block w-full text-sm">
        </div>

        <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="remember">
                Se souvenir de moi
            </label>
        </div>

        <button type="submit" class="btn btn-primary btn-block">
            Se connecter
        </button>
    </form>
</x-layouts.guest>
