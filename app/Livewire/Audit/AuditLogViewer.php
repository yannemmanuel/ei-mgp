<?php

namespace App\Livewire\Audit;

use App\Models\AuditLog;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Auth;
use Livewire\Component;
use Livewire\WithPagination;

/**
 * Consultation du journal d'audit (docs/exigences-audit.md §4) : lecture seule, réservée à
 * `auditeur` / `dpo` / `service_mgp` (`audit.view`, App\Policies\AuditLogPolicy déjà en place
 * depuis Phase 2). Aucune action d'écriture n'est exposée ici — cette page ne fait que lire.
 */
class AuditLogViewer extends Component
{
    use WithPagination;

    public string $action = '';

    public string $dateDebut = '';

    public string $dateFin = '';

    public function mount(): void
    {
        abort_unless(Auth::user()->can('audit.view'), 403);
    }

    private function utilisateurPeutVoirAdresseIp(): bool
    {
        return Auth::user()->hasAnyRole(['dpo', 'auditeur']);
    }

    /**
     * exigences-audit.md §5 : l'IP/user-agent de soumission ne doit être consultable que par le
     * DPO/Auditeur (enquête sur abus), jamais par les autres rôles porteurs de `audit.view`
     * (`service_mgp`, pourtant habilité au reste du journal) — un déclarant anonyme ne doit
     * jamais pouvoir être réidentifié par un rôle de traitement métier via ce journal.
     */
    public function getPeutVoirAdresseIpProperty(): bool
    {
        return $this->utilisateurPeutVoirAdresseIp();
    }

    public function updated(): void
    {
        $this->resetPage();
    }

    public function getLogsProperty(): LengthAwarePaginator
    {
        return AuditLog::query()
            ->with('utilisateur')
            ->when($this->action !== '', fn ($q) => $q->where('action', 'ilike', '%'.$this->action.'%'))
            ->when($this->dateDebut !== '', fn ($q) => $q->whereDate('created_at', '>=', $this->dateDebut))
            ->when($this->dateFin !== '', fn ($q) => $q->whereDate('created_at', '<=', $this->dateFin))
            ->orderByDesc('created_at')
            ->paginate(25);
    }

    public function render()
    {
        return view('livewire.audit.audit-log-viewer')
            ->layout('components.layouts.app', ['title' => "Journal d'audit"]);
    }
}
