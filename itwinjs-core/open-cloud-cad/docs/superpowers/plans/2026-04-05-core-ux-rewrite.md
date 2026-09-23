# Open Cloud CAD - Core UX Rewrite Implementation Plan (Sections 1,2,3,4,7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix UX blockers in authentication, project center, iTwin/iModel management, editor foundation, and version control to approach Onshape-level core experience.

**Architecture:** Restore feature-based directory structure, unify the 3D viewer instance across readonly/editable modes, replace primitive DX/DY/DZ inputs with a 3D Gizmo, consolidate side panels with tabs, and add visual timelines for version control.

**Tech Stack:** React 18, TypeScript, iTwinUI React, iTwin.js 5.0, React Query, Vite

---

## Phase 0: Workspace Recovery

The current working tree has missing `features/` directories due to an interrupted refactor. We must restore compilable code before any new work.

### Task 0.1: Restore features directory and imports

**Files:**
- Create: `open-cloud-cad/apps/web/src/app/contexts/UserContext.tsx`
- Create: `open-cloud-cad/apps/web/src/app/providers/QueryProvider.tsx`
- Create: `open-cloud-cad/apps/web/src/features/auth/services/auth/client.ts`
- Create: `open-cloud-cad/apps/web/src/features/itwin/hooks/useITwinsQuery.ts`
- Create: `open-cloud-cad/apps/web/src/features/itwin/components/CreateITwinDialog.tsx`
- Create: `open-cloud-cad/apps/web/src/features/imodel/hooks/useIModelsQuery.ts`
- Create: `open-cloud-cad/apps/web/src/features/imodel/hooks/useIModelPermission.ts`
- Create: `open-cloud-cad/apps/web/src/features/imodel/components/CreateIModelWorkflow.tsx`
- Create: `open-cloud-cad/apps/web/src/features/editor/components/CadToolbar.tsx`
- Create: `open-cloud-cad/apps/web/src/features/editor/components/ThemeToggle.tsx`
- Create: `open-cloud-cad/apps/web/src/features/editor/hooks/useEditTools.ts`
- Create: `open-cloud-cad/apps/web/src/features/version-control/hooks/useChangesets.ts`
- Create: `open-cloud-cad/apps/web/src/shared/components/skeletons/DocumentsSkeleton.tsx`
- Create: `open-cloud-cad/apps/web/src/shared/components/skeletons/ITwinDetailSkeleton.tsx`

**Steps:**
- [ ] **Step 1:** Extract files from git HEAD or `git show 63bc2a6610` that originally contained these components/hooks and place them in the paths above.
- [ ] **Step 2:** Fix relative imports in `Documents.tsx`, `ITwinDetail.tsx`, and `Editor.tsx` so they point to the new `features/` directories.
- [ ] **Step 3:** Run type check: `cd open-cloud-cad/apps/web && npx tsc --noEmit`
  - Expected: zero import errors.

---

## Phase 1: Authentication UX (Section 1)

### Task 1.1: Register page - confirm password, strength meter, and field-level errors

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/Register/Register.tsx`

**Steps:**
- [ ] **Step 1:** Add state for `confirmPassword` and `passwordStrength`.
- [ ] **Step 2:** Implement password strength helper and render a colored bar.
- [ ] **Step 3:** Add `confirmPassword` input and real-time validation message.
- [ ] **Step 4:** Map API errors to field-level inline messages.
- [ ] **Step 5:** On success redirect to `/login?registered=true` and show a success toast in Login.
- [ ] **Step 6:** Run tests and ensure they pass.

### Task 1.2: Login page - remember me and refined errors

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/Login/Login.tsx`
- Modify: `open-cloud-cad/apps/web/src/features/auth/services/auth/client.ts`

**Steps:**
- [ ] **Step 1:** Add `rememberMe: boolean` checkbox (default true).
- [ ] **Step 2:** Update login client to accept `rememberMe` and store tokens in `localStorage` (true) or `sessionStorage` (false).
- [ ] **Step 3:** `UserContext` reads both storage locations on mount.
- [ ] **Step 4:** Map HTTP status codes to clear Chinese error messages in the UI.
- [ ] **Step 5:** Verify with `npx tsc --noEmit`.

