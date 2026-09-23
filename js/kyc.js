'use strict';

/**
 * KYC — Module Base Clients & Anti-Blanchiment
 */

let kycEditingId = null;
let kycPhotoBase64 = null;

/**
 * Transactions appartenant à un client KYC : rapprochées par clientId quand disponible
 * (évite les faux positifs entre homonymes), avec repli sur le nom pour les transactions
 * historiques créées avant l'ajout du clientId (ex. données de démo).
 */
function transactionsForKycClient(client) {
    return State.transactions.filter(t => t.clientId ? t.clientId === client.id : t.client === client.name);
}

/** Retrouve l'ID d'un client KYC existant à partir de son téléphone (fiable), ou de son nom à défaut */
function findKycClientId(name, phone) {
    const client = KycState.clients.find(c => phone && c.phone === phone) ?? KycState.clients.find(c => c.name === name);
    return client ? client.id : null;
}

/* ── Rendu du tableau clients ───────────────────────────────── */
function renderKycTable(clients) {
    const tbody = document.getElementById('kyc-clients-body');
    tbody.innerHTML = '';

    if (!clients.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-gray-500 text-xs">Aucun client trouvé.</td></tr>`;
        return;
    }

    clients.forEach(c => {
        const nbTx = transactionsForKycClient(c).length;
        const statusClass = c.verified
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        const statusLabel = c.verified ? 'Vérifié' : 'En attente';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-800/40 transition-colors';
        tr.innerHTML = `
            <td class="p-3 font-mono text-cyan-400 font-bold">${escapeHtml(c.id)}</td>
            <td class="p-3 font-medium text-white">${escapeHtml(c.name)}</td>
            <td class="p-3 text-gray-400">${escapeHtml(c.idType)} — ${escapeHtml(c.idNumber)}</td>
            <td class="p-3 text-gray-300">${escapeHtml(c.phone)}</td>
            <td class="p-3 text-gray-300">${escapeHtml(c.nationality || '—')}</td>
            <td class="p-3 text-gray-300">${nbTx}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusClass}">${statusLabel}</span>
            </td>
            <td class="p-3 text-right space-x-1">
                <button onclick="openKycDetailModal('${c.id}')" class="p-1 text-gray-400 hover:text-cyan-400 transition-colors" title="Voir">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
                <button onclick="openKycFormModal('${c.id}')" class="p-1 text-gray-400 hover:text-cyan-400 transition-colors" title="Modifier">
                    <i data-lucide="pencil" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons({ nodes: [tbody] });
}

/* ── Recherche temps réel ───────────────────────────────────── */
function searchKycClients() {
    const query = document.getElementById('kyc-search').value;
    renderKycTable(KycState.searchClients(query));
}

/* ── Formulaire d'ajout / modification ──────────────────────── */
function openKycFormModal(clientId = null) {
    kycEditingId = clientId;
    kycPhotoBase64 = null;

    const title   = document.getElementById('kyc-form-title');
    const preview = document.getElementById('kyc-form-photo-preview');
    preview.classList.add('hidden');
    preview.src = '';
    document.getElementById('kyc-form-photo').value = '';

    if (clientId) {
        const client = KycState.getClient(clientId);
        if (!client) { showToast('Client introuvable.', 'error'); return; }
        title.textContent = 'Modifier la Fiche Client';
        document.getElementById('kyc-form-name').value        = client.name;
        document.getElementById('kyc-form-idtype').value      = client.idType;
        document.getElementById('kyc-form-idnumber').value    = client.idNumber;
        document.getElementById('kyc-form-phone').value       = client.phone;
        document.getElementById('kyc-form-nationality').value = client.nationality || '';
        document.getElementById('kyc-form-birthdate').value   = client.birthDate || '';
        document.getElementById('kyc-form-verified').checked  = client.verified;
        if (client.photo) {
            kycPhotoBase64 = client.photo;
            preview.src = client.photo;
            preview.classList.remove('hidden');
        }
    } else {
        title.textContent = 'Nouvelle Fiche Client';
        document.getElementById('kyc-form-name').value        = '';
        document.getElementById('kyc-form-idtype').value      = 'CNI';
        document.getElementById('kyc-form-idnumber').value    = '';
        document.getElementById('kyc-form-phone').value       = '';
        document.getElementById('kyc-form-nationality').value = '';
        document.getElementById('kyc-form-birthdate').value   = '';
        document.getElementById('kyc-form-verified').checked  = false;
    }

    document.getElementById('kyc-form-modal').classList.remove('hidden');
}

function closeKycFormModal() {
    document.getElementById('kyc-form-modal').classList.add('hidden');
}

/* ── Prévisualisation de la photo (redimensionnée + compressée avant stockage) ── */
const KYC_PHOTO_MAX_DIM = 900; // px, plus grand côté
const KYC_PHOTO_QUALITY = 0.8; // qualité JPEG

function previewKycPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > KYC_PHOTO_MAX_DIM || height > KYC_PHOTO_MAX_DIM) {
                const scale = KYC_PHOTO_MAX_DIM / Math.max(width, height);
                width  = Math.round(width * scale);
                height = Math.round(height * scale);
            }

            const canvas = document.createElement('canvas');
            canvas.width  = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            kycPhotoBase64 = canvas.toDataURL('image/jpeg', KYC_PHOTO_QUALITY);

            const preview = document.getElementById('kyc-form-photo-preview');
            preview.src = kycPhotoBase64;
            preview.classList.remove('hidden');
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
}

/* ── Validation du formulaire ───────────────────────────────── */
function validateKycForm() {
    const name     = document.getElementById('kyc-form-name').value.trim();
    const idNumber = document.getElementById('kyc-form-idnumber').value.trim();
    const phone    = document.getElementById('kyc-form-phone').value.trim();

    if (!name)     { showToast('Le nom complet est requis.', 'error');           return false; }
    if (!idNumber) { showToast('Le numéro de pièce est requis.', 'error');       return false; }
    if (!phone)    { showToast('Le numéro de téléphone est requis.', 'error');   return false; }
    return true;
}

/* ── Soumission (création ou modification) ──────────────────── */
async function submitKycForm() {
    if (!validateKycForm()) return;

    const data = {
        name:        document.getElementById('kyc-form-name').value.trim(),
        idType:      document.getElementById('kyc-form-idtype').value,
        idNumber:    document.getElementById('kyc-form-idnumber').value.trim(),
        phone:       document.getElementById('kyc-form-phone').value.trim(),
        nationality: document.getElementById('kyc-form-nationality').value.trim(),
        birthDate:   document.getElementById('kyc-form-birthdate').value,
        verified:    document.getElementById('kyc-form-verified').checked,
        photo:       kycPhotoBase64,
    };

    /* La référence (KYC-0001, ...) est désormais attribuée par le serveur */
    const saved = kycEditingId
        ? await KycState.updateClient(kycEditingId, data)
        : await KycState.addClient(data);

    const successMsg = kycEditingId ? 'Fiche client mise à jour avec succès.' : 'Nouvelle fiche client enregistrée.';
    const failureMsg = 'Échec de l\'enregistrement — vérifiez la connexion au serveur.';
    showToast(saved ? successMsg : failureMsg, saved ? 'success' : 'warning');

    closeKycFormModal();
    renderKycTable(KycState.clients);
}

/* ── Vue détail client (infos + historique transactions) ────── */
function openKycDetailModal(clientId) {
    const client = KycState.getClient(clientId);
    if (!client) return;

    document.getElementById('kyc-detail-name').textContent        = client.name;
    document.getElementById('kyc-detail-idline').textContent      = `${client.idType} N° : ${client.idNumber}`;
    document.getElementById('kyc-detail-phone').textContent       = `Tél : ${client.phone}`;
    document.getElementById('kyc-detail-nationality').textContent = client.nationality ? `Nationalité : ${client.nationality}` : '';

    const statusEl = document.getElementById('kyc-detail-status');
    statusEl.textContent = client.verified ? 'KYC Vérifié' : 'KYC En attente';
    statusEl.className = 'inline-block px-2 py-0.5 text-[10px] font-bold rounded border ' +
        (client.verified
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20');

    const photoEl    = document.getElementById('kyc-detail-photo');
    const fallbackEl = document.getElementById('kyc-detail-avatar-fallback');
    if (client.photo) {
        photoEl.src = client.photo;
        photoEl.classList.remove('hidden');
        fallbackEl.classList.add('hidden');
    } else {
        photoEl.classList.add('hidden');
        fallbackEl.classList.remove('hidden');
        fallbackEl.textContent = client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }

    const history     = transactionsForKycClient(client);
    const historyBody = document.getElementById('kyc-detail-history-body');
    historyBody.innerHTML = history.length
        ? history.map(t => `
            <tr>
                <td class="p-2 font-mono text-cyan-400">${escapeHtml(t.id)}</td>
                <td class="p-2 text-gray-400">${escapeHtml(t.time)}</td>
                <td class="p-2 text-white">${escapeHtml(t.type)}</td>
                <td class="p-2 font-bold text-white">${escapeHtml(t.amount)}</td>
            </tr>
        `).join('')
        : `<tr><td colspan="4" class="p-4 text-center text-gray-500">Aucune transaction enregistrée.</td></tr>`;

    document.getElementById('kyc-detail-modal').classList.remove('hidden');
}

function closeKycDetailModal() {
    document.getElementById('kyc-detail-modal').classList.add('hidden');
}
