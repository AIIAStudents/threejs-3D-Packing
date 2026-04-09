import { test, expect } from '@playwright/test';
import { FRONTEND_URL } from './phase5-test-helpers.js';

test.describe.configure({ mode: 'serial' });

test('preview routes still initialize key DOM and worker bindings', async ({ page }) => {
  test.setTimeout(120000);
  const consoleMessages = [];

  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text()
    });
  });

  await page.goto(`${FRONTEND_URL}/#/view-final`);
  await expect(page.locator('.packing-results-page')).toBeVisible();
  await expect(page.locator('#preview-container')).toHaveCount(1);
  await expect(page.locator('#space-select')).toBeVisible();

  await expect
    .poll(() =>
      consoleMessages.some(
        (entry) =>
          entry.type === 'log' && entry.text.includes('[ThreeViewer] Worker initialized')
      )
    )
    .toBe(true);

  await expect
    .poll(async () => {
      const value = await page.locator('#total-count').textContent();
      return (value || '').trim();
    })
    .not.toBe('-');

  await page.goto(`${FRONTEND_URL}/#/animation-preview`);
  await expect(page.locator('.animation-flow-page')).toBeVisible();
  await expect(page.locator('#animation-canvas')).toHaveCount(1);
  await expect(page.locator('#ui-panel')).toBeVisible();

  const blockingErrors = consoleMessages.filter((entry) => {
    if (entry.type !== 'error') return false;
    return (
      entry.text.includes("Unexpected token '<'") ||
      entry.text.includes('Preview container not found') ||
      entry.text.includes("Cannot read properties of null")
    );
  });

  expect(blockingErrors).toEqual([]);
});
