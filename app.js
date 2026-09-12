const STORAGE_KEY = 'epubtyper-state-v3';
const COMMON_CHARSET = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '0123456789',
  " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
].join('');
const CHARSET_PRESETS = {
  qwerty: COMMON_CHARSET,
  azerty: `${COMMON_CHARSET}àâäçéèêëîïôöùûüÿÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ`,
  qwertz: `${COMMON_CHARSET}äöüßÄÖÜẞ`,
  spanish: `${COMMON_CHARSET}áéíóúüñÁÉÍÓÚÜÑ¿¡`,
  nordic: `${COMMON_CHARSET}åäöøæÅÄÖØÆ`,
  russian: `${COMMON_CHARSET}йцукенгшщзхъфывапролджэячсмитьбюёЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮЁ`,
  ukrainian: `${COMMON_CHARSET}йцукенгшщзхїґфівапролджєячсмитьбюЙЦУКЕНГШЩЗХЇҐФІВАПРОЛДЖЄЯЧСМИТЬБЮ`,
  belarusian: `${COMMON_CHARSET}йцукенгшўзхъфывапролджэячсміцьбюЙЦУКЕНГШЎЗХЪФЫВАПРОЛДЖЭЯЧСМІЦЬБЮ`,
  bulgarian: `${COMMON_CHARSET}йцукенгшщзхъфывапролджьтюЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЬТЮ`,
  polish: `${COMMON_CHARSET}ąćęłńóśźżĄĆĘŁŃÓŚŹŻ`,
  czechSlovak: `${COMMON_CHARSET}áäčďéěíĺľňóôŕřšťúůýžÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽ`,
  serbian: `${COMMON_CHARSET}љњђћџјзчшђЈЉЊЂЋЏЗЧШ`
};
const DEFAULT_SETTINGS = {
  remainingColor: '#a9adb4',
  typedColor: '#17223b',
  errorColor: '#e9785d',
  currentBackground: '#f6d8cc',
  charsetPreset: 'qwerty',
  charset: COMMON_CHARSET,
  skipUnicode: true,
  skipWhitespace: true,
  skipRepeatedSpaces: true
};
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
  books: [SAMPLE_BOOK],
  bookProgress: {},
  history: [],
  settings: { ...DEFAULT_SETTINGS },
  currentChapter: 0,
  startedAt: null,
  timerId: null,
  persistId: null,
  characterElements: [],
  currentCharacter: -1,
  charsetSet: new Set(),
  bookProgressElements: new Map(),
  toastId: null
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  Object.assign(els, {
    bookList: document.querySelector('#book-list'),
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
    liveRawWpm: document.querySelector('#live-raw-wpm'),
    toast: document.querySelector('#toast'),
    epubInput: document.querySelector('#epub-input'),
    resetButton: document.querySelector('#reset-button'),
    practiceView: document.querySelector('#practice-view'),
    statsView: document.querySelector('#stats-view'),
    settingsView: document.querySelector('#settings-view'),
    charsetPreset: document.querySelector('#charset-preset'),
    charsetInput: document.querySelector('#charset-input'),
    bestWpm: document.querySelector('#best-wpm'),
    averageAccuracy: document.querySelector('#average-accuracy'),
    sessionsFinished: document.querySelector('#sessions-finished'),
    charactersTyped: document.querySelector('#characters-typed'),
    historyList: document.querySelector('#history-list'),
    resetSettings: document.querySelector('#reset-settings')
  });

  loadState();
  bindEvents();
  applySettings();
  renderBook();
  renderStats();
});

function bindEvents() {
  els.epubInput.addEventListener('change', handleEpubUpload);
  els.resetButton.addEventListener('click', resetChapter);
  els.resetSettings.addEventListener('click', resetSettings);
  els.typingSurface.addEventListener('click', focusTyping);
  els.mobileCapture.addEventListener('input', handleMobileInput);
  document.addEventListener('keydown', handleKeydown);
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener(input.type === 'color' ? 'input' : 'change', handleSettingChange);
  });
  els.charsetPreset.addEventListener('change', handleCharsetPresetChange);
  els.charsetInput.addEventListener('input', handleCharsetInput);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.bookProgress = saved.bookProgress || {};
    state.history = Array.isArray(saved.history) ? saved.history : [];
    state.settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
    const sampleProgress = state.bookProgress[SAMPLE_BOOK.id];
    state.currentChapter = Math.max(0, Math.min(Number(sampleProgress?.currentChapter) || 0, SAMPLE_BOOK.chapters.length - 1));
  } catch {
    state.bookProgress = {};
    state.history = [];
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

function persist() {
  clearTimeout(state.persistId);
  state.persistId = null;
  const current = getBookState();
  current.currentChapter = state.currentChapter;
  state.bookProgress[state.book.id] = current;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookProgress: state.bookProgress, history: state.history, settings: state.settings }));
  } catch (error) {
    console.warn('Unable to save typing progress.', error);
  }
}

