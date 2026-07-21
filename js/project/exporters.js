// project/exporters.js — экспорт PNG-снимка и PDF-отчёта.

import { state } from '../core/state.js';
import { $ } from '../core/dom.js';
import { fmt } from '../core/dom.js';
import { safeArea } from '../geometry/turfSafe.js';
import { ZONES, zoneOf } from '../zones/zoneConfig.js';
import { notifyOk, notifyError } from '../core/toast.js';

function mapRect() {
  const el = $('map');
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

export async function exportPNG() {
  const result = await window.terrimind.savePNG(mapRect());
  if (result.ok) notifyOk('Снимок сохранён');
  else if (!result.canceled) notifyError('Ошибка экспорта PNG: ' + (result.error || 'неизвестно'));
}

export async function exportPDF() {
  if (!state.blocks.length) { notifyError('Сначала сгенерируйте кварталы'); return; }
  const cap = await window.terrimind.captureMap(mapRect());
  const mapImage = cap.ok ? cap.dataUrl : null;

  const stats = [
    { label: 'Площадь участка', value: textOf('parcelArea') },
    { label: 'Кол-во кварталов', value: textOf('blockCount') },
    { label: 'Средний квартал', value: textOf('blockArea') },
    { label: 'Примерно жителей', value: textOf('population') },
    { label: 'Плотность', value: textOf('density') }
  ];

  const zoneArea = {};
  for (const b of state.blocks) {
    const z = zoneOf(b);
    zoneArea[z] = (zoneArea[z] || 0) + safeArea(b);
  }
  const zones = [];
  for (const z of Object.keys(ZONES)) {
    if (!zoneArea[z]) continue;
    zones.push({ label: ZONES[z].label, color: ZONES[z].fillColor, value: fmt(zoneArea[z]) + ' м²' });
  }

  const result = await window.terrimind.savePDF({ stats, zones, mapImage });
  if (result.ok) notifyOk('Отчёт сохранён');
  else if (!result.canceled) notifyError('Ошибка экспорта PDF: ' + (result.error || 'неизвестно'));
}

function textOf(id) { const el = $(id); return el ? el.textContent : '—'; }
