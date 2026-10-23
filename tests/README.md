# Tests

Место будущих интеграционных тестов (MCU + электроника + механика). Текущий unit-тест находится в `src/domain/templates.test.ts`.

V0.1: `src/domain/project.test.ts` проверяет операции и формат проекта. `editor.e2e.ts` — браузерные сценарии (desktop Chromium и Pixel 7), запуск `npm run test:e2e` после `npx playwright install chromium`. Эти файлы имеют суффикс `.e2e.ts`, чтобы Vitest не запускал браузерные тесты.
