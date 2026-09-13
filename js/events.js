import { DEFAULT_SETTINGS, CHARSET_PRESETS } from './config.js';
import { state, persist, persistSoon } from './state.js';
import { els } from './dom.js';
import { hashArrayBuffer } from './utils.js';
import { applySettings, renderBook, focusTyping, showToast, setView, hideChapterResults, stopTimer, selectBook, selectChapter, renderStatsChart, renderChapterResultCharts } from './ui.js';
import { typeCharacter, stepBack, resetChapter, refreshTypingPosition, handleKeyCharacter } from './typing.js';
import { isInputCharacter } from './passage.js';
import { parseEpub, rememberBook, revokeBookImages } from './epub.js';

export function bindEvents() {
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
  els.resetButton.addEventListener('click', () => {
    resetChapter();
    focusTyping();
  });
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

function handleKeydown(event) {
  if (!els.chapterResults.hidden && event.key === 'Escape') {
    event.preventDefault();
    hideChapterResults();
    return;
  }
  if (document.activeElement !== els.typingSurface && document.activeElement !== els.mobileCapture) return;
  if (event.key === 'Escape') {
    event.preventDefault();
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
  if (handleKeyCharacter(event.key, event.isComposing)) {
    event.preventDefault();
  }
}

function handleMobileInput(event) {
  const value = event.target.value;
  if (!value) return;
  [...value].forEach((character) => {
    if (isInputCharacter(character)) typeCharacter(character);
  });
  event.target.value = '';
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
    const buffer = await file.arrayBuffer();
    const hash = await hashArrayBuffer(buffer);
    const duplicate = state.books.find((candidate) => candidate.hash === hash);
    if (duplicate) {
      if (duplicate.id !== state.book.id) {
        selectBook(duplicate.id);
      } else {
        focusTyping();
      }
      showToast('This EPUB is already in your library.');
      return;
    }
    const remembered = state.bookIndex[hash];
    const book = await parseEpub(file, buffer, hash, remembered?.id);
    const existingIndex = state.books.findIndex((candidate) => candidate.id === book.id);
    const oldBook = existingIndex >= 0 ? state.books[existingIndex] : null;
    if (existingIndex >= 0) {
      state.books[existingIndex] = book;
    } else {
      state.books.push(book);
    }
    state.book = book;
    state.currentChapter = Math.max(0, Math.min(Number(state.bookProgress[book.id]?.currentChapter) || 0, book.chapters.length - 1));
    rememberBook(book);
    persist();
    renderBook();
    if (oldBook) revokeBookImages(oldBook);
    showToast(remembered ? `Welcome back to “${book.title}”.` : `${book.chapters.length} chapters loaded.`);
  } catch (error) {
    console.error(error);
    showToast('That EPUB could not be opened. Try another file.');
  } finally {
    els.epubInput.value = '';
  }
}

function openNextChapter() {
  hideChapterResults();
  if (state.currentChapter < state.book.chapters.length - 1) {
    selectChapter(state.currentChapter + 1);
  }
}
