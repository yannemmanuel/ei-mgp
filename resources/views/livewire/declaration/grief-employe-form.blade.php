    <div class="w-full">
        <h1 class="mb-1 font-serif text-xl text-slate-900">Déclarer un grief ou une plainte</h1>
        <p class="mb-6 text-sm text-slate-500">Parcours Employé.</p>

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
                                <label for="matricule" class="block text-sm font-medium text-slate-700">Matricule / département / service</label>
                                <input id="matricule" type="text" wire:model="matricule" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            </div>
                            <div>
                                <label for="posteOccupe" class="block text-sm font-medium text-slate-700">Poste occupé</label>
                                <input id="posteOccupe" type="text" wire:model="posteOccupe" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            </div>
                            <div>
                                <label for="ancienneteAnnees" class="block text-sm font-medium text-slate-700">Ancienneté (années)</label>
                                <input id="ancienneteAnnees" type="number" min="0" wire:model="ancienneteAnnees" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
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
                    @endunless
                @endif

                @if ($etapeActuelle === 2)
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label for="caractereRepetitif" class="block text-sm font-medium text-slate-700">Caractère répétitif *</label>
                            <select id="caractereRepetitif" wire:model="caractereRepetitif" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="caractereRepetitif-error">
                                <option value="">— Sélectionner —</option>
                                <option value="premiere_fois">Première fois</option>
                                <option value="deja_signale">Déjà signalé</option>
                                <option value="recurrent">Récurrent</option>
                            </select>
                            @error('caractereRepetitif') <p id="caractereRepetitif-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label for="dateHeureFaits" class="block text-sm font-medium text-slate-700">Date et heure des faits *</label>
                            <input id="dateHeureFaits" type="datetime-local" wire:model="dateHeureFaits" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="dateHeureFaits-error">
                            @error('dateHeureFaits') <p id="dateHeureFaits-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                    </div>

                    <div>
                        <label for="lieu" class="block text-sm font-medium text-slate-700">Lieu *</label>
                        <input id="lieu" type="text" wire:model="lieu" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="lieu-error">
                        @error('lieu') <p id="lieu-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>

                    <div class="alert alert-warning text-xs">
                        Attention : les informations sur les personnes impliquées et les témoins sont traitées de
                        façon strictement confidentielle.
                    </div>

                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label for="personnesImpliquees" class="block text-sm font-medium text-slate-700">Personnes impliquées</label>
                            <textarea id="personnesImpliquees" wire:model="personnesImpliquees" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                        </div>
                        <div>
                            <label for="temoinsEventuels" class="block text-sm font-medium text-slate-700">Témoins éventuels</label>
                            <textarea id="temoinsEventuels" wire:model="temoinsEventuels" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label class="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" wire:model="souhaitEtreRecontacte" class="rounded border-slate-300">
                            Je souhaite être recontacté(e)
                        </label>
                        @unless ($anonymat)
                            <div>
                                <label for="preferenceCanalRetour" class="block text-sm font-medium text-slate-700">Canal de retour préféré</label>
                                <select id="preferenceCanalRetour" wire:model="preferenceCanalRetour" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                                    <option value="">— Sélectionner —</option>
                                    <option value="email">Email</option>
                                    <option value="telephone">Téléphone</option>
                                    <option value="entretien">Entretien</option>
                                    <option value="page_de_suivi">Page de suivi</option>
                                </select>
                            </div>
                        @endunless
                    </div>
                @endif

                @if ($etapeActuelle === 3)
                    <div>
                        <label for="categorieId" class="block text-sm font-medium text-slate-700">Catégorie du grief *</label>
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
                        <label for="description" class="block text-sm font-medium text-slate-700">Description détaillée *</label>
                        <textarea id="description" wire:model="description" rows="4" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm" aria-describedby="description-error"></textarea>
                        @error('description') <p id="description-error" class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>

                    <div>
                        <label for="resultatSouhaite" class="block text-sm font-medium text-slate-700">Résultat souhaité</label>
                        <select id="resultatSouhaite" wire:model="resultatSouhaite" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            <option value="">— Sélectionner —</option>
                            <option value="resolution">Résolution</option>
                            <option value="mediation">Médiation</option>
                            <option value="sanction">Sanction</option>
                            <option value="signalement_simple">Signalement simple</option>
                        </select>
                    </div>
                @endif

                @if ($etapeActuelle === 4)
                    @include('livewire.declaration.partials.pieces-jointes')
                @endif

                <x-wizard-nav :etape="$etapeActuelle" :total="\App\Livewire\Declaration\DeclarationFormBase::NB_ETAPES" />
            </form>
        @endif
    </div>
