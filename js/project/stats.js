// project/stats.js — тонкий адаптер к единому движку ТЭП (services/calculation).
// Сохраняет прежний публичный API (parcelAreaM2/updateParcelArea/updateStats) для совместимости
// с app.js и loader.js. Вся арифметика теперь в domain/metrics; отображение — в renderer/features/results.

import { state } from '../core/state.js';
import { fmt, setText } from '../core/dom.js';
import { parcelAreaM2, recalcMetrics } from '../services/calculation/calcService.js';
import { renderResults } from '../renderer/features/results/resultsPanel.js';

export { parcelAreaM2 };

export function updateParcelArea() {
  const area = parcelAreaM2();
  setText('parcelArea', area ? fmt(area) + ' м²' : '—');
}

export function updateStats() {
  const metrics = recalcMetrics();
  const byId = metrics.byId;
  const nBlocks = state.blocks.length;

  // Легаси-совместимые поля (верхние карточки ТЭП)
  setText('blockCount', nBlocks ? String(nBlocks) : '—');
  const blocksArea = byId.blocks_area_m2;
  setText('blockArea', (blocksArea && blocksArea.raw && nBlocks)
    ? fmt(blocksArea.rounded / nBlocks) + ' м²' : '—');
  const pop = byId.population;
  setText('population', (pop && pop.raw !== null && nBlocks) ? fmt(pop.rounded) + ' чел' : '—');
  const dens = byId.population_density;
  setText('density', (dens && dens.raw !== null && nBlocks) ? fmt(dens.rounded) + ' чел/га' : '—');

  renderResults(metrics);
}
