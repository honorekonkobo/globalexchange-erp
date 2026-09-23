'use strict';

/**
 * API — Client HTTP vers le backend (remplace progressivement localStorage)
 */

const API_BASE = '/api';

function getAuthToken() {
    return sessionStorage.getItem('globalex_token');
}

function setAuthToken(token) {
    if (token) sessionStorage.setItem('globalex_token', token);
    else sessionStorage.removeItem('globalex_token');
}

async function apiRequest(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
        response = await fetch(API_BASE + path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion.');
    }

    let data = null;
    try { data = await response.json(); } catch { /* réponse sans corps (ex : 204) */ }

    if (!response.ok) {
        throw new Error(data?.error || `Erreur serveur (${response.status}).`);
    }
    return data;
}

function apiGet(path)        { return apiRequest('GET', path); }
function apiPost(path, body) { return apiRequest('POST', path, body); }
function apiPut(path, body)  { return apiRequest('PUT', path, body); }
function apiDelete(path)     { return apiRequest('DELETE', path); }
