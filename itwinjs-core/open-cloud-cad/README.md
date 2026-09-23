# 鲁班CAD（LubanCAD）

**天工开物**平台的 AI 生成式 CAD 产品——说出要什么，鲁班给你真形。基于 iTwin.js、本地部署（2026-09-23 命名家族定版：天工开物 / 鲁班CAD / 真形 / 绳墨；前名 Open Cloud CAD / Zokei）。详见 platform-docs（~/Documents/GitHub/platform-docs）的 VISION.md。

**Tech Stack**: React 18 + TypeScript 5.6 + iTwin.js 5.0 + Express + PostgreSQL + Azurite

---

## Features

| Module | Status | Description |
|--------|--------|-------------|
| **Authentication** | ✅ | JWT-based login/register |
| **Project Management** | ✅ | iTwin CRUD operations |
| **iModel Management** | ✅ | Model management with briefcase support |
| **3D Editor** | ✅ | 基础 3D 编辑器与工具注册（能力细分见下表各行与 platform-docs/STATUS.md） |
| **Solid Modeling** | 🟠 | Fillet, chamfer, shell, offset, sweep; PatternTools ID 收集 bug，PatternCommand 未注册 |
| **Boolean Operations** | ✅ | Union, subtract, intersect |
| **Measurement** | ✅ | Distance, area, volume, length |
| **Markup** | ❌ | 降级占位（@itwin/core-markup 模块解析问题，12 工具禁用） |
| **View Clip** | ✅ | Section plane, range, shape clipping |
| **AccuDraw** | ✅ | Precision drawing assistance |
| **Version Control** | 🟠 | Changeset/Named Version 可用；冲突检测 🟠（mock 数据）、冲突解决 ⚪（no-op 标记） |

完整能力矩阵见 platform-docs/STATUS.md（状态标记：✅/🟠/⚪/❌）

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Azurite (Azure Storage Emulator)

### Start Services

```bash
# 1. Start infrastructure
cd imodelhub-services && docker-compose up -d

# 2. Install dependencies
cd open-cloud-cad && rush install

# 3. Build project
rush build --to @open-cloud-cad/web

# 4. Start services
cd apps/backend && rushx dev      # Port 4001
cd apps/web-agent && rushx dev    # Port 4002
cd apps/web && rushx dev          # Port 3000
```

Access: http://localhost:3000

---

## Project Structure

```
open-cloud-cad/
├── apps/
│   ├── web/              # Frontend (Port 3000)
│   ├── backend/          # Backend API (Port 4001)
│   └── web-agent/        # Webhook agent (Port 4002)
├── packages/
│   ├── shared/           # Shared types and RPC interfaces
│   ├── viewer-core/      # Viewer core components
│   └── web-viewer/       # Web platform viewer
├── modules/
│   ├── core/             # Core CAD functionality
│   └── ui/               # UI components
└── docs/                 # Documentation
```

---

## Implemented Tools

### View Operations
- `View.Rotate` - Rotate view
- `View.Pan` - Pan view
- `View.Zoom` - Zoom view
- `View.Fit` - Fit view to selection
- `View.Undo/Redo` - View history

### Solid Modeling
- `RoundEdgesTool` - Edge fillet
- `ChamferEdgesTool` - Edge chamfer
- `HollowFacesTool` - Shell/solid hollow
- `OffsetFacesTool` - Face offset
- `SweepFacesTool` - Face sweep
- `UniteSolidsTool` - Boolean union
- `SubtractSolidsTool` - Boolean subtract
- `IntersectSolidsTool` - Boolean intersect

### Measurement
- `MeasureDistanceTool` - Distance measurement
- `MeasureLocationTool` - Coordinate location
- `MeasureAreaByPointsTool` - Area by points
- `MeasureLengthTool` - Length measurement
- `MeasureAreaTool` - Element area
- `MeasureVolumeTool` - Element volume

### Markup
❌ 已禁用（@itwin/core-markup 模块解析问题，12 工具全部禁用——以下为占位清单，状态见 Features 表）
- `LineTool` - Line annotation
- `RectangleTool` - Rectangle annotation
- `CircleTool` - Circle annotation
- `ArrowTool` - Arrow annotation
- `TextTool` - Text annotation

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](./CLAUDE.md) | Project overview and architecture |
| [docs/Architecture.md](./docs/Architecture.md) | System architecture |
| [docs/Deployment-Guide.md](./docs/Deployment-Guide.md) | Deployment guide |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Future roadmap |
| [docs/ITWINJS_CORE_MODIFICATIONS.md](./docs/ITWINJS_CORE_MODIFICATIONS.md) | iTwin.js core modifications |
| [docs/DEEP_ANALYSIS.md](./docs/DEEP_ANALYSIS.md) | Technical deep dive |

---

## Contributing

1. Follow the existing code style
2. Components: PascalCase (e.g., `CadToolbar.tsx`)
3. Hooks: camelCase (e.g., `useEditTools.ts`)
4. Types: PascalCase (e.g., `BriefcaseInfo.ts`)

---

## License

MIT License - See [LICENSE](./LICENSE) for details

---

## Acknowledgments

Built on [iTwin.js](https://www.itwinjs.org/) - An open platform from Bentley Systems for infrastructure digital twins.
