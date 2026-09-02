@props(['statut'])

@php
    $styles = [
        'recu' => 'badge-slate',
        'affecte' => 'badge-slate',
        'en_analyse' => 'badge-sky',
        'en_investigation' => 'badge-sky',
        'en_attente_information' => 'badge-amber',
        'action_corrective_en_cours' => 'badge-amber',
        'resolu' => 'badge-emerald',
        'cloture' => 'badge-indigo',
        'reouvert' => 'badge-orange',
        'rejete' => 'badge-red',
    ];
    $classe = $styles[$statut?->code?->value] ?? 'badge-slate';
@endphp

<span {{ $attributes->merge(['class' => "badge $classe"]) }}>
    {{ $statut->libelle_interne }}
</span>
