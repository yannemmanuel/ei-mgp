{{-- Layout "pleine page" par défaut de Livewire (config('livewire.component_layout') = 'layouts::app').
     Nos composants de déclaration produisent déjà un document HTML complet via
     <x-layouts.guest>/<x-layouts.app> dans leur propre vue : ce fichier reste donc un simple
     passe-plat, sans balisage supplémentaire, pour ne pas imbriquer deux documents HTML. --}}
{{ $slot }}
