# Webhook 配置说明

## 问题背景

iModelHub Services 和 Webhook Agent 之间需要共享同一个 Webhook Secret 来验证签名。如果两者不匹配，iModel 初始化会失败。

## 配置位置

### 1. iModelHub Services

**文件**: imodelhub-services 项目的 `.env`

```bash
WEBHOOK_SIGNING_SECRET=your-webhook-signing-secret-change-in-production
```

**注意**: 这个值会被用于：
- 生成 webhook 签名（webhook-event.emitter.ts）
- 创建数据库中的 webhook subscription（webhook-seed.service.ts）

### 2. Webhook Agent

**文件**: `webhook-agent/.env`

```bash
WEBHOOK_SECRET=your-webhook-signing-secret-change-in-production
```

**注意**: 这个值必须与 iModelHub Services 中的 `WEBHOOK_SIGNING_SECRET` 完全一致。

## 环境变量映射

```
imodelhub-services/.env                    webhook-agent/.env
─────────────────────────                  ──────────────
WEBHOOK_SIGNING_SECRET  ────────────────►  WEBHOOK_SECRET
         │                                         │
         │    (used for signature generation)      │
         │    (stored in database)                 │
         │                                         │
         └─────────────────────────────────────────┘
              (must match for validation)
```

## 修改步骤

如果修改了 secret，需要按以下步骤操作：

### 步骤 1: 修改配置

确保两个文件使用相同的 secret：

```bash
# imodelhub-services/.env
WEBHOOK_SIGNING_SECRET=your-new-secret

# webhook-agent/.env
WEBHOOK_SECRET=your-new-secret
```

### 步骤 2: 删除旧的 webhook subscription

```bash
cd <imodelhub-services 检出目录>
node -r dotenv/config -e "
const { DataSource } = require('typeorm');
const { WebhookSubscriptionEntity } = require('./dist/webhooks/infrastructure/persistence/relational/entities/webhook-subscription.entity');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'root',
  password: 'secret',
  database: 'api',
  entities: [WebhookSubscriptionEntity],
});

dataSource.initialize().then(async () => {
  const repo = dataSource.getRepository(WebhookSubscriptionEntity);
  await repo.delete({ callbackUrl: 'http://localhost:4002/webhook/events' });
  console.log('Deleted old webhook subscription');
  await dataSource.destroy();
});
"
```

### 步骤 3: 重启服务

```bash
# 重启 imodelhub-services
pkill -f "imodelhub"
cd <imodelhub-services 检出目录> && node -r dotenv/config dist/main.js

# 重启 webhook-agent
pkill -f "webhook-agent"
cd webhook-agent && node dist/main.js
```

### 步骤 4: 创建新的 webhook subscription

重启 imodelhub-services 时会自动创建新的 subscription。

或者手动创建：

```bash
cd <imodelhub-services 检出目录>
NODE_ENV=development node -r dotenv/config -e "
const { DataSource } = require('typeorm');
const { WebhookSubscriptionEntity } = require('./dist/webhooks/infrastructure/persistence/relational/entities/webhook-subscription.entity');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'root',
  password: 'secret',
  database: 'api',
  entities: [WebhookSubscriptionEntity],
});

async function seed() {
  await dataSource.initialize();
  const repo = dataSource.getRepository(WebhookSubscriptionEntity);
  
  const callbackUrl = 'http://localhost:4002/webhook/events';
  const webhookSecret = process.env.WEBHOOK_SIGNING_SECRET;
  
  const subscription = repo.create({
    scope: 'Account',
    scopeId: '',
    active: true,
    callbackUrl,
    eventTypes: ['iModels.iModelCreated.v1', 'iModels.iModelDeleted.v1'],
    secret: webhookSecret,
  });
  
  await repo.save(subscription);
  console.log('Created webhook subscription with secret:', webhookSecret);
  await dataSource.destroy();
}

seed().catch(console.error);
"
```

## 验证配置

### 检查数据库中的 secret

```bash
cd <imodelhub-services 检出目录>
node -r dotenv/config -e "
const { DataSource } = require('typeorm');
const { WebhookSubscriptionEntity } = require('./dist/webhooks/infrastructure/persistence/relational/entities/webhook-subscription.entity');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'root',
  password: 'secret',
  database: 'api',
  entities: [WebhookSubscriptionEntity],
});

dataSource.initialize().then(async () => {
  const repo = dataSource.getRepository(WebhookSubscriptionEntity);
  const subs = await repo.find();
  subs.forEach(s => {
    console.log('Webhook ID:', s.id);
    console.log('Secret:', s.secret);
  });
  await dataSource.destroy();
});
"
```

### 检查 webhook-agent 的 secret

```bash
cd webhook-agent
node -r dotenv/config -e "console.log('WEBHOOK_SECRET:', process.env.WEBHOOK_SECRET)"
```

## 常见问题

### 问题: "Invalid signature: Signature mismatch"

**原因**: imodelhub-services 和 webhook-agent 的 secret 不匹配

**解决**: 
1. 检查两个服务的配置
2. 删除旧的 webhook subscription
3. 重启两个服务

### 问题: "Missing signature or body"

**原因**: webhook 请求缺少签名头

**解决**: 检查 imodelhub-services 是否正确发送了签名

### 问题: "WEBHOOK_SECRET environment variable is required"

**原因**: webhook-agent 缺少环境变量配置

**解决**: 确保 `.env` 文件存在且包含 `WEBHOOK_SECRET`

## 默认配置

本地开发环境的默认配置：

```bash
# imodelhub-services/.env
WEBHOOK_SIGNING_SECRET=your-webhook-signing-secret-change-in-production

# webhook-agent/.env  
WEBHOOK_SECRET=your-webhook-signing-secret-change-in-production
```

**注意**: 生产环境必须修改这些默认值！
