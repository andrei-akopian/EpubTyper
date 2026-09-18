import { HISTORY_LIMIT } from './config.js';
import { state, persist, persistSoon, ensureBookState, ensureChapterState } from './state.js';
import { getChapterCharacters } from './utils.js';
import { takeKeyDelay, recordTypingEvent, getTypingMetrics } from './metrics.js';
import { characterFromKey, isInputCharacter, isFairCharacterAt, advanceToFairCharacter, setCharacterStatus, moveCursor, setExtraCharacters } from './passage.js';
import { renderChapter, renderBookProgress, updateSessionMetrics, showChapterResults, renderBookList, renderStats, startTimer, stopTimer } from './ui.js';

export function refreshTypingPosition() {
  const chapterState = ensureChapterState();
  if (chapterState.completed) {
    renderChapter();
    return;
  }
  let lastTyped = -1;
  chapterState.statuses.forEach((status, index) => {
    if (status === 'correct' || status === 'incorrect') lastTyped = index;
    if (status === 'skipped') {
      chapterState.statuses[index] = undefined;
      setCharacterStatus(index, undefined);
    }
  });
  chapterState.position = lastTyped + 1;
  const characters = getChapterCharacters(state.book, state.currentChapter);
  if (chapterState.position >= characters.length) {
    finishChapter();
    return;
  }
  advanceToFairCharacter(chapterState);
  moveCursor(chapterState.position);
  updateSessionMetrics();
  renderBookProgress();
}

function extrasAt(index) {
  const chapterState = ensureChapterState();
  return (chapterState.extraCharacters || [])
    .filter((extra) => extra.index === index)
    .map((extra) => extra.character);
}

export function typeCharacter(character) {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
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
  const timing = takeKeyDelay();
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
    recordTypingEvent(chapterState, { at: timing.at, delayMs: timing.delayMs, index: chapterState.position, key: character, expected, skipped: 0, correct: false, extra: true });
    setExtraCharacters(chapterState.position, extrasAt(chapterState.position));
    renderBookProgress();
    persistSoon();
    return;
  }
  const isCorrect = character === expected;
  chapterState.statuses[chapterState.position] = isCorrect ? 'correct' : 'incorrect';
  setCharacterStatus(chapterState.position, isCorrect ? 'correct' : 'incorrect');
  if (isCorrect) chapterState.correctEvents += 1;
  else chapterState.incorrectEvents += 1;
  recordTypingEvent(chapterState, { at: timing.at, delayMs: timing.delayMs, index: chapterState.position, key: character, expected, skipped: chapterState.position - before, correct: isCorrect });
  chapterState.position += 1;
  chapterState.attempts += 1;
  if (isCorrect) chapterState.correct += 1;
  advanceToFairCharacter(chapterState);
  moveCursor(chapterState.position >= characters.length ? -1 : chapterState.position);
  if (chapterState.position >= characters.length) finishChapter();
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

export function stepBack() {
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  chapterState.extraCharacters = chapterState.extraCharacters || [];
  for (let index = chapterState.extraCharacters.length - 1; index >= 0; index -= 1) {
    if (chapterState.extraCharacters[index].index === chapterState.position) {
      chapterState.extraCharacters.splice(index, 1);
      setExtraCharacters(chapterState.position, extrasAt(chapterState.position));
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
  updateSessionMetrics();
  renderBookProgress();
  persistSoon();
}

export function finishChapter() {
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  chapterState.completed = true;
  stopTimer();
  const metrics = getTypingMetrics(chapterState);
  state.history.unshift({
    bookId: state.book.id,
    bookTitle: state.book.title,
    chapterTitle: state.book.chapters[state.currentChapter].title,
    wpm: metrics.wpm,
    emaWpm: metrics.emaWpm,
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

export function resetChapter() {
  stopTimer();
  state.lastKeyAt = null;
  const bookState = ensureBookState();
  bookState.chapters[state.currentChapter] = {
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
  state.startedAt = null;
  persist();
  renderChapter();
  renderBookList();
  renderBookProgress();
}

export function handleKeyCharacter(key, isComposing) {
  const character = characterFromKey(key);
  if (!character || isComposing || !isInputCharacter(character)) return false;
  typeCharacter(character);
  return true;
}
