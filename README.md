# TerriMind

Десктопное приложение для градостроительного проектирования.  
Рисуете участок на карте — получаете сетку кварталов и автоматический расчёт ТЭП (технико-экономических показателей).

**Версия:** 1.0.0 (MVP)  
**Платформа:** Windows (Electron)  
**Автор:** rogaart

---

## Быстрый старт

### Требования
- Node.js 18+
- npm 9+

### Установка и запуск
```bash
npm install
npm start
```

### Сборка дистрибутива (Windows .exe)
```bash
npm run dist
# → dist/TerriMind Setup 1.0.0.exe
```

### Тесты
```bash
npm test          # все тесты (96)
npm run test:unit # только юнит-тесты
```

---

## Структура проекта

```
TerriMind/
├── main.js              # Electron main process (IPC, диалоги, лицензирование)
├── preload.js           # Electron preload (безопасный мост renderer ↔ main)
├── licensing.js         # Лицензирование: machineId, проверка токенов
├── activation-store.js  # Хранение activation record
├── tokens.example.json  # Шаблон файла токенов (см. ниже)
├── index.html           # Renderer: HTML + встроенные стили
├── js/
│   ├── app.js           # Точка входа renderer (ES-модуль)
│   ├── core/            # Примитивы: state, events, dom, toast
│   ├── domain/          # Чистая бизнес-логика (без DOM/Electron)
│   │   ├── economics/   # Экономические расчёты
│   │   ├── metrics/     # ТЭП: схема и вычисления
│   │   ├── regulations/ # Нормативная база: правила, профили, конфликты
│   │   └── units.js     # Конвертация единиц
│   ├── geometry/        # Геометрия: генератор кварталов, дороги, turf-обёртки
│   ├── map/             # Leaflet: инициализация, рисование, рендер
│   ├── project/         # Файловые операции: сохранение, загрузка, экспорт
│   ├── renderer/        # Компоненты renderer: графики, панель результатов
│   ├── repositories/    # DocumentStore (нормативная база)
│   ├── services/        # Сервисы: расчёт, PDF-обработка, извлечение правил
│   ├── ui/              # UI-компоненты: chrome, панели, индикатор dirty
│   ├── workers/         # Utility process: PDF-анализ в фоне
│   └── zones/           # Конфигурация зон (жилая, дороги, зелень…)
├── test/
│   ├── unit/            # Юнит-тесты (domain, services)
│   └── integration/     # Интеграционные тесты (DocumentStore, PDF pipeline)
└── build/
    └── icon.png         # Иконка приложения (256×256)
```

---

## Настройка токенов лицензирования

Токены не хранятся в git. Перед запуском создайте файл `tokens.json`:

```bash
cp tokens.example.json tokens.json
# Откройте tokens.json и замените значения на реальные токены
```

Формат `tokens.json`:
```json
{
  "tokens": [
    "ВАШ-ТОКЕН-1",
    "ВАШ-ТОКЕН-2"
  ]
}
```

> **Важно:** `tokens.json` добавлен в `.gitignore` и не попадёт в репозиторий.  
> Для продакшена используйте серверную проверку (`verifyTokenRemotely` в `licensing.js`).

---

## Функциональность

| Возможность | Статус |
|---|---|
| Рисование участка на карте (Leaflet + OSM) | ✅ |
| Автогенерация сетки кварталов (7 зон) | ✅ |
| Расчёт ТЭП (площадь, жители, плотность и др.) | ✅ |
| Экспорт: GeoJSON, PNG, PDF-отчёт | ✅ |
| Сохранение/открытие проекта (.terrimind.json) | ✅ |
| Автосохранение + recovery | ✅ |
| Нормативная база из PDF-документов | ✅ |
| Встроенные нормативные профили (4 шт.) | ✅ |
| Светлая/тёмная тема | ✅ |
| Лицензионная активация | ✅ |

---

## Известные ограничения

### `unsafe-eval` в CSP
`turf.min.js` использует `new Function()` внутри библиотеки RBush (пространственный индекс).  
Это требует `'unsafe-eval'` в Content-Security-Policy. Риск минимален, так как:
- `contextIsolation: true` и `nodeIntegration: false`
- Приложение не загружает удалённый контент

**Для устранения:** перейти на кастомную сборку Turf без RBush-eval (rollup/esbuild).

### Local Mode лицензирования
MVP использует локальную проверку токенов (без сервера).  
Stub для серверной проверки уже реализован в `licensing.js` → `verifyTokenRemotely`.

---

## Технологии

- **Electron** 43 — desktop shell
- **Leaflet** 1.9 + **leaflet-draw** — карта и рисование
- **Turf.js** 6.5 — геопространственные операции
- **pdf.js** 4.7 — извлечение текста из PDF
- **Node.js test runner** — тестирование (без сторонних фреймворков)
