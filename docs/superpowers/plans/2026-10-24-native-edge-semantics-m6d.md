# M6-d 实施计划：native 边语义深化（圆角在布尔后体上的正解）

> 依据：fillet-forensics.json 取证定案（三层阻断：拾取假阳性/求值捎带/2 体形态——后者已被 M6-c T2 消灭）。
> 前置：M6-a/b/c 已收官；Tutorial 2 金标准 +0.649% 闭环；圆角过渡 UX=建序直排（T7-B 实证）。

## 目标

布尔后体上的圆角**正解**：拾取层不再误判（面 id 列表放大消灭）、真 T 边在拾取时即被诚实拒收（而非 blend 中途整体回滚）、板角边在任意链序下可靠工作。

## 任务分解

### T1 native：边级持久 id 直挂（C++，imodel-native fork dev/source-build）
- 现状：持久 id 挂**面**（AcisFaceIdAttrib，id 列表式——布尔分裂片保留旧 id 追加新 id，AcisTopologyId.cpp:307-315）；边只能靠面对枚举间接寻址（放大根源）
- 改造：**布尔/特征求值落库时给边挂同款持久 ATTRIB**（边创建即分配，分裂时子边继承）；或最小版——暴露「按边 id 直查」op（输入持久边 id→返回 cache 子实体），拾取时经 topologyIdFromSubEntity 换算后直接存**边 id**
- native 重编译（脚本 replace-imodeljs-native.ps1 链路）+ TS 通道扩展（editor 包 EditBuiltInCommand 新 op 或扩展现有 op31/32）
- 单测：native 侧边 id 分裂继承（布尔后角边 id 稳定）；TS 侧往返

### T2 native：邻接数通道（修死桩）
- 现状：`getConnectedSubEntities` 死桩（SolidKernelUtil.cpp:669-686 CreateSubEntityFromId id-only 重载恒 nullptr——parent-body 重载现成可用未接线）
- 改造：接线 parent-body 重载→TS 暴露「边的邻面数」查询
- 单测：盒体角边邻接=2；Tutorial 2 墙脚 T 边邻接=3

### T3 web-next：拾取门禁真邻接数 + resolveEdgeRef 改造
- FilletEdgePickTool：拾得边先查邻接数——>2 即拒收 toast「该边为多面交界（非流形），圆角不支持」（拾取时诚实，取代 blend 中途回滚）
- resolveEdgeRef：边 id 直寻替代面对两两枚举（T1 通道）；面对路径保留兼容
- 单测：mock 通道形态/门禁路径

### T4 集成验收
- Tutorial 2 全链后（布尔体上）板 4 角边圆角→绿；拱脚 T 边拾取→诚实拒收文案（非中途回滚）
- 体积对拍维持 ±1%；全回归

## 风险
| 风险 | 缓解 |
|---|---|
| native C++ 改动+重编译链路（fork 维护纪律） | ITWINJS_CORE_MODIFICATIONS/私有仓 README 登记；替换脚本链路现成 |
| 边分裂继承语义（布尔后边可能消失/合并） | id 失效=诚实报「引用失效」走既有 status=1 通道 |
| 子代理额度 7 天上限（10-28 重置） | C++ 主工作排重置后；TS 侧可先行 |

## 顺序
T1→T2→T3→T4（native 串行；T3 的门禁可先行于 T1 用 T2 通道）。
