<div>
    <h1 class="mb-6 text-h1 text-slate-900">Journal d'audit</h1>

    <div class="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div>
            <label class="block text-xs font-medium text-slate-500">Action</label>
            <input type="text" wire:model.live.debounce.300ms="action" placeholder="dossier.cree, auth.connexion..." class="mt-1 block text-sm">
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Du</label>
            <input type="date" wire:model.live="dateDebut" class="mt-1 block text-sm">
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Au</label>
            <input type="date" wire:model.live="dateFin" class="mt-1 block text-sm">
        </div>
    </div>

    <div class="card p-5">
        <table class="w-full text-left text-sm">
            <thead>
                <tr class="border-b border-slate-100 text-xs text-slate-500">
                    <th class="pb-2">Date</th>
                    <th class="pb-2">Auteur</th>
                    <th class="pb-2">Action</th>
                    <th class="pb-2">Objet</th>
                    <th class="pb-2">Détail</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($this->logs as $log)
                    <tr class="border-b border-slate-50 align-top">
                        <td class="py-2 whitespace-nowrap text-xs text-slate-500">{{ $log->created_at->format('d/m/Y H:i:s') }}</td>
                        <td class="py-2 text-slate-700">{{ $log->utilisateur->name ?? 'Système' }}</td>
                        <td class="py-2">
                            <span class="badge badge-slate font-mono">{{ $log->action }}</span>
                        </td>
                        <td class="py-2 text-xs text-slate-500">
                            @if ($log->auditable_type)
                                {{ class_basename($log->auditable_type) }} #{{ $log->auditable_id }}
                            @endif
                        </td>
                        <td class="py-2 max-w-xs">
                            @if ($log->new_values)
                                <pre class="overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">{{ json_encode($log->new_values, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) }}</pre>
                            @endif
                            @if ($this->peutVoirAdresseIp && $log->ip_address)
                                <p class="mt-1 text-xs text-slate-400">{{ $log->ip_address }}</p>
                            @endif
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="5">
                            <x-empty-state title="Aucune entrée pour ces filtres.">
                                <x-slot:icon><x-icons.shield-check class="h-8 w-8" /></x-slot:icon>
                            </x-empty-state>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>

        <div class="mt-4">
            {{ $this->logs->links() }}
        </div>
    </div>
</div>
