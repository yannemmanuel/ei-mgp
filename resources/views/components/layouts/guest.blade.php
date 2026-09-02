<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? config('app.name') }}</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" rel="stylesheet">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="min-h-screen bg-brand-bg font-sans text-slate-900 antialiased">
<div class="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
    <aside class="relative flex flex-col justify-between overflow-hidden border-b border-slate-200 bg-brand-bg px-6 py-10 sm:px-10 lg:border-b-0 lg:border-r lg:px-12 lg:py-14">
        {{--
            Motif abstrait (ondes concentriques, thème "eau") comblant l'espace vide du panneau —
            décision prise plus tôt faute d'outil de génération d'image (docs/visual-direction.md).
            z-0 sur le motif + z-10 sur les deux blocs de contenu ci-dessous, jamais l'inverse
            (z-index négatif) : "aside" est position:relative SANS z-index propre, donc ne crée
            pas de contexte d'empilement — un enfant en z-index négatif se retrouverait alors
            derrière le fond opaque de aside lui-même (peint dans le contexte du parent), pas
            seulement derrière son texte. z-0 sur un enfant position:absolute crée sa propre pile
            local et reste visible, tant que les frères normaux passent explicitement au-dessus.
        --}}
        <svg class="pointer-events-none absolute -right-16 -bottom-16 z-0 h-72 w-72 text-primary-200" viewBox="0 0 200 200" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="99" stroke="currentColor" stroke-width="1.5" opacity="0.8" />
            <circle cx="100" cy="100" r="70" stroke="currentColor" stroke-width="1.5" opacity="0.65" />
            <circle cx="100" cy="100" r="41" stroke="currentColor" stroke-width="1.5" opacity="0.5" />
        </svg>

        <div class="relative z-10">
            <a href="{{ route('dashboard') }}" wire:navigate class="flex items-center gap-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-md bg-brand-green text-xs font-bold text-white">EI</span>
                <span class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Digitalisation EI / MGP</span>
            </a>

            <h1 class="mt-10 font-serif text-3xl leading-snug text-brand-green lg:mt-16 lg:text-4xl">
                {{ $heroTitle ?? 'Un canal sûr pour signaler ce qui doit l’être.' }}
            </h1>
            <p class="mt-4 max-w-sm text-sm leading-relaxed text-slate-600">
                {{ $heroSubtitle ?? 'Votre déclaration est traitée avec confidentialité — vous pouvez choisir de rester anonyme à tout moment.' }}
            </p>
        </div>

        @isset($steps)
            {{--
                Réagit à la progression réelle plutôt que d'afficher 3 puces statiques identiques
                quel que soit l'avancement (docs/audit-frontend-2026-08-29.md, point 4). L'étape 1
                "Décrivez les faits" couvre à elle seule les 4 étapes internes du wizard de
                déclaration (Identité/Contexte/Nature/Pièces jointes) : tant qu'on n'a pas soumis,
                elle reste active et affiche en plus la progression fine du wizard ; une fois
                soumis, elle passe "faite" et l'étape 2 "Recevez une référence" s'active à son
                tour. L'étape 3 "Suivez l'avancement" ne peut jamais devenir "active" ici : elle ne
                se produit que sur /suivi, une autre page — elle reste "à venir" par construction.

                Réactivité en x-data/Alpine, pas en Blade seul : `->layout()` rend ce gabarit UNE
                SEULE FOIS autour du composant Livewire — les mises à jour suivantes
                (etapeSuivante/submit) ne re-rendent que la racine du composant, jamais ce panneau
                qui vit en dehors. `wizard-progression` est dispatché par
                DeclarationFormBase::etapeSuivante()/etapePrecedente()/submit() (même mécanisme que
                `graphiques-actualises` pour les graphiques du dashboard, resources/js/charts.js).
                Les valeurs Blade ci-dessous n'amorcent que l'état du tout premier chargement.
            --}}
            <div x-data="{
                    etapeActuelle: {{ $etapeActuelle ?? 1 }},
                    nbEtapes: {{ $nbEtapes ?? 1 }},
                    soumis: {{ ($soumis ?? false) ? 'true' : 'false' }},
                 }"
                 x-on:wizard-progression.window="etapeActuelle = $event.detail.etapeActuelle; soumis = $event.detail.soumis">
                <ol class="relative z-10 mt-12 space-y-5 lg:mt-0">
                    @foreach ($steps as $i => $etape)
                        <li class="flex gap-3">
                            <template x-if="{{ $i }} < (soumis ? 1 : 0)">
                                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
                                    <x-icons.check class="h-4 w-4" stroke-width="2.5" />
                                </span>
                            </template>
                            <template x-if="!({{ $i }} < (soumis ? 1 : 0))">
                                <span class="font-serif text-xl font-semibold" :class="{{ $i }} === (soumis ? 1 : 0) ? 'text-brand-green' : 'text-slate-300'">
                                    {{ $i + 1 }}
                                </span>
                            </template>
                            <div>
                                <p class="text-sm font-medium" :class="{{ $i }} > (soumis ? 1 : 0) ? 'text-slate-400' : 'text-slate-900'">
                                    {{ $etape['titre'] }}
                                </p>
                                <p class="text-xs text-slate-500">{{ $etape['description'] }}</p>
                                @if ($i === 0)
                                    <div class="mt-1.5 flex items-center gap-1" x-show="!soumis && nbEtapes > 1">
                                        <template x-for="e in nbEtapes" :key="e">
                                            <span class="h-1 w-4 rounded-full" :class="e <= etapeActuelle ? 'bg-brand-green' : 'bg-slate-200'"></span>
                                        </template>
                                        <span class="ml-1 text-[11px] text-slate-400" x-text="'Étape ' + etapeActuelle + ' sur ' + nbEtapes"></span>
                                    </div>
                                @endif
                            </div>
                        </li>
                    @endforeach
                </ol>
            </div>
        @else
            <div></div>
        @endisset
    </aside>

    <div class="flex items-center justify-center px-4 py-12 sm:px-8 lg:px-16">
        <div class="w-full {{ $maxWidth ?? 'max-w-md' }} animate-rise-in">
            <div class="card p-8">
                {{ $slot }}
            </div>
        </div>

        <x-toast-container />
    </div>
</div>

    @livewireScripts
</body>
</html>
