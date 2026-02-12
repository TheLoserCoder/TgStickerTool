# Sharp Animation Detection & Upscaling Progress Fix

## Реализованные улучшения

### 1. Глубокая проверка анимации через Sharp metadata

**Проблема**: APNG файлы из LINE определялись как статичные изображения по расширению `.png`

**Решение**: 
```javascript
const metadata = await sharp(processPath, { animated: true }).metadata();
const isAnimated = preserveAnimation && metadata.pages && metadata.pages > 1;
```

- Проверка через `metadata.pages` вместо расширения файла
- Логирование: `File: sticker_0.png, pages: 40, isAnimated: true`
- Учитывается настройка пользователя `preserveAnimation`

### 2. Оптимизация памяти для массовой обработки

**Проблема**: Переполнение RAM при обработке большого количества изображений на AMD Ryzen 3 2200G

**Решение**:
```javascript
sharp.cache(false); // Перед обработкой
// ... обработка изображений
sharp.cache(true);  // После завершения
```

### 3. Детальный прогресс апскейлинга

**Проблема**: Прогресс застревал на 0% при апскейлинге

**Решение**:
- Добавлены вызовы `sendProgress('upscaling')` перед операциями масштабирования
- UI показывает текущий этап: "Апскейлинг", "Нарезка", "Конвертация", "Загрузка в ТГ"
- Отображается счетчик: "Изображений: 2 / 5"

**UI компоненты**:
```tsx
{progress.stage === 'upscaling' && 'Апскейлинг'}
{progress.stage === 'slicing' && 'Нарезка'}
{progress.stage === 'converting' && (progress.upscaled === 0 ? 'Загрузка в ТГ' : 'Конвертация')}
```

### 4. Сохранение стабильности сборки

✅ **electron-builder-afterpack.js** - не изменен  
✅ **package.json** - Windows targets: `["nsis", "portable"]`  
✅ **Linux build** - AppImage без изменений  
✅ **Sharp/FFmpeg** - нативные модули копируются корректно

## Технические детали

### Определение анимации
- **Метод**: `sharp.metadata()` с опцией `{ animated: true }`
- **Критерий**: `metadata.pages > 1`
- **Форматы**: APNG, GIF, WebP (animated)

### Прогресс обработки
1. **Upscaling** - увеличение разрешения (AI-апскейлер)
2. **Slicing** - нарезка на фрагменты
3. **Converting** - конвертация в WebP/WebM
4. **Загрузка в ТГ** - отправка в Telegram

### Производительность
- Отключение кэша Sharp при batch processing
- Параллельная обработка через Worker threads
- Оптимизация для AMD Ryzen 3 2200G (4 ядра)

## Результат

✅ APNG из LINE корректно определяются как анимированные  
✅ Прогресс апскейлинга отображается в реальном времени  
✅ Снижено потребление RAM при массовой обработке  
✅ Сборка для Windows и Linux остается стабильной
