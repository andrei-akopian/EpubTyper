const STORAGE_KEY = 'epubtyper-state-v3';
const HISTORY_LIMIT = 200;
const BOOK_PALETTE = ['#e9785d', '#2f6f7e', '#c4a35a', '#5b8a7a', '#6b7cb4', '#b85c8a', '#d4894a', '#17223b'];
const COMMON_CHARSET = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '0123456789',
  " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
].join('');
const MIN_CHAPTER_CHARACTERS = 80;
const CHARSET_PRESETS = {
  qwerty: COMMON_CHARSET,
  azerty: `${COMMON_CHARSET}àâäæçéèêëîïôœöùûüÿÀÂÄÆÇÉÈÊËÎÏÔŒÖÙÛÜŸ`,
  qwertz: `${COMMON_CHARSET}äöüßÄÖÜẞ`,
  spanish: `${COMMON_CHARSET}áéíóúüñÁÉÍÓÚÜÑ¿¡`,
  nordic: `${COMMON_CHARSET}åäöøæÅÄÖØÆ`,
  russian: `${COMMON_CHARSET}йцукенгшщзхъфывапролджэячсмитьбюёЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮЁ`,
  ukrainian: `${COMMON_CHARSET}йцукенгшщзхїґфівапролджєячсмитьбюЙЦУКЕНГШЩЗХЇҐФІВАПРОЛДЖЄЯЧСМИТЬБЮ`,
  belarusian: `${COMMON_CHARSET}йцукенгшўзхъфывапролджэячсміцьбюЙЦУКЕНГШЎЗХЪФЫВАПРОЛДЖЭЯЧСМІЦЬБЮ`,
  bulgarian: `${COMMON_CHARSET}абвгдежзийклмнопрстуфхцчшщъьюяАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯ`,
  polish: `${COMMON_CHARSET}ąćęłńóśźżĄĆĘŁŃÓŚŹŻ`,
  czechSlovak: `${COMMON_CHARSET}áäčďéěíĺľňóôŕřšťúůýžÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽ`,
  serbian: `${COMMON_CHARSET}абвгдђежзијклљмнњопрстћуфхцчџшАБВГДЂЕЖЗИЈКЛЉМНЊОПРСТЋУФХЦЧЏШ`
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

function sampleChapter(title, parts) {
  let text = '';
  const emphasisRanges = [];
  parts.forEach((part) => {
    const value = typeof part === 'string' ? part : part.text;
    const start = [...text].length;
    text += value;
    if (part.italic) emphasisRanges.push({ start, end: start + [...value].length });
  });
  return { title, text, emphasisRanges };
}

const SAMPLE_BOOK = {
  id: 'sample-quiet-hour',
  title: 'The Example Text',
  author: 'A sample reader',
  chapters: [
    sampleChapter('The First Chapter', [
      { text: 'Lorem ipsum', italic: true },
      ' dolor sit amet, consectetur adipiscing elit. Integer vitae sem at arcu facilisis luctus. ',
      { text: 'Praesent euismod', italic: true },
      ', justo at interdum feugiat, nibh neque posuere erat, vitae tincidunt lorem nibh sed erat.'
    ]),
    sampleChapter('The Second Chapter', [
      'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium ',
      { text: 'doloremque laudantium', italic: true },
      '. Totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.'
    ]),
    sampleChapter('The Third Chapter', [
      'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. ',
      { text: 'Neque porro quisquam est', italic: true },
      ', qui dolorem ipsum quia dolor sit amet.'
    ])
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
  toastId: null,
  fileDropDepth: 0,
  plots: {}
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
    uploadDropzone: document.querySelector('#upload-dropzone'),
    fileDropOverlay: document.querySelector('#file-drop-overlay'),
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
    statsChart: document.querySelector('#stats-chart'),
    statsChartEmpty: document.querySelector('#stats-chart-empty'),
    chapterResults: document.querySelector('#chapter-results'),
    chapterResultsTitle: document.querySelector('#chapter-results-title'),
    resultsWpm: document.querySelector('#results-wpm'),
    resultsAccuracy: document.querySelector('#results-accuracy'),
    resultsRawWpm: document.querySelector('#results-raw-wpm'),
    resultsTime: document.querySelector('#results-time'),
    chapterSpeedChart: document.querySelector('#chapter-speed-chart'),
    chapterAccuracyChart: document.querySelector('#chapter-accuracy-chart'),
    chapterResultsClose: document.querySelector('#chapter-results-close'),
    chapterResultsNext: document.querySelector('#chapter-results-next'),
    resetSettings: document.querySelector('#reset-settings')
  });

  loadState();
  bindEvents();
  applySettings();
  renderBook();
  renderStats();
});

