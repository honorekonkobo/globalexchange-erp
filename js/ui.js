'use strict';

/**
 * UI — Navigation, notifications, modales, rendu des tableaux
 */

/* ══════════════════════════════════════════════════════════════
   NAVIGATION PAR ONGLETS
══════════════════════════════════════════════════════════════ */

const TAB_TITLES = {
    dashboard: 'Tableau de bord Overview',
    exchange:  'Bureau de Change de Devises',
    transfers: 'Transferts Rapides Multi-Opérateurs',
    vault:     'Gestion Caisse & Trésorerie',
    history:   'Journal des Opérations & Historique',
    kyc:       'Base de Données Clients & KYC',
    report:    'Rapport Journalier de Clôture',
};

let currentTab = 'dashboard';
let exchangeFormDirty = false;
let transferFormDirty = false;

function markExchangeDirty() { exchangeFormDirty = true; }
function markTransferDirty() { transferFormDirty = true; }
function resetFormDirtyFlags() {
    exchangeFormDirty = false;
    transferFormDirty = false;
}

function switchTab(tabId) {
    if (tabId === currentTab) return;

    /* Avertir si le formulaire de l'onglet quitté contient des modifications non soumises */
    const leavingDirtyForm =
        (currentTab === 'exchange'  && exchangeFormDirty) ||
        (currentTab === 'transfers' && transferFormDirty);

    if (leavingDirtyForm) {
        openConfirmModal(
            'Ce formulaire contient des modifications non enregistrées. Voulez-vous vraiment changer d\'onglet ? Elles seront perdues.',
            () => { resetFormDirtyFlags(); performTabSwitch(tabId); }
        );
        return;
    }

    performTabSwitch(tabId);
}

function performTabSwitch(tabId) {
    currentTab = tabId;

    /* Cacher tous les onglets */
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-' + tabId)?.classList.remove('hidden');

    /* Réinitialiser les boutons nav */
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-cyan-400', 'bg-cyan-950/40', 'border', 'border-cyan-500/30');
        btn.classList.add('text-gray-400');
    });

    /* Activer le bon bouton */
    const activeBtn = document.getElementById('nav-' + tabId);
    if (activeBtn) {
        activeBtn.classList.add('text-cyan-400', 'bg-cyan-950/40', 'border', 'border-cyan-500/30');
        activeBtn.classList.remove('text-gray-400');
    }

    document.getElementById('page-title').textContent = TAB_TITLES[tabId] ?? 'GlobalExchange ERP';

    /* Rafraîchir le nombre de transactions par client à l'ouverture de l'onglet KYC */
    if (tabId === 'kyc') {
        const query = document.getElementById('kyc-search')?.value ?? '';
        renderKycTable(KycState.searchClients(query));
    }

    /* Recalculer le rapport journalier à chaque ouverture de l'onglet */
    if (tabId === 'report') {
        refreshReport();
    }

    /* Rafraîchir le solde de caisse et le journal des mouvements */
    if (tabId === 'vault') {
        refreshVault();
    }
}


/* ══════════════════════════════════════════════════════════════
   HORLOGE & COMPTEUR DE TRANSACTIONS (HEADER)
══════════════════════════════════════════════════════════════ */

function tickHeaderClock() {
    document.getElementById('header-clock').textContent = new Date().toLocaleTimeString('fr-FR');
}

function updateTxCounter() {
    const count = State.transactions.length;
    document.getElementById('header-tx-count').textContent = `${count} opération(s) aujourd'hui`;
}


/* ══════════════════════════════════════════════════════════════
   NOTIFICATIONS TOAST
══════════════════════════════════════════════════════════════ */

const TOAST_STYLES = {
    success: { border: 'border-cyan-500/40',   icon: 'check',           iconBg: 'bg-cyan-500/20 text-cyan-400'   },
    error:   { border: 'border-red-500/40',    icon: 'x-circle',        iconBg: 'bg-red-500/20 text-red-400'     },
    warning: { border: 'border-yellow-500/40', icon: 'alert-triangle',  iconBg: 'bg-yellow-500/20 text-yellow-400'},
};

