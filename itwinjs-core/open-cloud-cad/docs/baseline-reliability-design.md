# iModel Baseline 生成可靠性设计方案

## 问题分析

### 现状问题
1. **单点故障**: web-agent 宕机导致事件丢失
2. **无重试机制**: webhook 失败后无自动补偿
3. **状态不一致**: iModel 标记为 initialized 但无 baseline 文件
4. **缺乏监控**: 无法及时发现失败的初始化

### 根本原因
```
iModel 创建 → Webhook 发送 → web-agent 接收 → 生成 Baseline → 上传 Azurite → 通知完成
     │              │               │               │              │              │
     │              │               │               │              │              │
     ▼              ▼               ▼               ▼              ▼              ▼
   成功          可能丢失        可能宕机       可能失败       可能失败       可能丢失
```

## 解决方案

### 1. 健康检查与就绪检测 (Health Check)

#### 实现位置: `apps/web-agent/src/health-check.ts`
- 检查 Azurite 连接状态
- 检查 imodelhub-services API 可达性
- 检查磁盘空间（baseline 生成需要临时空间）

#### 实现位置: `imodelhub-services/src/health/webhook-health.ts`
- 检查 webhook 处理器状态
- 检查待处理事件队列深度

### 2. 补偿任务调度器 (Compensation Job)

#### 实现位置: `imodelhub-services/src/imodels/jobs/baseline-compensation.job.ts`

```typescript
/**
 * 每 5 分钟运行一次的补偿任务
 * 查找状态为 initialized 但缺少 checkpoint 的 iModel
 */
@Cron(CronExpression.EVERY_5_MINUTES)
async compensateMissingBaselines() {
  const orphanedIModels = await this.imodelRepository.find({
    where: {
      state: 'initialized',
      // 检查条件：
      // 1. fileSize === 0
      // 2. 或 checkpoint 记录不存在
      // 3. 或 Azurite 容器为空
    },
    take: 10, // 批量处理
  });

  for (const imodel of orphanedIModels) {
    // 重新触发 baseline 生成
    await this.triggerBaselineGeneration(imodel);
  }
}
```

### 3. 死信队列 (Dead Letter Queue)

#### 实现位置: `imodelhub-services/src/webhooks/dead-letter.service.ts`

```typescript
/**
 * Webhook 失败处理
 * 当 webhook 发送失败时，保存到死信队列
 */
async handleWebhookFailure(event: WebhookEvent, error: Error) {
  await this.deadLetterRepository.save({
    eventType: event.eventType,
    payload: event,
    errorMessage: error.message,
    retryCount: 0,
    maxRetries: 5,
    status: 'pending',
    createdAt: new Date(),
  });
}

/**
 * 死信队列重试任务
 * 每 2 分钟检查并重试
 */
@Cron(CronExpression.EVERY_2_MINUTES)
async processDeadLetterQueue() {
  const failedEvents = await this.deadLetterRepository.find({
    where: {
      status: 'pending',
      retryCount: LessThan(5),
    },
    take: 20,
  });

  for (const event of failedEvents) {
    try {
      await this.webhookEventEmitter.emit(event.eventType, event.payload, {
        iTwinId: event.payload.iTwinId,
      });
      await this.deadLetterRepository.update(event.id, {
        status: 'resolved',
        resolvedAt: new Date(),
      });
    } catch (error) {
      await this.deadLetterRepository.incrementRetry(event.id);
    }
  }
}
```

### 4. 状态验证器 (State Validator)

#### 实现位置: `imodelhub-services/src/imodels/validation/imodel-state.validator.ts`

```typescript
/**
 * 验证 iModel 状态的完整性
 */
@Injectable()
export class IModelStateValidator {
  async validateBaselineIntegrity(imodelId: string): Promise<ValidationResult> {
    const imodel = await this.imodelsService.findById(imodelId);
    
    // 检查 1: 数据库状态
    if (imodel.state !== 'initialized') {
      return { valid: false, reason: 'State not initialized' };
    }
    
    // 检查 2: Checkpoint 记录
    const checkpoint = await this.checkpointsService.findBaseline(imodelId);
    if (!checkpoint) {
      return { valid: false, reason: 'No checkpoint record' };
    }
    
    // 检查 3: Azurite 文件存在性
    const hasAzuriteFiles = await this.storage.checkContainerExists(
      `baselines/${imodelId}`
    );
    if (!hasAzuriteFiles) {
      return { valid: false, reason: 'Azurite container missing' };
    }
    
    // 检查 4: manifest.bcv 存在性
    const hasManifest = await this.storage.checkFileExists(
      `baselines/${imodelId}/manifest.bcv`
    );
    if (!hasManifest) {
      return { valid: false, reason: 'manifest.bcv missing' };
    }
    
    return { valid: true };
  }
}
```

### 5. 启动自检 (Startup Self-Check)

#### 实现位置: `apps/web-agent/src/startup-check.ts`

```typescript
/**
 * 启动时执行的依赖检查
 */
export async function performStartupChecks(config: WebhookConfig): Promise<StartupResult> {
  const checks = [];
  
  // 检查 1: imodelhub-services API
  checks.push(checkIModelHubAPI(config.imodelhubApiUrl));
  
  // 检查 2: Azurite 存储
  checks.push(checkAzuriteStorage(config.blobStorageUrl));
  
  // 检查 3: 磁盘空间
  checks.push(checkDiskSpace('/tmp', 1024 * 1024 * 100)); // 100MB
  
  // 检查 4: 处理遗留任务
  checks.push(recoverOrphanedIModels(config));
  
  const results = await Promise.all(checks);
  
  if (results.some(r => !r.success)) {
    throw new StartupError('Critical dependency check failed', results);
  }
  
  return { ready: true };
}
```

