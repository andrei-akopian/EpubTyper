import { MIN_CHAPTER_CHARACTERS, MAX_CHAPTER_CHARACTERS } from './config.js';
import { state } from './state.js';

export function rememberBook(book) {
  if (!book.hash) return;
  state.bookIndex[book.hash] = { id: book.id, title: book.title, author: book.author, chapterCount: book.chapters.length, importedAt: new Date().toISOString() };
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
  const tocBySection = groupTocBySection(book, flattenNavigation(navigation?.toc || []));
  const chapters = [];
  try {
    for (const section of book.spine.spineItems) {
      if (!section.linear || (section.properties || []).includes('nav')) continue;
      const contents = await section.load(book.load.bind(book));
      const body = contents.querySelector('body') || contents.documentElement || contents;
      const tocEntries = tocBySection.get(canonicalEpubHref(book, section.href)) || [];
      for (const chunk of splitSectionChunks(contents, body, tocEntries)) {
        const displayText = extractDisplayText(chunk.root);
        const text = displayText.text;
        const images = await loadChapterImages(book, section, displayText.images);
        const isReadable = chunk.split ? text.trim().length > 0 : isReadableChapter(text);
        const isImagePage = images.length > 0 && !isReadable;
        let title = chunk.title || 'Untitled';
        if (isImagePage && title === 'Untitled') title = 'Image';
        if ((isReadable || isImagePage) && !isFrontMatter(title, text)) chapters.push({ title, text, emphasisRanges: displayText.emphasisRanges, images });
      }
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

export function splitSectionChunks(contents, body, tocEntries) {
  const sectionTitle = tocEntries.find((entry) => !entry.fragment)?.label?.trim()
    || contents.querySelector('h1, h2, h3')?.textContent.replace(/\s+/g, ' ').trim()
    || '';
  const anchors = resolveTocAnchors(contents, tocEntries);
  let chunks;
  if (anchors.length >= 2) {
    chunks = splitAtBoundaries(contents, body, anchors, sectionTitle);
  } else {
    chunks = splitAtHeadings(contents, body, anchors[0]?.label || sectionTitle);
  }
  return chunks.flatMap((chunk) => splitOversizedChunk(contents, chunk));
}

export function groupTocBySection(book, toc) {
  const map = new Map();
  toc.forEach((entry) => {
    const href = String(entry.href || '');
    const hashIndex = href.indexOf('#');
    const key = canonicalEpubHref(book, hashIndex >= 0 ? href.slice(0, hashIndex) : href);
    if (!key) return;
    const list = map.get(key) || [];
    list.push({ fragment: hashIndex >= 0 ? safeDecode(href.slice(hashIndex + 1)) : '', label: entry.label?.trim() || '' });
    map.set(key, list);
  });
  return map;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveTocAnchors(contents, tocEntries) {
  const anchors = [];
  const seen = new Set();
  tocEntries.forEach((entry) => {
    if (!entry.fragment || seen.has(entry.fragment)) return;
    const element = contents.getElementById?.(entry.fragment) || contents.querySelector?.(`[id="${CSS.escape(entry.fragment)}"]`);
    if (!element) return;
    seen.add(entry.fragment);
    anchors.push({ element, label: entry.label || element.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) });
  });
  anchors.sort((a, b) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return anchors;
}

export function splitAtBoundaries(contents, body, anchors, preambleTitle) {
  const firstTitle = preambleTitle === anchors[0].label ? '' : preambleTitle;
  const chunks = [{ title: firstTitle, root: sliceRange(contents, body, null, anchors[0].element), split: true }];
  anchors.forEach((anchor, index) => {
    chunks.push({ title: anchor.label, root: sliceRange(contents, body, anchor.element, anchors[index + 1]?.element || null), split: true });
  });
  return chunks;
}

export function splitAtHeadings(contents, body, fallbackTitle) {
  if (measureText(body) <= MAX_CHAPTER_CHARACTERS) return [{ title: fallbackTitle, root: body }];
  const anchors = findHeadingAnchors(body);
  if (anchors.length < 2) return [{ title: fallbackTitle, root: body }];
  return splitAtBoundaries(contents, body, anchors, fallbackTitle);
}

export function findHeadingAnchors(body) {
  const headings = [...body.querySelectorAll('h1, h2, h3')];
  const counts = new Map();
  headings.forEach((element) => {
    const tag = element.tagName.toUpperCase();
    counts.set(tag, (counts.get(tag) || 0) + 1);
  });
  const level = ['H1', 'H2', 'H3'].find((tag) => (counts.get(tag) || 0) >= 2);
  if (!level) return [];
  return headings
    .filter((element) => element.tagName.toUpperCase() === level)
    .map((element) => ({ element, label: element.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled' }));
}

export function sliceRange(contents, body, startNode, endNode) {
  const range = contents.createRange();
  if (startNode) range.setStartBefore(startNode);
  else range.setStart(body, 0);
  if (endNode) range.setEndBefore(endNode);
  else range.setEnd(body, body.childNodes.length);
  return range.cloneContents();
}

export function splitOversizedChunk(contents, chunk) {
  if (measureText(chunk.root) <= MAX_CHAPTER_CHARACTERS) return [chunk];
  const blocks = [];
  collectBlocks(chunk.root, blocks);
  if (blocks.length < 2) return [chunk];
  const parts = [];
  let current = contents.createDocumentFragment();
  let size = 0;
  blocks.forEach((block) => {
    const blockSize = measureText(block);
    if (size > 0 && size + blockSize > MAX_CHAPTER_CHARACTERS) {
      parts.push(current);
      current = contents.createDocumentFragment();
      size = 0;
    }
    current.appendChild(block);
    size += blockSize;
  });
  if (current.childNodes.length) parts.push(current);
  if (parts.length < 2) return [{ ...chunk, root: parts[0] || chunk.root }];
  const baseTitle = chunk.title || 'Untitled';
  return parts.map((part, index) => ({ title: `${baseTitle} (part ${index + 1}/${parts.length})`, root: part, split: true }));
}

function collectBlocks(node, blocks) {
  [...node.childNodes].forEach((child) => {
    if (child.nodeType === 1 && child.children.length > 1 && measureText(child) > MAX_CHAPTER_CHARACTERS) collectBlocks(child, blocks);
    else blocks.push(child);
  });
}

export function measureText(node) {
  return (node.textContent || '').length;
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
  const trimmedTitle = title.trim();
  const titleHint = /^(copyright|contents|table of contents|title page|also by|about the author|dedication|acknowledg(e)?ments?)$/i.test(trimmedTitle)
    || /(project gutenberg|gutenberg.tm license|full project|transcriber.?s? notes?|^license$)/i.test(trimmedTitle);
  const metadataHint = /\b(isbn(?:-1[03])?|copyright|all rights reserved|library of congress|cataloging[- ]in[- ]publication|published by)\b/i.test(text.slice(0, 1600));
  const boilerplateHint = /^the project gutenberg ebook/i.test(text.trim()) || /\*\*\* ?start of the project gutenberg/i.test(text);
  const contentsHint = /^\s*contents\s*$/im.test(text.slice(0, 1200));
  return titleHint || boilerplateHint || contentsHint || (metadataHint && text.length < 2200);
}

export function extractDisplayText(body) {
  const blockElements = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL']);
  const italicElements = new Set(['CITE', 'DFN', 'EM', 'I', 'VAR']);
  const characters = [];
  const images = [];

  function appendText(value, emphasized = false) {
    [...value].forEach((character) => {
      if (character === '\n' && characters.length > 0 && characters[characters.length - 1].character === '\n') return;
      characters.push({ character, emphasized });
    });
  }

  function collect(node, emphasized = false) {
    if (node.nodeType === 3) {
      appendText(node.nodeValue || '', emphasized);
      return;
    }
    if (node.nodeType === 9 || node.nodeType === 11) {
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
