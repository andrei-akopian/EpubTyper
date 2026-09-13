import { STORAGE_KEY, DEFAULT_SETTINGS } from './config.js';
import { SAMPLE_BOOK } from './utils.js';

export const state = {
  book: SAMPLE_BOOK,
  books: [SAMPLE_BOOK],
  bookProgress: {},
  bookIndex: {},
  history: [],
  settings: { ...DEFAULT_SETTINGS },
  currentChapter: 0,
  startedAt: null,
  lastKeyAt: null,
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

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.bookProgress = saved.bookProgress || {};
    state.bookIndex = saved.bookIndex || {};
    state.history = Array.isArray(saved.history) ? saved.history : [];
    state.settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
    const sampleProgress = state.bookProgress[SAMPLE_BOOK.id];
    state.currentChapter = Math.max(0, Math.min(Number(sampleProgress?.currentChapter) || 0, SAMPLE_BOOK.chapters.length - 1));
  } catch {
    state.bookProgress = {};
    state.bookIndex = {};
    state.history = [];
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

export function persist() {
  clearTimeout(state.persistId);
  state.persistId = null;
  const current = ensureBookState();
  current.currentChapter = state.currentChapter;
  state.bookProgress[state.book.id] = current;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookProgress: state.bookProgress, bookIndex: state.bookIndex, history: state.history, settings: state.settings }));
  } catch (error) {
    console.warn('Unable to save typing progress.', error);
  }
}

export function persistSoon() {
  clearTimeout(state.persistId);
  state.persistId = window.setTimeout(persist, 300);
}

export function getBookState(bookId = state.book.id) {
  return state.bookProgress[bookId];
}

export function ensureBookState(bookId = state.book.id) {
  if (!state.bookProgress[bookId]) {
    state.bookProgress[bookId] = { chapters: {} };
  }
  return state.bookProgress[bookId];
}

export function getChapterState(index = state.currentChapter) {
  return ensureBookState()?.chapters?.[index];
}

export function ensureChapterState(index = state.currentChapter) {
  const bookState = ensureBookState();
  if (!bookState.chapters[index]) {
    bookState.chapters[index] = {
      position: 0,
      statuses: [],
      attempts: 0,
      correct: 0,
      correctEvents: 0,
      incorrectEvents: 0,
      elapsedMs: 0,
      completed: false,
      events: [],
      eventCount: 0,
      extraCharacters: []
    };
  }
  const chapter = bookState.chapters[index];
  chapter.statuses = chapter.statuses || [];
  chapter.events = chapter.events || [];
  chapter.extraCharacters = chapter.extraCharacters || [];
  chapter.eventCount = chapter.eventCount || chapter.events.length;
  chapter.correctEvents = chapter.correctEvents || 0;
  chapter.incorrectEvents = chapter.incorrectEvents || 0;
  return chapter;
}
