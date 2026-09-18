import { CHARS_PER_WORD, MAX_KEY_GAP_MS, SAME_MS_KEY_DELAY, WPM_EMA_ALPHA } from './config.js';
import { state } from './state.js';

export function takeKeyDelay() {
  const at = Date.now();
  let delayMs = state.lastKeyAt ? at - state.lastKeyAt : 0;
  if (!delayMs && state.lastKeyAt) delayMs = SAME_MS_KEY_DELAY;
  state.lastKeyAt = at;
  return { at, delayMs };
}

export function capKeyDelay(delayMs, isFirst) {
  if (isFirst) return 0;
  return Math.min(Math.max(Number(delayMs) || 0, 0), MAX_KEY_GAP_MS);
}

export function instantWpm(delayMs) {
  return delayMs > 0 ? 60000 / delayMs / CHARS_PER_WORD : 0;
}

export function recordTypingEvent(chapterState, event) {
  chapterState.events = chapterState.events || [];
  chapterState.eventCount = chapterState.eventCount || 0;
  chapterState.typedMs = chapterState.typedMs || 0;
  chapterState.correctChars = chapterState.correctChars || 0;
  chapterState.emaWpm = chapterState.emaWpm || 0;
  const delay = capKeyDelay(event.delayMs, chapterState.eventCount === 0);
  chapterState.typedMs += delay;
  if (event.correct && !event.extra) chapterState.correctChars += 1;
  const inst = instantWpm(delay);
  if (inst) chapterState.emaWpm = chapterState.emaWpm ? WPM_EMA_ALPHA * inst + (1 - WPM_EMA_ALPHA) * chapterState.emaWpm : inst;
  if (chapterState.events.length < 5000) {
    chapterState.events.push(event);
  } else {
    chapterState.events[chapterState.eventCount % 5000] = event;
    if (chapterState.eventCount % 5000 === 0) rebuildRunningMetrics(chapterState);
  }
  chapterState.eventCount += 1;
}

export function getOrderedEvents(chapterState) {
  const events = chapterState.events || [];
  if (!events.length) return [];
  const count = chapterState.eventCount || events.length;
  if (count <= events.length) return events.slice();
  const start = count % events.length;
  return events.slice(start).concat(events.slice(0, start));
}

export function eventDelayMs(event, previousAt, isFirst) {
  if (isFirst) return 0;
  const raw = event.delayMs != null ? event.delayMs : (event.at && previousAt ? event.at - previousAt : 0);
  return capKeyDelay(raw, false);
}

export function analyzeKeystrokes(chapterState) {
  const events = getOrderedEvents(chapterState);
  let typedMs = 0;
  let previousAt = 0;
  let correctKeys = 0;
  let totalKeys = 0;
  let correctChars = 0;
  let ema = 0;
  let lastWords = 0;
  const xs = [];
  const emaSeries = [];
  const avgSeries = [];
  const accuracySeries = [];
  const missSeries = [];
  events.forEach((event, index) => {
    const delay = eventDelayMs(event, previousAt, index === 0);
    typedMs += delay;
    if (event.at) previousAt = event.at;
    totalKeys += 1;
    if (event.correct) {
      correctKeys += 1;
      if (!event.extra) correctChars += 1;
    }
    const inst = instantWpm(delay);
    if (inst) ema = ema ? WPM_EMA_ALPHA * inst + (1 - WPM_EMA_ALPHA) * ema : inst;
    const words = Math.max(lastWords + 0.05, (Number(event.index) + 1) / CHARS_PER_WORD);
    lastWords = words;
    const minutes = typedMs / 60000;
    const accuracy = (correctKeys / totalKeys) * 100;
    xs.push(words);
    emaSeries.push(ema || null);
    avgSeries.push(minutes > 0 ? (correctChars / CHARS_PER_WORD) / minutes : null);
    accuracySeries.push(accuracy);
    missSeries.push(event.correct ? null : accuracy);
  });
  const minutes = typedMs / 60000;
  return {
    elapsedMs: typedMs,
    wpm: minutes > 0 ? Math.round((correctChars / CHARS_PER_WORD) / minutes) : 0,
    rawWpm: minutes > 0 ? Math.round((totalKeys / CHARS_PER_WORD) / minutes) : 0,
    emaWpm: Math.round(ema),
    accuracy: totalKeys ? Math.round((correctKeys / totalKeys) * 100) : 0,
    series: xs.length ? { xs, emaSeries, avgSeries, accuracySeries, missSeries } : null
  };
}

export function sampleProgressSeries(series, maxPoints) {
  const length = series.xs.length;
  if (length <= maxPoints) return series;
  const keep = new Set([0, length - 1]);
  series.missSeries.forEach((value, index) => {
    if (value != null) keep.add(index);
  });
  const step = (length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) keep.add(Math.round(index * step));
  const indexes = [...keep].sort((a, b) => a - b);
  return {
    xs: indexes.map((index) => series.xs[index]),
    emaSeries: indexes.map((index) => series.emaSeries[index]),
    avgSeries: indexes.map((index) => series.avgSeries[index]),
    accuracySeries: indexes.map((index) => series.accuracySeries[index]),
    missSeries: indexes.map((index) => series.missSeries[index])
  };
}

export function accuracyYRange(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return [90, 100];
  const min = Math.min(...numbers);
  if (min >= 100) return [95, 100];
  const pad = Math.max(2, (100 - min) * 0.2);
  return [Math.max(0, Math.floor(min - pad)), 100];
}

export function rebuildRunningMetrics(chapterState) {
  chapterState.typedMs = 0;
  chapterState.correctChars = 0;
  chapterState.emaWpm = 0;
  const events = getOrderedEvents(chapterState);
  let previousAt = 0;
  events.forEach((event, index) => {
    const delay = eventDelayMs(event, previousAt, index === 0);
    chapterState.typedMs += delay;
    if (event.at) previousAt = event.at;
    if (event.correct && !event.extra) chapterState.correctChars += 1;
    const inst = instantWpm(delay);
    if (inst) chapterState.emaWpm = chapterState.emaWpm ? WPM_EMA_ALPHA * inst + (1 - WPM_EMA_ALPHA) * chapterState.emaWpm : inst;
  });
}

export function getTypingMetrics(chapterState) {
  if (typeof chapterState.typedMs !== 'number' && (chapterState.events?.length || chapterState.eventCount)) {
    rebuildRunningMetrics(chapterState);
  }
  if (typeof chapterState.typedMs === 'number') {
    const minutes = chapterState.typedMs / 60000;
    const totalEvents = (chapterState.correctEvents || 0) + (chapterState.incorrectEvents || 0);
    return {
      elapsedMs: chapterState.typedMs,
      wpm: minutes > 0 ? Math.round((chapterState.correctChars / CHARS_PER_WORD) / minutes) : 0,
      emaWpm: Math.round(chapterState.emaWpm || 0),
      rawWpm: minutes > 0 ? Math.round((totalEvents / CHARS_PER_WORD) / minutes) : 0,
      accuracy: totalEvents ? Math.round((chapterState.correctEvents / totalEvents) * 100) : 0
    };
  }
  const analysis = analyzeKeystrokes(chapterState);
  const totalEvents = (chapterState.correctEvents || 0) + (chapterState.incorrectEvents || 0);
  const accuracy = totalEvents ? Math.round((chapterState.correctEvents / totalEvents) * 100) : analysis.accuracy;
  return {
    elapsedMs: analysis.elapsedMs,
    wpm: analysis.wpm,
    emaWpm: analysis.emaWpm,
    rawWpm: analysis.rawWpm,
    accuracy
  };
}
