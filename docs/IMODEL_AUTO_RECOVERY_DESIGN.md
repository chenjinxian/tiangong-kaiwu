# iModel 初始化失败自动修复流程设计

## 现状分析

### 现有恢复机制

1. **web-agent RecoveryChecker** (`apps/web-agent/src/main.ts`)
   - 每 5 分钟检查一次未初始化的 iModel
   - 查询 `notInitialized` 和 `initializationFailed` 状态的 iModel
   - 通过合成 webhook 事件触发 baseline 生成
   - 防重复处理机制（2 分钟冷却期）

2. **imodelhub-services BaselineCompensationJob** (`src/imodels/jobs/baseline-compensation.job.ts`)
   - 每 2 分钟运行一次
   - 查找 `initialized` 状态但 `fileSize=0` 的孤儿 iModel
   - 重新触发 `iModelCreated` webhook 事件

3. **Admin API 修复端点**
   - `POST /imodels/admin/repair-baselines` - 批量修复
   - `POST /imodels/admin/repair/:id` - 单个修复
   - `GET /imodels/admin/compensation-status` - 状态查询

### 存在的问题

1. **缺乏状态机管理** - 没有明确的重试次数限制和失败状态转移
2. **无指数退避** - 固定间隔重试，对临时故障不友好
3. **缺少失败原因分类** - 无法针对不同错误类型采取不同修复策略
4. **无告警通知** - 多次修复失败后无通知机制
5. **手动干预困难** - 缺乏强制重置和手动触发接口

## 设计目标

1. **自动重试** - 检测失败并自动重试，无需人工干预
2. **智能退避** - 根据失败原因和重试次数动态调整重试间隔
3. **状态追踪** - 清晰的状态机和审计日志
4. **故障分类** - 区分可恢复错误和不可恢复错误
5. **监控告警** - 多次失败后通知管理员
6. **手动干预** - 支持手动重置和强制修复

## 核心设计

### 1. 增强 iModel 状态机

```
                     +------------------+
                     |   notInitialized  |
                     |   (等待baseline)  |
                     +--------+---------+
                              |
                              | webhook 触发
                              v
                     +--------+---------+
                     | initialization    |
                     |   Scheduled       |
                     |  (初始化已调度)   |
                     +--------+---------+
                              |
              +---------------+---------------+
              |                               |
              | 成功                          | 失败
              v                               v
     +--------+---------+          +--------+---------+
     |   initialized    |          |  initialization  |
     |   (初始化完成)   |          |     Failed       |
     +------------------+          |  (初始化失败)    |
                                   +--------+---------+
                                            |
                                            | 自动重试
                                            v
                                   +--------+---------+
                                   |  retryScheduled  |
                                   |  (重试已调度)    |
                                   +------------------+
```

### 2. 新增数据库表

```sql
-- iModel 初始化尝试记录表
CREATE TABLE imodel_initialization_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imodel_id UUID NOT NULL REFERENCES imodels(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL, -- 'running', 'success', 'failed'
    error_code VARCHAR(50),      -- 错误分类代码
    error_message TEXT,          -- 详细错误信息
    strategy VARCHAR(50),        -- 使用的修复策略
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_init_attempts_imodel_id ON imodel_initialization_attempts(imodel_id);
CREATE INDEX idx_init_attempts_status ON imodel_initialization_attempts(status);

-- 在 imodels 表添加重试相关字段
ALTER TABLE imodels ADD COLUMN initialization_attempt_count INTEGER DEFAULT 0;
ALTER TABLE imodels ADD COLUMN last_initialization_attempt_at TIMESTAMP;
ALTER TABLE imodels ADD COLUMN next_scheduled_retry_at TIMESTAMP;
ALTER TABLE imodels ADD COLUMN failure_reason_code VARCHAR(50);
```

### 3. 错误分类与修复策略

