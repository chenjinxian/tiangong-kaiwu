#!/usr/bin/env node
/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * End-to-End Workflow Test Script
 * Tests complete user journey: register → login → create iTwin → create iModel → view
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';
const IMODELHUB_URL = process.env.IMODELHUB_URL || 'http://localhost:4000';

// Test data
const TEST_USER = {
  email: `test_${Date.now()}@example.com`,
  password: 'Test123!@#',
  firstName: 'Test',
  lastName: 'User',
  name: 'Test User'
};

const TEST_PROJECT = {
  displayName: `Test Project ${Date.now()}`,
  description: 'Created by E2E test',
  type: 'Project'
};

class E2ETestRunner {
  constructor() {
    this.browser = null;
    this.page = null;
    this.results = [];
  }

  async checkServices() {
    console.log('🔍 Checking services...\n');

    const services = [
      { name: 'imodelhub-services', url: IMODELHUB_URL + '/health' },
      { name: 'modeling-server', url: 'http://localhost:4001/health' },
      { name: 'web', url: BASE_URL }
    ];

    for (const service of services) {
      try {
        const response = await fetch(service.url);
        if (response.ok) {
          console.log(`  ✅ ${service.name} is running`);
        } else {
          console.log(`  ⚠️  ${service.name} returned ${response.status}`);
        }
      } catch (error) {
        console.log(`  ❌ ${service.name} is not accessible`);
        console.log(`     URL: ${service.url}`);
        console.log(`     Error: ${error.message}`);
      }
    }
    console.log('');
  }

  async setup() {
    console.log('🚀 Starting E2E tests...\n');
    await this.checkServices();

    console.log('🌐 Launching browser...');
    this.browser = await chromium.launch({ headless: false });
    this.page = await this.browser.newPage({
      viewport: { width: 1280, height: 720 }
    });
    console.log('   Browser launched\n');
  }

  async teardown() {
    if (this.browser) {
      await this.browser.close();
      console.log('\n🌐 Browser closed');
    }
  }

  async runTest(name, testFn) {
    console.log(`📝 ${name}...`);
    try {
      await testFn();
      console.log(`   ✅ PASSED\n`);
      this.results.push({ name, status: 'PASSED' });
      return true;
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
      this.results.push({ name, status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testRegister() {
    return this.runTest('User Registration', async () => {
      await this.page.goto(`${BASE_URL}/register`);
      await this.page.waitForSelector('input[name="email"]', { timeout: 5000 });

      await this.page.fill('input[name="name"]', TEST_USER.name);
      await this.page.fill('input[name="email"]', TEST_USER.email);
      await this.page.fill('input[name="password"]', TEST_USER.password);
      await this.page.fill('input[name="confirmPassword"]', TEST_USER.password);

      await this.page.click('button[type="submit"]');

      // Wait for navigation to documents page
      await this.page.waitForURL(/.*\/documents.*/, { timeout: 10000 });

      // Verify logged in state
      const userMenu = await this.page.locator('.user-menu, [data-testid="user-menu"]').isVisible().catch(() => false);
      if (!userMenu) {
        throw new Error('User menu not found after registration');
      }
    });
  }

  async testLogin() {
    return this.runTest('User Login', async () => {
      await this.page.goto(`${BASE_URL}/login`);
      await this.page.waitForSelector('input[name="email"]', { timeout: 5000 });

      await this.page.fill('input[name="email"]', TEST_USER.email);
      await this.page.fill('input[name="password"]', TEST_USER.password);

      await this.page.click('button[type="submit"]');

      // Wait for navigation
      await this.page.waitForURL(/.*\/documents.*/, { timeout: 10000 });
    });
  }

  async testCreateITwin() {
    return this.runTest('Create iTwin Project', async () => {
      // Click create button
      await this.page.click('button:has-text("新建项目"), button:has-text("Create")');

      // Fill project form
      await this.page.fill('input[name="displayName"]', TEST_PROJECT.displayName);
      await this.page.fill('textarea[name="description"]', TEST_PROJECT.description);

      // Submit
      await this.page.click('button[type="submit"]');

      // Wait for project to appear
      await this.page.waitForSelector(`text=${TEST_PROJECT.displayName}`, { timeout: 10000 });
    });
  }

  async testNavigateToITwin() {
    return this.runTest('Navigate to iTwin Detail', async () => {
      // Click on the project
      await this.page.click(`text=${TEST_PROJECT.displayName}`);

      // Wait for detail page
      await this.page.waitForSelector('h1, .itwin-detail', { timeout: 5000 });
    });
  }

  async testCreateIModel() {
    return this.runTest('Create iModel', async () => {
      // Click create iModel button
      await this.page.click('button:has-text("新建 iModel"), button:has-text("Create iModel")');

      // Fill iModel form
      const imodelName = `Test iModel ${Date.now()}`;
      await this.page.fill('input[name="name"]', imodelName);
      await this.page.fill('textarea[name="description"]', 'Test iModel description');

      // Submit
      await this.page.click('button[type="submit"]');

      // Wait for iModel to appear
      await this.page.waitForSelector(`text=${imodelName}`, { timeout: 10000 });
    });
  }

  async testViewIModel() {
    return this.runTest('View iModel in 3D Viewer', async () => {
      // Click on iModel
      await this.page.click('.imodel-card, [data-testid="imodel-card"]');

      // Wait for viewer to load
      await this.page.waitForSelector('.luban-cad-viewer, canvas', { timeout: 15000 });

      // Wait a bit for 3D to render
      await setTimeout(3000);
    });
  }

  async testLogout() {
    return this.runTest('User Logout', async () => {
      // Click user menu
      await this.page.click('.user-avatar, .user-menu');

      // Click logout
      await this.page.click('text=退出登录, text=Logout');

      // Verify redirect to login
      await this.page.waitForURL(/.*\/login.*/, { timeout: 5000 });
    });
  }

  async runAllTests() {
    await this.setup();

    console.log('═══════════════════════════════════════════════════════');
    console.log('           LubanCAD - E2E Test Suite            ');
    console.log('═══════════════════════════════════════════════════════\n');

    // Run tests in sequence
    const tests = [
      { name: 'Service Health Check', fn: () => this.checkServices() },
      { name: 'User Registration', fn: () => this.testRegister() },
      { name: 'User Login', fn: () => this.testLogin() },
      { name: 'Create iTwin Project', fn: () => this.testCreateITwin() },
      { name: 'Navigate to iTwin', fn: () => this.testNavigateToITwin() },
      { name: 'Create iModel', fn: () => this.testCreateIModel() },
      { name: 'View iModel (3D)', fn: () => this.testViewIModel() },
      { name: 'User Logout', fn: () => this.testLogout() }
    ];

    for (const test of tests) {
      if (test.name === 'Service Health Check') {
        await test.fn();
        continue;
      }
      await test.fn();
    }

    await this.teardown();
    this.printReport();
  }

  printReport() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                    Test Report                       ');
    console.log('═══════════════════════════════════════════════════════\n');

    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;

    this.results.forEach((result, index) => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${index + 1}. ${icon} ${result.name}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log('\n─────────────────────────────────────────────────────');
    console.log(`Total: ${this.results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
    console.log('─────────────────────────────────────────────────────\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run tests
const runner = new E2ETestRunner();
runner.runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
