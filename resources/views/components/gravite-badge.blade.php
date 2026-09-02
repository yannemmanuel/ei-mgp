@props(['niveau'])

@php
    $styles = [
        'faible' => 'badge-emerald',
        'modere' => 'badge-amber',
        'eleve' => 'badge-orange',
        'critique' => 'badge-red',
    ];
    $classe = $styles[$niveau?->code?->value] ?? 'badge-slate';
@endphp

<span {{ $attributes->merge(['class' => "badge $classe"]) }}>
    <span class="h-1.5 w-1.5 rounded-full" style="background-color: {{ $niveau->couleur ?? '#64748b' }}"></span>
    {{ $niveau->libelle }}
</span>
