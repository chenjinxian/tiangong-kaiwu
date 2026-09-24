#!/usr/bin/env node
/**
 * LubanCAD Demo Video Recorder
 * Records a full demonstration video of the platform
 *
 * Usage: npx playwright install chromium (first time)
 *        node scripts/record-demo-video.js
 */

const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const VIDEO_DIR = path.join(__dirname, '../videos');

// Ensure video directory exists
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function recordDemo() {
  console.log('🎬 Starting LubanCAD Demo Recording...\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080']
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1920, height: 1080 }
    },
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    // Step 1: Registration
    console.log('📋 Step 1: User Registration');
    await page.goto('http://localhost:3000/register', { waitUntil: 'load' });
    await page.waitForTimeout(8000); // Wait for React to render

    // Debug: check what's on the page
    const html = await page.content();
    console.log('   Page loaded, length:', html.length);

    // Take debug screenshot
    await page.screenshot({ path: path.join(VIDEO_DIR, 'debug-register.png') });

    // Use specific selectors - name needs space to separate first/last name
    await page.locator('#name').fill('演 示用户');
    await page.waitForTimeout(500);
    await page.locator('#email').fill(`demo${Date.now()}@example.com`);
    await page.waitForTimeout(500);
    await page.locator('#password').fill('DemoPassword123!');
    await page.waitForTimeout(500);
    await page.locator('#confirmPassword').fill('DemoPassword123!');
    await page.waitForTimeout(500);
    // Check the terms checkbox
    await page.locator('input[type="checkbox"]').check();
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('   ✅ Registration completed');

    // Step 2: iTwin Creation
    console.log('🏗️  Step 2: Creating iTwin');
    await page.waitForTimeout(3000); // Wait for redirect to iTwins page
    await page.screenshot({ path: path.join(VIDEO_DIR, 'debug-itwins.png') });
    await page.getByRole('button', { name: '新建项目' }).first().click();
    await page.waitForTimeout(2000);
    await page.locator('input#displayName').fill('演示项目2025');
    await page.waitForTimeout(500);
    await page.click('button:has-text("创建")');
    await page.waitForTimeout(3000);
    console.log('   ✅ iTwin created');

    // Step 3: Empty iModel Creation
    console.log('📦 Step 3: Creating Empty iModel');
    await page.waitForTimeout(3000);
    // Click on the iTwin card to go to detail page
    await page.getByText('演示项目2025').click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: '新建 iModel' }).first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(VIDEO_DIR, 'debug-imodel-dialog.png') });
    // Fill first input (模型名称)
    await page.locator('input').first().fill('EmptyModel');
    await page.waitForTimeout(500);
    await page.click('button:has-text("创建")');
    await page.waitForTimeout(5000); // Wait for initialization
    console.log('   ✅ Empty iModel created');

    // Step 4: Open Empty iModel
    console.log('👁️  Step 4: Opening Empty iModel');
    await page.click('button:has-text("打开")');
    await page.waitForTimeout(5000);
    console.log('   ✅ Empty iModel opened');

    // Step 5: Go back and create iModel with baseline
    console.log('📤 Step 5: Creating iModel with Baseline');
    await page.goto('http://localhost:3000/itwins');
    await page.waitForTimeout(2000);
    await page.click('text=演示项目2025');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: '新建 iModel' }).first().click();
    await page.waitForTimeout(1000);
    await page.locator('input').first().fill('HouseWithBaseline');
    await page.waitForTimeout(500);

    // Upload baseline file if exists
    const baselinePath = path.join(__dirname, '../house_model.bim');
    if (fs.existsSync(baselinePath)) {
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(baselinePath);
      await page.waitForTimeout(2000);
      console.log('   📁 Baseline file uploaded');
    } else {
      console.log('   ⚠️  Baseline file not found at ' + baselinePath + ', creating empty iModel');
    }

    await page.click('button:has-text("创建")');
    console.log('   ⏳ Uploading and processing baseline file...');
    await page.waitForTimeout(5000); // Wait for dialog to close and processing to start

    // Wait for HouseWithBaseline to show "就绪" status
    console.log('   ⏳ Waiting for HouseWithBaseline to be ready...');
    // Look for the specific iModel card with HouseWithBaseline and 就绪 status
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('*');
      for (const el of cards) {
        if (el.textContent?.includes('HouseWithBaseline')) {
          // Found HouseWithBaseline, now check if parent has 就绪
          const parent = el.closest('[class*="card"]') || el.parentElement?.parentElement?.parentElement;
          if (parent && parent.textContent?.includes('就绪')) {
            return true;
          }
        }
      }
      return false;
    }, { timeout: 120000 });
    console.log('   ✅ HouseWithBaseline is ready');
    await page.waitForTimeout(2000);

    // Step 6: Open baseline iModel
    console.log('👁️  Step 6: Opening Baseline iModel');
    // Find HouseWithBaseline card and click its "打开" button
    const houseCard = await page.locator('text=HouseWithBaseline').locator('xpath=ancestor::*[contains(@class, "card") or contains(@class, "Card")]').first();
    await houseCard.locator('button:has-text("打开")').first().click();
    await page.waitForTimeout(10000);
    console.log('   ✅ Baseline iModel opened');

    // Final view
    await page.waitForTimeout(5000);

    console.log('\n🎉 Demo recording completed!');
    console.log(`📁 Video saved to: ${VIDEO_DIR}\n`);

  } catch (error) {
    console.error('❌ Error during recording:', error);
  } finally {
    await context.close();
    await browser.close();

    // List generated videos
    const videos = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));
    if (videos.length > 0) {
      console.log('📹 Generated videos:');
      videos.forEach(v => console.log(`   - ${v}`));
    }
  }
}

recordDemo().catch(console.error);
