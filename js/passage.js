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

function ensureCursorObserver() {
  if (state.cursorObserver) return state.cursorObserver;
  const frame = document.querySelector('.passage-frame');
  if (!frame) return null;
  state.cursorObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const currentElement = state.characterElements[state.currentCharacter];
      if (entry.target !== currentElement) return;
      if (!entry.isIntersecting && state.cursorNeedsScroll) {
        entry.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
      state.cursorNeedsScroll = false;
    });
  }, { root: frame, threshold: 1, rootMargin: '-4px' });
  return state.cursorObserver;
}

export function moveCursor(index) {
  const observer = ensureCursorObserver();
  if (state.currentCharacter >= 0) {
    const previous = state.characterElements[state.currentCharacter];
    previous?.classList.remove('is-current');
    if (observer && previous) observer.unobserve(previous);
  }
  state.currentCharacter = index;
  if (index >= 0) {
    const element = state.characterElements[index];
    element?.classList.add('is-current');
    if (observer && element) {
      state.cursorNeedsScroll = true;
      observer.observe(element);
    }
  }
}

export function unobserveCurrentCharacter() {
  if (state.cursorObserver && state.currentCharacter >= 0) {
    state.cursorObserver.unobserve(state.characterElements[state.currentCharacter]);
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

export function setExtraCharacters(index, extras) {
  const element = state.characterElements[index];
  if (!element) return;
  let sibling = element.previousSibling;
  while (sibling && sibling.nodeType === 1 && sibling.classList.contains('is-extra')) {
    const toRemove = sibling;
    sibling = sibling.previousSibling;
    toRemove.remove();
  }
  extras.forEach((character) => {
    const extraSpan = document.createElement('span');
    extraSpan.className = 'is-extra is-incorrect';
    extraSpan.textContent = character;
    element.parentNode.insertBefore(extraSpan, element);
  });
}
