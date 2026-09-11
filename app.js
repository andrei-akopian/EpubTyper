const STORAGE_KEY = 'epubtyper-state-v1';
const SAMPLE_BOOK = {
  id: 'sample-quiet-hour',
  title: 'The Quiet Hour',
  author: 'A sample reader',
  chapters: [
    {
      title: 'The first page',
      text: `There is a particular kind of silence that arrives before a town wakes. It is not empty. It is the sound of small things returning to their places: a cup set on a counter, a broom finding the front step, a bird testing one bright note. In that hour, the day has not yet decided what it will ask of us.`
    },
    {
      title: 'A room with a window',
      text: `Mara kept her desk beside the window, though the view was only a brick wall and a narrow piece of sky. The wall changed less than the weather did, and that steadiness helped. Each morning she opened the book, placed both hands on the table, and began with the sentence that had been waiting for her.`
    },
    {
      title: 'The work of attention',
      text: `To pay attention is to make a small promise. You promise to stay long enough for the ordinary world to show its second face. A page becomes a room. A minute becomes a thread. Even the pauses between words begin to carry their own quiet weight.`
    }
  ]
};

const state = {
  book: SAMPLE_BOOK,
  bookProgress: {},
  history: [],
  currentChapter: 0,
  startedAt: null,
  timerId: null,
  toastId: null
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  Object.assign(els, {
    bookTitle: document.querySelector('#book-title'),
    bookAuthor: document.querySelector('#book-author'),
    bookProgressFill: document.querySelector('#book-progress-fill'),
    bookProgressLabel: document.querySelector('#book-progress-label'),
    bookChapterCount: document.querySelector('#book-chapter-count'),
    chapterList: document.querySelector('#chapter-list'),
    chapterKicker: document.querySelector('#chapter-kicker'),
    chapterTitle: document.querySelector('#chapter-title'),
    passage: document.querySelector('#passage'),
    typingSurface: document.querySelector('#typing-surface'),
    mobileCapture: document.querySelector('#mobile-capture'),
    typingHelp: document.querySelector('#typing-help'),
    typingProgressFill: document.querySelector('#typing-progress-fill'),
    characterCount: document.querySelector('#character-count'),
    accuracyValue: document.querySelector('#accuracy-value'),
    timeValue: document.querySelector('#time-value'),
    liveWpm: document.querySelector('#live-wpm'),
    toast: document.querySelector('#toast'),
    epubInput: document.querySelector('#epub-input'),
    resetButton: document.querySelector('#reset-button'),
    practiceView: document.querySelector('#practice-view'),
    statsView: document.querySelector('#stats-view'),
    bestWpm: document.querySelector('#best-wpm'),
    averageAccuracy: document.querySelector('#average-accuracy'),
    sessionsFinished: document.querySelector('#sessions-finished'),
    charactersTyped: document.querySelector('#characters-typed'),
    historyList: document.querySelector('#history-list')
  });

  loadState();
  bindEvents();
  renderBook();
  renderStats();
});

function bindEvents() {
  els.epubInput.addEventListener('change', handleEpubUpload);
  els.resetButton.addEventListener('click', resetChapter);
  els.typingSurface.addEventListener('click', focusTyping);
  els.mobileCapture.addEventListener('input', handleMobileInput);
  document.addEventListener('keydown', handleKeydown);
  document.querySelectorAll('.mode-button').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.bookProgress = saved.bookProgress || {};
    state.history = Array.isArray(saved.history) ? saved.history : [];
    const sampleProgress = state.bookProgress[SAMPLE_BOOK.id];
    state.currentChapter = sampleProgress?.currentChapter || 0;
  } catch {
    state.bookProgress = {};
    state.history = [];
  }
}

function persist() {
  const current = getBookState();
  current.currentChapter = state.currentChapter;
  state.bookProgress[state.book.id] = current;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookProgress: state.bookProgress, history: state.history }));
}

function getBookState() {
  const saved = state.bookProgress[state.book.id] || {};
  saved.chapters = saved.chapters || {};
  return saved;
}

function getChapterState(index = state.currentChapter) {
  const bookState = getBookState();
  if (!bookState.chapters[index]) {
    bookState.chapters[index] = { position: 0, statuses: [], attempts: 0, correct: 0, elapsedMs: 0, completed: false };
  }
  return bookState.chapters[index];
}