function persistSoon() {
  clearTimeout(state.persistId);
  state.persistId = window.setTimeout(persist, 300);
}

function applySettings() {
  const root = document.documentElement;
  root.style.setProperty('--remaining-color', state.settings.remainingColor);
  root.style.setProperty('--typed-color', state.settings.typedColor);
  root.style.setProperty('--error-color', state.settings.errorColor);
  root.style.setProperty('--current-background', state.settings.currentBackground);
  state.charsetSet = new Set([...state.settings.charset]);
  document.querySelectorAll('[data-setting]').forEach((input) => {
    const value = state.settings[input.dataset.setting];
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value;
  });
  els.charsetPreset.value = state.settings.charsetPreset;
  els.charsetInput.value = state.settings.charset;
}

function handleSettingChange(event) {
  const input = event.currentTarget;
  state.settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
  applySettings();
  if (input.type === 'checkbox') refreshTypingPosition();
  persist();
}

function resetSettings() {
  state.settings = { ...DEFAULT_SETTINGS };
  applySettings();
  refreshTypingPosition();
  persist();
}

function handleCharsetPresetChange(event) {
  const preset = event.target.value;
  state.settings.charsetPreset = preset;
  if (CHARSET_PRESETS[preset]) state.settings.charset = CHARSET_PRESETS[preset];
  applySettings();
  refreshTypingPosition();
  persist();
}

function handleCharsetInput(event) {
  state.settings.charsetPreset = 'custom';
  state.settings.charset = event.target.value;
  state.charsetSet = new Set([...state.settings.charset]);
  els.charsetPreset.value = 'custom';
  refreshTypingPosition();
  persistSoon();
}

function refreshTypingPosition() {
  const chapterState = getChapterState();
  if (chapterState.completed) {
    renderChapter();
    return;
  }
  let lastTyped = -1;
  chapterState.statuses.forEach((status, index) => {
    if (status === 'correct' || status === 'incorrect') lastTyped = index;
    if (status === 'skipped') chapterState.statuses[index] = undefined;
  });
  chapterState.position = lastTyped + 1;
  renderChapter();
  renderBookProgress();
}

function getBookState() {
  const saved = state.bookProgress[state.book.id] || {};
  saved.chapters = saved.chapters || {};
  return saved;
}

function getChapterState(index = state.currentChapter) {
  const bookState = getBookState();
  if (!bookState.chapters[index]) {
    bookState.chapters[index] = { position: 0, statuses: [], attempts: 0, correct: 0, correctEvents: 0, incorrectEvents: 0, elapsedMs: 0, completed: false, events: [], eventCount: 0 };
  }
  bookState.chapters[index].statuses = bookState.chapters[index].statuses || [];
  bookState.chapters[index].events = bookState.chapters[index].events || [];
  bookState.chapters[index].eventCount = bookState.chapters[index].eventCount || bookState.chapters[index].events.length;
  bookState.chapters[index].correctEvents = bookState.chapters[index].correctEvents || 0;
  bookState.chapters[index].incorrectEvents = bookState.chapters[index].incorrectEvents || 0;
  return bookState.chapters[index];
}

function renderBook() {
  renderBookList();
  renderChapter();
  renderBookProgress();
}

function renderBookList() {
  els.bookList.replaceChildren();
  state.bookProgressElements = new Map();
  state.books.forEach((book) => {
    const details = document.createElement('details');
    details.className = 'book-details';
    details.open = book.id === state.book.id;
    const summary = document.createElement('summary');
    const summaryCopy = document.createElement('span');
    summaryCopy.className = 'book-summary-copy';
    summaryCopy.innerHTML = `<span class="book-summary-title">${escapeHtml(book.title)}</span><span class="book-summary-meta">${escapeHtml(book.author || 'Unknown author')} · ${book.chapters.length} chapters</span>`;
    const progress = document.createElement('span');
    progress.className = 'book-summary-progress';
    summary.append(summaryCopy, progress);
    summary.addEventListener('click', () => {
      if (book.id !== state.book.id) selectBook(book.id);
    });
    details.appendChild(summary);
    const chapters = document.createElement('div');
    chapters.className = 'book-chapters';
    book.chapters.forEach((chapter, index) => {
      const button = document.createElement('button');
      const chapterState = state.bookProgress[book.id]?.chapters?.[index] || {};
      button.className = `chapter-button${book.id === state.book.id && index === state.currentChapter ? ' is-active' : ''}`;
      button.type = 'button';
      button.innerHTML = `<span class="chapter-number">${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(chapter.title)} ${chapterState.completed ? '<span class="chapter-complete">✓</span>' : ''}</span>`;
      button.addEventListener('click', () => selectChapterForBook(book.id, index));
      chapters.appendChild(button);
    });
    details.appendChild(chapters);
    els.bookList.appendChild(details);
    state.bookProgressElements.set(book.id, progress);
    updateBookProgress(book, progress);
  });
}

