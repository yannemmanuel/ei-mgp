import Chart from 'chart.js/auto';

const BRAND_GREEN = '#064e3b';
const NEUTRAL = '#94a3b8';

document.addEventListener('alpine:init', () => {
    Alpine.data('volumeChart', (initial) => ({
        chart: null,
        init() {
            this.chart = new Chart(this.$refs.canvas, {
                type: 'bar',
                data: this.toData(initial),
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                },
            });
        },
        update(rows) {
            this.chart.data = this.toData(rows);
            this.chart.update();
        },
        toData(rows) {
            return {
                labels: rows.map((r) => r.periode),
                datasets: [
                    { label: 'Déclarations', data: rows.map((r) => r.total), backgroundColor: BRAND_GREEN },
                    { label: 'Clôturées', data: rows.map((r) => r.cloturees), backgroundColor: NEUTRAL },
                ],
            };
        },
    }));

    Alpine.data('repartitionChart', (initial) => ({
        chart: null,
        init() {
            this.chart = new Chart(this.$refs.canvas, {
                type: 'doughnut',
                data: this.toData(initial),
                options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
            });
        },
        update(rows) {
            this.chart.data = this.toData(rows);
            this.chart.update();
        },
        toData(rows) {
            return {
                labels: rows.map((r) => r.libelle),
                datasets: [{ data: rows.map((r) => r.total), backgroundColor: rows.map((r) => r.couleur ?? NEUTRAL) }],
            };
        },
    }));

    Alpine.data('delaisChart', (initial) => ({
        chart: null,
        init() {
            this.chart = new Chart(this.$refs.canvas, {
                type: 'line',
                data: this.toData(initial),
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, title: { display: true, text: 'jours' } } },
                },
            });
        },
        update(rows) {
            this.chart.data = this.toData(rows);
            this.chart.update();
        },
        toData(rows) {
            return {
                labels: rows.map((r) => r.periode),
                datasets: [{ label: 'Délai moyen (jours)', data: rows.map((r) => r.delai_moyen), borderColor: BRAND_GREEN, tension: 0.3 }],
            };
        },
    }));

    Alpine.data('resolutionChart', (initial) => ({
        chart: null,
        init() {
            this.chart = new Chart(this.$refs.canvas, {
                type: 'line',
                data: this.toData(initial),
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '%' } } },
                },
            });
        },
        update(rows) {
            this.chart.data = this.toData(rows);
            this.chart.update();
        },
        toData(rows) {
            return {
                labels: rows.map((r) => r.periode),
                datasets: [{ label: 'Taux de résolution (%)', data: rows.map((r) => r.taux_resolution), borderColor: BRAND_GREEN, tension: 0.3 }],
            };
        },
    }));
});
