import { BOOK_PALETTE, COMMON_CHARSET } from './config.js';

export function sampleChapter(title, parts) {
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

export const SAMPLE_BOOK = {
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

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
}

export function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export async function hashArrayBuffer(buffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  const bytes = new Uint8Array(buffer);
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 250000));
  for (let index = 0; index < bytes.length; index += step) hash = Math.imul(hash ^ bytes[index], 16777619);
  hash = Math.imul(hash ^ bytes.length, 16777619);
  return `fnv-${(hash >>> 0).toString(16)}-${bytes.length}`;
}

export function historyBookKey(item) {
  return item.bookId || item.bookTitle || 'unknown';
}

export function colorForKey(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return BOOK_PALETTE[(hash >>> 0) % BOOK_PALETTE.length];
}

const chapterCharacterCache = new WeakMap();

export function getChapterCharacters(book, index) {
  const chapter = book.chapters[index];
  let characters = chapterCharacterCache.get(chapter);
  if (!characters) {
    characters = [...chapter.text];
    chapterCharacterCache.set(chapter, characters);
  }
  return characters;
}

export function getChapterLength(book, index) {
  return getChapterCharacters(book, index).length;
}

export function isCharsetCharacter(character, charsetSet) {
  return charsetSet.has(character);
}