function renderChapter() {
  const chapter = state.book.chapters[state.currentChapter];
  const chapterState = getChapterState();
  const text = chapter.text;
  els.chapterKicker.textContent = `Chapter ${String(state.currentChapter + 1).padStart(2, '0')}`;
  els.chapterTitle.textContent = chapter.title;
  els.passage.replaceChildren();
  state.characterElements = [];
  state.currentCharacter = -1;
  const fragment = document.createDocumentFragment();
  [...text].forEach((character, index) => {
    const span = document.createElement('span');
    span.textContent = character;
    state.characterElements.push(span);
    fragment.appendChild(span);
  });
  els.passage.appendChild(fragment);
  advanceToFairCharacter(chapterState);
  for (let index = 0; index < chapterState.position; index += 1) setCharacterStatus(index, chapterState.statuses[index] || 'skipped');
  moveCursor(chapterState.completed ? -1 : chapterState.position);
  els.typingHelp.classList.toggle('is-hidden', chapterState.position > 0 || chapterState.completed);
  updateSessionMetrics();
}

function setCharacterStatus(index, status) {
  const element = state.characterElements[index];
  if (!element) return;
  element.classList.remove('is-current', 'is-correct', 'is-incorrect');
  if (status === 'correct' || status === 'skipped') element.classList.add('is-correct');
  if (status === 'incorrect') element.classList.add('is-incorrect');
}

function moveCursor(index) {
  if (state.currentCharacter >= 0) state.characterElements[state.currentCharacter]?.classList.remove('is-current');
  state.currentCharacter = index;
  if (index >= 0) state.characterElements[index]?.classList.add('is-current');
}

function advanceToFairCharacter(chapterState) {
  const text = state.book.chapters[state.currentChapter].text;
  while (chapterState.position < text.length && !isFairCharacterAt(text, chapterState.position)) {
    chapterState.statuses[chapterState.position] = 'skipped';
    setCharacterStatus(chapterState.position, 'skipped');
    chapterState.position += 1;
  }
  return chapterState.position;
}

function renderBookProgress() {
  updateBookProgress(state.book, state.bookProgressElements.get(state.book.id));
}

function updateBookProgress(book, element) {
  if (!element) return;
  const total = book.chapters.reduce((sum, chapter) => sum + chapter.text.length, 0);
  const completed = book.chapters.reduce((sum, chapter, index) => sum + Math.min(state.bookProgress[book.id]?.chapters?.[index]?.position || 0, chapter.text.length), 0);
  element.textContent = `${total ? Math.round((completed / total) * 100) : 0}%`;
}

function selectBook(bookId) {
  const book = state.books.find((candidate) => candidate.id === bookId);
  if (!book || book.id === state.book.id) return;
  stopTimer();
  persist();
  state.book = book;
  state.currentChapter = Math.max(0, Math.min(Number(state.bookProgress[book.id]?.currentChapter) || 0, book.chapters.length - 1));
  persist();
  renderBook();
  focusTyping();
}

function selectChapterForBook(bookId, index) {
  setView('practice');
  if (bookId !== state.book.id) selectBook(bookId);
  selectChapter(index);
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
  renderBookList();
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
  const character = characterFromKey(event.key);
  if (!character || event.isComposing || !isInputCharacter(character)) return;
  event.preventDefault();
  typeCharacter(character);
}

function handleMobileInput(event) {
  const value = event.target.value;
  if (!value) return;
  [...value].forEach((character) => {
    if (isInputCharacter(character)) typeCharacter(character);
  });
  event.target.value = '';
}

