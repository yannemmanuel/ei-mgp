<x-layouts.guest title="Grief / plainte — Communauté" max-width="max-w-2xl">
    <div class="w-full">
        <h1 class="mb-1 text-lg font-semibold text-slate-900">Déclarer un grief ou une plainte</h1>
        <p class="mb-6 text-sm text-slate-500">Parcours Communauté — aucun compte requis.</p>

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
                            <label for="localite" class="block text-sm font-medium text-slate-700">Localité / village de résidence *</label>
                            <input id="localite" type="text" wire:model="localite" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            @error('localite') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
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
                @endunless

                <div>
                    <label for="statutPlaignant" class="block text-sm font-medium text-slate-700">Statut du plaignant *</label>
                    <select id="statutPlaignant" wire:model="statutPlaignant" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        <option value="">— Sélectionner —</option>
                        <option value="riverain">Riverain</option>
                        <option value="chef_coutumier">Chef coutumier</option>
                        <option value="association">Association</option>
                        <option value="ong">ONG</option>
                        <option value="autre">Autre</option>
                    </select>
                    @error('statutPlaignant') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                </div>

                <div>
                    <label for="categorieId" class="block text-sm font-medium text-slate-700">Catégorie *</label>
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
                        <label for="dateSurvenance" class="block text-sm font-medium text-slate-700">Date de survenance *</label>
                        <input id="dateSurvenance" type="date" wire:model="dateSurvenance" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        @error('dateSurvenance') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                    <div>
                        <label for="lieu" class="block text-sm font-medium text-slate-700">Lieu *</label>
                        <input id="lieu" type="text" wire:model="lieu" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        @error('lieu') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                </div>

                <div>
                    <label for="description" class="block text-sm font-medium text-slate-700">Description détaillée *</label>
                    <textarea id="description" wire:model="description" rows="4" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                    @error('description') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                </div>

                <div>
                    <label for="personnesBiensAffectes" class="block text-sm font-medium text-slate-700">Personnes / biens affectés</label>
                    <textarea id="personnesBiensAffectes" wire:model="personnesBiensAffectes" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                </div>

                @include('livewire.declaration.partials.pieces-jointes')

                <div>
                    <label for="solutionSouhaitee" class="block text-sm font-medium text-slate-700">Solution ou réparation souhaitée</label>
                    <textarea id="solutionSouhaitee" wire:model="solutionSouhaitee" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
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
