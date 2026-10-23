import { test, expect, type Page } from '@playwright/test';
const key = 'arduino-constructor.project.v1';
async function stored(page: Page) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key);
}
async function panel(page: Page, name: 'Каталог / сборка' | 'Свойства') {
  const button = page.getByRole('button', { name: new RegExp(name) }).first();
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
}
async function openTemplate(page: Page, name: string) {
  await panel(page, 'Каталог / сборка');
  await page
    .getByRole('button', { name, exact: false })
    .filter({ has: page.locator('strong') })
    .click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
});

test('сборки, суставы, операции над деталями и восстановление', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  expect((await stored(page)).components).toHaveLength(8);
  await openTemplate(page, 'Рука-манипулятор');
  expect((await stored(page)).components).toHaveLength(11);
  await page.locator('.assembly-list button').filter({ hasText: 'Шарнир' }).first().click();
  await panel(page, 'Свойства');
  const slider = page.getByRole('slider', { name: 'Угол сустава' });
  const beforeJoint = await page.locator('canvas').screenshot();
  await slider.fill('45');
  await expect(page.locator('.joint-control output')).toHaveText('45.0°');
  expect((await page.locator('canvas').screenshot()).equals(beforeJoint)).toBe(false);
  expect(
    (await stored(page)).joints.find(
      (joint: { child: { componentId: string } }) => joint.child.componentId === 'shoulder',
    ).angle,
  ).toBeCloseTo(Math.PI / 4);
  await expect(page.getByLabel('Положение X', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Размер Y', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Сбросить угол', exact: true }).click();
  await expect(page.locator('.joint-control output')).toHaveText('0.0°');
  await page.getByRole('button', { name: 'Дублировать', exact: true }).click();
  expect((await stored(page)).components.length).toBeGreaterThan(11);
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  expect((await stored(page)).components).toHaveLength(11);
  const before = await stored(page);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await page.getByRole('button', { name: 'Сброс камеры', exact: true }).click();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-arm.png`,
    fullPage: true,
  });
  await openTemplate(page, 'Колёсный робот 2WD');
  expect((await stored(page)).components).toHaveLength(8);
  for (const name of ['Электросхема', 'Программирование', 'Испытания']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.mode-placeholder')).toContainText('ещё не реализованы');
  }
  await page.getByRole('button', { name: 'Вернуться в 3D-сборку' }).click();
  expect(errors).toEqual([]);
});

test('новый проект, каталог, JSON roundtrip и отклонение плохого файла', async ({ page }) => {
  await page.getByRole('button', { name: '＋ Новый', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  expect((await stored(page)).components).toHaveLength(0);
  await panel(page, 'Каталог / сборка');
  await page.getByLabel('Поиск деталей').fill('Балка');
  await page.locator('.catalog-list button').click();
  await panel(page, 'Свойства');
  await page.getByLabel('Положение X', { exact: true }).fill('125');
  await page.getByLabel('Поворот Y', { exact: true }).fill('180');
  await expect(page.getByLabel('Поворот Y', { exact: true })).toHaveValue('180');
  await page.getByLabel('Поворот Y', { exact: true }).fill('30');
  const project = await stored(page);
  expect(project.components[0].position[0]).toBe(0.125);
  expect(project.components[0].rotation[1]).toBeCloseTo(Math.PI / 6);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт JSON', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(project);
  await page
    .getByLabel('Файл проекта')
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schemaVersion":99}'),
    });
  await expect(page.getByRole('alert')).toContainText('Импорт отклонён');
  expect(await stored(page)).toEqual(project);
  await page
    .getByLabel('Файл проекта')
    .setInputFiles({
      name: 'valid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  expect(await stored(page)).toEqual(project);
});

test('3D камера, выбор модели и сенсорное управление', async ({ page, isMobile, browserName }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Hide panels to give both viewports enough room.
  for (const name of ['Каталог / сборка', 'Свойства']) {
    const button = page.getByRole('button', { name: new RegExp(name) }).first();
    if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
  }
  const canvas = page.locator('canvas');
  await page.getByRole('button', { name: 'Сверху', exact: true }).click();
  await page.waitForTimeout(350);
  const before = await canvas.screenshot();
  // Pick the centrally framed chassis/board, then verify the inspector has a selection.
  const bounds = (await canvas.boundingBox())!;
  await canvas
    .tap({ position: { x: bounds.width / 2, y: bounds.height / 2 } })
    .catch(async () => canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } }));
  await panel(page, 'Свойства');
  await expect(page.getByLabel('Название детали')).toBeVisible();
  await page.getByRole('button', { name: /^⌖ Свойства/ }).click();
  await page.getByRole('button', { name: 'Сброс камеры', exact: true }).click();
  await page.waitForTimeout(300);
  const beforeGesture = await canvas.screenshot();
  const beforeProject = await stored(page);
  if (isMobile && browserName === 'chromium') {
    const session = await page.context().newCDPSession(page);
    const b = (await canvas.boundingBox())!;
    const x = b.x + b.width * 0.3;
    const y = b.y + b.height * 0.25;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 55, y: y + 30, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 25, y, id: 1 },
        { x: x + 25, y, id: 2 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 45, y: y + 20, id: 1 },
        { x: x + 65, y: y + 20, id: 2 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await session.detach();
  } else {
    const b = (await canvas.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.3 + 60, b.y + b.height * 0.25 + 30, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, 100);
  }
  await page.waitForTimeout(400);
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  expect((await canvas.screenshot()).equals(beforeGesture)).toBe(false);
  expect(await stored(page)).toEqual(beforeProject);
  await page.getByRole('button', { name: 'Справа', exact: true }).click();
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/${isMobile ? 'mobile' : 'desktop'}-editor.png`,
    fullPage: true,
  });
});

