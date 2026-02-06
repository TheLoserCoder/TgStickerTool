# TgStickerTool

Electron приложение с React, Redux Toolkit, TypeScript и SCSS.

## Стек технологий

- **Runtime**: Node.js
- **Framework**: Electron + React 18+
- **State Management**: Redux Toolkit
- **Styling**: SCSS (CSS Modules)
- **Language**: TypeScript
- **Build Tool**: Vite

## Структура проекта

```
src/
├── main/              # Electron main процесс
│   ├── main.ts
│   └── preload.ts
├── renderer/          # React приложение
│   └── src/
│       ├── app/       # Redux Store
│       ├── features/  # Функциональные модули
│       └── shared/    # Общие ресурсы
└── common/            # Общие типы
```

## Команды

```bash
# Разработка
npm run dev

# Сборка
npm run build

# Создание дистрибутива
npm run make
```

## Разработка

Приложение запускается в режиме разработки с hot-reload для renderer процесса.
