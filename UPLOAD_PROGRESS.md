# Реализация пошаговой загрузки с прогрессом

## Изменения в архитектуре

### 1. Типы (src/common/types.ts)
- Добавлен интерфейс `TelegramUploadProgress` для данных прогресса
- Добавлены IPC каналы: `TELEGRAM_UPLOAD_PROGRESS`, `TELEGRAM_UPLOAD_COMPLETE`
- Обновлен `ElectronAPI` с методами `onTelegramUploadProgress` и `onTelegramUploadComplete`

### 2. Main Process (src/main/services/TelegramBotClient.ts)
- Метод `createPack` теперь принимает callback `onProgress`
- Пошаговая загрузка: первый стикер через `createNewStickerSet`, остальные через `addStickerToSet`
- После каждого стикера вызывается `onProgress(current, total)`
- Задержка между стикерами увеличена до 800ms
- Проверка успешности загрузки каждого стикера

### 3. Main Process (src/main/main.ts)
- В обработчике `CREATE_TELEGRAM_PACK` добавлена функция `sendProgress`
- Прогресс отправляется через `event.sender.send(IPC_CHANNELS.TELEGRAM_UPLOAD_PROGRESS, ...)`
- После завершения отправляется событие `TELEGRAM_UPLOAD_COMPLETE`

### 4. Preload (src/main/preload.ts)
- Добавлены обработчики `onTelegramUploadProgress` и `onTelegramUploadComplete`
- События прокидываются из main в renderer через contextBridge

### 5. Renderer (src/renderer/src/features/pack/PackViewPage.tsx)
- Добавлен state `uploadProgress` для хранения данных прогресса
- В `useEffect` подписка на события прогресса и завершения
- Прогресс-бар отображается под кнопкой загрузки
- При завершении показывается alert с результатом

### 6. Стили (src/renderer/src/features/pack/PackViewPage.module.scss)
- Добавлены классы для прогресс-бара: `progressContainer`, `progressBar`, `progressFill`, `progressText`

## Как это работает

1. Пользователь нажимает "Загрузить в Telegram"
2. Main процесс начинает загрузку первого стикера
3. После успеха отправляется прогресс: 1/N
4. Цикл загружает остальные стикеры по одному
5. После каждого стикера отправляется обновленный прогресс
6. При завершении отправляется событие `TELEGRAM_UPLOAD_COMPLETE`
7. Renderer обновляет прогресс-бар в реальном времени
8. При ошибке загрузка прерывается с сообщением об ошибке

## Безопасность

- Используется буферное чтение файлов через `fs.readFileSync`
- Патч fetch с `duplex: 'half'` для совместимости с Electron
- Задержка 800ms между запросами для предотвращения rate limiting