function bindEvents() {
  els.epubInput.addEventListener('change', () => handleEpubUpload(els.epubInput.files[0]));
  document.addEventListener('dragenter', handleFileDragEnter);
  document.addEventListener('dragover', handleFileDragOver);
  document.addEventListener('dragleave', handleFileDragLeave);
  document.addEventListener('drop', handleFileDrop);
  window.addEventListener('dragend', resetFileDropState);
  els.uploadDropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    els.uploadDropzone.classList.add('is-dragging');
  });
  els.uploadDropzone.addEventListener('dragleave', () => els.uploadDropzone.classList.remove('is-dragging'));
  els.resetButton.addEventListener('click', resetChapter);
  els.resetSettings.addEventListener('click', resetSettings);
  els.chapterResultsClose.addEventListener('click', hideChapterResults);
  els.chapterResultsNext.addEventListener('click', openNextChapter);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (!els.statsView.hidden) renderStatsChart();
    }).observe(els.statsChart);
    new ResizeObserver(() => {
      if (!els.chapterResults.hidden) renderChapterResultCharts();
    }).observe(els.chapterResults);
  }
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
  window.addEventListener('pagehide', persist);
}

function isFileDrag(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  const items = Array.from(event.dataTransfer?.items || []);
  return types.includes('Files') || items.some((item) => item.kind === 'file');
}

function setFileDropVisible(visible) {
  els.fileDropOverlay.classList.toggle('is-visible', visible);
  els.fileDropOverlay.setAttribute('aria-hidden', String(!visible));
}

function resetFileDropState() {
  state.fileDropDepth = 0;
  setFileDropVisible(false);
  els.uploadDropzone.classList.remove('is-dragging');
}

function handleFileDragEnter(event) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  state.fileDropDepth += 1;
  setFileDropVisible(true);
}

function handleFileDragOver(event) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  setFileDropVisible(true);
}

function handleFileDragLeave(event) {
  if (!isFileDrag(event)) return;
  state.fileDropDepth = Math.max(0, state.fileDropDepth - 1);
  if (!state.fileDropDepth) resetFileDropState();
}

