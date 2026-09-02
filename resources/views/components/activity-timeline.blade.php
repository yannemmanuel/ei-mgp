@props(['items'])

@php
    // Couleurs sémantiques (statut), pas la couleur de marque — cf. docs/design-system-v2.md
    // "Sémantique (statut/gravité)" : mêmes ancres que .badge-emerald/-amber/-red/-sky
    // existants, pour ne jamais confondre "succès" avec la couleur d'identité SODECI.
    $dotClasses = [
        'success' => 'bg-emerald-500',
        'warning' => 'bg-amber-500',
        'danger' => 'bg-red-500',
        'info' => 'bg-sky-500',
        'neutral' => 'bg-slate-400',
    ];
@endphp

@if (count($items) === 0)
    <x-empty-state title="Aucune activité pour l'instant." />
@else
    <ol class="relative space-y-5 border-l border-slate-200 pl-5">
        @foreach ($items as $item)
            <li class="relative">
                <span class="absolute top-1 left-[-1.4rem] h-2.5 w-2.5 rounded-full ring-4 ring-white {{ $dotClasses[$item['tone'] ?? 'neutral'] }}"></span>
                <p class="text-sm text-slate-700">
                    <span class="font-medium text-slate-900">{{ $item['label'] }}</span>
                    @if (! empty($item['meta']))
                        — {{ $item['meta'] }}
                    @endif
                </p>
                <p class="text-xs text-slate-400">{{ $item['date'] }}</p>
                @if (! empty($item['description']))
                    <p class="mt-1 text-xs text-slate-500">{{ $item['description'] }}</p>
                @endif
            </li>
        @endforeach
    </ol>
@endif
