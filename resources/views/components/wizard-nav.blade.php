@props(['etape', 'total'])

<div class="flex items-center justify-between gap-3 pt-2">
    @if ($etape > 1)
        <button type="button" wire:click="etapePrecedente" class="btn btn-secondary">
            ← Précédent
        </button>
    @else
        <span></span>
    @endif

    @if ($etape < $total)
        <button type="button" wire:click="etapeSuivante" wire:loading.attr="disabled" wire:target="etapeSuivante" class="btn btn-primary">
            Continuer →
        </button>
    @else
        <button type="submit" wire:loading.attr="disabled" wire:target="submit" class="btn btn-primary py-2 text-sm font-semibold">
            <span wire:loading.remove wire:target="submit">Soumettre la déclaration</span>
            <span wire:loading wire:target="submit">Envoi en cours…</span>
        </button>
    @endif
</div>