| 错误代码 | 描述 | 修复策略 | 最大重试次数 | 退避策略 |
|---------|------|---------|-------------|---------|
| `WEBHOOK_DELIVERY_FAILED` | Webhook 投递失败 | 立即重试 | 5 | 指数退避 1min-15min |
| `BASELINE_GENERATION_TIMEOUT` | Baseline 生成超时 | 重新触发 | 3 | 线性退避 5min-15min |
| `AZURE_STORAGE_ERROR` | 存储服务错误 | 延迟重试 | 10 | 指数退避 1min-30min |
| `CLOUDSQLITE_ERROR` | CloudSqlite 错误 | 延迟重试 | 5 | 指数退避 2min-20min |
| `INVALID_BASELINE_FILE` | 无效 baseline 文件 | 标记失败，人工处理 | 0 | N/A |
| `IMODEL_ID_MISMATCH` | iModel ID 不匹配 | 标记失败，人工处理 | 0 | N/A |
| `UNKNOWN_ERROR` | 未知错误 | 延迟重试 | 3 | 指数退避 5min-15min |

### 4. 自动修复服务架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoRecoveryService                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Scanner    │  │   Analyzer   │  │   Executor   │      │
│  │  (扫描器)    │  │  (分析器)    │  │  (执行器)    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│         ▼                 ▼                 ▼              │
│  ┌────────────────────────────────────────────────────┐   │
│  │              RecoveryStrategyEngine                 │   │
│  │                 (修复策略引擎)                      │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              NotificationService (通知服务)                 │
│     ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │
│     │  Log   │  │ Webhook│  │ Email  │  │ Metrics│        │
│     └────────┘  └────────┘  └────────┘  └────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 5. 核心组件实现

#### 5.1 RecoveryScanner (恢复扫描器)

```typescript
// 扫描需要修复的 iModel
class RecoveryScanner {
  async scan(): Promise<ScannedIModel[]> {
    // 1. 查询超过重试等待时间的 failed 状态 iModel
    // 2. 查询超过处理时间的 scheduled 状态 iModel（超时检测）
    // 3. 查询长时间未初始化的 notInitialized 状态 iModel
    // 4. 返回优先级排序的列表
  }
}
```

#### 5.2 RecoveryAnalyzer (恢复分析器)

```typescript
// 分析失败原因并确定修复策略
class RecoveryAnalyzer {
  async analyze(imodel: ScannedIModel): Promise<RecoveryPlan> {
    // 1. 查询最近的尝试记录
    // 2. 根据错误代码和重试次数选择策略
    // 3. 计算下次重试时间（退避算法）
    // 4. 返回修复计划
  }

  private calculateBackoff(attemptCount: number, errorCode: string): number {
    // 指数退避算法
    const baseDelay = this.getBaseDelay(errorCode);
    const maxDelay = this.getMaxDelay(errorCode);
    const delay = Math.min(baseDelay * Math.pow(2, attemptCount - 1), maxDelay);
    // 添加随机抖动避免 thundering herd
    return delay + Math.random() * 0.1 * delay;
  }
}
```

#### 5.3 RecoveryExecutor (恢复执行器)

```typescript
// 执行修复操作
class RecoveryExecutor {
  async execute(plan: RecoveryPlan): Promise<ExecutionResult> {
    // 1. 记录尝试开始
    // 2. 根据策略类型执行不同操作：
    //    - RETRY_WEBHOOK: 重新发送 webhook
    //    - REGENERATE_BASELINE: 重新生成 baseline
    //    - RESET_AND_RETRY: 重置状态后重试
    //    - MANUAL_INTERVENTION_REQUIRED: 标记需人工处理
    // 3. 记录尝试结果
    // 4. 更新 iModel 状态
  }
}
```

### 6. API 设计

```typescript
// 获取需要修复的 iModel 列表
GET /api/admin/imodels/recovery/pending
Response: {
  items: Array<{
    id: string;
    name: string;
    state: string;
    failureReason: string;
    attemptCount: number;
    lastAttemptAt: string;
    nextRetryAt: string;
    suggestedAction: string;
  }>;
  total: number;
}

// 手动触发修复
POST /api/admin/imodels/:id/recovery/retry
Body: {
  force?: boolean;  // 强制立即重试，无视退避时间
  strategy?: string; // 指定修复策略
}

// 标记为需人工处理
POST /api/admin/imodels/:id/recovery/escalate
Body: {
  reason: string;
}

// 重置 iModel 初始化状态
POST /api/admin/imodels/:id/recovery/reset
Response: {
  success: boolean;
  newState: string;
}

// 获取修复历史
GET /api/admin/imodels/:id/recovery/history
Response: {
  attempts: Array<{
    attemptNumber: number;
    startedAt: string;
    completedAt: string;
    status: string;
    errorCode: string;
    errorMessage: string;
    strategy: string;
  }>;
}
```

