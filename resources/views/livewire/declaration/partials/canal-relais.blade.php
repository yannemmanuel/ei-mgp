@if ($viaRelais)
    <div>
        <label for="canalRelaisChoisi" class="block text-sm font-medium text-slate-700">Canal d'origine de la déclaration</label>
        <select id="canalRelaisChoisi" wire:model="canalRelaisChoisi"
                class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm">
            <option value="">— Sélectionner —</option>
            @foreach ($this->canauxRelais as $canal)
                <option value="{{ $canal->code->value }}">{{ $canal->libelle }}</option>
            @endforeach
        </select>
        @error('canalRelaisChoisi')
            <p class="mt-1 text-sm text-red-600">{{ $message }}</p>
        @enderror
    </div>
@endif
