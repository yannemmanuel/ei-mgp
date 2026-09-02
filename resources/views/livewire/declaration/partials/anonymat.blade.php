<div class="rounded-md border border-slate-200 bg-slate-50 p-4">
    <label class="flex items-start gap-3">
        <input id="anonymat" type="checkbox" wire:model.live="anonymat" aria-describedby="anonymat-error"
               class="mt-1 rounded border-slate-300 text-slate-900 focus:ring-slate-500">
        <span>
            <span class="block text-sm font-medium text-slate-900">Je souhaite rester anonyme</span>
            <span class="block text-xs text-slate-500">
                Aucune information permettant de vous identifier ne sera demandée ni conservée.
                Un numéro de référence et un code d'accès secondaire vous seront communiqués pour
                suivre votre dossier.
            </span>
        </span>
    </label>

    @error('anonymat')
        <p id="anonymat-error" class="mt-2 text-sm text-red-600">{{ $message }}</p>
    @enderror
</div>