test('повреждённое сохранение не перезаписывается автоматически', async ({ page }) => {
  await page.evaluate((storageKey) => localStorage.setItem(storageKey, 'invalid'), key);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Исходное сохранение не перезаписано');
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(
    'invalid',
  );
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  expect((await stored(page)).schemaVersion).toBe(2);
});

test('перетаскивание оси и кольца действительно меняет трансформацию', async ({
  page,
  isMobile,
}) => {
  const { PNG } = await import('pngjs');
  await page.getByRole('button', { name: '＋ Новый', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await panel(page, 'Каталог / сборка');
  await page.getByLabel('Поиск деталей').fill('Балка');
  await page.locator('.catalog-list button').click();
  await page.getByRole('button', { name: /^☰ Каталог/ }).click();
  const properties = page.getByRole('button', { name: /^⌖ Свойства/ });
  if ((await properties.getAttribute('aria-expanded')) === 'true') await properties.click();
  await page.getByRole('button', { name: 'Спереди', exact: true }).click();
  await page.waitForTimeout(250);
  const canvas = page.locator('canvas');
  // Find a colored control handle in rendered pixels, avoiding assumptions about device DPR.
  async function handle(color: 'red' | 'blue') {
    const image = PNG.sync.read(await canvas.screenshot({ scale: 'css' }));
    const points: { x: number; y: number }[] = [];
    for (let y = 5; y < image.height - 5; y++)
      for (let x = 5; x < image.width - 5; x++) {
        const i = (image.width * y + x) * 4;
        const [r, g, b] = image.data.subarray(i, i + 3);
        if (color === 'red' ? r > 180 && g < 100 && b < 100 : b > 180 && r < 100 && g < 140)
          points.push({ x, y });
      }
    expect(points.length).toBeGreaterThan(10);
    const maxX = Math.max(...points.map((p) => p.x));
    const edge = points.filter((p) => p.x >= maxX - (color === 'red' ? 6 : 12));
    return {
      x: edge.reduce((sum, p) => sum + p.x, 0) / edge.length,
      y: edge.reduce((sum, p) => sum + p.y, 0) / edge.length,
    };
  }
  async function drag(from: { x: number; y: number }, dx: number, dy: number, cancel = false) {
    const bounds = (await canvas.boundingBox())!;
    const x = bounds.x + from.x;
    const y = bounds.y + from.y;
    if (isMobile) {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let step = 1; step <= 5; step++)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + (dx * step) / 5, y: y + (dy * step) / 5, id: 1 }],
        });
      await session.send('Input.dispatchTouchEvent', {
        type: cancel ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      });
      await session.detach();
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 5 });
      await page.mouse.up();
    }
  }
  if (isMobile) {
    const beforeCancel = await stored(page);
    await drag(await handle('red'), 20, 0, true);
    expect(await stored(page)).toEqual(beforeCancel);
  }
  await drag(await handle('red'), 35, 0);
  await expect.poll(async () => (await stored(page)).components[0].position[0]).not.toBe(0);
  await page.getByRole('button', { name: '↻ Поворот', exact: true }).click();
  await page.waitForTimeout(200);
  await drag(await handle('blue'), -15, -40);
  await expect
    .poll(async () => Math.hypot(...(await stored(page)).components[0].rotation))
    .toBeGreaterThan(0.1);
  const result = await stored(page);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  expect(await stored(page)).toEqual(result);
});