function typeCharacter(character) {
  const chapter = state.book.chapters[state.currentChapter];
  const chapterState = getChapterState();
  if (chapterState.completed) return;
  const before = chapterState.position;
  advanceToFairCharacter(chapterState);
  if (chapterState.position >= chapter.text.length) {
    finishChapter();
    return;
  }
  if (!state.startedAt) {
    state.startedAt = Date.now();
    startTimer();
  }
  const expected = chapter.text[chapterState.position];
  const isCorrect = character === expected;
  chapterState.statuses[chapterState.position] = isCorrect ? 'correct' : 'incorrect';
  setCharacterStatus(chapterState.position, isCorrect ? 'correct' : 'incorrect');
  if (isCorrect) chapterState.correctEvents += 1;
  else chapterState.incorrectEvents += 1;
  chapterState.events = chapterState.events || [];
  const event = { at: Date.now(), index: chapterState.position, key: character, expected, skipped: chapterState.position - before, correct: isCorrect };
  if (chapterState.events.length < 5000) chapterState.events.push(event);
  else chapterState.events[chapterState.eventCount % 5000] = event;
  chapterState.eventCount += 1;
  chapterState.position += 1;
  chapterState.attempts += 1;
  if (isCorrect) chapterState.correct += 1;
  advanceToFairCharacter(chapterState);
  moveCursor(chapterState.position >= chapter.text.length ? -1 : chapterState.position);
  if (chapterState.position >= chapter.text.length) finishChapter();
  els.typingHelp.classList.add('is-hidden');
  updateSessionMetrics();
  renderBookProgress();
  persistSoon();
}

function stepBack() {
  const chapterState = getChapterState();
  if (!chapterState.position || chapterState.completed) return;
  let previous = chapterState.position - 1;
  while (previous >= 0 && chapterState.statuses[previous] === 'skipped') {
    chapterState.statuses[previous] = undefined;
    setCharacterStatus(previous, undefined);
    previous -= 1;
  }
  if (previous < 0) return;
  if (chapterState.statuses[previous] === 'correct') chapterState.correct -= 1;
  chapterState.statuses[previous] = undefined;
  setCharacterStatus(previous, undefined);
  chapterState.position = previous;
  moveCursor(chapterState.position);
  els.typingHelp.classList.add('is-hidden');
  updateSessionMetrics();
  renderBookProgress();
  persistSoon();
}

function finishChapter() {
  const chapterState = getChapterState();
  chapterState.completed = true;
  stopTimer();
  const metrics = getTypingMetrics(chapterState);
  state.history.unshift({
    bookTitle: state.book.title,
    chapterTitle: state.book.chapters[state.currentChapter].title,
    wpm: metrics.wpm,
    rawWpm: metrics.rawWpm,
    accuracy: metrics.accuracy,
    characters: chapterState.attempts,
    date: new Date().toISOString()
  });
  state.history = state.history.slice(0, 20);
  persist();
  renderBookList();
  renderStats();
  showToast('Chapter complete.');
}

function resetChapter() {
  stopTimer();
  const bookState = getBookState();
  bookState.chapters[state.currentChapter] = { position: 0, statuses: [], attempts: 0, correct: 0, correctEvents: 0, incorrectEvents: 0, elapsedMs: 0, completed: false, events: [], eventCount: 0 };
  state.startedAt = null;
  persist();
  renderChapter();
  renderBookList();
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
  const metrics = getTypingMetrics(chapterState);
  const percent = chapter.text.length ? (chapterState.position / chapter.text.length) * 100 : 0;
  els.liveWpm.textContent = metrics.wpm;
  els.liveRawWpm.textContent = metrics.rawWpm;
  els.accuracyValue.textContent = `${metrics.accuracy}%`;
  els.timeValue.textContent = formatTime(metrics.elapsedMs);
  els.characterCount.textContent = `${chapterState.position} / ${chapter.text.length} characters`;
  els.typingProgressFill.style.width = `${percent}%`;
}

function getTypingMetrics(chapterState) {
  const elapsedMs = chapterState.elapsedMs + (state.startedAt ? Date.now() - state.startedAt : 0);
  const durationMinutes = elapsedMs / 60000;
  const wpm = durationMinutes > 0 ? Math.round((chapterState.correct / 5) / durationMinutes) : 0;
  const rawWpm = durationMinutes > 0 ? Math.round((chapterState.attempts / 5) / durationMinutes) : 0;
  const totalEvents = chapterState.correctEvents + chapterState.incorrectEvents;
  const accuracy = totalEvents ? Math.round((chapterState.correctEvents / totalEvents) * 100) : 0;
  return { elapsedMs, wpm, rawWpm, accuracy };
}