function handleFileDrop(event) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  resetFileDropState();
  handleEpubUpload(event.dataTransfer.files[0]);
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
    bookState.chapters[index] = { position: 0, statuses: [], attempts: 0, correct: 0, correctEvents: 0, incorrectEvents: 0, elapsedMs: 0, completed: false, events: [], eventCount: 0, extraCharacters: [] };
  }
  bookState.chapters[index].statuses = bookState.chapters[index].statuses || [];
  bookState.chapters[index].events = bookState.chapters[index].events || [];
  bookState.chapters[index].extraCharacters = bookState.chapters[index].extraCharacters || [];
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
  const characters = getChapterCharacters();
  els.chapterKicker.textContent = `Chapter ${String(state.currentChapter + 1).padStart(2, '0')}`;
  els.chapterTitle.textContent = chapter.title;
  els.passage.replaceChildren();
  state.characterElements = [];
  state.currentCharacter = -1;
  const fragment = document.createDocumentFragment();
  const emphasisRanges = chapter.emphasisRanges || [];
  let emphasisRangeIndex = 0;
  const imagesByPosition = new Map();
  (chapter.images || []).forEach((image) => {
    const images = imagesByPosition.get(image.index) || [];
    images.push(image);
    imagesByPosition.set(image.index, images);
  });
  const extraCharacters = chapterState.extraCharacters || [];
  const extrasByPosition = new Map();
  extraCharacters.forEach((extra) => {
    const extras = extrasByPosition.get(extra.index) || [];
    extras.push(extra.character);
    extrasByPosition.set(extra.index, extras);
  });
  characters.forEach((character, index) => {
    appendPassageImages(fragment, imagesByPosition.get(index));
    extrasByPosition.get(index)?.forEach((extra) => {
      const extraSpan = document.createElement('span');
      extraSpan.className = 'is-extra is-incorrect';
      extraSpan.textContent = extra;
      fragment.appendChild(extraSpan);
    });
    const span = document.createElement('span');
    span.textContent = character;
    if (index === 0 || characters[index - 1] === '\n') span.classList.add('is-paragraph-start');
    while (emphasisRangeIndex < emphasisRanges.length && index >= emphasisRanges[emphasisRangeIndex].end) emphasisRangeIndex += 1;
    if (emphasisRanges[emphasisRangeIndex]?.start <= index) span.classList.add('is-emphasis');
    state.characterElements.push(span);
    fragment.appendChild(span);
  });
  appendPassageImages(fragment, imagesByPosition.get(characters.length));
  els.passage.appendChild(fragment);
  advanceToFairCharacter(chapterState);
  for (let index = 0; index < chapterState.position; index += 1) setCharacterStatus(index, chapterState.statuses[index] || 'skipped');
  moveCursor(chapterState.completed ? -1 : chapterState.position);
  els.typingHelp.classList.toggle('is-hidden', chapterState.position > 0 || chapterState.completed);
  if (chapterState.position >= characters.length && !chapterState.completed) finishChapter();
  updateSessionMetrics();
}

function appendPassageImages(fragment, images) {
  (images || []).forEach((image) => {
    const figure = document.createElement('figure');
    figure.className = 'passage-image';
    const imageElement = document.createElement('img');
    imageElement.src = image.src;
    imageElement.alt = image.alt || '';
    imageElement.loading = 'lazy';
    figure.appendChild(imageElement);
    fragment.appendChild(figure);
  });
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
  if (index >= 0) {
    const element = state.characterElements[index];
    element?.classList.add('is-current');
    element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }
}

function advanceToFairCharacter(chapterState) {
  const text = getChapterCharacters();
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
  const total = book.chapters.reduce((sum, chapter) => sum + [...chapter.text].length, 0);
  const completed = book.chapters.reduce((sum, chapter, index) => {
    const length = [...chapter.text].length;
    return sum + Math.min(state.bookProgress[book.id]?.chapters?.[index]?.position || 0, length);
  }, 0);
  element.textContent = `${total ? Math.round((completed / total) * 100) : 0}%`;
}