---

## Phase 2: Project Center (Section 2)

### Task 2.1: Documents page - stabilize cache and improve empty states

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/Documents/Documents.tsx`
- Modify: `open-cloud-cad/apps/web/src/features/itwin/hooks/useITwinsQuery.ts`

**Steps:**
- [ ] **Step 1:** Add `staleTime: 5 * 60 * 1000` and `cacheTime: 10 * 60 * 1000` to the React Query hooks.
- [ ] **Step 2:** Verify filter switching no longer triggers duplicate requests.
- [ ] **Step 3:** Add an inline SVG empty-state illustration for each filter tab.
- [ ] **Step 4:** For zero search results, show "未找到匹配的项目" with a "清除搜索" button.
- [ ] **Step 5:** Verify with `npx tsc --noEmit`.

---

## Phase 3: iTwin & iModel Management (Section 3-4)

### Task 3.1: Implement Edit and Delete for iTwin projects

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/ITwinDetail/ITwinDetail.tsx`
- Create: `open-cloud-cad/apps/web/src/features/itwin/components/EditITwinDialog.tsx`

**Steps:**
- [ ] **Step 1:** Add `updateITwin` and `deleteITwin` methods to the iTwins client.
- [ ] **Step 2:** Create `EditITwinDialog.tsx` using iTwinUI Dialog.
- [ ] **Step 3:** Wire "编辑项目" menu item to open the dialog; on save, refetch and toast.
- [ ] **Step 4:** Wire "删除项目" to a confirmation dialog; on confirm, delete, navigate back, and toast.
- [ ] **Step 5:** Write a simple unit test for the dialog if the project already has a dialog test pattern.

### Task 3.2: Implement iModel delete and download

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/ITwinDetail/ITwinDetail.tsx`
- Modify: `open-cloud-cad/apps/web/src/features/imodel/services/client.ts` (create if missing)

**Steps:**
- [ ] **Step 1:** Add `deleteIModel` and `getDownloadUrl` to the imodels client.
- [ ] **Step 2:** Bind "删除" card menu item with confirmation and loading state.
- [ ] **Step 3:** Bind "下载" card menu item using a hidden anchor tag with `download` attribute.
- [ ] **Step 4:** Verify with `npx tsc --noEmit`.

### Task 3.3: iModel initialization progress visualization

**Files:**
- Modify: `open-cloud-cad/apps/web-agent/src/webhook-server.ts`
- Modify: `open-cloud-cad/apps/web-agent/src/baseline-generator.ts`
- Modify: `open-cloud-cad/apps/backend/src/main.ts`
- Modify: `open-cloud-cad/apps/web/src/pages/ITwinDetail/ITwinDetail.tsx`

**Steps:**
- [ ] **Step 1:** Store progress state in backend memory (a `Map<iModelId, {step, progress}>`).
- [ ] **Step 2:** Emit progress steps from `baseline-generator.ts` at 10%, 30%, 60%, 90%, 100%.
- [ ] **Step 3:** Add `GET /api/imodels/:id/progress` route in backend.
- [ ] **Step 4:** Update frontend to poll `/progress` and show step text + determinate progress bar.
- [ ] **Step 5:** Verify the visual output in the browser.

### Task 3.4: Failed iModel retry

**Files:**
- Modify: `open-cloud-cad/apps/backend/src/main.ts`
- Modify: `open-cloud-cad/apps/web/src/pages/ITwinDetail/ITwinDetail.tsx`

**Steps:**
- [ ] **Step 1:** Add `POST /api/imodels/:id/reinitialize` in backend that resets state and re-triggers processing.
- [ ] **Step 2:** In `ITwinDetail.tsx`, for `failed` cards show error tooltip and a "重新初始化" button.
- [ ] **Step 3:** Clicking the button calls the endpoint and resumes polling.
- [ ] **Step 4:** Verify with a test that the retry flow works end-to-end.

---

## Phase 4: Editor Foundation Refactor (Section 5-6)

### Task 4.1: Unify viewer — single instance for readonly and editable modes

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/Editor/Editor.tsx`

