/**
 * 工具快捷键真栈验收（Onshape 口径：shift+s 草图 / shift+e 拉伸 / shift+w 旋转 /
 * shift+f 圆角）。Ribbon 主钮 shortcut 元数据此前只用于 tooltip/menu 展示，
 * 本轮接到同一 activate 路由；输入框/可编辑焦点不拦截。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

test.describe('编辑器工具快捷键（Onshape 对拍）', () => {
  test('shift+s 打开草图对话框；关闭后 shift+e 打开拉伸对话框', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 180_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return await openSeedImodelEditor(page, seed);
      }
    };
    await openWithRetry();
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 60_000 });

    await page.keyboard.press('Shift+S');
    const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(sketchDialog).toBeVisible({ timeout: 15_000 });
    await sketchDialog.locator('.part-studio-sketch-dialog__cancel').click();
    await expect(sketchDialog).toHaveCount(0, { timeout: 10_000 });

    await page.keyboard.press('Shift+E');
    const featureDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(featureDialog).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(featureDialog).toHaveCount(0, { timeout: 10_000 });
  });
});