function selectBook(bookId) {
  const book = state.books.find((candidate) => candidate.id === bookId);
  if (!book || book.id === state.book.id) return;
  hideChapterResults();
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
    hideChapterResults();
    focusTyping();
    return;
  }
  hideChapterResults();
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
  if (!els.chapterResults.hidden && event.key === 'Escape') {
    event.preventDefault();
    hideChapterResults();
    return;
  }
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
  const characters = getChapterCharacters();
  const chapterState = getChapterState();
  if (chapterState.completed) return;
  const before = chapterState.position;
  advanceToFairCharacter(chapterState);
  if (chapterState.position >= characters.length) {
    finishChapter();
    return;
  }
  if (!state.startedAt) {
    state.startedAt = Date.now();
    startTimer();
  }
  if (character === ' ' && characters[chapterState.position] !== ' ') {
    alignToNextSpace(characters, chapterState);
    if (chapterState.position >= characters.length) {
      finishChapter();
      return;
    }
  }
  const expected = characters[chapterState.position];
  if (/\s/.test(expected) && !/\s/.test(character)) {
    chapterState.extraCharacters = chapterState.extraCharacters || [];
    chapterState.extraCharacters.push({ index: chapterState.position, character });
    chapterState.incorrectEvents += 1;
    chapterState.attempts += 1;
    recordTypingEvent(chapterState, { at: Date.now(), index: chapterState.position, key: character, expected, skipped: 0, correct: false, extra: true });
    renderChapter();
    renderBookProgress();
    persistSoon();
    return;
  }
  const isCorrect = character === expected;
  chapterState.statuses[chapterState.position] = isCorrect ? 'correct' : 'incorrect';
  setCharacterStatus(chapterState.position, isCorrect ? 'correct' : 'incorrect');
  if (isCorrect) chapterState.correctEvents += 1;
  else chapterState.incorrectEvents += 1;
  recordTypingEvent(chapterState, { at: Date.now(), index: chapterState.position, key: character, expected, skipped: chapterState.position - before, correct: isCorrect });
  chapterState.position += 1;
  chapterState.attempts += 1;
  if (isCorrect) chapterState.correct += 1;
  advanceToFairCharacter(chapterState);
  moveCursor(chapterState.position >= characters.length ? -1 : chapterState.position);
  if (chapterState.position >= characters.length) finishChapter();
  els.typingHelp.classList.add('is-hidden');
  updateSessionMetrics();
  renderBookProgress();
  persistSoon();
}

function alignToNextSpace(characters, chapterState) {
  let index = chapterState.position;
  while (index < characters.length) {
    if (characters[index] === ' ' && isFairCharacterAt(characters, index)) {
      chapterState.position = index;
      return;
    }
    if (isFairCharacterAt(characters, index)) {
      chapterState.statuses[index] = 'incorrect';
      setCharacterStatus(index, 'incorrect');
      chapterState.incorrectEvents += 1;
    } else {
      chapterState.statuses[index] = 'skipped';
      setCharacterStatus(index, 'skipped');
    }
    index += 1;
  }
  chapterState.position = index;
}

function recordTypingEvent(chapterState, event) {
  chapterState.events = chapterState.events || [];
  chapterState.eventCount = chapterState.eventCount || 0;
  if (chapterState.events.length < 5000) chapterState.events.push(event);
  else chapterState.events[chapterState.eventCount % 5000] = event;
  chapterState.eventCount += 1;
}

function stepBack() {
  const chapterState = getChapterState();
  if (chapterState.completed) return;
  chapterState.extraCharacters = chapterState.extraCharacters || [];
  for (let index = chapterState.extraCharacters.length - 1; index >= 0; index -= 1) {
    if (chapterState.extraCharacters[index].index === chapterState.position) {
      chapterState.extraCharacters.splice(index, 1);
      renderChapter();
      renderBookProgress();
      persistSoon();
      return;
    }
  }
  if (!chapterState.position) return;
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
    bookId: state.book.id,
    bookTitle: state.book.title,
    chapterTitle: state.book.chapters[state.currentChapter].title,
    wpm: metrics.wpm,
    rawWpm: metrics.rawWpm,
    accuracy: metrics.accuracy,
    characters: chapterState.attempts,
    date: new Date().toISOString()
  });
  state.history = state.history.slice(0, HISTORY_LIMIT);
  persist();
  renderBookList();
  renderStats();
  showChapterResults(metrics);
}

