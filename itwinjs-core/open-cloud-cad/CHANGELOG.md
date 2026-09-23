# Changelog

All notable changes to Open Cloud CAD will be documented in this file.

## [Unreleased] - 2026-04-07

### Added

- **Modeling Tools**: Complete boolean operations and face tools
  - `UniteSolidsTool` - Union multiple solid bodies
  - `SubtractSolidsTool` - Subtract one solid from another
  - `IntersectSolidsTool` - Intersect two solid bodies
  - `OffsetFacesTool` - Offset selected faces by distance
  - `SweepFacesTool` - Sweep faces along direction
  - Abstract `BooleanToolBase` class for shared boolean logic

- **Baseline Reliability**: Automatic compensation for failed baseline generation
  - `BaselineCompensationJob` runs every 2 minutes
  - Auto-detects orphaned iModels (initialized but missing checkpoint)
  - Retriggers baseline generation webhook automatically
  - Admin API endpoints for manual repair and monitoring

- **Health Check Script**: `scripts/health-check.sh`
  - Verifies all services are running (imodelhub, backend, web-agent, Azurite)
  - Checks webhook configuration and recent events
  - Reports orphaned iModels count
  - Validates database connectivity

- **Admin API Endpoints** (imodelhub-services):
  - `GET /imodels/admin/uninitialized` - List uninitialized iModels
  - `POST /imodels/admin/repair-baselines` - Batch repair all failed baselines
  - `POST /imodels/admin/repair/:id` - Repair specific iModel
  - `GET /imodels/admin/compensation-status` - Check compensation job status

### Fixed

- **V2 Checkpoint 403 Error**: Fixed authentication failures
  - Root cause: web-agent not running, Azurite data directory empty
  - Added automatic baseline regeneration for affected iModels

### Documentation

- Updated `CLAUDE.md` with deployment reliability section
- Updated `README.md` with health check instructions
- Updated `docs/Deployment-Guide.md` with Admin API and troubleshooting
- Updated `docs/baseline-reliability-design.md` with implementation status

## [Unreleased] - 2026-04-01

### Added

- **Baseline File Upload**: Full support for user-uploaded baseline .bim files
  - Web-Agent processes files asynchronously
  - Converts to CloudSqlite BCVV format for V2 Checkpoint
  - Validates and fixes iModelId/iTwinId in uploaded files
  - Proper error handling with `failed` state

- **Database Migration**: Added `failed` state to `imodels_state_enum`
  - Migration: `AddFailedToIModelStateEnum20260401000001`
  - Allows marking iModels that failed baseline processing

- **Static Resource Serving**: Workspace directory structure for iTwin.js
  - `public/scripts/` - iTwin.js worker files
  - `public/workspace/default/` - Default workspace with symlinks
  - Support for localization files

### Fixed

- **Azure Storage Authentication**: Use `StorageSharedKeyCredential` instead of plain object
  - Fixes "Server failed to authenticate" errors with Azurite

- **File Path Consistency**: `blobContainerName` from config instead of parsing from path
  - Fixes "Container not found" errors in web-agent

- **Express Route Ordering**: `/baseline/process` endpoint registered before 404 handler
  - Fixes 404 errors when backend calls web-agent

- **SnapshotDb ReadOnly Issue**: Use `StandaloneDb` with `OpenMode.ReadWrite`
  - Fixes "IModelDb was opened read-only" error when fixing IDs

- **Vite Proxy Configuration**: Added `/workspace` and `/azurite` proxies
  - Fixes worker file 404 errors
  - Fixes CORS issues with Azurite uploads

- **Public Path Configuration**: Set `publicPath: '/workspace/default/'` in `IModelApp.startup`
  - Fixes iTwin.js worker and localization file loading

### Changed

- **iModel State Management**: User-uploaded files stay `notInitialized` until processing completes
  - Empty iModels: initialized immediately
  - Uploaded files: notInitialized → initialized (after processing)

- **CreateIModelWorkflow**: Removed polling, added background processing indicator
  - Dialog closes after upload completes
  - iModel card shows processing state

### Configuration Changes

#### Web-Agent `.env`
```bash
# New baseline processing variables
BLOB_STORAGE_URL=http://127.0.0.1:10000/devstoreaccount1
BLOB_ACCOUNT_NAME=devstoreaccount1
BLOB_ACCOUNT_KEY=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==
BLOB_CONTAINER_NAME=imodelhub
IMODELHUB_API_URL=http://localhost:4000
```

#### Frontend Vite Config
```typescript
proxy: {
  '/azurite': { /* Azure blob storage proxy */ },
  '/workspace': { /* iTwin.js static files */ },
}
```

### Documentation

- Updated `README.md` with troubleshooting section
- Updated `QUICKSTART.md` with baseline file testing steps
- Updated `apps/web-agent/README.md` with baseline processing documentation

### Known Issues

- **tsx watch caching**: Sometimes requires full restart (`pkill -f tsx`) to pick up changes
- **iTwin.js cache locking**: Briefcase cache may lock files, requires cache cleanup on restart
- **React StrictMode**: Components mount twice in development, may cause initialization warnings

### Migration Notes

1. Run database migration in imodelhub-services:
   ```bash
   cd /path/to/imodelhub-services
   npm run migration:run
   ```

2. Create static file symlinks:
   ```bash
   cd apps/web/public
   mkdir -p workspace/default
   ln -s $(pwd)/scripts workspace/default/scripts
   ln -s /path/to/itwinjs/core/frontend/lib/public/locales workspace/default/locales
   ```

3. Restart all services:
   ```bash
   pkill -f tsx
   # Restart backend, web-agent, and web
   ```

---

## [1.0.0] - 2026-03-31

### Added

- Initial release
- User authentication (JWT-based)
- iTwin/iModel CRUD operations
- 3D Viewer with read-only mode
- Edit mode with BriefcaseConnection
- Sketch tools (line, arc, circle, rectangle, polygon)
- Transform tools (move, rotate)
- Undo/redo support
- CAD feature history
- Assembly management
- Empty iModel baseline generation via webhooks