function renderBook() {
  els.bookTitle.textContent = state.book.title;
  els.bookAuthor.textContent = state.book.author || 'Unknown author';
  els.bookChapterCount.textContent = `${state.book.chapters.length} chapters`;
  renderChapterList();
  renderChapter();
  renderBookProgress();
}

function renderChapterList() {
  els.chapterList.innerHTML = '';
  state.book.chapters.forEach((chapter, index) => {
    const button = document.createElement('button');
    const chapterState = getChapterState(index);
    button.className = `chapter-button${index === state.currentChapter ? ' is-active' : ''}`;
    button.type = 'button';
    button.innerHTML = `<span class="chapter-number">${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(chapter.title)} ${chapterState.completed ? '<span class="chapter-complete">✓</span>' : ''}</span>`;
    button.addEventListener('click', () => selectChapter(index));
    els.chapterList.appendChild(button);
  });
}

function renderChapter() {
  const chapter = state.book.chapters[state.currentChapter];
  const chapterState = getChapterState();
  const text = chapter.text;
  els.chapterKicker.textContent = `Chapter ${String(state.currentChapter + 1).padStart(2, '0')}`;
  els.chapterTitle.textContent = chapter.title;
  els.passage.innerHTML = '';
  [...text].forEach((character, index) => {
    const span = document.createElement('span');
    span.textContent = character === ' ' ? '\u00a0' : character;
    if (character === ' ') span.classList.add('is-space');
    if (index < chapterState.position) span.classList.add(chapterState.statuses[index] === 'correct' ? 'is-correct' : 'is-incorrect');
    if (index === chapterState.position && !chapterState.completed) span.classList.add('is-current');
    els.passage.appendChild(span);
  });
  els.typingHelp.classList.toggle('is-hidden', chapterState.position > 0 || chapterState.completed);
  updateSessionMetrics();
}

function renderBookProgress() {
  const total = state.book.chapters.reduce((sum, chapter) => sum + chapter.text.length, 0);
  const completed = state.book.chapters.reduce((sum, chapter, index) => sum + Math.min(getChapterState(index).position, chapter.text.length), 0);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  els.bookProgressFill.style.width = `${percent}%`;
  els.bookProgressLabel.textContent = `${percent}% complete`;
}

function selectChapter(index) {
  if (index === state.currentChapter) {
    focusTyping();
    return;
  }
  stopTimer();
  persist();
  state.currentChapter = index;
  persist();
  renderChapterList();
  renderChapter();
  renderBookProgress();
  focusTyping();
}

function focusTyping() {
  els.mobileCapture.focus({ preventScroll: true });
}

function handleKeydown(event) {
  if (document.activeElement !== els.typingSurface && document.activeElement !== els.mobileCapture) return;
  if (event.key === 'Escape') {
    stopTimer();
    els.mobileCapture.blur();
    els.typingSurface.blur();
    showToast('Paused. Click the passage to continue.');
    return;
  }
  if (event.key === 'Backspace') {
    event.preventDefault();
    stepBack();
    return;
  }
  if (event.key.length !== 1 || event.isComposing || !isKeyboardCharacter(event.key)) return;
  event.preventDefault();
  typeCharacter(event.key);
}

function handleMobileInput(event) {
  const value = event.target.value;
  if (!value) return;
  [...value].forEach((character) => {
    if (isKeyboardCharacter(character)) typeCharacter(character);
  });
  event.target.value = '';
}

function typeCharacter(character) {
  const chapter = state.book.chapters[state.currentChapter];
  const chapterState = getChapterState();
  if (chapterState.completed || chapterState.position >= chapter.text.length) return;
  if (!state.startedAt) {
    state.startedAt = Date.now();
    startTimer();
  }
  const expected = chapter.text[chapterState.position];
  const isCorrect = character === expected;
  chapterState.statuses[chapterState.position] = isCorrect ? 'correct' : 'incorrect';
  chapterState.position += 1;
  chapterState.attempts += 1;
  if (isCorrect) chapterState.correct += 1;
  if (chapterState.position === chapter.text.length) finishChapter();
  renderChapter();
  renderChapterList();
  renderBookProgress();
  persist();
}

function stepBack() {
  const chapterState = getChapterState();
  if (!chapterState.position || chapterState.completed) return;
  chapterState.position -= 1;
  if (chapterState.statuses[chapterState.position] === 'correct') chapterState.correct -= 1;
  chapterState.statuses.pop();
  chapterState.attempts = Math.max(0, chapterState.attempts - 1);
  renderChapter();
  renderBookProgress();
  persist();
}