function resetChapter() {
  hideChapterResults();
  stopTimer();
  const bookState = getBookState();
  bookState.chapters[state.currentChapter] = { position: 0, statuses: [], attempts: 0, correct: 0, correctEvents: 0, incorrectEvents: 0, elapsedMs: 0, completed: false, events: [], eventCount: 0, extraCharacters: [] };
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
  const characters = getChapterCharacters();
  const chapterState = getChapterState();
  const metrics = getTypingMetrics(chapterState);
  const percent = characters.length ? (chapterState.position / characters.length) * 100 : 0;
  els.liveWpm.textContent = metrics.wpm;
  els.liveRawWpm.textContent = metrics.rawWpm;
  els.accuracyValue.textContent = `${metrics.accuracy}%`;
  els.timeValue.textContent = formatTime(metrics.elapsedMs);
  els.characterCount.textContent = `${chapterState.position} / ${characters.length} characters`;
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
    hideChapterResults();
    stopTimer();
    els.mobileCapture.blur();
  }
  if (stats) requestAnimationFrame(renderStats);
}

function renderStats() {
  const completed = state.history;
  const best = completed.reduce((value, item) => Math.max(value, item.wpm), 0);
  const average = completed.length ? Math.round(completed.reduce((sum, item) => sum + item.accuracy, 0) / completed.length) : 0;
  els.bestWpm.textContent = best;
  els.averageAccuracy.textContent = `${average}%`;
  els.sessionsFinished.textContent = completed.length;
  els.charactersTyped.textContent = completed.reduce((sum, item) => sum + item.characters, 0).toLocaleString();
  renderStatsChart(true);
}

function historyBookKey(item) {
  return item.bookId || item.bookTitle || 'unknown';
}

function colorForKey(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return BOOK_PALETTE[(hash >>> 0) % BOOK_PALETTE.length];
}

function destroyPlot(key) {
  state.plots[key]?.destroy();
  state.plots[key] = null;
}

function createUPlot(target, data, series, options = {}) {
  const width = Math.max(1, Math.floor(target.clientWidth));
  return new uPlot({
    width,
    height: options.height || 220,
    class: 'epub-uplot',
    padding: [8, 12, 0, 0],
    legend: { show: Boolean(options.legend) },
    scales: options.scales || {},
    axes: [
      {
        stroke: '#5b6477',
        grid: { stroke: 'rgba(23, 34, 59, 0.12)' },
        ticks: { stroke: 'rgba(23, 34, 59, 0.12)' },
        font: '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        ...(options.xAxis || {})
      },
      {
        stroke: '#5b6477',
        grid: { stroke: 'rgba(23, 34, 59, 0.12)' },
        ticks: { stroke: 'rgba(23, 34, 59, 0.12)' },
        font: '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        ...(options.yAxis || {})
      }
    ],
    series
  }, data, target);
}

function renderStatsChart(force = false) {
  if (els.statsView.hidden) return;
  const sessions = state.history.filter((item) => item.date && Number.isFinite(item.wpm)).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!sessions.length || typeof uPlot !== 'function') {
    destroyPlot('stats');
    els.statsChart.hidden = true;
    els.statsChartEmpty.hidden = false;
    return;
  }
  els.statsChartEmpty.hidden = true;
  els.statsChart.hidden = false;
  const width = Math.floor(els.statsChart.clientWidth);
  if (width < 40) return;
  if (!force && state.plots.stats && state.plots.stats.width === width) return;
  destroyPlot('stats');
  const groups = [];
  const indexByKey = new Map();
  sessions.forEach((item) => {
    const key = historyBookKey(item);
    if (indexByKey.has(key)) return;
    indexByKey.set(key, groups.length);
    groups.push({ key, label: item.bookTitle || 'Unknown book', color: colorForKey(key) });
  });
  const xs = sessions.map((item) => Date.parse(item.date) / 1000);
  const data = [xs, ...groups.map((group) => sessions.map((item) => (historyBookKey(item) === group.key ? item.wpm : null)))];
  const series = [
    {},
    ...groups.map((group) => ({
      label: group.label,
      stroke: group.color,
      width: 2,
      spanGaps: true,
      points: { show: true, size: 7, width: 1, stroke: group.color, fill: group.color }
    }))
  ];
  state.plots.stats = createUPlot(els.statsChart, data, series, {
    height: 280,
    legend: true,
    scales: {
      x: { time: true },
      y: { range: (u, min, max) => [0, Math.max((Number.isFinite(max) ? max : 0) * 1.15, 20)] }
    },
    yAxis: { values: (u, splits) => splits.map((value) => String(Math.round(value))) }
  });
}