**Steps:**
- [ ] **Step 1:** Remove dual-viewer conditional rendering. Delete the separate `WebViewer` usage.
- [ ] **Step 2:** Use a single viewport div (`ref={viewportRef}`) that never unmounts.
- [ ] **Step 3:** Open a single connection (BriefcaseConnection preferred; fallback CheckpointConnection) and persist camera state across mode switches.
- [ ] **Step 4:** Mode changes only toggle tool availability, not the viewer instance.
- [ ] **Step 5:** Verify no flash/reload occurs when briefcase is acquired.

### Task 4.2: Integrate BriefcaseStatus into Editor topbar

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/Editor/Editor.tsx`
- Create: `open-cloud-cad/apps/web/src/features/editor/components/BriefcaseStatus.tsx`
- Create: `open-cloud-cad/apps/web/src/features/editor/components/BriefcaseStatusBar.tsx`
- Create: `open-cloud-cad/apps/web/src/features/imodel/hooks/useBriefcase.ts`

**Steps:**
- [ ] **Step 1:** Restore `BriefcaseStatus.tsx` and `useBriefcase.ts` from recent commits into `features/`.
- [ ] **Step 2:** Create `BriefcaseStatusBar.tsx` styled for the Editor topbar.
- [ ] **Step 3:** Replace the disabled "申请编辑权限" button in `Editor.tsx` with `<BriefcaseStatusBar iModelId={iModelId} />`.
- [ ] **Step 4:** Ensure acquiring a briefcase smoothly enables edit tools without remounting the viewer.

### Task 4.3: Clean toolbar — remove dev tools, replace emojis with icons

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/Editor/Editor.tsx`

**Steps:**
- [ ] **Step 1:** Hide "诊断" and "测试球体" behind `import.meta.env.DEV`.
- [ ] **Step 2:** Replace all emoji toolbar buttons with proper `@itwin/itwinui-icons-react` icons.
- [ ] **Step 3:** Add `title` attributes and group buttons with dividers for visual clarity.
- [ ] **Step 4:** Verify the toolbar renders correctly in both readonly and editable modes.

### Task 4.4: Consolidate right-side panels with tabs

**Files:**
- Modify: `open-cloud-cad/apps/web/src/pages/Editor/Editor.tsx`
- Create: `open-cloud-cad/apps/web/src/features/editor/components/EditorSidebar.tsx`

**Steps:**
- [ ] **Step 1:** Create `EditorSidebar.tsx` using iTwinUI `<Tabs>` with tabs: `特征`, `装配`, `历史`, `版本`.
- [ ] **Step 2:** Replace hardcoded absolute panels in `Editor.tsx` with a single right sidebar.
- [ ] **Step 3:** Toolbar buttons for "历史" and "版本" switch the active tab instead of toggling booleans.
- [ ] **Step 4:** `ChangesetCompare` renders inside the `历史` tab, not as an overlay.
- [ ] **Step 5:** Verify no layout overflow and the viewer remains the dominant visual element.

### Task 4.5: 3D Transform Gizmo for Move/Rotate/Scale

**Files:**
- Create: `open-cloud-cad/apps/web/src/core/gizmo/TransformGizmo.ts`
- Create: `open-cloud-cad/apps/web/src/core/gizmo/useTransformGizmo.ts`
- Modify: `open-cloud-cad/apps/web/src/pages/Editor/Editor.tsx`

**Steps:**
- [ ] **Step 1:** Implement `TransformGizmo.ts` to draw X/Y/Z axis arrows and handle axis picking via ray intersection in view space.
- [ ] **Step 2:** Implement `useTransformGizmo.ts` with `startTransform`, `updateTransform`, `commitTransform`, `cancelTransform`.
- [ ] **Step 3:** Remove the DX/DY/DZ input toolbar entirely from `Editor.tsx`.
- [ ] **Step 4:** Bind "移动", "旋转", "缩放" toolbar buttons to the gizmo. On drag, the selected element moves in world space along the active axis.
- [ ] **Step 5:** On mouseup, commit the transform via the existing backend API / RPC.
- [ ] **Step 6:** Verify the gizmo appears only when elements are selected and a transform mode is active.

