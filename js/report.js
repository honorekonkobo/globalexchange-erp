'use strict';

/**
 * REPORT — Module Rapport Journalier de Clôture
 */

const REPORT_OPERATORS = [
    { code: 'CHANGE', label: 'Change Devises',  barClass: 'bg-cyan-400' },
    { code: 'OM',     label: 'Orange Money',     barClass: 'bg-om'       },
    { code: 'WU',     label: 'Western Union',    barClass: 'bg-wu'       },
    { code: 'WAVE',   label: 'Wave Money',       barClass: 'bg-wave'     },
    { code: 'MOOV',   label: 'Moov Money',       barClass: 'bg-moov'     },
    { code: 'MG',     label: 'MoneyGram',        barClass: 'bg-mg'       },
];

/* ── Calcul des données du rapport depuis State.transactions ───── */
function computeReportData() {
    const rows = REPORT_OPERATORS.map(op => {
        const txs        = State.transactions.filter(t => t.typeCode === op.code);
        const volume      = txs.reduce((sum, t) => sum + parseFCFA(t.amount), 0);
        const commissions = txs.reduce((sum, t) => sum + parseFCFA(t.fee), 0);
        return { ...op, count: txs.length, volume, commissions };
    });

    const totalCount       = rows.reduce((s, r) => s + r.count, 0);
    const totalVolume      = rows.reduce((s, r) => s + r.volume, 0);
    const totalCommissions = rows.reduce((s, r) => s + r.commissions, 0);

    /* Règle de classification entrée/sortie partagée avec le journal de caisse (state.js) */
    let entrees = 0, sorties = 0;
    State.transactions.forEach(t => {
        const amount = parseFCFA(t.amount);
        isVaultEntree(t) ? entrees += amount : sorties += amount;
    });

    const opening = parseFloat(document.getElementById('report-opening-balance')?.value) || 0;
    const solde   = opening + entrees - sorties + totalCommissions;

    return { rows, totalCount, totalVolume, totalCommissions, entrees, sorties, opening, solde };
}

/* ── Tableau récapitulatif ──────────────────────────────────── */
function renderReportSummary(data) {
    const tbody = document.getElementById('report-summary-body');
    tbody.innerHTML = data.rows.map(r => `
        <tr class="hover:bg-gray-800/40 transition-colors">
            <td class="p-3 font-semibold text-white flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full ${r.barClass}"></span> ${r.label}
            </td>
            <td class="p-3">${r.count}</td>
            <td class="p-3 font-bold text-white">${r.volume.toLocaleString('fr-FR')} FCFA</td>
            <td class="p-3 text-emerald-400 font-semibold">${r.commissions.toLocaleString('fr-FR')} FCFA</td>
        </tr>
    `).join('');

    document.getElementById('report-summary-foot').innerHTML = `
        <tr>
            <td class="p-3">Total</td>
            <td class="p-3">${data.totalCount}</td>
            <td class="p-3">${data.totalVolume.toLocaleString('fr-FR')} FCFA</td>
            <td class="p-3 text-emerald-400">${data.totalCommissions.toLocaleString('fr-FR')} FCFA</td>
        </tr>
    `;
}

/* ── Graphique commissions par opérateur (barres CSS) ───────── */
function renderCommissionChart(data) {
    const container = document.getElementById('report-chart');
    const max = Math.max(...data.rows.map(r => r.commissions), 1);

    container.innerHTML = data.rows.map(r => `
        <div>
            <div class="flex justify-between text-xs font-semibold mb-1">
                <span class="text-gray-300 flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full ${r.barClass}"></span> ${r.label}</span>
                <span class="text-white">${r.commissions.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div class="w-full bg-gray-800 h-3 rounded-full overflow-hidden">
                <div class="${r.barClass} h-full rounded-full" style="width:${(r.commissions / max * 100).toFixed(1)}%"></div>
            </div>
        </div>
    `).join('');
}

