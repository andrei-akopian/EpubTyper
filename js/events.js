import { DEFAULT_SETTINGS, CHARSET_PRESETS } from './config.js';
import { state, persist, persistSoon } from './state.js';
import { els } from './dom.js';
import { hashArrayBuffer, SAMPLE_BOOK } from './utils.js';
import { applySettings, renderBook, focusTyping, showToast, setView, hideChapterResults, stopTimer, selectBook, selectChapter, renderStatsChart, renderChapterResultCharts } from './ui.js';
import {
  typeCharacter,
  stepBack,
  resetChapter,
  refreshTypingPosition,
  handleKeyCharacter,
  moveToPosition,
  moveByCharacters,
  moveByWords,
  skipParagraph,
  previousParagraph,
  moveToBeginningOfParagraph,
  moveToEndOfParagraph
} from './typing.js';
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
  els.skipParagraphButton?.addEventListener('click', () => {
    skipParagraph();
    focusTyping();
  });
  els.resetSettings.addEventListener('click', resetSettings);
  els.chapterResultsClose.addEventListener('click', hideChapterResults);
  els.chapterResultsNext.addEventListener('click', openNextChapter);
  els.mobileWarningDismiss?.addEventListener('click', () => els.mobileWarning.classList.add('is-dismissed'));
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (!els.statsView.hidden) renderStatsChart();
    }).observe(els.statsChart);
    new ResizeObserver(() => {
      if (!els.chapterResults.hidden) renderChapterResultCharts();
    }).observe(els.chapterResults);
  }
  els.passage.addEventListener('click', handlePassageClick);
  els.typingSurface.addEventListener('click', handleSurfaceClick);
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
  if (!els.chapterResults.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideChapterResults();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      openNextChapter();
      return;
    }
    return;
  }
  if (document.activeElement !== els.typingSurface && document.activeElement !== els.mobileCapture) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    persist();
    showToast('Progress saved.');
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (event.altKey || event.ctrlKey || event.metaKey) {
      moveByWords(-1);
    } else {
      moveByCharacters(-1);
    }
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    if (event.altKey || event.ctrlKey || event.metaKey) {
      moveByWords(1);
    } else {
      moveByCharacters(1);
    }
    return;
  }
  if (event.key === 'ArrowDown') {
    if (event.altKey || event.ctrlKey) {
      event.preventDefault();
      skipParagraph();
      return;
    }
  }
  if (event.key === 'ArrowUp') {
    if (event.altKey || event.ctrlKey) {
      event.preventDefault();
      previousParagraph();
      return;
    }
  }
  if (event.key === 'PageDown') {
    event.preventDefault();
    skipParagraph();
    return;
  }
  if (event.key === 'PageUp') {
    event.preventDefault();
    previousParagraph();
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    moveToBeginningOfParagraph();
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    moveToEndOfParagraph();
    return;
  }
  if (event.metaKey || event.ctrlKey) return;
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

function handlePassageClick(event) {
  let target = event.target;
  let targetIndex = null;
  if (target?.classList.contains('is-extra') && target.dataset.targetIndex != null) {
    targetIndex = Number(target.dataset.targetIndex);
  } else if (target?.dataset?.index != null) {
    targetIndex = Number(target.dataset.index);
  } else {
    const span = target?.closest?.('span[data-index]');
    if (span) {
      targetIndex = Number(span.dataset.index);
    }
  }
  if (targetIndex === null && typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    const node = range?.startContainer;
    const parent = node?.nodeType === 3 ? node.parentElement : node;
    const span = parent?.closest?.('span[data-index]');
    if (span && span.dataset.index != null) {
      targetIndex = Number(span.dataset.index);
    }
  }
  if (targetIndex !== null && !Number.isNaN(targetIndex)) {
    moveToPosition(targetIndex);
  }
  focusTyping();
}

function handleSurfaceClick(event) {
  if (event.target === els.typingSurface) {
    focusTyping();
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
    if (remembered && remembered.chapterCount && remembered.chapterCount !== book.chapters.length) {
      delete state.bookProgress[book.id];
      state.currentChapter = 0;
    }
    if (existingIndex >= 0) {
      state.books[existingIndex] = book;
    } else {
      state.books.push(book);
    }
    const sampleIndex = state.books.findIndex((candidate) => candidate.id === SAMPLE_BOOK.id);
    if (sampleIndex >= 0) {
      state.books.splice(sampleIndex, 1);
      delete state.bookProgress[SAMPLE_BOOK.id];
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