function getOrderedEvents(chapterState) {
  const events = chapterState.events || [];
  if (!events.length) return [];
  const count = chapterState.eventCount || events.length;
  if (count <= events.length) return events.slice();
  const start = count % events.length;
  return events.slice(start).concat(events.slice(0, start));
}

function downsampleColumns(columns, maxPoints) {
  const length = columns[0].length;
  if (length <= maxPoints) return columns;
  const step = (length - 1) / (maxPoints - 1);
  return columns.map((column) => {
    const sampled = [];
    for (let index = 0; index < maxPoints; index += 1) sampled.push(column[Math.round(index * step)]);
    return sampled;
  });
}

function buildChapterProgressSeries(chapterState) {
  const events = getOrderedEvents(chapterState);
  if (events.length < 2) return null;
  const startedAt = events[0].at;
  let correctKeys = 0;
  let totalKeys = 0;
  let correctChars = 0;
  const xs = [];
  const wpm = [];
  const accuracy = [];
  events.forEach((event, index) => {
    totalKeys += 1;
    if (event.correct) {
      correctKeys += 1;
      if (!event.extra) correctChars += 1;
    }
    const elapsedMs = event.at - startedAt;
    if (elapsedMs < 1000 && index !== events.length - 1) return;
    const minutes = Math.max(elapsedMs, 1) / 60000;
    xs.push(elapsedMs / 1000);
    wpm.push((correctChars / 5) / minutes);
    accuracy.push((correctKeys / totalKeys) * 100);
  });
  if (xs.length < 2) return null;
  return downsampleColumns([xs, wpm, accuracy], 240);
}

function renderChapterResultCharts() {
  if (els.chapterResults.hidden || typeof uPlot !== 'function') return;
  const width = Math.floor(els.chapterSpeedChart.clientWidth);
  if (width < 40) return;
  if (state.plots.chapterSpeed && state.plots.chapterSpeed.width === width) return;
  destroyPlot('chapterSpeed');
  destroyPlot('chapterAccuracy');
  const series = buildChapterProgressSeries(getChapterState());
  if (!series) return;
  const [xs, wpm, accuracy] = series;
  const showPoints = xs.length < 12;
  state.plots.chapterSpeed = createUPlot(els.chapterSpeedChart, [xs, wpm], [
    {},
    { label: 'wpm', stroke: '#e9785d', width: 2, points: { show: showPoints, size: 5, width: 0 } }
  ], {
    height: 180,
    scales: { y: { range: (u, min, max) => [0, Math.max((Number.isFinite(max) ? max : 0) * 1.15, 20)] } },
    xAxis: { values: (u, splits) => splits.map((value) => formatTime(value * 1000)) },
    yAxis: { values: (u, splits) => splits.map((value) => String(Math.round(value))) }
  });
  state.plots.chapterAccuracy = createUPlot(els.chapterAccuracyChart, [xs, accuracy], [
    {},
    { label: 'accuracy', stroke: '#2f6f7e', width: 2, points: { show: showPoints, size: 5, width: 0 } }
  ], {
    height: 180,
    scales: { y: { range: [0, 100] } },
    xAxis: { values: (u, splits) => splits.map((value) => formatTime(value * 1000)) },
    yAxis: { values: (u, splits) => splits.map((value) => `${Math.round(value)}%`) }
  });
}

function showChapterResults(metrics) {
  const chapter = state.book.chapters[state.currentChapter];
  els.chapterResultsTitle.textContent = chapter.title;
  els.resultsWpm.textContent = metrics.wpm;
  els.resultsRawWpm.textContent = metrics.rawWpm;
  els.resultsAccuracy.textContent = `${metrics.accuracy}%`;
  els.resultsTime.textContent = formatTime(metrics.elapsedMs);
  els.chapterResultsNext.hidden = state.currentChapter >= state.book.chapters.length - 1;
  els.chapterResults.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(renderChapterResultCharts));
  els.chapterResultsClose.focus();
}

