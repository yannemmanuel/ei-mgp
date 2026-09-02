    <div class="w-full">
        <h1 class="mb-1 font-serif text-xl text-slate-900">Déclarer un événement indésirable</h1>
        <p class="mb-6 text-sm text-slate-500">Parcours Employé — signalement d'une situation ou condition dangereuse.</p>

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
                        <div wire:key="identite-ei-employe" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label for="nomPrenom" class="block text-sm font-medium text-slate-700">Nom et prénom</label>
                                <input id="nomPrenom" type="text" wire:model="nomPrenom"
                                       class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            </div>
                            <div>
                                <label for="matricule" class="block text-sm font-medium text-slate-700">Matricule</label>
                                <input id="matricule" type="text" wire:model="matricule"
                                       class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            </div>
                            <div>
                                <label for="directionId" class="block text-sm font-medium text-slate-700">Direction *</label>
                                <select id="directionId" wire:model="directionId"
                                        class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="directionId-error">
                                    <option value="">— Sélectionner —</option>
                                    @foreach ($this->directionsDisponibles as $direction)
                                        <option value="{{ $direction->id }}">{{ $direction->libelle }}</option>
                                    @endforeach
                                </select>
                                @error('directionId') <p id="directionId-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <label for="posteOccupe" class="block text-sm font-medium text-slate-700">Poste occupé</label>
                                <input id="posteOccupe" type="text" wire:model="posteOccupe"
                                       class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            </div>
                            <div>
                                <label for="contactEmail" class="block text-sm font-medium text-slate-700">Email</label>
                                <input id="contactEmail" type="email" wire:model="contactEmail"
                                       class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="contactEmail-error">
                                @error('contactEmail') <p id="contactEmail-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <label for="contactTelephone" class="block text-sm font-medium text-slate-700">Téléphone</label>
                                <input id="contactTelephone" type="text" wire:model="contactTelephone"
                                       class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            </div>
                        </div>
                    @endunless
                @endif

                @if ($etapeActuelle === 2)
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label for="dateSurvenance" class="block text-sm font-medium text-slate-700">Date de survenue *</label>
                            <input id="dateSurvenance" type="date" wire:model="dateSurvenance"
                                   class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="dateSurvenance-error">
                            @error('dateSurvenance') <p id="dateSurvenance-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label for="lieu" class="block text-sm font-medium text-slate-700">Lieu *</label>
                            <input id="lieu" type="text" wire:model="lieu"
                                   class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="lieu-error">
                            @error('lieu') <p id="lieu-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                    </div>
                @endif

                @if ($etapeActuelle === 3)
                    <div>
                        <label for="categorieId" class="block text-sm font-medium text-slate-700">Nature de l'EI *</label>
                        <select id="categorieId" wire:model.live="categorieId"
                                class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="categorieId-error">
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
                            <input id="categorieAutrePrecision" type="text" wire:model="categorieAutrePrecision"
                                   class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="categorieAutrePrecision-error">
                            @error('categorieAutrePrecision') <p id="categorieAutrePrecision-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                    @endif

                    <div>
                        <label for="niveauGraviteId" class="block text-sm font-medium text-slate-700">Niveau de gravité *</label>
                        <select id="niveauGraviteId" wire:model="niveauGraviteId"
                                class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="niveauGraviteId-error">
                            <option value="">— Sélectionner —</option>
                            @foreach ($this->niveauxGraviteDisponibles as $niveau)
                                <option value="{{ $niveau->id }}">{{ $niveau->libelle }}</option>
                            @endforeach
                        </select>
                        @error('niveauGraviteId') <p id="niveauGraviteId-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>

                    <div>
                        <label for="description" class="block text-sm font-medium text-slate-700">Description de l'évènement *</label>
                        <textarea id="description" wire:model="description" rows="4"
                                  class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="description-error"></textarea>
                        @error('description') <p id="description-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>

                    <div>
                        <label for="propositionMesureCorrective" class="block text-sm font-medium text-slate-700">
                            Proposition de mesure corrective <span class="font-normal text-slate-400">(facultatif)</span>
                        </label>
                        <textarea id="propositionMesureCorrective" wire:model="propositionMesureCorrective" rows="2"
                                  class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                    </div>
                @endif

                @if ($etapeActuelle === 4)
                    @include('livewire.declaration.partials.pieces-jointes')
                @endif

                <x-wizard-nav :etape="$etapeActuelle" :total="\App\Livewire\Declaration\DeclarationFormBase::NB_ETAPES" />
            </form>
        @endif
    </div>
