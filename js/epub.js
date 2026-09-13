import { MIN_CHAPTER_CHARACTERS } from './config.js';
import { state } from './state.js';

export function rememberBook(book) {
  if (!book.hash) return;
  state.bookIndex[book.hash] = { id: book.id, title: book.title, author: book.author, importedAt: new Date().toISOString() };
}

export function revokeBookImages(book) {
  if (!book?.chapters) return;
  book.chapters.forEach((chapter) => {
    (chapter.images || []).forEach((image) => {
      if (typeof image.src === 'string' && image.src.startsWith('blob:')) {
        URL.revokeObjectURL(image.src);
      }
    });
  });
}

export async function parseEpub(file, buffer, hash, existingId) {
  if (typeof ePub !== 'function') throw new Error('epub.js did not load.');
  const book = ePub(buffer);
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
  return { id: existingId || `epub-${hash}`, hash, title, author, chapters };
}

export async function loadChapterImages(book, section, imageAnchors = []) {
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

export function resolveSectionResource(book, section, source) {
  if (/^(?:data|blob|https?):/i.test(source)) return source.split('#')[0];
  const sectionUrl = new URL(book.resolve(section.href, true), window.location.href);
  return new URL(source.split('#')[0], sectionUrl).pathname;
}

export function flattenNavigation(items, result = []) {
  items.forEach((item) => {
    result.push(item);
    flattenNavigation(item.subitems || [], result);
  });
  return result;
}

export function findTocTitle(book, toc, sectionHref) {
  const target = canonicalEpubHref(book, sectionHref);
  if (!target) return '';
  const item = toc.find((entry) => canonicalEpubHref(book, entry.href) === target);
  return item?.label?.trim() || '';
}

export function canonicalEpubHref(book, href) {
  const path = String(href || '').split(/[?#]/, 1)[0];
  if (!path) return '';
  try {
    return decodeURIComponent(book.canonical(path));
  } catch {
    return path;
  }
}

export function isReadableChapter(text) {
  return text.replace(/\s/g, '').length >= MIN_CHAPTER_CHARACTERS;
}

export function isFrontMatter(title, text) {
  const titleHint = /^(copyright|contents|table of contents|title page|also by|about the author|dedication|acknowledg(e)?ments?)$/i.test(title.trim());
  const metadataHint = /\b(isbn(?:-1[03])?|copyright|all rights reserved|library of congress|cataloging[- ]in[- ]publication|published by)\b/i.test(text.slice(0, 1600));
  return titleHint || (metadataHint && text.length < 2200);
}

export function extractDisplayText(body) {
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

export function isItalicElement(node, italicElements) {
  if (italicElements.has(node.tagName.toUpperCase())) return true;
  const style = node.getAttribute('style') || '';
  const className = typeof node.className === 'string' ? node.className : '';
  return /font-style\s*:\s*(?:italic|oblique)/i.test(style) || /(?:^|\s)(?:emphasis|italic|italics)(?:\s|$)/i.test(className);
}
