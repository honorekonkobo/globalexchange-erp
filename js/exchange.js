'use strict';

/**
 * EXCHANGE — Module Bureau de Change (achat / vente de devises)
 */

let currentExchangeType = 'ACHAT';

/* ── Bascule Achat / Vente ──────────────────────────────────── */
function setExchangeType(type) {
    currentExchangeType = type;

    const active   = 'py-2.5 rounded-lg text-xs font-bold transition-all bg-cyan-500 text-white shadow-md';
    const inactive = 'py-2.5 rounded-lg text-xs font-bold transition-all text-gray-400 hover:text-white';

    document.getElementById('btn-type-achat').className = type === 'ACHAT' ? active : inactive;
    document.getElementById('btn-type-vente').className = type === 'VENTE' ? active : inactive;

    calcExchange();
}

/* ── Calcul automatique ─────────────────────────────────────── */
function calcExchange() {
    const curr     = document.getElementById('ex-currency').value;
    const amount   = parseFloat(document.getElementById('ex-amount').value) || 0;
    const rateObj  = CONFIG.rates[curr];
    const applied  = currentExchangeType === 'ACHAT' ? rateObj.buy : rateObj.sell;
    const totalRaw = amount * applied;
    const totalNet = currentExchangeType === 'ACHAT'
        ? Math.max(0, totalRaw - CONFIG.exchangeFee)
        : totalRaw + CONFIG.exchangeFee;

    document.getElementById('ex-official-rate').textContent = `1 ${curr} = ${rateObj.official.toFixed(2)} FCFA`;
    document.getElementById('ex-applied-rate').textContent  = `1 ${curr} = ${applied.toFixed(2)} FCFA`;
    document.getElementById('ex-fees').textContent          = CONFIG.exchangeFee.toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('ex-total-local').textContent   = totalNet.toLocaleString('fr-FR') + ' FCFA';
}

/* ── Validation du formulaire ───────────────────────────────── */
function validateExchangeForm() {
    const amount   = parseFloat(document.getElementById('ex-amount').value) || 0;
    const clientId = document.getElementById('ex-client-id').value.trim();
    const name     = document.getElementById('ex-client-name').value.trim();

    if (!amount || amount <= 0) {
        showToast('Veuillez saisir un montant valide.', 'error');
        return false;
    }
    if (!name) {
        showToast('Le nom du client est requis.', 'warning');
        return false;
    }
    if (!clientId) {
        showToast('Le numéro de pièce d\'identité est requis.', 'warning');
        return false;
    }
    return true;
}

/* ── Traitement de l'opération ──────────────────────────────── */
async function processExchangeOperation() {
    if (!validateExchangeForm()) return;

    const curr        = document.getElementById('ex-currency').value;
    const amount      = parseFloat(document.getElementById('ex-amount').value);
    const clientName  = document.getElementById('ex-client-name').value.trim();
    const clientPhone = document.getElementById('ex-client-phone').value.trim();
    const rateObj     = CONFIG.rates[curr];
    const applied     = currentExchangeType === 'ACHAT' ? rateObj.buy : rateObj.sell;
    const totalNet    = document.getElementById('ex-total-local').textContent;

    const ref = openReceiptModal({
        opType:     `CHANGE ${currentExchangeType}`,
        clientName,
        foreignVal: `${amount.toLocaleString('fr-FR')} ${curr}`,
        rate:       `1 ${curr} = ${applied.toFixed(2)} XOF`,
        fees:       CONFIG.exchangeFee.toLocaleString('fr-FR') + ' FCFA',
        totalNet,
    });

    const saved = await State.addTransaction({
        id:       ref,
        time:     new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type:     `Change (${currentExchangeType} ${curr})`,
        typeCode: 'CHANGE',
        client:   clientName,
        clientId: findKycClientId(clientName, clientPhone),
        amount:   totalNet,
        fee:      CONFIG.exchangeFee.toLocaleString('fr-FR') + ' FCFA',
        status:   'Terminé',
    });

    renderDashTable(State.transactions);
    renderHistoryTable(State.transactions);
    updateTxCounter();
    exchangeFormDirty = false;
    showToast(
        saved ? 'Opération de change enregistrée avec succès !'
              : 'Échec de l\'enregistrement — vérifiez la connexion au serveur.',
        saved ? 'success' : 'warning'
    );
}