/* ── Solde de caisse estimé ──────────────────────────────────── */
function renderVaultSummary(data) {
    document.getElementById('report-entrees').textContent     = '+' + data.entrees.toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('report-sorties').textContent     = '-' + data.sorties.toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('report-commissions').textContent = '+' + data.totalCommissions.toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('report-solde').textContent       = data.solde.toLocaleString('fr-FR') + ' FCFA';
}

/* ── Rafraîchissement complet (appelé à chaque ouverture d'onglet) ── */
function refreshReport() {
    const now = new Date();
    document.getElementById('report-date').textContent =
        'Généré le ' + now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR');

    const data = computeReportData();
    renderReportSummary(data);
    renderCommissionChart(data);
    renderVaultSummary(data);
}

/* ── Impression ──────────────────────────────────────────────── */
function printReport() {
    window.print();
}


/* ══════════════════════════════════════════════════════════════
   TABLEAU DE BORD — KPI et répartition par service (onglet Dashboard)
   Réutilise REPORT_OPERATORS et le calcul du solde de caisse
   (computeVaultLedger, vault.js) pour ne pas dupliquer la logique
   déjà validée dans l'onglet Rapport.
══════════════════════════════════════════════════════════════ */
function refreshDashboard() {
    let volumeTotal = 0, commissionsTotal = 0, entrees = 0, sorties = 0;
    State.transactions.forEach(t => {
        volumeTotal += parseFCFA(t.amount);
        commissionsTotal += parseFCFA(t.fee);
        isVaultEntree(t) ? entrees++ : sorties++;
    });

    document.getElementById('dash-kpi-volume').textContent      = volumeTotal.toLocaleString('fr-FR');
    document.getElementById('dash-kpi-commissions').textContent = commissionsTotal.toLocaleString('fr-FR');
    document.getElementById('dash-kpi-txcount').textContent     = State.transactions.length;
    document.getElementById('dash-kpi-entrees').textContent     = entrees;
    document.getElementById('dash-kpi-sorties').textContent     = sorties;

    const { currentBalance } = computeVaultLedger();
    document.getElementById('dash-kpi-vault').textContent = currentBalance.toLocaleString('fr-FR');

    const byOperator = REPORT_OPERATORS
        .map(op => ({
            ...op,
            volume: State.transactions
                .filter(t => t.typeCode === op.code)
                .reduce((sum, t) => sum + parseFCFA(t.amount), 0),
        }))
        .filter(op => op.volume > 0);

    document.getElementById('dash-volume-total').textContent = 'Total : ' + volumeTotal.toLocaleString('fr-FR') + ' FCFA';

    const container = document.getElementById('dash-volume-breakdown');
    container.innerHTML = byOperator.length
        ? byOperator.map(op => {
            const pct = volumeTotal ? (op.volume / volumeTotal * 100) : 0;
            return `
                <div>
                    <div class="flex justify-between text-xs font-semibold mb-1">
                        <span class="text-gray-300 flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full ${op.barClass}"></span> ${op.label}</span>
                        <span class="text-white">${op.volume.toLocaleString('fr-FR')} FCFA (${pct.toFixed(0)}%)</span>
                    </div>
                    <div class="w-full bg-gray-800 h-3 rounded-full overflow-hidden">
                        <div class="${op.barClass} h-full rounded-full" style="width:${pct.toFixed(1)}%"></div>
                    </div>
                </div>
            `;
        }).join('')
        : '<p class="text-xs text-gray-500 text-center py-4">Aucune opération aujourd\'hui.</p>';

    /* Soldes rapides du header : Caisse Cash = solde de caisse réel,
       flottants opérateurs = CONFIG.providerFloats (pas encore suivis
       côté serveur — seule source de vérité disponible aujourd'hui). */
    document.getElementById('header-caisse-cash').textContent = currentBalance.toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('header-uv-om').textContent   = CONFIG.providerFloats.OM   ?? '—';
    document.getElementById('header-uv-wave').textContent = CONFIG.providerFloats.WAVE ?? '—';
    document.getElementById('header-uv-wu').textContent   = CONFIG.providerFloats.WU   ?? '—';
}