function finishChapter() {
  const chapterState = getChapterState();
  chapterState.completed = true;
  stopTimer();
  const minutes = Math.max(chapterState.elapsedMs / 60000, 1 / 60000);
  const wpm = Math.round((chapterState.correct / 5) / minutes);
  state.history.unshift({
    bookTitle: state.book.title,
    chapterTitle: state.book.chapters[state.currentChapter].title,
    wpm,
    accuracy: chapterState.attempts ? Math.round((chapterState.correct / chapterState.attempts) * 100) : 100,
    characters: chapterState.attempts,
    date: new Date().toISOString()
  });
  state.history = state.history.slice(0, 20);
  persist();
  renderStats();
  showToast('Chapter complete. Nice work.');
}

function resetChapter() {
  stopTimer();
  const bookState = getBookState();
  bookState.chapters[state.currentChapter] = { position: 0, statuses: [], attempts: 0, correct: 0, elapsedMs: 0, completed: false };
  state.startedAt = null;
  persist();
  renderChapter();
  renderChapterList();
  renderBookProgress();
  focusTyping();
}

function startTimer() {
  if (state.timerId) return;
  state.timerId = window.setInterval(updateSessionMetrics, 500);
}

function stopTimer() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = null;
  if (state.startedAt) {
    const chapterState = getChapterState();
    chapterState.elapsedMs += Date.now() - state.startedAt;
    state.startedAt = null;
    persist();
  }
  updateSessionMetrics();
}

function updateSessionMetrics() {
  const chapter = state.book.chapters[state.currentChapter];
  const chapterState = getChapterState();
  const elapsedMs = chapterState.elapsedMs + (state.startedAt ? Date.now() - state.startedAt : 0);
  const minutes = Math.max(elapsedMs / 60000, 1 / 60000);
  const wpm = Math.round((chapterState.correct / 5) / minutes) || 0;
  const accuracy = chapterState.attempts ? Math.round((chapterState.correct / chapterState.attempts) * 100) : 100;
  const percent = chapter.text.length ? (chapterState.position / chapter.text.length) * 100 : 0;
  els.liveWpm.textContent = wpm;
  els.accuracyValue.textContent = `${accuracy}%`;
  els.timeValue.textContent = formatTime(elapsedMs);
  els.characterCount.textContent = `${chapterState.position} / ${chapter.text.length} characters`;
  els.typingProgressFill.style.width = `${percent}%`;
}

function setView(view) {
  const practice = view === 'practice';
  els.practiceView.hidden = !practice;
  els.statsView.hidden = practice;
  els.practiceView.classList.toggle('is-visible', practice);
  els.statsView.classList.toggle('is-visible', !practice);
  document.querySelectorAll('.mode-button').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (!practice) {
    stopTimer();
    els.mobileCapture.blur();
    renderStats();
  }
}

function renderStats() {
  const completed = state.history;
  const best = completed.reduce((value, item) => Math.max(value, item.wpm), 0);
  const average = completed.length ? Math.round(completed.reduce((sum, item) => sum + item.accuracy, 0) / completed.length) : 0;
  els.bestWpm.textContent = best;
  els.averageAccuracy.textContent = `${average}%`;
  els.sessionsFinished.textContent = completed.length;
  els.charactersTyped.textContent = completed.reduce((sum, item) => sum + item.characters, 0).toLocaleString();
  els.historyList.innerHTML = completed.length ? completed.map((item) => `<div class="history-row"><div><strong>${escapeHtml(item.chapterTitle)}</strong><small>${escapeHtml(item.bookTitle)} · ${formatDate(item.date)}</small></div><span class="history-value">${item.wpm} wpm</span><span class="history-value">${item.accuracy}% acc.</span><span class="history-value">${item.characters} chars</span></div>`).join('') : '<p class="empty-history">Finish a passage and it will appear here.</p>';
}

async function handleEpubUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    showToast('Opening your EPUB…');
    const book = await parseEpub(file);
    state.book = book;
    state.currentChapter = state.bookProgress[book.id]?.currentChapter || 0;
    state.startedAt = null;
    renderBook();
    showToast(`${book.chapters.length} chapters loaded.`);
  } catch (error) {
    console.error(error);
    showToast('That EPUB could not be opened. Try another file.');
  } finally {
    event.target.value = '';
  }
}

