/**
 * Open Cloud CAD - 功能演示测试
 * 生成演示截图展示全部功能
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#'
};

test.describe('Open Cloud CAD 功能演示', () => {
  test('完整功能演示', async ({ page }) => {
    test.setTimeout(300000);
    
    // 1. 登录页面
    console.log('📸 1. 登录页面');
    await page.goto(`${BASE_URL}/login`);
    // 等待表单完全加载
    await page.waitForSelector('input[type="email"]', { state: 'visible' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'demo/01-login.png', fullPage: true });
    
    // 2. 登录
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/itwins');
    
    // 3. 文档中心 - 最近打开
    console.log('📸 2. 文档中心 - 最近打开');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo/02-documents-recent.png', fullPage: true });
    
    // 4. 切换到我的项目
    console.log('📸 3. 文档中心 - 我的项目');
    await page.click('button:has-text("我的项目")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'demo/03-documents-my.png', fullPage: true });
    
    // 5. 创建项目对话框
    console.log('📸 4. 创建项目对话框');
    await page.click('button:has-text("新建项目")');
    await page.waitForSelector('text=创建 iTwin 项目');
    await page.screenshot({ path: 'demo/04-create-project-dialog.png', fullPage: true });
    
    // 6. 创建项目
    const projectName = `Demo Project ${Date.now()}`;
    await page.fill('input[placeholder="输入项目名称"]', projectName);
    await page.click('button:has-text("创建")');
    await page.waitForTimeout(3000);
    
    // 7. 项目详情页
    console.log('📸 5. 项目详情页');
    await page.click(`text=${projectName}`);
    await page.waitForURL(/.*\/itwins\/.+/);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo/05-project-detail.png', fullPage: true });
    
    // 8. 创建 iModel 对话框
    console.log('📸 6. 创建 iModel 对话框');
    await page.click('button:has-text("新建 iModel")');
    await page.waitForSelector('text=创建 iModel');
    await page.screenshot({ path: 'demo/06-create-imodel-dialog.png', fullPage: true });
    
    // 9. 创建 iModel
    const imodelName = `Demo iModel ${Date.now()}`;
    await page.fill('input[placeholder="输入模型名称"]', imodelName);
    await page.click('button:has-text("创建")');
    await page.waitForTimeout(3000);
    
    // 10. 编辑器页面
    console.log('📸 7. 编辑器页面');
    // 点击"打开"按钮进入编辑器
    await page.click('button:has-text("打开")');
    await page.waitForURL(/\/workspace\/.+/, { timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'demo/07-editor.png', fullPage: true });
    
    console.log('✅ 演示截图完成！');
  });
});
