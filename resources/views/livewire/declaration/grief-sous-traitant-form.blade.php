<x-layouts.guest title="Grief / plainte — Sous-traitant" max-width="max-w-2xl">
    <div class="w-full">
        <h1 class="mb-1 text-lg font-semibold text-slate-900">Déclarer un grief ou une plainte</h1>
        <p class="mb-6 text-sm text-slate-500">Parcours Sous-traitant — aucun compte requis.</p>

        @if ($soumis)
            @include('livewire.declaration.partials.confirmation')
        @else
            <form wire:submit="submit" class="relative space-y-6">
                @include('livewire.declaration.partials.honeypot')
                @include('livewire.declaration.partials.canal-relais')
                @include('livewire.declaration.partials.anonymat')

                @unless ($anonymat)
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label for="nomPrenom" class="block text-sm font-medium text-slate-700">Nom et prénom</label>
                            <input id="nomPrenom" type="text" wire:model="nomPrenom" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                        <div>
                            <label for="entreprise" class="block text-sm font-medium text-slate-700">Entreprise sous-traitante</label>
                            <input id="entreprise" type="text" wire:model="entreprise" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                        <div>
                            <label for="fonction" class="block text-sm font-medium text-slate-700">Fonction</label>
                            <input id="fonction" type="text" wire:model="fonction" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                        <div>
                            <label for="contactEmail" class="block text-sm font-medium text-slate-700">Email</label>
                            <input id="contactEmail" type="email" wire:model="contactEmail" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            @error('contactEmail') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label for="contactTelephone" class="block text-sm font-medium text-slate-700">Téléphone</label>
                            <input id="contactTelephone" type="text" wire:model="contactTelephone" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                    </div>

                    <label class="flex items-start gap-2 text-sm text-slate-700">
                        <input type="checkbox" wire:model="consentementRgpd" class="mt-1 rounded border-slate-300">
                        <span>J'accepte que mes données personnelles soient traitées dans le cadre de ce grief *</span>
                    </label>
                    @error('consentementRgpd') <p class="text-sm text-red-600">{{ $message }}</p> @enderror
                @endunless

                <div>
                    <label for="categorieId" class="block text-sm font-medium text-slate-700">Type de grief *</label>
                    <select id="categorieId" wire:model.live="categorieId" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        <option value="">— Sélectionner —</option>
                        @foreach ($this->categoriesDisponibles as $categorie)
                            <option value="{{ $categorie->id }}">{{ $categorie->libelle }}</option>
                        @endforeach
                    </select>
                    @error('categorieId') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                </div>

                @if ($this->categorieEstAutre)
                    <div>
                        <label for="categorieAutrePrecision" class="block text-sm font-medium text-slate-700">Merci de préciser *</label>
                        <input id="categorieAutrePrecision" type="text" wire:model="categorieAutrePrecision" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        @error('categorieAutrePrecision') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                @endif

                <div>
                    <label for="niveauGraviteId" class="block text-sm font-medium text-slate-700">Niveau de gravité *</label>
                    <select id="niveauGraviteId" wire:model="niveauGraviteId" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        <option value="">— Sélectionner —</option>
                        @foreach ($this->niveauxGraviteDisponibles as $niveau)
                            <option value="{{ $niveau->id }}">{{ $niveau->libelle }}</option>
                        @endforeach
                    </select>
                    @error('niveauGraviteId') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                </div>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label for="lieuSite" class="block text-sm font-medium text-slate-700">Lieu / site concerné *</label>
                        <input id="lieuSite" type="text" wire:model="lieuSite" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        @error('lieuSite') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                    <div>
                        <label for="dateHeureFaits" class="block text-sm font-medium text-slate-700">Date et heure des faits *</label>
                        <input id="dateHeureFaits" type="datetime-local" wire:model="dateHeureFaits" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        @error('dateHeureFaits') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                </div>

                <div>
                    <label for="description" class="block text-sm font-medium text-slate-700">Description factuelle *</label>
                    <textarea id="description" wire:model="description" rows="4" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                    @error('description') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                </div>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label for="personnesOuServicesImpliques" class="block text-sm font-medium text-slate-700">Personnes ou services impliqués</label>
                        <textarea id="personnesOuServicesImpliques" wire:model="personnesOuServicesImpliques" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                    </div>
                    <div>
                        <label for="temoinsEventuels" class="block text-sm font-medium text-slate-700">Témoins éventuels</label>
                        <textarea id="temoinsEventuels" wire:model="temoinsEventuels" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                    </div>
                </div>

                @include('livewire.declaration.partials.pieces-jointes')

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label class="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" wire:model="souhaitEtreInforme" class="rounded border-slate-300">
                        Je souhaite être informé(e) de l'issue
                    </label>
                    <div>
                        <label for="canalRetourSouhaite" class="block text-sm font-medium text-slate-700">Canal de retour</label>
                        <input id="canalRetourSouhaite" type="text" wire:model="canalRetourSouhaite" placeholder="Téléphone, email…" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                    </div>
                </div>

                <button type="submit" wire:loading.attr="disabled" wire:target="submit"
                        class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
                    <span wire:loading.remove wire:target="submit">Soumettre la déclaration</span>
                    <span wire:loading wire:target="submit">Envoi en cours…</span>
                </button>
            </form>
        @endif
    </div>
</x-layouts.guest>
