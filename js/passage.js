import { state } from './state.js';
import { getChapterCharacters, isCharsetCharacter } from './utils.js';

export function characterFromKey(key) {
  if (key === 'Enter') return '\n';
  if (key === 'Tab') return '\t';
  return key.length === 1 ? key : '';
}

export function isInputCharacter(character) {
  if (!character || character === '\r') return false;
  if (/[\n\t]/.test(character)) return !state.settings.skipWhitespace;
  return isCharsetCharacter(character, state.charsetSet) || !state.settings.skipUnicode;
}

export function isFairCharacterAt(text, index) {
  const character = text[index];
  if (character === '\r') return false;
  if (character === '\n' || character === '\t') return !state.settings.skipWhitespace;
  if (character === ' ' && !isCharsetCharacter(character, state.charsetSet)) return !state.settings.skipUnicode;
  if (!isCharsetCharacter(character, state.charsetSet)) return !state.settings.skipUnicode;
  if (character !== ' ') return true;
  const previous = text[index - 1];
  return !state.settings.skipRepeatedSpaces || !previous || !/[\s\u00a0]/.test(previous);
}

export function advanceToFairCharacter(chapterState) {
  const text = getChapterCharacters(state.book, state.currentChapter);
  while (chapterState.position < text.length && !isFairCharacterAt(text, chapterState.position)) {
    chapterState.statuses[chapterState.position] = 'skipped';
    setCharacterStatus(chapterState.position, 'skipped');
    chapterState.position += 1;
  }
  return chapterState.position;
}

export function setCharacterStatus(index, status) {
  const element = state.characterElements[index];
  if (!element) return;
  element.classList.remove('is-current', 'is-correct', 'is-incorrect');
  if (status === 'correct' || status === 'skipped') element.classList.add('is-correct');
  if (status === 'incorrect') element.classList.add('is-incorrect');
}

export function moveCursor(index) {
  if (state.currentCharacter >= 0) state.characterElements[state.currentCharacter]?.classList.remove('is-current');
  state.currentCharacter = index;
  if (index >= 0) {
    const element = state.characterElements[index];
    element?.classList.add('is-current');
    element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }
}

export function appendPassageImages(fragment, images) {
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
