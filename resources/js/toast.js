document.addEventListener('alpine:init', () => {
    Alpine.data('toastContainer', () => ({
        toasts: [],

        init() {
            (window.__initialFlash ?? []).forEach((flash) => this.push(flash));
        },

        push(detail) {
            const id = crypto.randomUUID();
            this.toasts.push({ id, type: detail.type ?? 'success', message: detail.message });
            setTimeout(() => this.dismiss(id), detail.timeout ?? 5000);
        },

        dismiss(id) {
            this.toasts = this.toasts.filter((toast) => toast.id !== id);
        },
    }));
});
