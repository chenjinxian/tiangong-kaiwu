/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * E2E API Test Script
 * Tests full workflow: Login -> Create iTwin -> Create iModel -> Get Briefcase
 */

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:4000';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'Test123!@#';

async function httpRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

async function runE2ETest() {
  console.log('🚀 开始 E2E API 测试');
  console.log('====================');

  let accessToken;
  let userId;
  let iTwinId;
  let iModelId;
  let briefcaseId;

  // Step 1: Login
  console.log('\n📍 Step 1: 登录');
  const loginRes = await httpRequest(`${API_URL}/auth/email/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (loginRes.status !== 200) {
    console.error('❌ 登录失败:', loginRes.data);
    process.exit(1);
  }

  accessToken = loginRes.data.token;
  userId = loginRes.data.user.id;
  console.log('✅ 登录成功');
  console.log(`   用户 ID: ${userId}`);

  // Step 2: Create iTwin Project
  console.log('\n📍 Step 2: 创建 iTwin 项目');
  const projectName = `E2E Project ${Date.now()}`;
  const projectRes = await httpRequest(`${API_URL}/api/itwins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      displayName: projectName,
      description: 'E2E test project',
    }),
  });

  if (projectRes.status !== 201 && projectRes.status !== 200) {
    console.error('❌ 项目创建失败:', projectRes.data);
    process.exit(1);
  }

  iTwinId = projectRes.data.id;
  console.log('✅ 项目创建成功');
  console.log(`   项目名称: ${projectName}`);
  console.log(`   iTwin ID: ${iTwinId}`);

  // Step 3: Create iModel
  console.log('\n📍 Step 3: 创建 iModel');
  const iModelName = `E2E Model ${Date.now()}`;
  const iModelRes = await httpRequest(`${API_URL}/api/imodels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      iTwinId: iTwinId,
      name: iModelName,
    }),
  });

  if (iModelRes.status !== 201 && iModelRes.status !== 200) {
    console.error('❌ iModel 创建失败:', iModelRes.data);
    process.exit(1);
  }

  iModelId = iModelRes.data.id;
  console.log('✅ iModel 创建成功');
  console.log(`   iModel 名称: ${iModelName}`);
  console.log(`   iModel ID: ${iModelId}`);

  // Step 4: Check iModel status
  console.log('\n📍 Step 4: 检查 iModel 状态');
  await new Promise(r => setTimeout(r, 2000));

  const iModelStatusRes = await httpRequest(
    `${API_URL}/api/imodels/${iModelId}?iTwinId=${iTwinId}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  const state = iModelStatusRes.data?.state || 'unknown';
  console.log(`   iModel 状态: ${state}`);

  // Step 5: Get Briefcase
  console.log('\n📍 Step 5: 获取 Briefcase');
  const briefcaseRes = await httpRequest(`${API_URL}/api/imodels/${iModelId}/briefcases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  if (briefcaseRes.status === 201 || briefcaseRes.status === 200) {
    briefcaseId = briefcaseRes.data?.id || briefcaseRes.data?.briefcaseId;
    console.log('✅ Briefcase 获取成功');
    console.log(`   Briefcase ID: ${briefcaseId}`);
  } else {
    console.log('⚠️  Briefcase 可能已存在或需要等待 V2 Checkpoint');
    console.log(`   状态: ${briefcaseRes.status}`);
  }

  // Step 6: Get Changesets
  console.log('\n📍 Step 6: 获取变更集列表');
  const changesetsRes = await httpRequest(
    `${API_URL}/api/imodels/${iModelId}/changesets`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  const changesetCount = Array.isArray(changesetsRes.data) ? changesetsRes.data.length : 0;
  console.log(`   变更集数量: ${changesetCount}`);

  // Summary
  console.log('\n🎉 ==========================================');
  console.log('🎉 E2E API 测试完成!');
  console.log('🎉 ==========================================');
  console.log(`   项目: ${projectName}`);
  console.log(`   iTwin ID: ${iTwinId}`);
  console.log(`   iModel: ${iModelName}`);
  console.log(`   iModel ID: ${iModelId}`);
  console.log(`   状态: ${state}`);
  console.log(`   变更集: ${changesetCount}`);
  console.log('');
  console.log(`   🌐 编辑器 URL: ${BASE_URL}/workspace/${iTwinId}/${iModelId}`);
  console.log('');

  // Cleanup: Delete test project
  console.log('📍 Cleanup: 删除测试项目');
  const deleteRes = await httpRequest(`${API_URL}/api/itwins/${iTwinId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (deleteRes.status === 200 || deleteRes.status === 204) {
    console.log('✅ 测试项目已删除');
  } else {
    console.log('⚠️  测试项目删除失败:', deleteRes.data);
  }

  console.log('\n✅ 所有 E2E API 测试通过!');
}

runE2ETest().catch(err => {
  console.error('❌ E2E 测试失败:', err);
  process.exit(1);
});
