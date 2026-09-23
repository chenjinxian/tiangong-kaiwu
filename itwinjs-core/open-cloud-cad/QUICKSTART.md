# Open Cloud CAD - 快速入门指南

## 1. 环境准备

### 必需依赖

```bash
# Node.js (v18+)
node --version  # 应 >= 18.0.0

# npm (v8+)
npm --version   # 应 >= 8.0.0

# Azurite
npm install -g azurite

# PostgreSQL (可通过 Docker 启动)
docker --version
```

### 环境变量设置（首次运行必需）

```bash
# 方式一：使用自动设置脚本
cd open-cloud-cad
./scripts/setup-env.sh

# 方式二：手动复制配置文件
cd open-cloud-cad/apps/web
cp .env.example .env

cd ../web-agent
cp .env.example .env
```

**注意**：`.env` 文件包含本地开发配置，不应提交到 git。`.env.example` 是模板文件，可以提交。

### 项目目录结构

```
~/Documents/GitHub/
├── itwinjs-core/              # 当前项目
│   └── open-cloud-cad/
│       ├── apps/
│       │   ├── backend/       # Port 4001
│       │   ├── web/           # Port 3000
│       │   └── web-agent/     # Port 4002
│       └── scripts/
│           ├── start-all.sh   # 统一启动脚本
│           └── check-config.sh # 配置检查
│
└── imodelhub-services/        # 依赖服务
    └── docker-compose.yaml    # PostgreSQL, Azurite, Redis
```

## 2. 一键启动（推荐）

### 步骤 1：检查配置

```bash
cd /Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad
./scripts/check-config.sh
```

### 步骤 2：启动所有服务

```bash
./scripts/start-all.sh
```

### 步骤 3：验证服务状态

```bash
./scripts/start-all.sh status
```

预期输出：
```
服务              端口       状态           PID
----------------------------------------------------------------
postgres          5432       ✅ 运行中      N/A
azurite           10000      ✅ 运行中      12345
redis             6379       ✅ 运行中      N/A
imodelhub         4000       ✅ 运行中      12346
backend           4001       ✅ 运行中      12347
web-agent         4002       ✅ 运行中      12348
web               3000       ✅ 运行中      12349
```

### 步骤 4：访问应用

打开浏览器访问：http://localhost:3000

## 3. Docker 方式启动

```bash
# 完整启动所有服务
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f

# 停止
docker-compose -f docker-compose.dev.yml down
```

## 4. 手动启动（调试使用）

### 终端 1：启动基础设施

```bash
cd /Users/xunzhang/Documents/GitHub/imodelhub-services
docker-compose up postgres azurite redis -d
```

### 终端 2：启动 imodelhub-services

```bash
cd /Users/xunzhang/Documents/GitHub/imodelhub-services
npm run start:dev
```

### 终端 3：启动 backend

```bash
cd /Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/apps/backend
npm run dev
```

### 终端 4：启动 web-agent

```bash
cd /Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/apps/web-agent
npm run dev
```

### 终端 5：启动 frontend

```bash
cd /Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/apps/web
npm run dev
```

## 5. 常见问题

### 5.1 端口被占用

```bash
# 查找占用 4000 端口的进程
lsof -i :4000

# 终止进程
kill -9 <PID>

# 或使用脚本停止所有服务
./scripts/start-all.sh stop
```

### 5.2 配置不一致

```bash
# 运行配置检查
./scripts/check-config.sh

# 自动修复
./scripts/check-config.sh  # 按提示选择修复
```

### 5.3 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
pg_isready -h localhost -p 5432

# 或检查 Docker 容器
docker ps | grep postgres
```

### 5.4 Azurite 连接失败

```bash
# 检查 Azurite 是否运行
curl http://localhost:10000/devstoreaccount1?comp=list

# 手动启动 Azurite
azurite-blob --blobHost 127.0.0.1 --blobPort 10000 --silent
```

### 5.5 iModel 初始化失败

**症状**: 创建的 iModel 一直显示"未初始化"状态

**原因**: imodelhub-services 和 web-agent 的 webhook secret 不匹配

**解决方案**:

```bash
# 1. 检查环境变量配置
echo "imodelhub-services WEBHOOK_SIGNING_SECRET:"
grep WEBHOOK_SIGNING_SECRET /path/to/imodelhub-services/.env

echo "web-agent WEBHOOK_SECRET:"
grep WEBHOOK_SECRET /path/to/open-cloud-cad/apps/web-agent/.env

# 2. 确保两个值相同，如果不一致：
#    - 修改 apps/web-agent/.env 中的 WEBHOOK_SECRET
#    - 使其与 imodelhub-services/.env 中的 WEBHOOK_SIGNING_SECRET 一致