async function parseEpub(file) {
  if (!('DecompressionStream' in window)) throw new Error('This browser does not support EPUB compression.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipEntries(bytes);
  const container = parseXml(await readZipEntry(entries, bytes, 'META-INF/container.xml'));
  const rootfile = firstByLocalName(container, 'rootfile');
  if (!rootfile) throw new Error('EPUB has no rootfile.');
  const opfPath = rootfile.getAttribute('full-path');
  const opf = parseXml(await readZipEntry(entries, bytes, opfPath));
  const opfDirectory = opfPath.slice(0, opfPath.lastIndexOf('/') + 1);
  const manifestNode = firstByLocalName(opf, 'manifest');
  const spineNode = firstByLocalName(opf, 'spine');
  const manifest = new Map([...manifestNode.getElementsByTagNameNS('*', 'item')].map((item) => [item.getAttribute('id'), item]));
  const chapters = [];
  for (const itemref of spineNode.getElementsByTagNameNS('*', 'itemref')) {
    if (itemref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(itemref.getAttribute('idref'));
    if (!item || !/html|xhtml/i.test(item.getAttribute('media-type') || '')) continue;
    if ((item.getAttribute('properties') || '').split(/\s+/).includes('nav')) continue;
    const path = normalizePath(opfDirectory + item.getAttribute('href').split('#')[0]);
    const source = await readZipEntry(entries, bytes, path);
    const document = parseXml(source);
    const body = firstByLocalName(document, 'body');
    const titleNode = firstByLocalName(document, 'h1') || firstByLocalName(document, 'h2') || firstByLocalName(document, 'h3') || firstByLocalName(document, 'title');
    const text = normalizeText(body?.textContent || document.documentElement.textContent || '');
    const title = titleNode?.textContent.trim() || `Chapter ${chapters.length + 1}`;
    if (text && !isFrontMatter(title, text)) chapters.push({ title, text });
  }
  if (!chapters.length) throw new Error('No readable chapters found.');
  const title = firstByLocalName(opf, 'title')?.textContent.trim() || file.name.replace(/\.epub$/i, '');
  const author = firstByLocalName(opf, 'creator')?.textContent.trim() || 'Imported EPUB';
  return { id: `epub-${file.name}-${file.size}-${file.lastModified}`, title, author, chapters };
}

function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive.');
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  const entries = new Map();
  let offset = directoryOffset;
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    entries.set(normalizePath(name), { method: view.getUint16(offset + 10, true), compressedSize: view.getUint32(offset + 20, true), size: view.getUint32(offset + 24, true), localOffset: view.getUint32(offset + 42, true) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!directorySize || !entries.size) throw new Error('Empty ZIP archive.');
  return entries;
}

async function readZipEntry(entries, bytes, path) {
  const entry = entries.get(normalizePath(path));
  if (!entry) throw new Error(`Missing EPUB entry: ${path}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.localOffset;
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const start = local + 30 + nameLength + extraLength;
  const compressed = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(compressed);
  if (entry.method !== 8) throw new Error('Unsupported ZIP compression.');
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(new Uint8Array(await new Response(stream).arrayBuffer()));
}

function parseXml(source) {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Invalid EPUB XML.');
  return document;
}

function firstByLocalName(document, name) {
  return document.getElementsByTagNameNS('*', name)[0] || null;
}

function isFrontMatter(title, text) {
  const titleHint = /^(copyright|contents|table of contents|title page|also by|about the author|dedication|acknowledg(e)?ments?)$/i.test(title.trim());
  const metadataHint = /\b(isbn(?:-1[03])?|copyright|all rights reserved|library of congress|cataloging[- ]in[- ]publication|published by)\b/i.test(text.slice(0, 1600));
  return titleHint || (metadataHint && text.length < 2200);
}

function normalizeText(value) {
  const replacements = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...' };
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split('').map((character) => replacements[character] || character).join('').replace(/\s+/g, ' ').replace(/[^A-Za-z0-9 .,;:!?\-_'"()\[\]\/]/g, '').replace(/ {2,}/g, ' ').trim();
}

function normalizePath(path) {
  const parts = [];
  path.split('/').forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') parts.pop();
    else parts.push(part);
  });
  return parts.join('/');
}

function isKeyboardCharacter(character) {
  return /^[ -~]$/.test(character);
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(state.toastId);
  state.toastId = setTimeout(() => els.toast.classList.remove('is-visible'), 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
}
