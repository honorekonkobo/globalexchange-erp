'use strict';

/**
 * TRANSFERS — Module Transferts Rapides (OM, WU, Wave, Moov, MG)
 */

let currentTransferProvider = 'OM';
let currentTransferMode     = 'ENVOI';

/* ── Sélection de l'opérateur ───────────────────────────────── */
const PROVIDER_ACTIVE_CLASSES = {
    OM:   'bg-[#ff6600] text-white',
    WU:   'bg-[#ffcc00] text-gray-900',
    WAVE: 'bg-[#1dc3f7] text-white',
    MOOV: 'bg-[#0055a5] text-white',
    MG:   'bg-[#e31837] text-white',
};

const PROVIDER_BASE = 'prov-tab-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all';

function selectProvider(prov) {
    currentTransferProvider = prov;

    document.querySelectorAll('.prov-tab-btn').forEach(btn => {
        btn.className = `${PROVIDER_BASE} bg-gray-900 text-gray-400 hover:text-white border border-gray-800`;
    });

    const active = document.getElementById('prov-btn-' + prov);
    if (active) {
        active.className = `${PROVIDER_BASE} ${PROVIDER_ACTIVE_CLASSES[prov] ?? 'bg-cyan-500 text-white'} shadow-lg`;
    }

    document.getElementById('tr-float-display').textContent = CONFIG.providerFloats[prov] ?? '—';
}

/* ── Bascule Envoi / Retrait ────────────────────────────────── */
function setTransferMode(mode) {
    currentTransferMode = mode;

    const active   = 'px-4 py-1.5 rounded-md text-xs font-bold bg-emerald-500 text-white shadow';
    const inactive = 'px-4 py-1.5 rounded-md text-xs font-bold text-gray-400 hover:text-white';

    document.getElementById('btn-mode-envoi').className   = mode === 'ENVOI'   ? active : inactive;
    document.getElementById('btn-mode-retrait').className = mode === 'RETRAIT' ? active : inactive;
}

/* ── Calcul automatique des frais ───────────────────────────── */
function calcTransferFees() {
    const amount = parseFloat(document.getElementById('tr-amount').value) || 0;
    const fee    = amount * CONFIG.transferFeeRate;
    document.getElementById('tr-fees').value = fee.toLocaleString('fr-FR') + ' FCFA';
}

/* ── Validation du formulaire ───────────────────────────────── */
function validateTransferForm() {
    const sender = document.getElementById('tr-sender-name').value.trim();
    const recip  = document.getElementById('tr-rec-name').value.trim();
    const amount = parseFloat(document.getElementById('tr-amount').value) || 0;

    if (!sender) { showToast('Le nom de l\'expéditeur est requis.', 'error');   return false; }
    if (!recip)  { showToast('Le nom du bénéficiaire est requis.', 'error');    return false; }
    if (!amount || amount <= 0) { showToast('Montant invalide.', 'error');      return false; }
    return true;
}

/* ── Traitement de la transaction ───────────────────────────── */
async function processTransferOperation() {
    if (!validateTransferForm()) return;

    const sender      = document.getElementById('tr-sender-name').value.trim();
    const senderPhone = document.getElementById('tr-sender-phone').value.trim();
    const amount      = parseFloat(document.getElementById('tr-amount').value);
    const mtcn        = document.getElementById('tr-mtcn').value.trim();
    const fee         = amount * CONFIG.transferFeeRate;
    const ref         = mtcn || ('REF-' + Math.floor(100000 + Math.random() * 900000));
    /* RETRAIT : les frais sont la commission de l'agent, déduite du montant remis au bénéficiaire.
       ENVOI : les frais sont ajoutés au montant versé par l'expéditeur. */
    const totalNet    = currentTransferMode === 'RETRAIT' ? (amount - fee) : (amount + fee);

    openReceiptModal({
        opType:     `${currentTransferProvider} (${currentTransferMode})`,
        ref,
        clientName: sender,
        foreignVal: amount.toLocaleString('fr-FR') + ' FCFA',
        rate:       '— (Transfert interne)',
        fees:       fee.toLocaleString('fr-FR') + ' FCFA',
        totalNet:   totalNet.toLocaleString('fr-FR') + ' FCFA',
    });

    const saved = await State.addTransaction({
        id:       ref,
        time:     new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type:     `${currentTransferProvider} ${currentTransferMode}`,
        typeCode: currentTransferProvider,
        client:   sender,
        clientId: findKycClientId(sender, senderPhone),
        amount:   amount.toLocaleString('fr-FR') + ' FCFA',
        fee:      fee.toLocaleString('fr-FR') + ' FCFA',
        status:   'Terminé',
    });

    renderDashTable(State.transactions);
    renderHistoryTable(State.transactions);
    refreshDashboard();
    updateTxCounter();
    transferFormDirty = false;
    showToast(
        saved ? 'Transfert validé et commission enregistrée.'
              : 'Échec de l\'enregistrement — vérifiez la connexion au serveur.',
        saved ? 'success' : 'warning'
    );
}
