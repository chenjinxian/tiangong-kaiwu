#!/usr/bin/env node
/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * API Workflow Test - Tests complete user journey via REST APIs
 */

import { setTimeout as sleep } from 'timers/promises';

const IMODELHUB_URL = process.env.IMODELHUB_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';

// Test data - use consistent credentials
const TEST_USER = {
  email: `test_e2e_${Date.now()}@example.com`,
  password: 'Test123456!',
  firstName: 'Test',
  lastName: 'User'
};

class APITestRunner {
  constructor() {
    this.results = [];
    this.accessToken = null;
    this.refreshToken = null;
    this.userId = null;
    this.iTwinId = null;
    this.iModelId = null;
  }

  log(message, type = 'info') {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
      step: '📝'
    };
    console.log(`${icons[type] || 'ℹ️'} ${message}`);
  }

  async runTest(name, testFn) {
    console.log(`\n📝 ${name}`);
    console.log('─'.repeat(50));
    try {
      await testFn();
      this.results.push({ name, status: 'PASSED' });
      this.log('PASSED', 'success');
      return true;
    } catch (error) {
      this.results.push({ name, status: 'FAILED', error: error.message });
      this.log(`FAILED: ${error.message}`, 'error');
      return false;
    }
  }

  async checkServices() {
    console.log('\n🔍 Checking Services');
    console.log('═'.repeat(50));

    const services = [
      { name: 'imodelhub-services', url: `${IMODELHUB_URL}/health` },
      { name: 'backend', url: `${BACKEND_URL}/health` }
    ];

    for (const service of services) {
      try {
        const response = await fetch(service.url);
        if (response.ok) {
          this.log(`${service.name} is running`, 'success');
        } else {
          this.log(`${service.name} returned ${response.status}`, 'warning');
        }
      } catch (error) {
        this.log(`${service.name} is not accessible: ${error.message}`, 'error');
      }
    }
  }

  async testRegister() {
    return this.runTest('1. User Registration', async () => {
      // Use the same TEST_USER credentials for registration
      const uniqueUser = {
        email: TEST_USER.email,
        password: TEST_USER.password,
        firstName: TEST_USER.firstName,
        lastName: TEST_USER.lastName
      };

      const response = await fetch(`${IMODELHUB_URL}/auth/email/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uniqueUser)
      });

      // Handle 204 No Content (registration successful but no response body)
      if (response.status === 204) {
        this.log('User registered successfully (no content)', 'success');
        return;
      }

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        // If user already exists, that's okay for test purposes
        if (data.message?.includes('exists') || data.message?.includes('already')) {
          this.log('User already exists, continuing with login', 'warning');
          return;
        }
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      if (!data.user || !data.token) {
        throw new Error('Invalid response: missing user or token');
      }

      this.userId = data.user.id;
      this.accessToken = data.token;
      this.refreshToken = data.refreshToken;

      this.log(`User registered: ${data.user.email}`, 'success');
      this.log(`Access token received: ${this.accessToken.substring(0, 20)}...`, 'info');
    });
  }

  async testLogin() {
    return this.runTest('2. User Login', async () => {
      const response = await fetch(`${IMODELHUB_URL}/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_USER.email,
          password: TEST_USER.password
        })
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      this.accessToken = data.token;
      this.refreshToken = data.refreshToken;

      const email = data.user?.email || data.email || TEST_USER.email;
      this.log(`User logged in: ${email}`, 'success');
    });
  }

  async testGetCurrentUser() {
    return this.runTest('3. Get Current User', async () => {
      if (!this.accessToken) {
        this.log('Skipping: No access token available', 'warning');
        return;
      }

      const response = await fetch(`${IMODELHUB_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      const text = await response.text();
      const user = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${user.message || ''}`);
      }

      const email = user.email || user.user?.email || 'unknown';
      this.log(`Current user: ${email}`, 'success');
    });
  }

  async testCreateITwin() {
    return this.runTest('4. Create iTwin Project', async () => {
      if (!this.accessToken) {
        this.log('Skipping: No access token available', 'warning');
        return;
      }

      const response = await fetch(`${IMODELHUB_URL}/itwins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          displayName: `Test Project ${Date.now()}`,
          description: 'Created by API workflow test',
          subClass: 'Project',
          class: 'Project'
        })
      });

      const text = await response.text();
      const iTwin = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(iTwin.message || `HTTP ${response.status}`);
      }

      // Handle different response formats
      this.iTwinId = iTwin.id || iTwin.iTwin?.id || iTwin.data?.id;
      const displayName = iTwin.displayName || iTwin.name || iTwin.iTwin?.displayName || 'Unnamed';

      if (!this.iTwinId) {
        throw new Error('Invalid response: missing iTwin ID');
      }

      this.log(`iTwin created: ${displayName}`, 'success');
      this.log(`iTwin ID: ${this.iTwinId}`, 'info');
    });
  }

  async testListITwins() {
    return this.runTest('5. List iTwins', async () => {
      if (!this.accessToken) {
        this.log('Skipping: No access token available', 'warning');
        return;
      }

      const response = await fetch(`${IMODELHUB_URL}/itwins`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      const iTwins = data.iTwins || data.data || data;
      this.log(`Found ${Array.isArray(iTwins) ? iTwins.length : 0} iTwins`, 'success');
    });
  }

  async testGetITwinDetails() {
    return this.runTest('6. Get iTwin Details', async () => {
      if (!this.iTwinId) {
        this.log('Skipping: No iTwin ID available', 'warning');
        return;
      }

      const response = await fetch(`${IMODELHUB_URL}/itwins/${this.iTwinId}`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      const text = await response.text();
      const iTwin = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(iTwin.message || `HTTP ${response.status}`);
      }

      const displayName = iTwin.displayName || iTwin.name || 'Unnamed';
      this.log(`iTwin: ${displayName}`, 'success');
    });
  }

  async testCreateIModel() {
    return this.runTest('7. Create iModel', async () => {
      if (!this.iTwinId) {
        this.log('Skipping: No iTwin ID available', 'warning');
        return;
      }

      const timestamp = Date.now();
      const response = await fetch(`${IMODELHUB_URL}/imodels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          iTwinId: this.iTwinId,
          name: `Test-iModel-${timestamp}`,
          displayName: `Test iModel ${timestamp}`,
          description: 'Created by API workflow test'
        })
      });

      const text = await response.text();
      const iModel = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(iModel.message || `HTTP ${response.status}`);
      }
      this.iModelId = iModel.id || iModel.iModel?.id || iModel.data?.id;
      const displayName = iModel.displayName || iModel.name || iModel.iModel?.displayName || 'Unnamed';

      this.log(`iModel created: ${displayName}`, 'success');
      this.log(`iModel ID: ${this.iModelId}`, 'info');
    });
  }

  async testListIModels() {
    return this.runTest('8. List iModels', async () => {
      if (!this.accessToken) {
        this.log('Skipping: No access token available', 'warning');
        return;
      }

      const iTwinIdParam = this.iTwinId ? `?iTwinId=${this.iTwinId}` : '';
      const response = await fetch(`${IMODELHUB_URL}/imodels${iTwinIdParam}`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      const iModels = data.iModels || data.data || data;
      this.log(`Found ${Array.isArray(iModels) ? iModels.length : 0} iModels`, 'success');
    });
  }

  async testBackendHealth() {
    return this.runTest('9. Backend Health Check', async () => {
      const response = await fetch(`${BACKEND_URL}/health`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const health = await response.json();
      this.log(`Backend status: ${health.status}`, 'success');
      this.log(`WebSocket clients: ${health.websocket?.connectedClients || 0}`, 'info');
    });
  }

  async testBackendRPC() {
    return this.runTest('10. Backend RPC Metadata', async () => {
      const response = await fetch(`${BACKEND_URL}/rpc/metadata`);

      const text = await response.text();
      const metadata = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(metadata.message || `HTTP ${response.status}`);
      }

      this.log(`RPC Interface: ${metadata.interfaceName || 'OpenCloudRpcInterface'}`, 'success');
    });
  }

  async testRefreshToken() {
    return this.runTest('11. Refresh Token', async () => {
      if (!this.refreshToken) {
        this.log('Skipping: No refresh token available', 'warning');
        return;
      }

      const response = await fetch(`${IMODELHUB_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.refreshToken}`
        }
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      this.accessToken = data.token;
      this.refreshToken = data.refreshToken;

      this.log('Token refreshed successfully', 'success');
    });
  }

  async testLogout() {
    return this.runTest('12. User Logout', async () => {
      if (!this.accessToken) {
        this.log('Skipping: No access token available', 'warning');
        return;
      }

      const response = await fetch(`${IMODELHUB_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({ refreshToken: this.refreshToken || '' })
      });

      // Handle 204 No Content
      if (response.status === 204) {
        this.log('User logged out successfully', 'success');
        return;
      }

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      this.log('User logged out successfully', 'success');
    });
  }

  async delay(ms) {
    await sleep(ms);
  }

  async runAllTests() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║     Open Cloud CAD - API Workflow Test Suite        ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    await this.checkServices();

    // Run all tests with delays to avoid rate limiting
    await this.testRegister();
    await this.delay(1000);
    await this.testLogin();
    await this.delay(500);
    await this.testGetCurrentUser();
    await this.delay(500);
    await this.testCreateITwin();
    await this.delay(500);
    await this.testListITwins();
    await this.delay(500);
    await this.testGetITwinDetails();
    await this.delay(500);
    await this.testCreateIModel();
    await this.delay(500);
    await this.testListIModels();
    await this.delay(500);
    await this.testBackendHealth();
    await this.delay(500);
    await this.testBackendRPC();
    await this.delay(500);
    await this.testRefreshToken();
    await this.delay(500);
    await this.testLogout();

    this.printReport();
  }

  printReport() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║                   Test Report                        ║');
    console.log('╠══════════════════════════════════════════════════════╣');

    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;

    this.results.forEach((result, index) => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      const status = result.status === 'PASSED' ? 'PASS' : 'FAIL';
      console.log(`║ ${icon} ${(index + 1).toString().padStart(2)}. ${result.name.padEnd(35)} ${status} ║`);
      if (result.error) {
        console.log(`║    Error: ${result.error.substring(0, 30).padEnd(33)} ║`);
      }
    });

    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Total: ${this.results.length.toString().padStart(2)} | ✅ Passed: ${passed.toString().padStart(2)} | ❌ Failed: ${failed.toString().padStart(2)}        ║`);
    console.log('╚══════════════════════════════════════════════════════╝\n');

    if (failed > 0) {
      console.log('⚠️  Some tests failed. Please check the service logs.\n');
      process.exit(1);
    } else {
      console.log('🎉 All tests passed!\n');
      process.exit(0);
    }
  }
}

// Run tests
const runner = new APITestRunner();
runner.runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
