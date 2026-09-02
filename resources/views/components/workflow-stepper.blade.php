@props(['statut'])

@php
    /**
     * Les 10 codes de StatutDossierCode (docs/regles-metier.md, docs/workflows.md) ne forment pas
     * une ligne à 10 arrêts lisible visuellement — on les regroupe en 4 macro-étapes. "Rejeté" est
     * un cas de sortie, pas une étape du parcours : affiché comme un bandeau séparé plutôt que
     * forcé dans la frise (docs/page-redesign-map.md §2).
     */
    $etapes = [
        'recu' => 'Reçu',
        'affecte' => 'Affecté',
        'traitement' => 'En traitement',
        'cloture' => 'Clôturé',
    ];

    $macroEtapeParCode = [
        'recu' => 'recu',
        'affecte' => 'affecte',
        'en_analyse' => 'traitement',
        'en_investigation' => 'traitement',
        'en_attente_information' => 'traitement',
        'action_corrective_en_cours' => 'traitement',
        'resolu' => 'traitement',
        'reouvert' => 'traitement',
        'cloture' => 'cloture',
    ];

    $code = $statut->code->value;
    $ordre = array_keys($etapes);
    $macroEtape = $macroEtapeParCode[$code] ?? 'recu';
    $indexActif = array_search($macroEtape, $ordre, true);
@endphp

@if ($code === 'rejete')
    <div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        <x-icons.x-mark class="h-5 w-5 shrink-0" />
        Dossier rejeté — non recevable
    </div>
@else
    <div {{ $attributes }}>
        <ol class="flex items-center">
            @foreach ($ordre as $i => $cle)
                <li class="flex flex-1 items-center last:flex-none">
                    <div class="flex flex-col items-center gap-1.5">
                        <span @class([
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors duration-300',
                            'border-primary-600 bg-primary-600 text-white' => $i < $indexActif,
                            'border-primary-600 bg-white text-primary-600' => $i === $indexActif,
                            'border-slate-300 bg-white text-slate-400' => $i > $indexActif,
                        ])>
                            @if ($i < $indexActif)
                                <x-icons.check class="h-3.5 w-3.5" stroke-width="2.5" />
                            @else
                                {{ $i + 1 }}
                            @endif
                        </span>
                        <span class="text-label whitespace-nowrap uppercase {{ $i === $indexActif ? 'text-primary-700' : 'text-slate-400' }}">
                            {{ $etapes[$cle] }}
                        </span>
                    </div>
                    @unless ($loop->last)
                        <div class="mx-2 h-0.5 flex-1 rounded-full transition-colors duration-300 {{ $i < $indexActif ? 'bg-primary-600' : 'bg-slate-200' }}"></div>
                    @endunless
                </li>
            @endforeach
        </ol>
        @if ($code === 'reouvert')
            <p class="mt-2 text-xs font-medium text-accent-700">Dossier réouvert (RG-07)</p>
        @endif
    </div>
@endif
