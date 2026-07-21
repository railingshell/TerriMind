// ui/presetsPanel.js — UI пресетов (список, сохранение, удаление, применение).

import { $, on } from '../core/dom.js';
import { markDirty } from '../core/state.js';
import { BUILTIN_PRESETS, getUserPresets, saveUserPresets, getPresets, collectParams, applyParams } from '../project/params.js';

export function renderPresetOptions(selectKey) {
  const sel = $('preset');
  if (!sel) return;
  sel.innerHTML = '<option value="">— выбрать —</option>';
  for (const key of Object.keys(BUILTIN_PRESETS)) {
    const o = document.createElement('option');
    o.value = key; o.textContent = BUILTIN_PRESETS[key].label;
    sel.appendChild(o);
  }
  const user = getUserPresets();
  const keys = Object.keys(user);
  if (keys.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Мои пресеты';
    for (const key of keys) {
      const o = document.createElement('option');
      o.value = 'user:' + key; o.textContent = user[key].label;
      grp.appendChild(o);
    }
    sel.appendChild(grp);
  }
  if (selectKey !== undefined) sel.value = selectKey;
  updateButtons();
}

function updateButtons() {
  const sel = $('preset');
  const del = $('deletePresetBtn');
  if (sel && del) del.disabled = !(sel.value && sel.value.indexOf('user:') === 0);
}

function applyPreset(key) {
  if (!key) { updateButtons(); return; }
  const preset = getPresets()[key];
  if (!preset) return;
  applyParams(Object.assign({}, collectParams(), preset.params));
  markDirty();
  updateButtons();
  const hint = $('presetHint');
  if (hint) hint.textContent = 'Пресет «' + preset.label + '» применён. Нажмите «Сгенерировать кварталы».';
}

export function initPresets() {
  renderPresetOptions('');
  on('preset', 'change', (e) => applyPreset(e.target.value));

  on('savePresetBtn', 'click', () => {
    const name = prompt('Название пресета:');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const params = collectParams();
    delete params.showLabels;
    const user = getUserPresets();
    user[trimmed] = { label: trimmed, params };
    saveUserPresets(user);
    renderPresetOptions('user:' + trimmed);
    const hint = $('presetHint');
    if (hint) hint.textContent = 'Пресет «' + trimmed + '» сохранён.';
  });

  on('deletePresetBtn', 'click', () => {
    const sel = $('preset');
    if (!sel || sel.value.indexOf('user:') !== 0) return;
    const key = sel.value.slice('user:'.length);
    if (!confirm('Удалить пресет «' + key + '»?')) return;
    const user = getUserPresets();
    delete user[key];
    saveUserPresets(user);
    renderPresetOptions('');
    const hint = $('presetHint');
    if (hint) hint.textContent = 'Пресет удалён.';
  });
}