function hideChapterResults() {
  if (els.chapterResults.hidden) return;
  destroyPlot('chapterSpeed');
  destroyPlot('chapterAccuracy');
  els.chapterResults.hidden = true;
}

function openNextChapter() {
  hideChapterResults();
  if (state.currentChapter < state.book.chapters.length - 1) selectChapter(state.currentChapter + 1);
}

async function handleEpubUpload(file) {
  if (!file) return;
  if (!/\.epub$/i.test(file.name) && file.type !== 'application/epub+zip') {
    showToast('Please choose an EPUB file.');
    els.epubInput.value = '';
    return;
  }
  hideChapterResults();
  stopTimer();
  persist();
  try {
    showToast('Opening your EPUB…');
    const book = await parseEpub(file);
    const existingIndex = state.books.findIndex((candidate) => candidate.id === book.id);
    if (existingIndex >= 0) state.books[existingIndex] = book;
    else state.books.push(book);
    state.book = book;
    state.currentChapter = Math.max(0, Math.min(Number(state.bookProgress[book.id]?.currentChapter) || 0, book.chapters.length - 1));
    renderBook();
    showToast(`${book.chapters.length} chapters loaded.`);
  } catch (error) {
    console.error(error);
    showToast('That EPUB could not be opened. Try another file.');
  } finally {
    els.epubInput.value = '';
  }
}