function showToast(msg, type = 'success') {
    const s = TOAST_STYLES[type] ?? TOAST_STYLES.success;
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto bg-gray-900 border ${s.border} text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-xs font-semibold`;

    /* Construction via le DOM (et non innerHTML) : le message peut contenir du texte
       saisi par l'utilisateur (nom client, référence...) et ne doit jamais être interprété
       comme du HTML. */
    const iconWrap = document.createElement('div');
    iconWrap.className = `p-1 ${s.iconBg} rounded-lg shrink-0`;
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', s.icon);
    icon.className = 'w-4 h-4';
    iconWrap.appendChild(icon);

    const msgSpan = document.createElement('span');
    msgSpan.textContent = msg;

    toast.appendChild(iconWrap);
    toast.appendChild(msgSpan);
    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });

    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3200);
}

/* Alias de compatibilité */
function triggerNotification(msg) { showToast(msg); }


/* ══════════════════════════════════════════════════════════════
   MODALE DE CONFIRMATION (remplace window.confirm)
══════════════════════════════════════════════════════════════ */

function openConfirmModal(message, onConfirm) {
    let modal = document.getElementById('confirm-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'confirm-modal';
        modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-[#0e1320] border border-gray-700 rounded-2xl p-6 max-w-sm w-full space-y-5 shadow-2xl">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-red-500/20 text-red-400 rounded-xl">
                        <i data-lucide="alert-triangle" class="w-5 h-5"></i>
                    </div>
                    <h3 class="font-bold text-white text-sm">Confirmation requise</h3>
                </div>
                <p id="confirm-modal-msg" class="text-sm text-gray-300 leading-relaxed"></p>
                <div class="flex gap-3">
                    <button id="confirm-modal-cancel"
                        class="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold transition-all">
                        Annuler
                    </button>
                    <button id="confirm-modal-ok"
                        class="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-xs font-bold transition-all">
                        Confirmer
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        lucide.createIcons({ nodes: [modal] });
    }

    document.getElementById('confirm-modal-msg').textContent = message;
    modal.classList.remove('hidden');

    const close = () => modal.classList.add('hidden');
    document.getElementById('confirm-modal-ok').onclick     = () => { close(); onConfirm(); };
    document.getElementById('confirm-modal-cancel').onclick = close;
}


/* ══════════════════════════════════════════════════════════════
   MODALE REÇU / TICKET
══════════════════════════════════════════════════════════════ */

/**
 * @param {object} data  { opType, ref?, clientName, foreignVal, rate, fees, totalNet }
 * @returns {string} Référence du ticket générée
 */
function openReceiptModal(data) {
    const now    = new Date();
    const date   = now.toLocaleDateString('fr-FR') + ' - ' + now.toLocaleTimeString('fr-FR');
    const ref    = data.ref ?? ('GX-' + Math.floor(100000 + Math.random() * 900000));

    document.getElementById('rec-date').textContent        = date;
    document.getElementById('rec-op-type').textContent     = data.opType;
    document.getElementById('rec-ref').textContent         = ref;
    document.getElementById('rec-cashier').textContent     = `${CONFIG.cashier.name} (${CONFIG.cashier.counter})`;
    document.getElementById('rec-client-name').textContent = data.clientName;
    document.getElementById('rec-foreign-val').textContent = data.foreignVal;
    document.getElementById('rec-rate').textContent        = data.rate;
    document.getElementById('rec-fees').textContent        = data.fees;
    document.getElementById('rec-total-net').textContent   = data.totalNet;

    document.getElementById('receipt-modal').classList.remove('hidden');
    return ref;
}

function closeReceiptModal() {
    document.getElementById('receipt-modal').classList.add('hidden');
}


/* ══════════════════════════════════════════════════════════════
   RENDU DES TABLEAUX
══════════════════════════════════════════════════════════════ */

function renderDashTable(data) {
    const tbody = document.getElementById('dash-tx-body');
    tbody.innerHTML = '';

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-gray-500 text-xs">Aucune transaction trouvée.</td></tr>`;
        return;
    }

    data.forEach(tx => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-800/40 transition-colors';
        tr.innerHTML = `
            <td class="p-3 font-mono text-cyan-400 font-bold">${escapeHtml(tx.id)}</td>
            <td class="p-3 text-gray-400">${escapeHtml(tx.time)}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-200 border border-gray-700">
                    ${escapeHtml(tx.type)}
                </span>
            </td>
            <td class="p-3 font-medium text-white">${escapeHtml(tx.client)}</td>
            <td class="p-3 font-bold text-white">${escapeHtml(tx.amount)}</td>
            <td class="p-3 text-emerald-400 font-semibold">${escapeHtml(tx.fee)}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    ${escapeHtml(tx.status)}
                </span>
            </td>
            <td class="p-3 text-right">
                <button onclick="showToast('Impression du ticket ' + this.dataset.txId)" data-tx-id="${escapeHtml(tx.id)}"
                    class="p-1 text-gray-400 hover:text-cyan-400 transition-colors">
                    <i data-lucide="printer" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons({ nodes: [tbody] });
}

function renderHistoryTable(data) {
    const tbody  = document.getElementById('hist-tx-body');
    const today  = new Date().toLocaleDateString('fr-FR');
    tbody.innerHTML = '';

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-gray-500 text-xs">Aucun résultat.</td></tr>`;
        return;
    }

    data.forEach(tx => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-800/40 transition-colors';
        tr.innerHTML = `
            <td class="p-3 font-mono text-cyan-400 font-bold">${escapeHtml(tx.id)}</td>
            <td class="p-3 text-gray-400">${escapeHtml(today)} — ${escapeHtml(tx.time)}</td>
            <td class="p-3 font-semibold text-white">${escapeHtml(tx.type)}</td>
            <td class="p-3 text-gray-300">${escapeHtml(tx.client)}</td>
            <td class="p-3 font-bold text-white">${escapeHtml(tx.amount)}</td>
            <td class="p-3 text-emerald-400 font-bold">${escapeHtml(tx.fee)}</td>
            <td class="p-3 text-right">
                <button onclick="showToast('Détails de la transaction chargés.')"
                    class="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded text-gray-300 transition-all">
                    Voir Détails
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
