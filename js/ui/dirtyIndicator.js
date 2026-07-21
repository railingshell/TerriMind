// ui/dirtyIndicator.js — индикатор несохранённых изменений (title + main IPC).

import { on as onEvent } from '../core/events.js';

function updateTitle(dirty) {
  try { document.title = (dirty ? '● ' : '') + 'TerriMind'; } catch (e) {}
}
function notifyMain(dirty) {
  try { if (window.terrimind && window.terrimind.notifyDirty) window.terrimind.notifyDirty(dirty); } catch (e) {}
}

export function initDirtyIndicator() {
  onEvent('dirty:change', (dirty) => {
    updateTitle(dirty);
    notifyMain(dirty);
  });
  updateTitle(false);
}