async function parseEpub(file) {
  if (typeof ePub !== 'function') throw new Error('epub.js did not load.');
  const book = ePub(await file.arrayBuffer());
  await book.ready;
  const metadata = await book.loaded.metadata;
  const navigation = await book.loaded.navigation;
  const toc = flattenNavigation(navigation?.toc || []);
  const chapters = [];
  try {
    for (const section of book.spine.spineItems) {
      if (!section.linear || (section.properties || []).includes('nav')) continue;
      const contents = await section.load(book.load.bind(book));
      const body = contents.querySelector('body');
      const titleNode = contents.querySelector('h1, h2, h3');
      const displayText = extractDisplayText(body || contents);
      const text = displayText.text;
      const images = await loadChapterImages(book, section, displayText.images);
      const isReadable = isReadableChapter(text);
      const isImagePage = images.length > 0 && !isReadable;
      let title = findTocTitle(book, toc, section.href) || titleNode?.textContent.trim() || 'Untitled';
      if (isImagePage && title === 'Untitled') title = 'Image';
      if ((isReadable || isImagePage) && !isFrontMatter(title, text)) chapters.push({ title, text, emphasisRanges: displayText.emphasisRanges, images });
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

async function loadChapterImages(book, section, imageAnchors = []) {
  const images = [];
  for (const image of imageAnchors) {
    try {
      const source = image.source.trim();
      const resource = resolveSectionResource(book, section, source);
      const src = /^(?:data|blob|https?):/i.test(resource) ? resource : URL.createObjectURL(await book.archive.request(book.resolve(resource), 'blob'));
      images.push({ index: image.index, src, alt: image.alt });
    } catch (error) {
      console.warn('Unable to load EPUB image.', error);
    }
  }
  return images;
}

function resolveSectionResource(book, section, source) {
  if (/^(?:data|blob|https?):/i.test(source)) return source.split('#')[0];
  const sectionUrl = new URL(book.resolve(section.href, true), window.location.href);
  return new URL(source.split('#')[0], sectionUrl).pathname;
}

function flattenNavigation(items, result = []) {
  items.forEach((item) => {
    result.push(item);
    flattenNavigation(item.subitems || [], result);
  });
  return result;
}

function findTocTitle(book, toc, sectionHref) {
  const target = canonicalEpubHref(book, sectionHref);
  if (!target) return '';
  const item = toc.find((entry) => canonicalEpubHref(book, entry.href) === target);
  return item?.label?.trim() || '';
}

function canonicalEpubHref(book, href) {
  const path = String(href || '').split(/[?#]/, 1)[0];
  if (!path) return '';
  try {
    return decodeURIComponent(book.canonical(path));
  } catch {
    return path;
  }
}

function isReadableChapter(text) {
  return text.replace(/\s/g, '').length >= MIN_CHAPTER_CHARACTERS;
}

function isFrontMatter(title, text) {
  const titleHint = /^(copyright|contents|table of contents|title page|also by|about the author|dedication|acknowledg(e)?ments?)$/i.test(title.trim());
  const metadataHint = /\b(isbn(?:-1[03])?|copyright|all rights reserved|library of congress|cataloging[- ]in[- ]publication|published by)\b/i.test(text.slice(0, 1600));
  return titleHint || (metadataHint && text.length < 2200);
}

function extractDisplayText(body) {
  const blockElements = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL']);
  const italicElements = new Set(['CITE', 'DFN', 'EM', 'I', 'VAR']);
  const characters = [];
  const images = [];

  function appendText(value, emphasized = false) {
    [...value].forEach((character) => characters.push({ character, emphasized }));
  }

  function collect(node, emphasized = false) {
    if (node.nodeType === 3) {
      appendText(node.nodeValue || '', emphasized);
      return;
    }
    if (node.nodeType === 9) {
      [...node.childNodes].forEach((child) => collect(child, emphasized));
      return;
    }
    if (node.nodeType !== 1) return;
    const tagName = node.tagName.toUpperCase();
    if (tagName === 'HEAD' || tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT') return;
    if (tagName === 'IMG' || tagName === 'IMAGE') {
      const source = node.getAttribute('src') || node.getAttribute('href') || node.getAttribute('xlink:href');
      if (source) images.push({ index: characters.length, source, alt: node.getAttribute('alt') || '' });
      return;
    }
    if (tagName === 'BR' || tagName === 'HR') {
      appendText('\n');
      return;
    }
    const nodeEmphasized = emphasized || isItalicElement(node, italicElements);
    const start = characters.length;
    [...node.childNodes].forEach((child) => collect(child, nodeEmphasized));
    const lastCharacter = characters[characters.length - 1];
    if (blockElements.has(tagName) && characters.length > start && lastCharacter.character !== '\n') appendText('\n');
  }

  collect(body);
  let leadingNewlines = 0;
  while (characters[0]?.character === '\n') {
    characters.shift();
    leadingNewlines += 1;
  }
  if (leadingNewlines) images.forEach((image) => { image.index = Math.max(0, image.index - leadingNewlines); });
  while (characters[characters.length - 1]?.character === '\n') characters.pop();

  const emphasisRanges = [];
  let rangeStart = null;
  characters.forEach((entry, index) => {
    if (entry.emphasized && rangeStart === null) rangeStart = index;
    if (!entry.emphasized && rangeStart !== null) {
      emphasisRanges.push({ start: rangeStart, end: index });
      rangeStart = null;
    }
  });
  if (rangeStart !== null) emphasisRanges.push({ start: rangeStart, end: characters.length });

  return { text: characters.map((entry) => entry.character).join(''), emphasisRanges, images };
}

function isItalicElement(node, italicElements) {
  if (italicElements.has(node.tagName.toUpperCase())) return true;
  const style = node.getAttribute('style') || '';
  const className = typeof node.className === 'string' ? node.className : '';
  return /font-style\s*:\s*(?:italic|oblique)/i.test(style) || /(?:^|\s)(?:emphasis|italic|italics)(?:\s|$)/i.test(className);
}

function getChapterCharacters(index = state.currentChapter) {
  return [...state.book.chapters[index].text];
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

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(state.toastId);
  state.toastId = setTimeout(() => els.toast.classList.remove('is-visible'), 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
}
