import { cacheElements } from './dom.js';
import { loadState } from './state.js';
import { applySettings, renderBook, renderStats, focusTyping } from './ui.js';
import { bindEvents } from './events.js';

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  loadState();
  bindEvents();
  applySettings();
  renderBook();
  renderStats();
  focusTyping();
});