### 6. API 端点：手动触发重试

#### 实现位置: `imodelhub-services/src/imodels/imodels-admin.controller.ts`

```typescript
/**
 * 管理员端点：批量修复失败的 baseline
 */
@Post('admin/repair-baselines')
@ApiOperation({ summary: '修复所有失败的 baseline 生成' })
async repairFailedBaselines(): Promise<RepairResult> {
  const failedIModels = await this.imodelsService.findFailedBaselines();
  
  const results = [];
  for (const imodel of failedIModels) {
    try {
      await this.webhookEventEmitter.emit(
        'iModels.iModelCreated.v1',
        { iModelId: imodel.id, needBaseline: true },
        { iTwinId: imodel.iTwinId }
      );
      results.push({ id: imodel.id, status: 'triggered' });
    } catch (error) {
      results.push({ id: imodel.id, status: 'failed', error: error.message });
    }
  }
  
  return { processed: results.length, results };
}

/**
 * 管理员端点：单个 iModel 状态检查
 */
@Get(':id/admin/validate')
@ApiOperation({ summary: '验证 iModel baseline 完整性' })
async validateIModel(@Param('id') id: string): Promise<ValidationReport> {
  return this.stateValidator.validateBaselineIntegrity(id);
}
```

### 7. 前端状态显示

#### 实现位置: `apps/web/features/imodel/components/IModelStatus.tsx`

```typescript
/**
 * 显示 iModel 初始化状态，提供重试按钮
 */
export function IModelStatus({ imodel }: { imodel: IModel }) {
  const [validating, setValidating] = useState(false);
  const [status, setStatus] = useState<ValidationResult | null>(null);
  
  const validate = async () => {
    setValidating(true);
    const result = await fetch(`/api/imodels/${imodel.id}/admin/validate`)
      .then(r => r.json());
    setStatus(result);
    setValidating(false);
  };
  
  const retryBaseline = async () => {
    await fetch(`/api/imodels/${imodel.id}/baseline/retry`, { method: 'POST' });
  };
  
  if (imodel.state === 'notInitialized' || (status && !status.valid)) {
    return (
      <div className="imodel-status error">
        <Alert type="error">
          iModel 初始化失败
          <Button onClick={retryBaseline}>重新生成 Baseline</Button>
        </Alert>
      </div>
    );
  }
  
  return <div className="imodel-status ok">已就绪</div>;
}
```

## 部署检查清单

### 启动前检查
```bash
# 1. 检查服务依赖
curl http://localhost:4000/health  # imodelhub-services
curl http://localhost:4001/health  # backend
curl http://localhost:4002/health  # web-agent
curl http://localhost:10000/       # Azurite

# 2. 检查 webhook 订阅
curl http://localhost:4000/webhooks -H "Authorization: Bearer $TOKEN"

# 3. 检查死信队列深度
curl http://localhost:4000/admin/webhooks/dead-letter/stats
```

### 监控指标
- `webhook_delivery_latency`: Webhook 发送延迟
- `webhook_failure_rate`: Webhook 失败率
- `baseline_generation_duration`: Baseline 生成耗时
- `orphaned_imodels_count`: 孤儿 iModel 数量
- `azurite_storage_usage`: Azurite 存储使用率

### 告警规则
- Webhook 失败率 > 5% 时告警
- 死信队列长度 > 10 时告警
- Baseline 生成耗时 > 5 分钟时告警
- Azurite 存储使用率 > 80% 时告警

## 实施优先级

1. **P0 (立即)**: 补偿任务调度器 - 修复现有问题
2. **P1 (本周)**: 死信队列 + 手动重试 API
3. **P2 (本月)**: 状态验证器 + 启动自检
4. **P3 (下月)**: 监控指标 + 告警系统

## 实施状态 (2026-04-07；2026-09-22 复核仍属实)

### 已实施 ✅

1. **补偿任务调度器** (`BaselineCompensationJob`)
   - 文件: `imodelhub-services/src/imodels/jobs/baseline-compensation.job.ts`
   - 每 2 分钟自动检查并修复孤儿 iModel
   - 批量处理，避免系统过载

2. **Admin API 端点**
   - 文件: `imodelhub-services/src/imodels/imodels-admin.controller.ts`
   - `GET /imodels/admin/uninitialized` - 获取未初始化 iModel 列表
   - `POST /imodels/admin/repair-baselines` - 批量修复
   - `POST /imodels/admin/repair/:id` - 单个修复
   - `GET /imodels/admin/compensation-status` - 查看补偿任务状态

3. **健康检查脚本**
   - 文件: `scripts/health-check.sh`
   - 一键检查所有服务健康状态
   - 检查 orphaned iModels 数量

### 待实施 ⏳

1. **死信队列** (Dead Letter Queue)
2. **状态验证器** (State Validator)
3. **启动自检** (Startup Self-Check)
4. **监控指标** (Prometheus Metrics)
5. **告警系统** (Alerting System)
