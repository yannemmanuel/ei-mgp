<div class="card p-5">
    <h2 class="mb-3 text-sm font-semibold text-slate-900">Messagerie sécurisée</h2>

    <div class="mb-4 max-h-96 space-y-3 overflow-y-auto">
        @forelse ($this->messages as $message)
            @php $estAgent = $message->expediteur_type->value === 'agent'; @endphp
            <div class="flex {{ $estAgent ? 'justify-end' : 'justify-start' }}">
                <div class="max-w-[80%] rounded-lg px-3 py-2 text-sm {{ $estAgent ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800' }}">
                    <p class="whitespace-pre-line">{{ $message->corps }}</p>
                    <p class="mt-1 text-xs {{ $estAgent ? 'text-slate-300' : 'text-slate-500' }}">
                        {{ $estAgent ? ($message->expediteur->name ?? 'Agent') : 'Déclarant' }}
                        — {{ $message->created_at->format('d/m/Y H:i') }}
                    </p>
                </div>
            </div>
        @empty
            <p class="text-sm text-slate-400">Aucun message pour ce dossier.</p>
        @endforelse
    </div>

    <form wire:submit="envoyer" class="space-y-2 border-t border-slate-100 pt-4">
        <textarea wire:model="corps" rows="3" placeholder="Écrire un message..."
                  class="block w-full text-sm"></textarea>
        @error('corps') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
        <button type="submit" class="btn btn-primary">
            Envoyer
        </button>
    </form>
</div>
