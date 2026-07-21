// ui/licensePanel.js — панель лицензии (статус + сброс активации).

import { $ } from '../core/dom.js';

export function initLicensePanel() {
  const info = $('licenseInfo');
  const btn = $('deactivateBtn');
  if (info && window.terrilicense && window.terrilicense.status) {
    window.terrilicense.status().then((s) => {
      if (s && s.active) {
        const who = s.clientName ? (s.clientName + ' • ') : '';
        info.textContent = 'Активировано. ' + who + (s.plan ? ('план: ' + s.plan) : '');
      }
    }).catch(() => {});
  }
  if (btn && window.terrilicense && window.terrilicense.deactivate) {
    btn.addEventListener('click', () => {
      if (!confirm('Сбросить активацию? Приложение потребует токен при следующем запуске.')) return;
      window.terrilicense.deactivate();
    });
  }
}