/* ── Estimateur rapide (dashboard) ─────────────────────────── */
function runDashCalc() {
    const amount = parseFloat(document.getElementById('dash-calc-amount').value) || 0;
    const curr   = document.getElementById('dash-calc-curr').value;
    const total  = amount * CONFIG.rates[curr].buy;
    document.getElementById('dash-calc-res').textContent = total.toLocaleString('fr-FR') + ' FCFA';
}


/* ══════════════════════════════════════════════════════════════
   TAUX DU JOUR — fixés manuellement chaque matin par la cheffe de guichet
   La liste des devises est ouverte : CONFIG.rates est la seule source
   de vérité, on ne la duplique dans aucune liste figée.
══════════════════════════════════════════════════════════════ */

function getCurrencyCodes()  { return Object.keys(CONFIG.rates); }
function getEditableCodes()  { return getCurrencyCodes().filter(c => !CONFIG.rates[c].fixed); }

/* ── Selects "Devise" (comptoir de change + estimateur dashboard) ── */
function populateCurrencySelects() {
    const codes = getCurrencyCodes();
    const optionsHtml = codes.map(code => {
        const r = CONFIG.rates[code];
        return `<option value="${code}">${code} (${r.symbol}) — ${r.name}</option>`;
    }).join('');

    ['ex-currency', 'dash-calc-curr'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const previous = select.value;
        select.innerHTML = optionsHtml;
        select.value = codes.includes(previous) ? previous : codes[0];
    });
}

/* ── Ticker taux en direct (dashboard) ──────────────────────── */
function renderDashRatesTicker() {
    const container = document.getElementById('dash-rates-ticker');
    if (!container) return;

    container.innerHTML = getCurrencyCodes().map(code => {
        const r = CONFIG.rates[code];
        const isDown = typeof r.trend === 'string' && r.trend.startsWith('-');
        const trendClass = (r.trend === 'fixed' || !isDown) ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10';
        const trendIcon  = r.trend === 'fixed' ? '' : `<i data-lucide="${isDown ? 'trending-down' : 'trending-up'}" class="w-3 h-3"></i>`;

        return `
            <div class="bg-gray-900/80 p-3 rounded-xl border border-gray-800/80 flex justify-between items-center">
                <div>
                    <span class="text-xs text-gray-400 block font-medium">${code} / XOF (${r.name})</span>
                    <span class="text-lg font-extrabold text-white">${r.official.toFixed(r.fixed ? 3 : 2)}</span>
                </div>
                <span class="text-xs font-bold ${trendClass} px-2 py-1 rounded flex items-center gap-0.5">
                    ${trendIcon} ${r.trendLabel}
                </span>
            </div>
        `;
    }).join('');

    lucide.createIcons({ nodes: [container] });
}

