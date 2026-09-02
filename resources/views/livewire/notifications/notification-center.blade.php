<div class="relative" x-data="{ open: false }" x-on:keydown.escape.window="open = false">
    <button type="button" x-on:click="open = ! open"
            class="relative -m-2.5 flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-900" aria-label="Notifications">
        <x-icons.bell class="h-6 w-6" />
        @if ($this->nombreNonLues > 0)
            <span class="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white">
                {{ $this->nombreNonLues > 9 ? '9+' : $this->nombreNonLues }}
            </span>
        @endif
    </button>

    <div x-show="open" x-cloak x-transition.origin.top.right x-on:click.outside="open = false"
         class="absolute right-0 top-full z-50 mt-2 w-80 rounded-floating border border-slate-200 bg-white shadow-floating">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 class="text-h4 text-slate-900">Notifications</h2>
            @if ($this->nombreNonLues > 0)
                <button type="button" wire:click="toutMarquerLu" class="text-xs font-medium text-primary-700 hover:underline">
                    Tout marquer comme lu
                </button>
            @endif
        </div>

        <div class="max-h-96 overflow-y-auto">
            @forelse ($this->notifications as $notification)
                <button type="button" wire:click="marquerLu('{{ $notification->id }}')"
                        class="flex w-full items-start gap-2.5 border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-50">
                    <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full {{ $notification->read_at ? 'bg-transparent' : 'bg-primary-600' }}"></span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium text-slate-900">{{ $notification->data['objet'] ?? 'Notification' }}</span>
                        <span class="block truncate text-xs text-slate-500">{{ $notification->data['corps'] ?? '' }}</span>
                        <span class="mt-0.5 block text-xs text-slate-400">{{ $notification->created_at->diffForHumans() }}</span>
                    </span>
                </button>
            @empty
                <div class="px-4 py-8">
                    <x-empty-state title="Aucune notification." description="Vous êtes à jour.">
                        <x-slot:icon><x-icons.bell class="h-8 w-8" /></x-slot:icon>
                    </x-empty-state>
                </div>
            @endforelse
        </div>
    </div>
</div>
