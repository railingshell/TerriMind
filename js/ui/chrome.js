// ui/chrome.js — оболочка UI: тема, сворачивание сайдбара, табы, статус, пустое состояние.
// Не трогает логику геометрии. Читает элементы по id.

(function () {
  var root = document.documentElement;
  var body = document.body;

  // Тема (localStorage)
  var THEME_KEY = 'terrimind.theme';
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    body.className = body.className.replace(/\b(light|dark)\b/g, '').trim() + ' ' + t;
    var icon = document.getElementById('themeIcon');
    if (icon) {
      if (t === 'dark') {
        icon.innerHTML = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
      } else {
        icon.innerHTML = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
      }
    }
  }
  var saved = 'dark';
  try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
  applyTheme(saved);
  var tt = document.getElementById('themeToggle');
  if (tt) tt.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    try { if (window.map && window.map.invalidateSize) setTimeout(function(){ window.map.invalidateSize(); }, 160); } catch (e) {}
  });

  // Сворачивание сайдбара
  var cb = document.getElementById('collapseBtn');
  if (cb) cb.addEventListener('click', function () {
    body.classList.toggle('sidebar-collapsed');
    try { if (window.map && window.map.invalidateSize) setTimeout(function(){ window.map.invalidateSize(); }, 160); } catch (e) {}
  });

  // Кнопка «Я понял» пустого состояния
  var esOk = document.getElementById('emptyStateOk');
  var esBox = document.getElementById('emptyState');
  if (esOk && esBox) esOk.addEventListener('click', function () { esBox.classList.add('dismissed'); });

  // Pill-табы разделов
  var tabs = document.getElementById('sectionTabs');
  var rail = document.getElementById('navRail');
  if (tabs) {
    var pills = tabs.querySelectorAll('.pill');
    var navBtns = rail ? rail.querySelectorAll('.nav-btn') : [];
    function activateTab(section) {
      body.setAttribute('data-tab', section);
      pills.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-section') === section); });
      navBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-nav') === section); });
      if (body.classList.contains('sidebar-collapsed')) {
        body.classList.remove('sidebar-collapsed');
        try { if (window.map && window.map.invalidateSize) setTimeout(function(){ window.map.invalidateSize(); }, 160); } catch (e) {}
      }
    }
    pills.forEach(function (p) { p.addEventListener('click', function () { activateTab(p.getAttribute('data-section')); }); });
    navBtns.forEach(function (b) { b.addEventListener('click', function () { activateTab(b.getAttribute('data-nav')); }); });
    activateTab('site');
  }

  // Статус проекта в топбаре (следим за document.title)
  var chip = document.getElementById('statusChip');
  var stext = document.getElementById('statusText');
  function syncStatus() {
    var dirty = document.title.indexOf('●') === 0;
    if (chip) chip.classList.toggle('dirty', dirty);
    if (stext) stext.textContent = dirty ? 'Есть изменения' : 'Сохранено';
  }
  syncStatus();
  var titleEl = document.querySelector('title');
  if (titleEl && window.MutationObserver) {
    new MutationObserver(syncStatus).observe(titleEl, { childList: true });
  }

  // Пустое состояние: скрыть при появлении участка (следим за clearBtn.disabled)
  function checkParcel() {
    var clearBtn = document.getElementById('clearBtn');
    var has = clearBtn && !clearBtn.disabled;
    body.classList.toggle('has-parcel', !!has);
  }
  checkParcel();
  var clearBtn = document.getElementById('clearBtn');
  if (clearBtn && window.MutationObserver) {
    new MutationObserver(checkParcel).observe(clearBtn, { attributes: true, attributeFilter: ['disabled'] });
  }
})();