# 3. 删除旧的 webhook subscription
cd /path/to/imodelhub-services
node -r dotenv/config -e "
const { DataSource } = require('typeorm');
const { WebhookSubscriptionEntity } = require('./dist/webhooks/infrastructure/persistence/relational/entities/webhook-subscription.entity');
const dataSource = new DataSource({
  type: 'postgres', host: 'localhost', port: 5432,
  username: 'root', password: 'secret', database: 'api',
  entities: [WebhookSubscriptionEntity],
});
dataSource.initialize().then(async () => {
  const repo = dataSource.getRepository(WebhookSubscriptionEntity);
  await repo.delete({ callbackUrl: 'http://localhost:4002/webhook/events' });
  console.log('Deleted old webhook subscription');
  await dataSource.destroy();
});
"

# 4. 重启 imodelhub-services 和 web-agent
pkill -f imodelhub
pkill -f web-agent
cd /path/to/imodelhub-services && npm start
cd /path/to/open-cloud-cad/apps/web-agent && npm start

# 5. 重新创建 iModel 测试
```

详细文档: `docs/WEBHOOK_CONFIG.md`

### 5.6 Viewer 加载失败（Worker 404）

```bash
# 检查 worker 文件是否存在
ls -la apps/web/public/scripts/parse-imdl-worker.js

# 检查 workspace 链接
ls -la apps/web/public/workspace/default/

# 如果没有，创建链接
cd apps/web/public
mkdir -p workspace/default
ln -s $(pwd)/scripts workspace/default/scripts
ln -s /path/to/itwinjs/core/frontend/lib/public/locales workspace/default/locales
```

## 6. 调试技巧

### 查看日志

```bash
# 所有服务日志
tail -f /tmp/open-cloud-cad/*.log

# 特定服务日志
tail -f /tmp/open-cloud-cad/imodelhub.log
tail -f /tmp/open-cloud-cad/backend.log
tail -f /tmp/open-cloud-cad/web-agent.log
```

### 数据库查询

```bash
# 连接到 PostgreSQL
psql -h localhost -U postgres -d imodelhub

# 常用查询
\dt                          # 列出所有表
SELECT * FROM imodel LIMIT 5;  # 查看 iModel
SELECT * FROM itwin LIMIT 5;   # 查看 iTwin
```

### 健康检查

```bash
# 所有服务健康检查
curl http://localhost:4000/health/live  # imodelhub
curl http://localhost:4001/health       # backend
curl http://localhost:4002/health       # web-agent
```

## 7. 测试 iModel 创建

### 7.1 创建空 iModel（推荐首次测试）

1. 打开 http://localhost:3000
2. 登录（如果没有账号先注册）
3. 创建或选择一个 iTwin
4. 点击"创建 iModel"
5. 填写名称，**不选择 baseline 文件**
6. 等待初始化完成（约 5 秒）
7. 点击"打开"查看 3D 模型

### 7.2 创建带 baseline 文件的 iModel

1. 打开 http://localhost:3000
2. 登录并选择 iTwin
3. 点击"创建 iModel"
4. 填写名称，**选择 .bim 文件**作为 baseline
5. 点击"创建"，文件上传完成后对话框会关闭
6. 在 iModel 列表中等待状态变为"就绪"（约 10-30 秒）
7. 点击"打开"查看 3D 模型

**注意**: baseline 文件处理是异步的，上传完成后 web-agent 会在后台：
- 下载原始文件
- 验证并修复 iModelId/iTwinId
- 转换为 CloudSqlite BCVV 格式
- 上传回 Azurite
- 通知后端完成

查看处理状态：
```bash
# 查看 web-agent 日志
tail -f /tmp/web-agent.log

# 查看 iModel 状态
docker exec -i imodelhub-services-postgres-1 psql -U root -d api \
  -c "SELECT name, state FROM imodels ORDER BY createdAt DESC LIMIT 5;"
```

## 8. 停止服务

```bash
# 方式一：使用脚本
./scripts/start-all.sh stop

# 方式二：Docker
docker-compose -f docker-compose.dev.yml down

# 方式三：手动停止
kill $(cat /tmp/open-cloud-cad/*.pid)
```

## 9. 更新代码后重启

```bash
# 1. 停止服务
./scripts/start-all.sh stop

# 2. 拉取最新代码
git pull

# 3. 重新启动
./scripts/start-all.sh
```

## 10. 获取帮助

```bash
# 查看脚本帮助
./scripts/start-all.sh help

# 查看配置检查帮助
./scripts/check-config.sh --help

# 查看架构文档
cat docs/Architecture.md
```

---

**遇到问题？** 请先运行 `./scripts/check-config.sh` 检查配置。
