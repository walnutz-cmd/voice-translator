'use strict';

const LANGS = [
  { code: 'fr-FR', iso: 'fr', name: 'Français' },
  { code: 'en-US', iso: 'en', name: 'English' },
  { code: 'es-ES', iso: 'es', name: 'Español' },
  { code: 'de-DE', iso: 'de', name: 'Deutsch' },
  { code: 'it-IT', iso: 'it', name: 'Italiano' },
  { code: 'pt-PT', iso: 'pt', name: 'Português' },
  { code: 'nl-NL', iso: 'nl', name: 'Nederlands' },
  { code: 'pl-PL', iso: 'pl', name: 'Polski' },
  { code: 'ru-RU', iso: 'ru', name: 'Русский' },
  { code: 'uk-UA', iso: 'uk', name: 'Українська' },
  { code: 'tr-TR', iso: 'tr', name: 'Türkçe' },
  { code: 'ar-SA', iso: 'ar', name: 'العربية' },
  { code: 'hi-IN', iso: 'hi', name: 'हिन्दी' },
  { code: 'zh-CN', iso: 'zh-CN', name: '中文（简体）' },
  { code: 'ja-JP', iso: 'ja', name: '日本語' },
  { code: 'ko-KR', iso: 'ko', name: '한국어' },
];

const MAX_ENTRIES = 200;

const srcSelect = document.getElementById('src');
const tgtSelect = document.getElementById('tgt');
const swapBtn = document.getElementById('swap');
const micBtn = document.getElementById('mic');
const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const srcLabel = document.getElementById('src-label');
const tgtLabel = document.getElementById('tgt-label');
const srcLog = document.getElementById('src-log');
const tgtLog = document.getElementById('tgt-log');
const replayBtn = document.getElementById('replay');
const clearBtn = document.getElementById('clear');
const autospeakBox = document.getElementById('autospeak');

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  listening: false,
  entries: [],
  interim: { src: '', tgt: '' },
  autoSpeak: true,
};

let recognition = null;
let restartTimer = null;
let interimTimer = null;
const cache = new Map();

for (const lang of LANGS) {
  const o1 = document.createElement('option');
  o1.value = lang.code;
  o1.textContent = lang.name;
  srcSelect.appendChild(o1);
  const o2 = o1.cloneNode(true);
  tgtSelect.appendChild(o2);
}
srcSelect.value = 'fr-FR';
tgtSelect.value = 'en-US';

const srcLang = () => LANGS.find(l => l.code === srcSelect.value) || LANGS[0];
const tgtLang = () => LANGS.find(l => l.code === tgtSelect.value) || LANGS[1];

async function googleTranslate(text, src, tgt) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + src +
    '&tl=' + tgt + '&dt=t&q=' + encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('bad payload');
  return data[0].map(seg => seg[0]).join('');
}

async function mymemoryTranslate(text, src, tgt) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
    '&langpair=' + src + '|' + tgt;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const out = data && data.responseData && data.responseData.translatedText;
  if (!out || out.includes('MYMEMORY WARNING') || out.includes('PLEASE SELECT')) throw new Error('bad payload');
  return out;
}

async function translate(text, src, tgt) {
  const key = src + '|' + tgt + '|' + text;
  if (cache.has(key)) return cache.get(key);
  for (const fn of [googleTranslate, mymemoryTranslate]) {
    try {
      const out = (await fn(text, src, tgt)).trim();
      if (out) {
        cache.set(key, out);
        return out;
      }
    } catch (e) { /* try next provider */ }
  }
  throw new Error('all providers failed');
}

function pickVoice(code) {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  const prefix = code.slice(0, 2);
  return voices.find(v => v.lang === code) || voices.find(v => v.lang && v.lang.startsWith(prefix)) || null;
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tgtLang().code;
  u.rate = 1;
  const v = pickVoice(u.lang);
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function ensureRecognition() {
  if (!SR) return null;
  if (recognition) return recognition;
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = srcLang().code;
  recognition.onresult = onResult;
  recognition.onerror = onError;
  recognition.onend = onEnd;
  return recognition;
}

function onResult(event) {
  let interim = '';
  let finalText = '';
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const res = event.results[i];
    const txt = res[0].transcript;
    if (res.isFinal) finalText += txt;
    else interim += txt;
  }
  state.interim.src = interim.trim();
  scheduleInterimTranslation();
  if (finalText.trim()) commitFinal(finalText.trim());
  render();
}

function scheduleInterimTranslation() {
  const text = state.interim.src;
  clearTimeout(interimTimer);
  if (!text) {
    state.interim.tgt = '';
    return;
  }
  interimTimer = setTimeout(async () => {
    try {
      state.interim.tgt = await translate(text, srcLang().iso, tgtLang().iso);
    } catch (e) {
      state.interim.tgt = '';
    }
    render();
  }, 350);
}

