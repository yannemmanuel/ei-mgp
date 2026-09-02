@props(['class' => 'h-5 w-5', 'strokeWidth' => '2'])
<svg {{ $attributes->merge(['class' => $class]) }} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="{{ $strokeWidth }}" aria-hidden="true">
    <path d="M5 10.5l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" />
</svg>