function setView(view) {
  const practice = view === 'practice';
  const stats = view === 'stats';
  els.practiceView.hidden = !practice;
  els.statsView.hidden = !stats;
  els.settingsView.hidden = view !== 'settings';
  els.practiceView.classList.toggle('is-visible', practice);
  els.statsView.classList.toggle('is-visible', stats);
  els.settingsView.classList.toggle('is-visible', view === 'settings');
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    if (button.hasAttribute('aria-selected')) button.setAttribute('aria-selected', active ? 'true' : 'false');
    if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', active ? 'true' : 'false');
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
  els.historyList.innerHTML = completed.length ? completed.map((item) => `<div class="history-row"><div><strong>${escapeHtml(item.chapterTitle)}</strong><small>${escapeHtml(item.bookTitle)} · ${formatDate(item.date)}</small></div><span class="history-value">${item.wpm} wpm</span><span class="history-value">${item.rawWpm ?? item.wpm} raw</span><span class="history-value">${item.accuracy}% acc.</span></div>`).join('') : '<p class="empty-history">Finish a passage and it will appear here.</p>';
}

async function handleEpubUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    showToast('Opening your EPUB…');
    const book = await parseEpub(file);
    const existingIndex = state.books.findIndex((candidate) => candidate.id === book.id);
    if (existingIndex >= 0) state.books[existingIndex] = book;
    else state.books.push(book);
    state.book = book;
    state.currentChapter = Math.max(0, Math.min(Number(state.bookProgress[book.id]?.currentChapter) || 0, book.chapters.length - 1));
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
  if (typeof ePub !== 'function') throw new Error('epub.js did not load.');
  const book = ePub(await file.arrayBuffer());
  await book.ready;
  const metadata = await book.loaded.metadata;
  const chapters = [];
  try {
    for (const section of book.spine.spineItems) {
      if (!section.linear || (section.properties || []).includes('nav')) continue;
      const contents = await section.load(book.load.bind(book));
      const body = contents.querySelector('body');
      const titleNode = contents.querySelector('h1, h2, h3, title');
      const text = extractDisplayText(body || contents);
      const title = titleNode?.textContent.trim() || `Chapter ${chapters.length + 1}`;
      if (text && !isFrontMatter(title, text)) chapters.push({ title, text });
      section.unload();
    }
  } finally {
    book.destroy();
  }
  if (!chapters.length) throw new Error('No readable chapters found.');
  const title = metadata?.title || file.name.replace(/\.epub$/i, '');
  const author = metadata?.creator || 'Imported EPUB';
  return { id: `epub-${file.name}-${file.size}-${file.lastModified}`, title, author, chapters };
}

function isFrontMatter(title, text) {
  const titleHint = /^(copyright|contents|table of contents|title page|also by|about the author|dedication|acknowledg(e)?ments?)$/i.test(title.trim());
  const metadataHint = /\b(isbn(?:-1[03])?|copyright|all rights reserved|library of congress|cataloging[- ]in[- ]publication|published by)\b/i.test(text.slice(0, 1600));
  return titleHint || (metadataHint && text.length < 2200);
}

function extractDisplayText(body) {
  return body.textContent || '';
}

function normalizeText(value) {
  const replacements = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...' };
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split('').map((character) => replacements[character] || character).join('').replace(/\s+/g, ' ').replace(/[^A-Za-z0-9 .,;:!?\-_'"()\[\]\/]/g, '').replace(/ {2,}/g, ' ').trim();
}

function isCharsetCharacter(character) {
  return state.charsetSet.has(character);
}

function characterFromKey(key) {
  if (key === 'Enter') return '\n';
  if (key === 'Tab') return '\t';
  return key.length === 1 ? key : '';
}

function isInputCharacter(character) {
  if (!character || character === '\r') return false;
  if (/[\n\t]/.test(character)) return !state.settings.skipWhitespace;
  return isCharsetCharacter(character) || !state.settings.skipUnicode;
}

function isFairCharacterAt(text, index) {
  const character = text[index];
  if (character === '\r') return false;
  if (character === '\n' || character === '\t') return !state.settings.skipWhitespace;
  if (character === ' ' && !isCharsetCharacter(character)) return !state.settings.skipUnicode;
  if (!isCharsetCharacter(character)) return !state.settings.skipUnicode;
  if (character !== ' ') return true;
  const previous = text[index - 1];
  return !state.settings.skipRepeatedSpaces || !previous || !/[\s\u00a0]/.test(previous);
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