/* ── Grille taux bureau (onglet Change) ─────────────────────── */
function renderExchangeRatesGrid() {
    const container = document.getElementById('exchange-rates-grid');
    if (!container) return;

    container.innerHTML = getCurrencyCodes().map(code => {
        const r = CONFIG.rates[code];
        const badge = r.fixed
            ? '<span class="text-cyan-400">BCEAO Fixe</span>'
            : '<span class="text-yellow-400">Flottant</span>';

        return `
            <div class="bg-gray-900/80 p-3 rounded-xl border border-gray-800">
                <div class="flex justify-between items-center font-bold text-xs text-white">
                    <span>${code} (${r.symbol})</span>${badge}
                </div>
                <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div class="bg-gray-800 p-1.5 rounded text-center">
                        <span class="text-gray-400 block">Achat</span>
                        <span class="font-bold text-emerald-400">${r.buy.toFixed(2)} FCFA</span>
                    </div>
                    <div class="bg-gray-800 p-1.5 rounded text-center">
                        <span class="text-gray-400 block">Vente</span>
                        <span class="font-bold text-rose-400">${r.sell.toFixed(2)} FCFA</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/* ── Libellé "Dernière mise à jour" ──────────────────────────── */
function renderRatesUpdatedLabel() {
    const el = document.getElementById('dash-rates-updated');
    if (!el) return;

    if (!RatesState.lastUpdated) {
        el.textContent = 'Taux par défaut — pas encore fixés aujourd\'hui';
        return;
    }
    const d = new Date(RatesState.lastUpdated);
    el.textContent = 'Dernière mise à jour : ' + d.toLocaleDateString('fr-FR') + ' ' +
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function renderRatesDisplays() {
    renderDashRatesTicker();
    renderExchangeRatesGrid();
    renderRatesUpdatedLabel();
}

/* ── Modale de fixation des taux du jour ─────────────────────── */
function openRatesModal() {
    const container = document.getElementById('rates-form-fields');

    container.innerHTML = getCurrencyCodes().map(code => {
        const r = CONFIG.rates[code];

        if (r.fixed) {
            return `
                <div class="p-3 bg-gray-900/60 border border-gray-800 rounded-xl flex justify-between items-center text-xs">
                    <span class="font-bold text-white">${code} (${r.symbol}) — ${r.name} — BCEAO Fixe</span>
                    <span class="font-bold text-cyan-400">${r.official} FCFA</span>
                </div>
            `;
        }

        return `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-white">${code} / XOF (${r.name})</span>
                    <button onclick="deleteCurrency('${code}')" class="text-rose-400 hover:text-rose-300 transition-colors" title="Supprimer cette devise">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label for="rates-form-${code}-official" class="text-[11px] text-gray-400 mb-1 block">Officiel</label>
                        <input type="number" step="0.001" min="0" id="rates-form-${code}-official" value="${r.official}"
                            class="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500">
                    </div>
                    <div>
                        <label for="rates-form-${code}-buy" class="text-[11px] text-gray-400 mb-1 block">Achat</label>
                        <input type="number" step="0.01" min="0" id="rates-form-${code}-buy" value="${r.buy}"
                            class="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500">
                    </div>
                    <div>
                        <label for="rates-form-${code}-sell" class="text-[11px] text-gray-400 mb-1 block">Vente</label>
                        <input type="number" step="0.01" min="0" id="rates-form-${code}-sell" value="${r.sell}"
                            class="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500">
                    </div>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('add-currency-form').classList.add('hidden');
    document.getElementById('rates-modal').classList.remove('hidden');
    lucide.createIcons({ nodes: [container] });
}

function closeRatesModal() {
    document.getElementById('rates-modal').classList.add('hidden');
}

function toggleAddCurrencyForm() {
    document.getElementById('add-currency-form').classList.toggle('hidden');
}

/* ── Soumission : le serveur valide, recalcule la tendance et persiste ── */
async function submitRatesForm() {
    const updates = {};
    for (const code of getEditableCodes()) {
        updates[code] = {
            official: parseFloat(document.getElementById(`rates-form-${code}-official`).value),
            buy:      parseFloat(document.getElementById(`rates-form-${code}-buy`).value),
            sell:     parseFloat(document.getElementById(`rates-form-${code}-sell`).value),
        };
    }

    try {
        await RatesState.updateRates(updates);
    } catch (e) {
        showToast(e.message, 'error');
        return;
    }

    closeRatesModal();
    renderRatesDisplays();
    calcExchange();
    runDashCalc();
    showToast('Taux du jour mis à jour avec succès.', 'success');
}

/* ── Ajout d'une nouvelle devise (validée côté serveur) ──────── */
async function submitAddCurrency() {
    const code     = document.getElementById('new-curr-code').value.trim().toUpperCase();
    const symbol   = document.getElementById('new-curr-symbol').value.trim();
    const name     = document.getElementById('new-curr-name').value.trim();
    const official = parseFloat(document.getElementById('new-curr-official').value);
    const buy      = parseFloat(document.getElementById('new-curr-buy').value);
    const sell     = parseFloat(document.getElementById('new-curr-sell').value);

    try {
        await RatesState.addCurrency({ code, symbol, name, official, buy, sell });
    } catch (e) {
        showToast(e.message, 'error');
        return;
    }

    populateCurrencySelects();
    renderRatesDisplays();
    openRatesModal();
    calcExchange();
    runDashCalc();
    showToast(`Devise ${code} ajoutée avec succès.`, 'success');
}

/* ── Suppression d'une devise (bloquée côté serveur pour l'EUR) ── */
function deleteCurrency(code) {
    openConfirmModal(
        `Supprimer la devise ${code} ? Elle ne sera plus disponible pour les opérations de change.`,
        async () => {
            try {
                await RatesState.deleteCurrency(code);
            } catch (e) {
                showToast(e.message, 'error');
                return;
            }
            populateCurrencySelects();
            renderRatesDisplays();
            openRatesModal();
            calcExchange();
            runDashCalc();
            showToast(`Devise ${code} supprimée.`, 'success');
        }
    );
}
