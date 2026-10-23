import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const oldArm = JSON.parse(
  readFileSync(new URL('./fixtures/v0.1-arm.json', import.meta.url), 'utf8'),
);
const key = 'arduino-constructor.project.v1';
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
}
async function panel(page: Page, name: string) {
  const button = page.getByRole('button', { name: new RegExp(name) }).first();
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
}
async function worldPoses(page: Page): Promise<Record<string, number[]>> {
  return page.evaluate(async (storageKey) => {
    const path = '/src/domain/mechanics.ts';
    const { worldMatrices } = await import(path);
    const project = JSON.parse(localStorage.getItem(storageKey)!);
    return Object.fromEntries(
      [...worldMatrices(project)].map(([id, matrix]) => [id, matrix.elements]),
    );
  }, key);
}
function closePoses(a: Record<string, number[]>, b: Record<string, number[]>) {
  for (const id of Object.keys(a)) a[id].forEach((n, i) => expect(n).toBeCloseTo(b[id][i], 9));
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
});

test('колесо закреплено, сустав управляется касанием, а шасси переносит робот', async ({
  page,
  isMobile,
}) => {
  await panel(page, 'Каталог / сборка');
  await page.locator('.assembly-list button').filter({ hasText: 'Ведущее колесо' }).first().click();
  await panel(page, 'Свойства');
  await expect(page.getByLabel('Положение X', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Поворот Y', { exact: true })).toBeDisabled();
  const before = await worldPoses(page);
  const slider = page.getByRole('slider', { name: 'Угол сустава' });
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  if (isMobile) await page.touchscreen.tap(box.x + box.width * 0.78, box.y + box.height / 2);
  else await slider.click({ position: { x: box.width * 0.78, y: box.height / 2 } });
  await expect
    .poll(
      async () =>
        (await stored(page)).joints.find(
          (joint: { child: { componentId: string } }) => joint.child.componentId === 'wheel-left',
        ).angle,
    )
    .not.toBe(0);
  const rotated = await worldPoses(page);
  expect(rotated['wheel-left'].slice(12, 15)).toEqual(before['wheel-left'].slice(12, 15));
  await page.getByLabel('Максимальный угол').fill('30');
  expect(
    (await stored(page)).joints.find(
      (joint: { child: { componentId: string } }) => joint.child.componentId === 'wheel-left',
    ).angle,
  ).toBeLessThanOrEqual(Math.PI / 6 + 1e-8);
  await page.getByRole('button', { name: 'Сбросить угол', exact: true }).click();
  await expect(page.locator('.joint-control output')).toHaveText('0.0°');
  await page.locator('.assembly-list button').filter({ hasText: 'Шасси 2WD' }).click();
  const initial = await worldPoses(page);
  await page.getByLabel('Положение X', { exact: true }).fill('200');
  const moved = await worldPoses(page);
  for (const id of Object.keys(initial)) {
    expect(moved[id][12] - initial[id][12]).toBeCloseTo(0.2, 9);
    expect(moved[id][13]).toBeCloseTo(initial[id][13], 9);
    expect(moved[id][14]).toBeCloseTo(initial[id][14], 9);
  }
  const saved = await stored(page);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  expect(await stored(page)).toEqual(saved);
});

test('Соединить: создание, редактирование рамки, цикл, смена ведущей детали и отсоединение', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: '＋ Новый', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await panel(page, 'Каталог / сборка');
  await page.getByLabel('Поиск деталей').fill('Балка');
  for (let i = 0; i < 3; i++) await page.locator('.catalog-list button').click();
  const [a, b, c] = (await stored(page)).components;
  await page.getByRole('button', { name: '⛓ Соединить', exact: true }).click();
  await page.getByLabel('Первая деталь', { exact: true }).selectOption(a.id);
  await page.getByLabel('Первая точка крепления', { exact: true }).selectOption('top');
  await page.getByLabel('Вторая деталь', { exact: true }).selectOption(b.id);
  await page.getByLabel('Вторая точка крепления', { exact: true }).selectOption('bottom');
  await page.getByLabel('Тип нового соединения', { exact: true }).selectOption('axle');
  await expect(page.getByRole('button', { name: 'Совместить и соединить' })).toBeDisabled();
  await page.getByLabel('Тип нового соединения', { exact: true }).selectOption('revolute');
  await page.getByRole('button', { name: 'Совместить и соединить' }).click();
  expect((await stored(page)).joints).toHaveLength(1);
  await expect(page.getByLabel('Положение X', { exact: true })).toBeDisabled();
  await page.getByRole('slider', { name: 'Угол сустава' }).fill('25');
  await page.getByText('Локальные крепёжные рамки', { exact: true }).click();
  await page.getByLabel('Ведущее крепление position X', { exact: true }).fill('15');
  expect((await stored(page)).joints[0].parent.frame.position[0]).toBe(0.015);
  const before = await worldPoses(page);
  await page.getByLabel('Родитель соединения', { exact: true }).selectOption(c.id);
  closePoses(await worldPoses(page), before);
  await page.getByRole('button', { name: '⛓ Соединить', exact: true }).click();
  await page.getByLabel('Первая деталь', { exact: true }).selectOption(b.id);
  await page.getByLabel('Вторая деталь', { exact: true }).selectOption(c.id);
  await page.getByRole('button', { name: 'Совместить и соединить' }).click();
  await expect(page.getByRole('alert')).toContainText('Циклическая');
  expect((await stored(page)).joints).toHaveLength(1);
  await page.getByRole('button', { name: 'Закрыть режим', exact: true }).click();
  await page.getByRole('button', { name: 'Отсоединить деталь', exact: true }).click();
  expect((await stored(page)).joints).toHaveLength(0);
  closePoses(await worldPoses(page), before);
  await expect(page.getByLabel('Положение X', { exact: true })).toBeEnabled();
  const freeBefore = await worldPoses(page);
  await page.getByLabel('Родитель детали', { exact: true }).selectOption(a.id);
  closePoses(await worldPoses(page), freeBefore);
  const saved = await stored(page);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  expect(await stored(page)).toEqual(saved);
  expect(errors).toEqual([]);
});

test('V0.1 автоматически мигрирует с backup, рука и суставы восстанавливаются', async ({
  page,
}) => {
  await page.evaluate(
    ({ key, project }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(project));
    },
    { key, project: oldArm },
  );
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  const migrated = await stored(page);
  expect(migrated.schemaVersion).toBe(2);
  expect(migrated.joints.length).toBeGreaterThan(0);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(`${key}.schema1-backup`)!), key),
  ).toEqual(oldArm);
  await panel(page, 'Каталог / сборка');
  await panel(page, 'Свойства');
  for (const id of ['platform', 'shoulder', 'elbow', 'wrist']) {
    const part = migrated.components.find((part: { id: string }) => part.id === id);
    const same = migrated.components.filter((item: { name: string }) => item.name === part.name);
    const index = same.findIndex((item: { id: string }) => item.id === id);
    await page.locator('.assembly-list button').filter({ hasText: part.name }).nth(index).click();
    await page.getByRole('slider', { name: 'Угол сустава' }).fill('35');
    await expect(page.locator('.joint-control output')).toHaveText('35.0°');
  }
  const saved = await stored(page),
    before = await worldPoses(page);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  expect(await stored(page)).toEqual(saved);
  closePoses(await worldPoses(page), before);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-mechanics.png`,
    fullPage: true,
  });
});
