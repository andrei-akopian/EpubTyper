import { HISTORY_LIMIT } from './config.js';
import { state, persist, persistSoon, ensureBookState, ensureChapterState } from './state.js';
import { getChapterCharacters } from './utils.js';
import { takeKeyDelay, recordTypingEvent, getTypingMetrics } from './metrics.js';
import { characterFromKey, isInputCharacter, isFairCharacterAt, advanceToFairCharacter, setCharacterStatus, moveCursor, setExtraCharacters } from './passage.js';
import { renderChapter, renderBookProgress, updateSessionMetrics, showChapterResults, renderBookList, renderStats, startTimer, stopTimer } from './ui.js';

export function isChapterComplete(chapterState, characters) {
  for (let index = 0; index < characters.length; index += 1) {
    if (isFairCharacterAt(characters, index) && !chapterState.statuses[index]) {
      return false;
    }
  }
  return true;
}

export function findFirstUntypedIndex(chapterState, characters) {
  for (let index = 0; index < characters.length; index += 1) {
    if (isFairCharacterAt(characters, index) && !chapterState.statuses[index]) {
      return index;
    }
  }
  return -1;
}

export function refreshTypingPosition() {
  const chapterState = ensureChapterState();
  if (chapterState.completed) {
    renderChapter();
    return;
  }
  const characters = getChapterCharacters(state.book, state.currentChapter);
  for (let index = 0; index < characters.length; index += 1) {
    if (!isFairCharacterAt(characters, index)) {
      chapterState.statuses[index] = 'skipped';
      setCharacterStatus(index, 'skipped');
    }
  }
  if (chapterState.position >= characters.length) {
    if (isChapterComplete(chapterState, characters)) {
      finishChapter();
      return;
    }
    const firstUntyped = findFirstUntypedIndex(chapterState, characters);
    chapterState.position = firstUntyped !== -1 ? firstUntyped : 0;
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

export function moveToPosition(targetIndex) {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  const clamped = Math.max(0, Math.min(characters.length, targetIndex));
  chapterState.position = clamped;
  if (chapterState.position < characters.length) {
    advanceToFairCharacter(chapterState);
  }
  moveCursor(chapterState.position >= characters.length ? -1 : chapterState.position);
  updateSessionMetrics();
  renderBookProgress();
  persistSoon();
}

export function moveByCharacters(delta) {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  const target = Math.max(0, Math.min(characters.length, chapterState.position + delta));
  moveToPosition(target);
}

export function moveByWords(delta) {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  let pos = chapterState.position;
  if (delta > 0) {
    while (pos < characters.length && !/\s/.test(characters[pos])) pos += 1;
    while (pos < characters.length && /\s/.test(characters[pos])) pos += 1;
  } else {
    if (pos > 0 && /\s/.test(characters[pos - 1])) {
      while (pos > 0 && /\s/.test(characters[pos - 1])) pos -= 1;
    }
    while (pos > 0 && !/\s/.test(characters[pos - 1])) pos -= 1;
  }
  moveToPosition(pos);
}

export function skipParagraph() {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  let newlineIndex = -1;
  for (let index = chapterState.position; index < characters.length; index += 1) {
    if (characters[index] === '\n') {
      newlineIndex = index;
      break;
    }
  }
  let nextParagraphStart;
  if (newlineIndex === -1) {
    nextParagraphStart = characters.length;
  } else {
    let next = newlineIndex + 1;
    while (next < characters.length && characters[next] === '\n') {
      next += 1;
    }
    nextParagraphStart = next;
  }
  for (let index = chapterState.position; index < nextParagraphStart; index += 1) {
    if (!chapterState.statuses[index]) {
      chapterState.statuses[index] = 'skipped';
      setCharacterStatus(index, 'skipped');
    }
  }
  chapterState.position = nextParagraphStart;
  if (chapterState.position >= characters.length) {
    if (isChapterComplete(chapterState, characters)) {
      finishChapter();
      return;
    }
    const firstUntyped = findFirstUntypedIndex(chapterState, characters);
    if (firstUntyped !== -1) {
      chapterState.position = firstUntyped;
    } else {
      finishChapter();
      return;
    }
  }
  advanceToFairCharacter(chapterState);
  moveCursor(chapterState.position);
  updateSessionMetrics();
  renderBookProgress();
  persistSoon();
}

export function previousParagraph() {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  let pos = chapterState.position;
  if (pos > 0 && characters[pos - 1] === '\n') pos -= 1;
  let prevNewline = -1;
  for (let index = Math.max(0, pos - 1); index >= 0; index -= 1) {
    if (characters[index] === '\n') {
      prevNewline = index;
      break;
    }
  }
  let target = prevNewline === -1 ? 0 : prevNewline + 1;
  if (pos <= target && prevNewline > 0) {
    let earlierNewline = -1;
    for (let index = prevNewline - 1; index >= 0; index -= 1) {
      if (characters[index] === '\n') {
        earlierNewline = index;
        break;
      }
    }
    target = earlierNewline === -1 ? 0 : earlierNewline + 1;
  }
  moveToPosition(target);
}

export function moveToBeginningOfParagraph() {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  let pos = chapterState.position;
  if (pos > 0 && characters[pos - 1] === '\n') pos -= 1;
  const prevNewline = characters.lastIndexOf('\n', Math.max(0, pos - 1));
  moveToPosition(prevNewline === -1 ? 0 : prevNewline + 1);
}

export function moveToEndOfParagraph() {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  const nextNewline = characters.indexOf('\n', chapterState.position);
  moveToPosition(nextNewline === -1 ? characters.length : nextNewline);
}

export function typeCharacter(character) {
  const characters = getChapterCharacters(state.book, state.currentChapter);
  const chapterState = ensureChapterState();
  if (chapterState.completed) return;
  const before = chapterState.position;
  advanceToFairCharacter(chapterState);
  if (chapterState.position >= characters.length) {
    if (isChapterComplete(chapterState, characters)) {
      finishChapter();
      return;
    }
    const firstUntyped = findFirstUntypedIndex(chapterState, characters);
    if (firstUntyped !== -1) {
      chapterState.position = firstUntyped;
      advanceToFairCharacter(chapterState);
      moveCursor(chapterState.position);
    } else {
      finishChapter();
      return;
    }
  }
  if (!state.startedAt) {
    state.startedAt = Date.now();
    startTimer();
  }
  const timing = takeKeyDelay();
  if (character === ' ' && characters[chapterState.position] !== ' ') {
    alignToNextSpace(characters, chapterState);
    if (chapterState.position >= characters.length) {
      if (isChapterComplete(chapterState, characters)) {
        finishChapter();
        return;
      }
      const firstUntyped = findFirstUntypedIndex(chapterState, characters);
      if (firstUntyped !== -1) {
        chapterState.position = firstUntyped;
        advanceToFairCharacter(chapterState);
        moveCursor(chapterState.position);
      } else {
        finishChapter();
        return;
      }
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
  const prevStatus = chapterState.statuses[chapterState.position];
  if (prevStatus === 'correct' && !isCorrect) {
    chapterState.correct = Math.max(0, (chapterState.correct || 0) - 1);
    chapterState.correctChars = Math.max(0, (chapterState.correctChars || 0) - 1);
  } else if (prevStatus !== 'correct' && isCorrect) {
    chapterState.correct = (chapterState.correct || 0) + 1;
  }
  chapterState.statuses[chapterState.position] = isCorrect ? 'correct' : 'incorrect';
  setCharacterStatus(chapterState.position, isCorrect ? 'correct' : 'incorrect');
  if (isCorrect) chapterState.correctEvents += 1;
  else chapterState.incorrectEvents += 1;
  recordTypingEvent(chapterState, { at: timing.at, delayMs: timing.delayMs, index: chapterState.position, key: character, expected, skipped: chapterState.position - before, correct: isCorrect });
  chapterState.position += 1;
  chapterState.attempts += 1;
  advanceToFairCharacter(chapterState);
  if (chapterState.position >= characters.length) {
    if (isChapterComplete(chapterState, characters)) {
      moveCursor(-1);
      finishChapter();
      return;
    }
    const firstUntyped = findFirstUntypedIndex(chapterState, characters);
    if (firstUntyped !== -1) {
      chapterState.position = firstUntyped;
      advanceToFairCharacter(chapterState);
      moveCursor(chapterState.position);
    } else {
      moveCursor(-1);
      finishChapter();
      return;
    }
  } else {
    moveCursor(chapterState.position);
  }
  updateSessionMetrics();
  renderBookProgress();
  persistSoon();
}

function alignToNextSpace(characters, chapterState) {
  let index = chapterState.position;
  while (index < characters.length) {
    if ((characters[index] === ' ' || characters[index] === '\n') && isFairCharacterAt(characters, index)) {
      chapterState.position = index;
      return;
    }
    if (isFairCharacterAt(characters, index)) {
      if (chapterState.statuses[index] === 'correct') {
        chapterState.correct = Math.max(0, (chapterState.correct || 0) - 1);
        chapterState.correctChars = Math.max(0, (chapterState.correctChars || 0) - 1);
      }
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
  if (chapterState.statuses[previous] === 'correct') {
    chapterState.correct = Math.max(0, (chapterState.correct || 0) - 1);
    chapterState.correctChars = Math.max(0, (chapterState.correctChars || 0) - 1);
  }
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
