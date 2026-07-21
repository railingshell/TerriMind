// renderer/features/regulations/regModel.js — модель нормативов в renderer.
// Держит: режим (ручной/авто), ручные параметры, свод правил, активный профиль, состав КИТ.
// Не теряет ручные значения при смене режима. Источник каждого параметра прозрачен.

import { emit } from '../../../core/events.js';
import { buildRuleset, flattenApplied } from '../../../domain/regulations/ruleset.js';
import { makeRule, RULE_CATEGORY, RULE_SOURCE, CONFIRM_STATUS } from '../../../domain/regulations/ruleSchema.js';
import { BUILTIN_PROFILES, migrateProfile } from '../../../domain/regulations/profiles.js';

export const MODE = Object.freeze({ MANUAL: 'manual', AUTO: 'auto' });

const PROFILES_KEY = 'terrimind.regProfiles';

const model = {
  mode: MODE.MANUAL,
  manual: {},                 // { category: value } — ручные значения (НЕ теряются при смене режима)
  manualPins: {},             // { category: true } — закреплённые
  pdfRules: [],               // правила из активных документов (загружаются из main)
  confirmed: {},              // { ruleId: 'confirmed'|'rejected' }
  activeProfileId: null,
  profiles: {},               // пользовательские профили (id -> profile)
  fart: { includeUnderground: false, includeParking: false, includeTechFloors: true, includeMainOnly: false },
  lastRuleset: null,
  context: {}                 // { territory, zone, parcelAreaM2, ... }
};

export function getRegModel() { return api; }

// ── Режим ──
function setMode(mode) {
  if (mode !== MODE.MANUAL && mode !== MODE.AUTO) return;
  model.mode = mode;
  rebuild();
  emit('reg:mode', mode);
}
function getMode() { return model.mode; }

// ── Ручные параметры (сохраняются всегда, независимо от режима) ──
function setManual(category, value) {
  if (value === null || value === undefined || value === '') delete model.manual[category];
  else model.manual[category] = Number(value);
  rebuild();
  emit('reg:manual', { category, value });
}
function getManual(category) { return model.manual[category]; }
function resetManual(category) { delete model.manual[category]; delete model.manualPins[category]; rebuild(); }
function pinManual(category, pinned) { model.manualPins[category] = !!pinned; rebuild(); }
function allManual() { return Object.assign({}, model.manual); }

// ── Правила из PDF (устанавливаются из main через reg.activeRules) ──
function setPdfRules(rules) {
  model.pdfRules = (rules || []).map((r) => Object.assign({}, r, applyConfirm(r)));
  rebuild();
}
function applyConfirm(r) {
  const st = model.confirmed[r.id];
  if (st === 'confirmed') return { confirmStatus: CONFIRM_STATUS.CONFIRMED };
  if (st === 'rejected') return { confirmStatus: CONFIRM_STATUS.REJECTED };
  return {};
}
function confirmRule(ruleId, status) {
  model.confirmed[ruleId] = status;           // 'confirmed'|'rejected'
  const r = model.pdfRules.find((x) => x.id === ruleId);
  if (r) r.confirmStatus = status === 'confirmed' ? CONFIRM_STATUS.CONFIRMED : CONFIRM_STATUS.REJECTED;
  rebuild();
}

// ── Контекст применимости ──
function setContext(ctx) { model.context = Object.assign({}, model.context, ctx); rebuild(); }

// ── Состав КИТ ──
function setFart(patch) { model.fart = Object.assign({}, model.fart, patch); rebuild(); emit('reg:fart', model.fart); }
function fartComposition() { return Object.assign({}, model.fart); }

// ── Профили ──
function loadProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      model.profiles = {};
      for (const [id, p] of Object.entries(obj.profiles || {})) model.profiles[id] = migrateProfile(p);
      model.activeProfileId = obj.activeProfileId || null;
    }
  } catch (e) { /* ignore */ }
}
function saveProfiles() {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify({ profiles: model.profiles, activeProfileId: model.activeProfileId }));
  } catch (e) { /* ignore */ }
}
function upsertProfile(profile) { model.profiles[profile.id] = profile; saveProfiles(); emit('reg:profiles'); }
function removeProfile(id) { delete model.profiles[id]; if (model.activeProfileId === id) model.activeProfileId = null; saveProfiles(); emit('reg:profiles'); }
function setActiveProfile(id) { model.activeProfileId = id; rebuild(); saveProfiles(); emit('reg:profiles'); }
function allProfiles() {
  const builtin = Object.values(BUILTIN_PROFILES);
  return builtin.concat(Object.values(model.profiles));
}
function activeProfile() {
  if (!model.activeProfileId) return null;
  return BUILTIN_PROFILES[model.activeProfileId.replace('builtin:', '')] || model.profiles[model.activeProfileId] || null;
}

// ── Сборка правил из всех источников ──
function collectAllRules() {
  const rules = [];

  // 1. Профиль (демо/пользовательский)
  const prof = activeProfile();
  if (prof) for (const r of prof.rules || []) rules.push(r);

  // 2. Правила из PDF (только в авто-режиме учитываются для применения)
  if (model.mode === MODE.AUTO) {
    for (const r of model.pdfRules) rules.push(r);
  }

  // 3. Ручные значения как правила высшего приоритета (manual pin)
  for (const [category, value] of Object.entries(model.manual)) {
    if (!Number.isFinite(value)) continue;
    rules.push(makeRule({
      id: 'manual:' + category,
      name: category,
      category,
      recommendedValue: value,
      appliedValue: value,
      maxValue: value,
      source: RULE_SOURCE.MANUAL_PIN,
      confirmStatus: CONFIRM_STATUS.CONFIRMED,
      manualOverride: true,
      locked: !!model.manualPins[category],
      confidence: 1,
      description: 'Введено вручную'
    }));
  }

  return rules;
}

// ── Пересборка свода ──
function rebuild() {
  const all = collectAllRules();
  model.lastRuleset = buildRuleset(all, model.context, {
    name: (activeProfile() && activeProfile().name) || 'Свод правил'
  });
  emit('reg:ruleset', model.lastRuleset);
}

function ruleset() { if (!model.lastRuleset) rebuild(); return model.lastRuleset; }
function appliedMap() { return flattenApplied(ruleset()); }

// ── Сериализация в проект ──
function serialize() {
  return JSON.parse(JSON.stringify({
    mode: model.mode,
    manual: model.manual,
    manualPins: model.manualPins,
    confirmed: model.confirmed,
    activeProfileId: model.activeProfileId,
    fart: model.fart,
    context: model.context
  }));
}
function deserialize(data) {
  if (!data) return;
  model.mode = data.mode || MODE.MANUAL;
  model.manual = data.manual || {};
  model.manualPins = data.manualPins || {};
  model.confirmed = data.confirmed || {};
  model.activeProfileId = data.activeProfileId || null;
  model.fart = Object.assign(model.fart, data.fart || {});
  model.context = data.context || {};
  rebuild();
}

const api = {
  MODE,
  setMode, getMode,
  setManual, getManual, resetManual, pinManual, allManual,
  setPdfRules, confirmRule,
  setContext,
  setFart, fartComposition,
  loadProfiles, saveProfiles, upsertProfile, removeProfile, setActiveProfile, allProfiles, activeProfile,
  ruleset, appliedMap, rebuild,
  serialize, deserialize,
  _model: model
};
