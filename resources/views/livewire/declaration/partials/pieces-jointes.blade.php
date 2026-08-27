<div>
    <label for="fichiers" class="block text-sm font-medium text-slate-700">
        Pièces jointes <span class="font-normal text-slate-400">(facultatif — 5 fichiers max., 50 Mo au total)</span>
    </label>
    <input id="fichiers" type="file" wire:model="fichiers" multiple
           accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf"
           class="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200">

    <div wire:loading wire:target="fichiers" class="mt-1 text-xs text-slate-500">Téléversement en cours…</div>

    @if ($fichiers)
        <ul class="mt-2 space-y-1 text-sm text-slate-600">
            @foreach ($fichiers as $fichier)
                <li>{{ $fichier->getClientOriginalName() }}</li>
            @endforeach
        </ul>
    @endif

    @error('fichiers')
        <p class="mt-1 text-sm text-red-600">{{ $message }}</p>
    @enderror
    @error('fichiers.*')
        <p class="mt-1 text-sm text-red-600">{{ $message }}</p>
    @enderror
</div>
