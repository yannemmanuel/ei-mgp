    <div class="w-full">
        <h1 class="mb-1 font-serif text-xl text-slate-900">Déclarer un grief ou une plainte</h1>
        <p class="mb-6 text-sm text-slate-500">Parcours Sous-traitant — aucun compte requis.</p>

        @if ($soumis)
            @include('livewire.declaration.partials.confirmation')
        @else
            <form wire:submit="submit" class="relative space-y-6">
                @include('livewire.declaration.partials.honeypot')

                <x-wizard-progress :etape="$etapeActuelle" :total="\App\Livewire\Declaration\DeclarationFormBase::NB_ETAPES" :labels="$this->libellesEtapes()" />

                @if ($etapeActuelle === 1)
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
                                <input id="contactEmail" type="email" wire:model="contactEmail" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="contactEmail-error">
                                @error('contactEmail') <p id="contactEmail-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <label for="contactTelephone" class="block text-sm font-medium text-slate-700">Téléphone</label>
                                <input id="contactTelephone" type="text" wire:model="contactTelephone" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            </div>
                        </div>

                        <label class="flex items-start gap-2 text-sm text-slate-700">
                            <input id="consentementRgpd" type="checkbox" wire:model="consentementRgpd" aria-describedby="consentementRgpd-error" class="mt-1 rounded border-slate-300">
                            <span>J'accepte que mes données personnelles soient traitées dans le cadre de ce grief *</span>
                        </label>
                        @error('consentementRgpd') <p id="consentementRgpd-error" class="text-sm text-red-600">{{ $message }}</p> @enderror
                    @endunless
                @endif

                @if ($etapeActuelle === 2)
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label for="lieuSite" class="block text-sm font-medium text-slate-700">Lieu / site concerné *</label>
                            <input id="lieuSite" type="text" wire:model="lieuSite" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="lieuSite-error">
                            @error('lieuSite') <p id="lieuSite-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label for="dateHeureFaits" class="block text-sm font-medium text-slate-700">Date et heure des faits *</label>
                            <input id="dateHeureFaits" type="datetime-local" wire:model="dateHeureFaits" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="dateHeureFaits-error">
                            @error('dateHeureFaits') <p id="dateHeureFaits-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
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
                @endif

                @if ($etapeActuelle === 3)
                    <div>
                        <label for="categorieId" class="block text-sm font-medium text-slate-700">Type de grief *</label>
                        <select id="categorieId" wire:model.live="categorieId" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="categorieId-error">
                            <option value="">— Sélectionner —</option>
                            @foreach ($this->categoriesDisponibles as $categorie)
                                <option value="{{ $categorie->id }}">{{ $categorie->libelle }}</option>
                            @endforeach
                        </select>
                        @error('categorieId') <p id="categorieId-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>

                    @if ($this->categorieEstAutre)
                        <div>
                            <label for="categorieAutrePrecision" class="block text-sm font-medium text-slate-700">Merci de préciser *</label>
                            <input id="categorieAutrePrecision" type="text" wire:model="categorieAutrePrecision" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="categorieAutrePrecision-error">
                            @error('categorieAutrePrecision') <p id="categorieAutrePrecision-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                    @endif

                    <div>
                        <label for="niveauGraviteId" class="block text-sm font-medium text-slate-700">Niveau de gravité *</label>
                        <select id="niveauGraviteId" wire:model="niveauGraviteId" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="niveauGraviteId-error">
                            <option value="">— Sélectionner —</option>
                            @foreach ($this->niveauxGraviteDisponibles as $niveau)
                                <option value="{{ $niveau->id }}">{{ $niveau->libelle }}</option>
                            @endforeach
                        </select>
                        @error('niveauGraviteId') <p id="niveauGraviteId-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>

                    <div>
                        <label for="description" class="block text-sm font-medium text-slate-700">Description factuelle *</label>
                        <textarea id="description" wire:model="description" rows="4" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="description-error"></textarea>
                        @error('description') <p id="description-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                @endif

                @if ($etapeActuelle === 4)
                    @include('livewire.declaration.partials.pieces-jointes')
                @endif

                <x-wizard-nav :etape="$etapeActuelle" :total="\App\Livewire\Declaration\DeclarationFormBase::NB_ETAPES" />
            </form>
        @endif
    </div>
