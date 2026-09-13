import { state, persist, ensureChapterState } from './state.js';
import { els } from './dom.js';
import { escapeHtml, formatTime, getChapterCharacters, historyBookKey, colorForKey } from './utils.js';
import { appendPassageImages, advanceToFairCharacter, moveCursor, setCharacterStatus } from './passage.js';
import { analyzeKeystrokes, sampleProgressSeries, accuracyYRange, getTypingMetrics } from './metrics.js';

export function applySettings() {
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

export function renderBook() {
  renderBookList();
  renderChapter();
  renderBookProgress();
}

export function renderBookList() {
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

export function renderChapter() {
  const chapter = state.book.chapters[state.currentChapter];
  const chapterState = ensureChapterState();
  const characters = getChapterCharacters(state.book, state.currentChapter);
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
  updateSessionMetrics();
}

export function renderBookProgress() {
  updateBookProgress(state.book, state.bookProgressElements.get(state.book.id));
}

export function updateBookProgress(book, element) {
  if (!element) return;
  const total = book.chapters.reduce((sum, chapter) => sum + [...chapter.text].length, 0);
  const completed = book.chapters.reduce((sum, chapter, index) => {
    const length = [...chapter.text].length;
    return sum + Math.min(state.bookProgress[book.id]?.chapters?.[index]?.position || 0, length);
  }, 0);
  element.textContent = `${total ? Math.round((completed / total) * 100) : 0}%`;
}

export function selectBook(bookId) {
  const book = state.books.find((candidate) => candidate.id === bookId);
  if (!book || book.id === state.book.id) return;
  hideChapterResults();
  stopTimer();
  state.lastKeyAt = null;
  persist();
  state.book = book;
  state.currentChapter = Math.max(0, Math.min(Number(state.bookProgress[book.id]?.currentChapter) || 0, book.chapters.length - 1));
  persist();
  renderBook();
  focusTyping();
}

export function selectChapterForBook(bookId, index) {
  setView('practice');
  if (bookId !== state.book.id) selectBook(bookId);
  selectChapter(index);
}

export function selectChapter(index) {
  if (index === state.currentChapter) {
    hideChapterResults();
    focusTyping();
    return;
  }
  hideChapterResults();
  stopTimer();
  state.lastKeyAt = null;
  persist();
  state.currentChapter = index;
  persist();
  renderBookList();
  renderChapter();
  renderBookProgress();
  focusTyping();
}

export function focusTyping() {
  els.mobileCapture.focus({ preventScroll: true });
}

export function startTimer() {
  if (state.timerId) return;
  state.timerId = window.setInterval(updateSessionMetrics, 500);
}

export function stopTimer() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = null;
  state.startedAt = null;
  updateSessionMetrics();
}

export function updateSessionMetrics() {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  const metrics = getTypingMetrics(chapterState);
  const percent = characters.length ? (chapterState.position / characters.length) * 100 : 0;
  els.liveWpm.textContent = metrics.emaWpm;
  els.liveAvgWpm.textContent = metrics.wpm;
  els.accuracyValue.textContent = `${metrics.accuracy}%`;
  els.timeValue.textContent = formatTime(metrics.elapsedMs);
  els.characterCount.textContent = `${chapterState.position} / ${characters.length} characters`;
  els.typingProgressFill.style.width = `${percent}%`;
  if (els.typingProgress) {
    els.typingProgress.setAttribute('aria-valuenow', String(Math.round(percent)));
  }
}

export function setView(view) {
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

export function renderStats() {
  const completed = state.history;
  const best = completed.reduce((value, item) => Math.max(value, item.wpm), 0);
  const average = completed.length ? Math.round(completed.reduce((sum, item) => sum + item.accuracy, 0) / completed.length) : 0;
  els.bestWpm.textContent = best;
  els.averageAccuracy.textContent = `${average}%`;
  els.sessionsFinished.textContent = completed.length;
  els.charactersTyped.textContent = completed.reduce((sum, item) => sum + item.characters, 0).toLocaleString();
  renderStatsChart(true);
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

export function renderStatsChart(force = false) {
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

export function renderChapterResultCharts() {
  if (els.chapterResults.hidden || typeof uPlot !== 'function') return;
  const width = Math.floor(els.chapterSpeedChart.clientWidth);
  if (width < 40) return;
  if (state.plots.chapterSpeed && state.plots.chapterSpeed.width === width) return;
  destroyPlot('chapterSpeed');
  destroyPlot('chapterAccuracy');
  const analysis = analyzeKeystrokes(ensureChapterState());
  if (!analysis.series) return;
  const series = sampleProgressSeries(analysis.series, 240);
  const showPoints = series.xs.length < 12;
  const wordAxis = { values: (u, splits) => splits.map((value) => String(Math.round(value))) };
  state.plots.chapterSpeed = createUPlot(els.chapterSpeedChart, [series.xs, series.avgSeries, series.emaSeries], [
    {},
    { label: 'avg', stroke: '#2f6f7e', width: 2, points: { show: showPoints, size: 5, width: 0 } },
    { label: 'ema', stroke: '#e9785d', width: 2, points: { show: showPoints, size: 5, width: 0 } }
  ], {
    height: 180,
    legend: true,
    scales: { y: { range: (u, min, max) => [0, Math.max((Number.isFinite(max) ? max : 0) * 1.15, 20)] } },
    xAxis: wordAxis,
    yAxis: { values: (u, splits) => splits.map((value) => String(Math.round(value))) }
  });
  state.plots.chapterAccuracy = createUPlot(els.chapterAccuracyChart, [series.xs, series.accuracySeries, series.missSeries], [
    {},
    { label: 'accuracy', stroke: '#2f6f7e', width: 2, points: { show: false } },
    { label: 'mistakes', stroke: '#e9785d', width: 0, paths: () => null, points: { show: true, size: 6, width: 0, fill: '#e9785d' } }
  ], {
    height: 180,
    legend: true,
    scales: { y: { range: accuracyYRange(series.accuracySeries) } },
    xAxis: wordAxis,
    yAxis: { values: (u, splits) => splits.map((value) => `${Math.round(value)}%`) }
  });
}

export function showChapterResults(metrics) {
  const chapter = state.book.chapters[state.currentChapter];
  els.chapterResultsTitle.textContent = chapter.title;
  els.resultsWpm.textContent = metrics.wpm;
  els.resultsEmaWpm.textContent = metrics.emaWpm;
  els.resultsAccuracy.textContent = `${metrics.accuracy}%`;
  els.resultsTime.textContent = formatTime(metrics.elapsedMs);
  els.chapterResultsNext.hidden = state.currentChapter >= state.book.chapters.length - 1;
  els.chapterResults.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(renderChapterResultCharts));
  els.chapterResultsClose.focus();
}

export function hideChapterResults() {
  if (els.chapterResults.hidden) return;
  destroyPlot('chapterSpeed');
  destroyPlot('chapterAccuracy');
  els.chapterResults.hidden = true;
}

export function openNextChapter() {
  hideChapterResults();
  if (state.currentChapter < state.book.chapters.length - 1) selectChapter(state.currentChapter + 1);
}

export function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(state.toastId);
  state.toastId = setTimeout(() => els.toast.classList.remove('is-visible'), 2600);
}
