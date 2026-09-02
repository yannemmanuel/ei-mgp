@props(['items' => []])

<nav aria-label="Fil d'Ariane" class="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
    @foreach ($items as $item)
        @unless ($loop->first)
            <x-icons.chevron-right class="h-3.5 w-3.5 shrink-0 text-slate-300" />
        @endunless

        @if (! $loop->last && isset($item['url']))
            <a href="{{ $item['url'] }}" wire:navigate class="transition-colors hover:text-slate-900 hover:underline hover:underline-offset-2">{{ $item['label'] }}</a>
        @else
            <span class="font-medium text-slate-700">{{ $item['label'] }}</span>
        @endif
    @endforeach
</nav>
