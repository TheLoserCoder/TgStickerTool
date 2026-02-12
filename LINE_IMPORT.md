# Импорт стикеров LINE

## Описание

Модуль позволяет импортировать стикеры из LINE Store напрямую в редактор приложения без сохранения временных файлов на диск.

## Архитектура

### Main Process (`src/main/main.ts`)

- **IPC Handler**: `IMPORT_LINE_STICKERS`
- **Зависимости**: `axios`, `cheerio`
- **Логика**:
  1. Загружает HTML страницу LINE Store
  2. Парсит элементы `li.mdCMN09Li` с атрибутом `data-preview`
  3. Определяет тип стикера (animation/static) и формирует URL
  4. Загружает изображения через axios (arraybuffer)
  5. Конвертирует в Base64 и возвращает массив

### Renderer Process

#### UI компоненты
- **ImportLineDialog** (`src/renderer/src/shared/components/ui/ImportLineDialog.tsx`)
  - Диалог ввода URL LINE Store
  - Использует Radix UI Dialog
  - SCSS Modules для стилизации

#### Интеграция в HomePage
- Кнопка "Импорт из LINE" с иконкой DownloadIcon
- Обработчик `handleLineImport`:
  - Вызывает `window.electron.importLineStickers(url)`
  - Создает объекты изображений с Base64 данными
  - Использует существующий `addImages` action
  - Переходит в редактор через `navigateTo('EDITOR')`

## Использование

1. На главной странице нажать "Импорт из LINE"
2. Вставить ссылку вида: `https://store.line.me/stickershop/product/...`
3. Дождаться загрузки
4. Стикеры откроются в редакторе как обычные изображения

## Технические детали

- **Формат данных**: PNG изображения в Base64 (data URI)
- **Шаблоны URL**:
  - Анимированные: `sticker_animation@2x.png`
  - Статичные: `sticker@2x.png`
- **Жизненный цикл**: Данные хранятся в Redux store, уничтожаются при закрытии редактора
- **Интеграция**: Использует ту же логику, что и локальные файлы

## Ограничения

- Не создаются временные файлы
- Данные хранятся только в памяти
- При закрытии без сохранения данные теряются
