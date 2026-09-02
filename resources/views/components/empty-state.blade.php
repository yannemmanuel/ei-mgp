@props(['title', 'description' => null])

{{--
    Motif abstrait (deux anneaux concentriques, thème "onde") derrière l'icône — décision prise
    plus tôt (docs/visual-direction.md) : pas d'outil de génération d'image dans cet environnement,
    donc illustrations = motifs SVG/CSS abstraits plutôt que des icônes seules flottant dans le
    vide. Neutre (slate) et non la couleur de marque : un état vide n'est ni positif ni négatif,
    il ne mérite pas un habillage vert (cf. principe "la couleur encode un signal").
--}}
<div class="flex flex-col items-center justify-center gap-3 py-10 text-center">
    <div class="relative flex h-20 w-20 items-center justify-center">
        <span class="absolute inset-0 rounded-full bg-slate-50"></span>
        <span class="absolute inset-2.5 rounded-full bg-slate-100/80"></span>
        <span class="relative text-slate-300">{{ $icon ?? '' }}</span>
    </div>
    <p class="text-sm font-medium text-slate-500">{{ $title }}</p>
    @if ($description)
        <p class="text-xs text-slate-400">{{ $description }}</p>
    @endif
    @isset($action)
        <div class="mt-2">{{ $action }}</div>
    @endisset
</div>
