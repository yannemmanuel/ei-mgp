@props(['etape', 'total', 'labels' => []])

<div class="mb-6">
    <div class="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
        <span>Étape {{ $etape }} / {{ $total }}</span>
        <span class="text-slate-700">{{ $labels[$etape - 1] ?? '' }}</span>
    </div>
    <div class="flex gap-1.5" role="progressbar" aria-valuenow="{{ $etape }}" aria-valuemin="1" aria-valuemax="{{ $total }}">
        @for ($i = 1; $i <= $total; $i++)
            <span class="h-1.5 flex-1 rounded-full transition-colors duration-300 {{ $i <= $etape ? 'bg-primary-600' : 'bg-slate-200' }}"></span>
        @endfor
    </div>
</div>