async function commitFinal(text) {
  const entry = { src: text, tgt: null };
  state.entries.push(entry);
  if (state.entries.length > MAX_ENTRIES) state.entries.shift();
  render();
  try {
    const t = await translate(text, srcLang().iso, tgtLang().iso);
    entry.tgt = t;
    if (state.autoSpeak) speak(t);
  } catch (e) {
    entry.tgt = 'Traduction indisponible (vérifiez la connexion).';
  }
  render();
}

function onError(event) {
  const code = event.error;
  if (code === 'no-speech' || code === 'aborted') return;
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    state.listening = false;
    setStatus('error', 'Accès au micro refusé — autorisez-le dans les réglages du navigateur.');
  } else if (code === 'audio-capture') {
    state.listening = false;
    setStatus('error', 'Aucun micro détecté sur cet appareil.');
  } else if (code === 'network') {
    setStatus('error', 'Erreur réseau de la reconnaissance vocale.');
  } else {
    setStatus('error', 'Erreur de reconnaissance : ' + code);
  }
  updateMic();
}

function onEnd() {
  if (!state.listening) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (!state.listening || !recognition) return;
    try { recognition.start(); } catch (e) { /* already started */ }
  }, 250);
}

function startListening() {
  const rec = ensureRecognition();
  if (!rec) {
    setStatus('error', 'Reconnaissance vocale non supportée — utilisez Chrome ou Edge récent.');
    return;
  }
  rec.lang = srcLang().code;
  state.listening = true;
  try { rec.start(); } catch (e) { /* already started */ }
  setStatus('listen', 'Écoute en cours — parlez…');
  updateMic();
}

function stopListening() {
  state.listening = false;
  clearTimeout(restartTimer);
  clearTimeout(interimTimer);
  state.interim = { src: '', tgt: '' };
  if (recognition) {
    try { recognition.stop(); } catch (e) { /* not running */ }
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  setStatus('idle', 'En pause — cliquez sur le micro pour reprendre.');
  updateMic();
  render();
}

function toggleListening() {
  if (state.listening) stopListening();
  else startListening();
}

function setStatus(mode, text) {
  statusText.textContent = text;
  dot.className = 'dot' + (mode === 'listen' ? ' listen' : mode === 'error' ? ' error' : '');
}

function updateMic() {
  micBtn.classList.toggle('listening', state.listening);
  micBtn.setAttribute('aria-pressed', String(state.listening));
  micBtn.setAttribute('aria-label', state.listening ? 'Couper le micro' : 'Activer le micro');
}

function render() {
  srcLog.textContent = '';
  tgtLog.textContent = '';
  for (const e of state.entries) {
    const a = document.createElement('div');
    a.className = 'line';
    a.textContent = e.src;
    srcLog.appendChild(a);
    const b = document.createElement('div');
    b.className = 'line' + (e.tgt === null ? ' pending' : '');
    b.textContent = e.tgt === null ? '…' : e.tgt;
    tgtLog.appendChild(b);
  }
  if (state.interim.src) {
    const a = document.createElement('div');
    a.className = 'line interim';
    a.textContent = state.interim.src;
    srcLog.appendChild(a);
    const b = document.createElement('div');
    b.className = 'line interim';
    b.textContent = state.interim.tgt || '';
    tgtLog.appendChild(b);
  }
  srcLog.scrollTop = srcLog.scrollHeight;
  tgtLog.scrollTop = tgtLog.scrollHeight;
}

function updateLabels() {
  srcLabel.textContent = 'Vous · ' + srcLang().name;
  tgtLabel.textContent = 'Traduction · ' + tgtLang().name;
}

function applyLangChange() {
  if (srcLang().code === tgtLang().code) {
    tgtSelect.value = srcLang().iso === 'en' ? 'fr-FR' : 'en-US';
  }
  if (state.listening && recognition) {
    recognition.lang = srcLang().code;
    try { recognition.stop(); } catch (e) { /* onend will restart with the new lang */ }
  }
  updateLabels();
}

srcSelect.addEventListener('change', applyLangChange);
tgtSelect.addEventListener('change', applyLangChange);

swapBtn.addEventListener('click', () => {
  const s = srcSelect.value;
  srcSelect.value = tgtSelect.value;
  tgtSelect.value = s;
  applyLangChange();
});

micBtn.addEventListener('click', toggleListening);

replayBtn.addEventListener('click', () => {
  const last = [...state.entries].reverse().find(e => e.tgt);
  if (last) speak(last.tgt);
});

clearBtn.addEventListener('click', () => {
  state.entries = [];
  state.interim = { src: '', tgt: '' };
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  render();
});

autospeakBox.addEventListener('change', () => {
  state.autoSpeak = autospeakBox.checked;
});

if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => {};
}

if (!SR) {
  setStatus('error', 'Reconnaissance vocale non supportée — utilisez Chrome ou Edge récent.');
  micBtn.disabled = true;
  micBtn.style.opacity = '0.4';
}

updateLabels();
render();
