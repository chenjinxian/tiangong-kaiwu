/**
 * LubanCAD - 功能演示测试
 * 生成演示截图展示全部功能
 */
import { test, expect } from '@playwright/test';
import { waitForEditorReady } from './helpers';

const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#'
};

test.describe('LubanCAD 功能演示', () => {
  test('完整功能演示', async ({ page }) => {
    test.setTimeout(300000);

    // 1. 登录页面
    console.log('📸 1. 登录页面');
    await page.goto('/login');
    // 等待表单完全加载
    await page.waitForSelector('input[type="email"]', { state: 'visible' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'demo/01-login.png', fullPage: true });

    // 2. 登录
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.getByRole('button', { name: /^登录$|登录中|Sign In/i }).first().click();
    await page.waitForURL('**/itwins', { timeout: 15000 });

    // 3. 文档中心 - 我的项目（默认过滤即 my）
    console.log('📸 2. 文档中心 - 我的项目');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo/02-documents-my.png', fullPage: true });

    // 4. 创建项目对话框
    console.log('📸 3. 创建项目对话框');
    await page.getByRole('button', { name: '新建项目' }).click();
    // 对话框标题只存在于 aria-label（内层 heading 为空）—— 用 role 定位
    const dialog = page.getByRole('dialog', { name: '创建 iTwin 项目' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'demo/03-create-project-dialog.png', fullPage: true });

    // 5. 创建项目
    const projectName = `Demo Project ${Date.now()}`;
    await page.locator('input[placeholder="输入项目名称"]').fill(projectName);
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30000 });

    // 6. 项目详情页（项目卡片 = Tile 内嵌以项目名命名的 button）
    console.log('📸 4. 项目详情页');
    const projectItem = page.locator('main').getByRole('button', { name: projectName }).first();
    await expect(projectItem).toBeVisible({ timeout: 30000 });
    await projectItem.click();
    await page.waitForURL(/.*\/itwins\/.+/, { timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo/04-project-detail.png', fullPage: true });

    // 7. 创建 iModel 对话框（自绘 div 对话框，标题是可见文本）
    console.log('📸 5. 创建 iModel 对话框');
    await page.getByRole('button', { name: '新建 iModel' }).first().click();
    const imodelDialog = page.locator('.dialog-container').filter({ hasText: '创建 iModel' });
    await expect(imodelDialog).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'demo/05-create-imodel-dialog.png', fullPage: true });

    // 8. 创建 iModel
    const imodelName = `Demo iModel ${Date.now()}`;
    await page.locator('input[placeholder="输入模型名称"]').fill(imodelName);
    await imodelDialog.getByRole('button', { name: '创建', exact: true }).click();
    // onCreated 会让父组件即时关闭对话框 —— 以对话框关闭为创建完成信号
    await expect(imodelDialog).toBeHidden({ timeout: 120000 });

    // 9. 编辑器页面：「打开工作空间」（新建 iModel 异步初始化，未初始化时禁用）
    console.log('📸 6. 编辑器页面');
    const openBtn = page.getByRole('button', { name: '打开工作空间' }).first();
    await expect(openBtn).toBeVisible({ timeout: 60000 });
    await expect(openBtn).toBeEnabled({ timeout: 60000 });
    await openBtn.click();
    await page.waitForURL(/\/workspace\/.+/, { timeout: 60000 });
    await waitForEditorReady(page);
    await page.locator('.cad-toolbar-horizontal').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo/06-editor.png', fullPage: true });

    console.log('✅ 演示截图完成！');
  });
});
