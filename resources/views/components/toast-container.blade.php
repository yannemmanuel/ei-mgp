<div
    x-data="toastContainer()"
    x-init="init()"
    x-on:toast.window="push($event.detail)"
    class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
>
    <template x-for="toast in toasts" :key="toast.id">
        <div
            class="pointer-events-auto w-full max-w-sm alert"
            :class="{
                'alert-success': toast.type === 'success',
                'alert-error': toast.type === 'error',
                'alert-warning': toast.type === 'warning',
            }"
            x-show="true"
            x-transition
            role="status"
            aria-live="polite"
        >
            <div class="flex items-start justify-between gap-3">
                <p x-text="toast.message"></p>
                <button
                    type="button"
                    x-on:click="dismiss(toast.id)"
                    class="shrink-0 text-current/60 hover:text-current"
                    aria-label="Fermer"
                >&times;</button>
            </div>
        </div>
    </template>
</div>

@if (session('status') || session('error'))
    <script>
        window.__initialFlash = window.__initialFlash ?? [];
        @if (session('status')) window.__initialFlash.push({ type: 'success', message: @js(session('status')) }); @endif
        @if (session('error')) window.__initialFlash.push({ type: 'error', message: @js(session('error')) }); @endif
    </script>
@endif