### 7. 前端管理界面

```
┌─────────────────────────────────────────────────────────────────┐
│  iModel 自动修复管理                                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ 待修复: 5    │  │ 修复中: 2    │  │ 今日成功: 12 │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
├─────────────────────────────────────────────────────────────────┤
│  待修复 iModel 列表                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 名称        │ 状态      │ 失败原因        │ 重试 │ 操作   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ TestModel1  │ Failed    │ Storage Error   │ 2/5  │ [修复] │  │
│  │ TestModel2  │ Scheduled │ Timeout         │ 1/3  │ [修复] │  │
│  │ TestModel3  │ Failed    │ Invalid File    │ 0/0  │ [查看] │  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  修复统计 (最近 24 小时)                                        │
│  [成功率图表] [错误分布饼图] [修复耗时趋势]                     │
└─────────────────────────────────────────────────────────────────┘
```

## 实施计划

### Phase 1: 基础增强 (1-2 天)

1. **数据库迁移**
   - 创建 `imodel_initialization_attempts` 表
   - 添加 `imodels` 表重试相关字段

2. **增强 BaselineCompensationJob**
   - 添加重试次数限制
   - 实现基础退避算法
   - 记录尝试历史

### Phase 2: 策略引擎 (2-3 天)

1. **实现错误分类**
   - 在 web-agent 中分类错误代码
   - 在 imodelhub-services 中记录错误代码

2. **实现 RecoveryStrategyEngine**
   - Scanner/Analyzer/Executor 基础实现
   - 集成到现有服务中

### Phase 3: API 与界面 (2-3 天)

1. **Admin API 扩展**
   - 实现修复管理端点
   - 实现查询和统计端点

2. **前端管理界面**
   - 待修复列表页面
   - 修复历史页面
   - 统计仪表板

### Phase 4: 监控告警 (1-2 天)

1. **通知服务**
   - Webhook 通知
   - 邮件通知（可选）

2. **Metrics 集成**
   - 成功率/失败率指标
   - 修复耗时指标

## 配置选项

```yaml
# auto-recovery.yaml
recovery:
  enabled: true
  scanner:
    interval: "30s"        # 扫描间隔
    batchSize: 10          # 每批处理数量
  strategies:
    webhookDeliveryFailed:
      maxRetries: 5
      backoff:
        type: exponential
        baseDelay: 60s
        maxDelay: 900s
    baselineGenerationTimeout:
      maxRetries: 3
      backoff:
        type: linear
        baseDelay: 300s
        maxDelay: 900s
    azureStorageError:
      maxRetries: 10
      backoff:
        type: exponential
        baseDelay: 60s
        maxDelay: 1800s
  notification:
    webhook:
      url: "${RECOVERY_WEBHOOK_URL}"
      events: ["max_retries_exceeded", "manual_intervention_required"]
    alertThreshold:
      consecutiveFailures: 5  # 连续失败 5 次后告警
      failureRate: 0.3        # 失败率超过 30% 后告警
```

## 关键指标

| 指标名称 | 描述 | 目标值 |
|---------|------|-------|
| `recovery_success_rate` | 自动修复成功率 | > 95% |
| `recovery_avg_duration` | 平均修复耗时 | < 5 min |
| `recovery_max_attempts_reached` | 达到最大重试次数的比例 | < 2% |
| `manual_intervention_required` | 需人工干预的比例 | < 1% |

## 后续优化

1. **机器学习辅助** - 基于历史数据预测最优重试策略
2. **自愈能力** - 自动检测并修复系统级问题（如存储空间不足）
3. **多区域支持** - 针对不同区域使用不同的修复策略
4. **灰度发布** - 新策略先在小范围验证再全量推广