### Task 4.6: Auto-save and pending changes indicator

**Files:**
- Create: `open-cloud-cad/apps/web/src/features/editor/hooks/useAutoSave.ts`
- Modify: `open-cloud-cad/apps/web/src/pages/Editor/Editor.tsx`

**Steps:**
- [ ] **Step 1:** Implement `useAutoSave.ts` that calls `save()` after 3 seconds of inactivity when `hasChanges` is true.
- [ ] **Step 2:** Derive `hasPendingChanges` from `UndoManager` or briefcase state in `Editor.tsx`.
- [ ] **Step 3:** Show a green dot next to the Save button in the topbar when there are pending changes.
- [ ] **Step 4:** Require a non-empty changeset description before Push; show a small dialog for input.
- [ ] **Step 5:** Verify auto-save fires correctly after pausing edits.

---

## Phase 5: Version Control UX (Section 7)

### Task 5.1: Changeset timeline visual overhaul

**Files:**
- Modify: `open-cloud-cad/apps/web/src/features/version-control/components/ChangesetTimeline.tsx`

**Steps:**
- [ ] **Step 1:** Replace flat list with a CSS vertical timeline.
- [ ] **Step 2:** Show changeset index, short description, author, and relative time at each node.
- [ ] **Step 3:** Highlight the current changeset with a larger, colored node.
- [ ] **Step 4:** Add hover tooltip with full description and exact timestamp.
- [ ] **Step 5:** Verify within the Editor's `历史` tab.

### Task 5.2: Split-screen changeset comparison

**Files:**
- Modify: `open-cloud-cad/apps/web/src/features/version-control/components/ChangesetCompare.tsx`
- Modify: `open-cloud-cad/apps/web/src/features/editor/components/EditorSidebar.tsx`

**Steps:**
- [ ] **Step 1:** Render `ChangesetCompare` inside the `历史` tab instead of a full-screen overlay.
- [ ] **Step 2:** Use a 50%/50% split layout. Each side shows a `WebViewer` loaded with the source or target checkpoint.
- [ ] **Step 3:** Header shows source name, target name, and a "关闭对比" button.
- [ ] **Step 4:** MVP: list changed element IDs with color badges (green = added, red = removed) next to each viewer.
- [ ] **Step 5:** Verify the split view renders correctly and can be closed to return to the timeline.

---

## Acceptance Criteria

### Authentication
- [ ] Register has password confirmation, strength bar, and field-level errors
- [ ] Login has remember-me toggle and clear error messages
- [ ] Tokens stored in localStorage when remember-me is checked, sessionStorage otherwise

### Documents
- [ ] Switching filters does not repeatedly re-fetch within 5 minutes
- [ ] Empty states use an illustration instead of plain text
- [ ] Search with no results shows a clear-search button

### iTwin / iModel
- [ ] iTwin projects can be edited and deleted with confirmation
- [ ] iModels can be deleted and downloaded
- [ ] iModel initialization shows step-by-step progress (e.g., "步骤 2/4：验证文件 30%")
- [ ] Failed iModels show error details and a retry button

### Editor Foundation
- [ ] Only one viewer instance exists; switching modes does not reload the model
- [ ] Briefcase acquisition is interactive in the topbar
- [ ] Toolbar has no emojis and no dev-only buttons in production
- [ ] Right panels are consolidated into `特征/装配/历史/版本` tabs
- [ ] Move/Rotate/Scale use a 3D gizmo instead of DX/DY/DZ inputs
- [ ] Auto-save fires 3 seconds after the user stops editing
- [ ] Unpushed changes show an indicator; push requires a description

### Version Control
- [ ] Changeset timeline uses a visual timeline with nodes
- [ ] Changeset comparison is a split view inside the History tab
