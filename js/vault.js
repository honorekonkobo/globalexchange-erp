'use strict';

/**
 * VAULT — Module Caisse & Trésorerie
 */

/** Classe une transaction métier en mouvement de caisse (entrée/sortie) */
function classifyTransactionMovement(t) {
    const amount   = parseFCFA(t.amount);
    const isEntree = isVaultEntree(t); /* règle partagée avec le rapport journalier (state.js) */

    return {
        time: t.time, type: t.type, reference: t.id,
        amountIn:  isEntree ? amount : 0,
        amountOut: isEntree ? 0 : amount,
    };
}

/** Calcule le journal complet (mouvements manuels + transactions) et le solde courant */
function computeVaultLedger() {
    const manual = VaultState.movements.map(m => ({
        time:      m.time,
        type:      (m.direction === 'IN' ? 'Alimentation — ' : 'Retrait — ') + m.reason,
        reference: m.reference,
        amountIn:  m.direction === 'IN'  ? m.amount : 0,
        amountOut: m.direction === 'OUT' ? m.amount : 0,
    }));
    const fromTx = State.transactions.map(classifyTransactionMovement);

    const combined = [...manual, ...fromTx].sort((a, b) => a.time.localeCompare(b.time));

    let running = CONFIG.vault.openingBalance;
    const withBalance = combined.map(m => {
        running += m.amountIn - m.amountOut;
        return { ...m, balance: running };
    });

    return { ledger: withBalance.slice().reverse(), currentBalance: running };
}

/* ── Rendu du journal des mouvements ────────────────────────── */
function renderVaultLedger(ledger) {
    const tbody = document.getElementById('vault-ledger-body');

    if (!ledger.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500 text-xs">Aucun mouvement enregistré.</td></tr>`;
        return;
    }

    tbody.innerHTML = ledger.map(m => `
        <tr class="hover:bg-gray-800/40 transition-colors">
            <td class="p-2 text-gray-400">${escapeHtml(m.time)}</td>
            <td class="p-2 text-white">${escapeHtml(m.type)}</td>
            <td class="p-2 font-mono text-cyan-400">${escapeHtml(m.reference)}</td>
            <td class="p-2 text-emerald-400 font-semibold">${m.amountIn  ? '+' + m.amountIn.toLocaleString('fr-FR')  : '—'}</td>
            <td class="p-2 text-rose-400 font-semibold">${m.amountOut ? '-' + m.amountOut.toLocaleString('fr-FR') : '—'}</td>
            <td class="p-2 font-bold text-white">${m.balance.toLocaleString('fr-FR')} FCFA</td>
        </tr>
    `).join('');
}

/* ── Solde temps réel + bannière d'alerte de seuil ──────────── */
function refreshVault() {
    const { ledger, currentBalance } = computeVaultLedger();
    renderVaultLedger(ledger);

    const belowThreshold = currentBalance < CONFIG.vault.minThreshold;

    const balanceEl = document.getElementById('vault-balance-display');
    balanceEl.textContent = currentBalance.toLocaleString('fr-FR') + ' FCFA';
    balanceEl.classList.toggle('text-emerald-400', !belowThreshold);
    balanceEl.classList.toggle('text-red-400', belowThreshold);

    document.getElementById('vault-threshold-label').textContent =
        CONFIG.vault.minThreshold.toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('vault-alert-banner').classList.toggle('hidden', !belowThreshold);
}

/* ── Validation du formulaire de mouvement ──────────────────── */
function validateVaultMovementForm() {
    const amount = parseFloat(document.getElementById('vault-movement-amount').value) || 0;
    const reason = document.getElementById('vault-movement-reason').value.trim();

    if (!amount || amount <= 0) { showToast('Veuillez saisir un montant valide.', 'error'); return false; }
    if (!reason)                { showToast('Le motif du mouvement est requis.', 'error');  return false; }
    return true;
}

/* ── Enregistrement d'une alimentation / retrait manuel ─────── */
async function submitVaultMovement() {
    if (!validateVaultMovementForm()) return;

    const direction = document.getElementById('vault-movement-type').value;
    const amount    = parseFloat(document.getElementById('vault-movement-amount').value);
    const reason    = document.getElementById('vault-movement-reason').value.trim();

    /* Heure et référence (MVT-XXXXXX) sont désormais attribuées par le serveur */
    const saved = await VaultState.addMovement({ direction, amount, reason });

    document.getElementById('vault-movement-amount').value = '';
    document.getElementById('vault-movement-reason').value = '';

    refreshVault();
    const successMsg = direction === 'IN' ? 'Alimentation de caisse enregistrée.' : 'Retrait de caisse enregistré.';
    const failureMsg = 'Échec de l\'enregistrement — vérifiez la connexion au serveur.';
    showToast(saved ? successMsg : failureMsg, saved ? 'success' : 'warning');
}

/* ── Clôture de journée (résumé + confirmation) ─────────────── */
function openCloseVaultModal() {
    const { currentBalance } = computeVaultLedger();
    const summary = `Résumé du jour : ${State.transactions.length} transaction(s) traitée(s), solde de caisse estimé à ${currentBalance.toLocaleString('fr-FR')} FCFA. Voulez-vous procéder à la clôture définitive de la caisse ? Cette action est irréversible.`;

    openConfirmModal(summary, () => {
        showToast('Caisse clôturée. Rapport envoyé au manager.');
    });
}
