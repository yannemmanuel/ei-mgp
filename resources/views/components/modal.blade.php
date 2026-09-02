@props(['name', 'title' => null, 'maxWidth' => 'max-w-lg'])

@php $titleId = "{$name}-title"; @endphp

<div
    x-data="{ open: false }"
    x-on:open-modal.window="if ($event.detail.name === '{{ $name }}') open = true"
    x-on:close-modal.window="if ($event.detail.name === '{{ $name }}') open = false"
    x-on:keydown.escape.window="open = false"
>
    {{ $trigger ?? '' }}

    {{--
        No x-teleport here: this app's "page components" (the whole page is one Livewire
        component, wire:id lives on <html>) do a full-document morph on every update. A
        teleported node becomes an extra <body> child with no counterpart in the server's
        re-rendered HTML, which breaks the morph. Rendering in place is visually equivalent
        since position:fixed isn't affected by DOM depth as long as no ancestor sets a
        transform/filter/contain — none of this app's containers do.
    --}}
    <div x-show="open" x-cloak class="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" @if ($title) aria-labelledby="{{ $titleId }}" @endif>
        <div x-show="open" x-transition.opacity x-on:click="open = false" class="fixed inset-0 bg-slate-900/50"></div>
        <div x-show="open" x-transition class="card relative w-full {{ $maxWidth }} p-6" x-on:click.stop>
            <button type="button" x-on:click="open = false" aria-label="Fermer"
                    class="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <x-icons.x-mark class="h-5 w-5" />
            </button>
            @if ($title)
                <h2 id="{{ $titleId }}" class="mb-4 pr-8 text-h3 text-slate-900">{{ $title }}</h2>
            @endif
            {{ $slot }}
        </div>
    </div>
</div>
