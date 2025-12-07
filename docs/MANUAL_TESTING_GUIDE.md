# BotForg Editor - Manual Testing Guide

**Version**: 1.0 MVP
**Last Updated**: January 13, 2025
**Purpose**: Step-by-step manual testing checklist for BotForg Editor

---

## Prerequisites

**Before Starting**:

1. ✅ Backend running: `http://localhost:8000`
2. ✅ Frontend running: `http://localhost:5173`
3. ✅ Chrome DevTools open (Console + Network tabs)
4. ✅ React DevTools installed (optional for performance profiling)

**Estimated Time**: 2-3 hours for complete testing

---

## Phase 2: Frontend Block Library Integration

### Test 2.1: Initial Load ✓

**Steps**:

1. Open browser and navigate to `http://localhost:5173/editorV2`
2. Wait for page to load completely

**Verify**:

- [ ] BlockLibrary panel visible on left side
- [ ] Blocks are grouped by category
- [ ] Categories appear in order: Базовые → Бизнесовые → Сервисные → Системные → AI → Дополнительные
- [ ] Plan badge visible in library header (should show current plan)
- [ ] Plan/role badge visible in EditorControls (top bar)
- [ ] No console errors during load
- [ ] Loading completes in < 2 seconds

**Success Criteria**: All checkboxes checked ✅

---

### Test 2.2: Plan/Role Selection ✓

**Steps**:

1. Locate plan selector in EditorControls
2. Note current block count
3. Change plan: free → pro → enterprise
4. For each change, observe block count

**Verify**:

- [ ] Free plan shows ~8 blocks
- [ ] Pro plan shows ~21 blocks
- [ ] Enterprise plan shows 24 blocks (all)
- [ ] Badge updates immediately on selection
- [ ] No duplicate blocks appear
- [ ] Transitions are smooth (no flickering)
- [ ] Category structure maintained

**Success Criteria**: Block counts match expectations ✅

---

### Test 2.3: Search Functionality ✓

**Steps**:

1. Locate search box in BlockLibrary
2. Type "сообщение" (lowercase)
3. Observe filtered results
4. Clear search (X button or delete text)
5. Verify all blocks return

**Verify**:

- [ ] Only matching blocks shown during search
- [ ] Search is case-insensitive
- [ ] Matches in title AND description
- [ ] Clear button works
- [ ] All blocks return after clear
- [ ] Category headers remain visible

**Success Criteria**: Search filters correctly ✅

---

### Test 2.4: Block Cards UI ✓

**Steps**:

1. Scroll through BlockLibrary
2. Hover over different blocks
3. Inspect visual elements

**Verify**:

- [ ] Icon displayed correctly for each block
- [ ] Title clearly visible
- [ ] Description text visible and readable
- [ ] Border color matches block's color property
- [ ] Hover effect works (background change or shadow)
- [ ] No layout issues (text overflow, alignment)
- [ ] Cursor changes to grab/move on hover

**Success Criteria**: All visual elements correct ✅

---

## Phase 3: Drag-and-Drop Node Creation

### Test 3.1: Basic Drag-and-Drop ✓

**Steps**:

1. Find "Сообщение" block in BlockLibrary
2. Click and drag to canvas center
3. Release mouse button
4. Open browser console
5. Inspect logged node structure

**Verify**:

- [ ] Node appears at drop location
- [ ] Node has correct structure:
  ```json
  {
    "id": "xyz123",
    "type": "default",
    "position": { "x": 250, "y": 100 },
    "data": {
      "blockId": "message",
      "title": "Сообщение",
      "icon": "💬",
      "color": "#3b82f6",
      "settings": {}
    }
  }
  ```
- [ ] Console shows node validation log
- [ ] Success toast appears: "Блок добавлен"
- [ ] Node is selectable and draggable

**Success Criteria**: Node created with correct structure ✅

---

### Test 3.2: Multiple Blocks ✓

**Steps**:

1. Drag 5 different blocks to canvas
2. For each, check console log

**Verify**:

- [ ] Each node has unique ID (different from others)
- [ ] Each has correct blockId (matches catalog)
- [ ] All have `settings: {}` (empty object)
- [ ] All nodes render correctly
- [ ] No ID collisions

**Success Criteria**: 5 unique nodes created ✅

---

### Test 3.3: Access Control ✓

**Steps**:

1. Set plan=free, role=developer (in EditorControls)
2. Try to drag "Оплата" block (requires pro)
3. Observe result
4. Try to drag "Сообщение" block (free-tier block)
5. Observe result

**Verify for "Оплата" (denied)**:

- [ ] Warning toast appears: "Доступен только в тарифе PRO"
- [ ] Node NOT created on canvas
- [ ] Console shows access denied log

**Verify for "Сообщение" (allowed)**:

- [ ] Success toast appears: "Блок добавлен"
- [ ] Node created on canvas
- [ ] No access warnings

**Success Criteria**: Access control working correctly ✅

---

### Test 3.4: Node Rendering ✓

**Steps**:

1. Drag several different blocks
2. Inspect visual appearance

**Verify**:

- [ ] Node shows block title (not ID)
- [ ] Border color matches block.color
- [ ] Start node has handles: top and bottom only
- [ ] Other nodes have handles: all 4 sides (top, right, bottom, left)
- [ ] No visual glitches or rendering errors
- [ ] Text is readable
- [ ] Rounded corners appear correctly

**Success Criteria**: All nodes render correctly ✅

---

## Phase 4: BlockSettingsPanel Dynamic Forms

### Test 4.1: Form Rendering ✓

**Steps**:

1. Click on "Сообщение" node
2. Settings panel should open on right
3. Inspect panel contents

**Verify**:

- [ ] Panel opens on right side
- [ ] Header shows "Сообщение" title
- [ ] Description text visible
- [ ] Form fields match configSchema:
  - Text field: "Текст сообщения" (required)
  - Select field: "Режим парсинга"
  - Boolean field: "Отключить превью ссылок"
  - Select field: "Тип медиа" (none, image, gif, video)
  - Media list field: "Медиа-файлы" (если mediaType != none)
  - Button list field: "Кнопки" (опционально)
  - String field: "Название блока" (можно изменить, иконка остается)
- [ ] Close button (X) visible in top-right
- [ ] Panel closes when clicking on empty canvas area
- [ ] Panel stays open when clicking on the same node again

**Success Criteria**: Panel displays correct fields ✅

---

### Test 4.2: Field Types ✓

**Steps**:
Test each field type by finding a block that uses it:

1. **String Field**: Type in text input
2. **Text Field**: Type multi-line text in textarea
3. **Number Field**: Try entering text (should reject)
4. **Boolean Field**: Toggle checkbox
5. **Select Field**: Choose from dropdown
6. **Multiselect Field**: Select multiple checkboxes
7. **JSON Field**: Enter JSON `{"key": "value"}`
8. **Duration Field**: Enter amount and select unit

**Verify**:

- [ ] String: Text input accepts any text
- [ ] Text: Textarea allows multi-line, resizable
- [ ] Number: Only accepts numbers, rejects letters
- [ ] Boolean: Checkbox toggles on/off
- [ ] Select: Dropdown shows options, selection works
- [ ] Multiselect: Multiple checkboxes, can select many
- [ ] JSON: JSON editor validates syntax, shows errors
- [ ] Duration: Amount input + unit dropdown work together

**Success Criteria**: All 8 field types functional ✅

---

### Test 4.3: Required Field Indicators ✓

**Steps**:

1. Select any node
2. Look at form fields
3. Identify required fields

**Verify**:

- [ ] Required fields show red asterisk (\*) after label
- [ ] Optional fields have no asterisk
- [ ] Asterisk color is clearly visible (red)
- [ ] All fields have labels

**Success Criteria**: Required indicators visible ✅

---

### Test 4.4: Data Updates ✓

**Steps**:

1. Select "Сообщение" node
2. Type "Test message" in "Текст сообщения" field
3. Change "Название блока" to "Мое сообщение"
4. Select "Тип медиа" = "image"
5. Add multiple images via "Медиа-файлы" (upload or URL)
6. Click "Inspect" button (or open console)
7. Check console for logged settings

**Verify**:

- [ ] Settings update in real-time
- [ ] Node title changes to "Мое сообщение" (icon remains unchanged)
- [ ] Media previews appear in the node (200px width, 100px height, maintains aspect ratio)
- [ ] Message text preview appears below media in the node
- [ ] Console shows updated settings:
  ```json
  {
    "text": "Test message",
    "parseMode": "Plain",
    "disablePreview": false,
    "mediaType": "image",
    "mediaList": [
      {
        "url": "http://...",
        "type": "image",
        "source": "upload",
        "fileName": "image.jpg"
      }
    ]
  }
  ```
- [ ] No data appears outside `node.data.settings`
- [ ] Updates happen immediately (real-time)

**Success Criteria**: Data updates correctly ✅

---

### Test 4.5: Switching Nodes ✓

**Steps**:

1. Select node A, fill some fields
2. Select node B, fill different fields
3. Select node A again
4. Check if data persists

**Verify**:

- [ ] Panel updates to show node B's fields
- [ ] Node A's data persists when switching back
- [ ] No data loss during switching
- [ ] Panel renders correct schema for each node

**Success Criteria**: Data persists correctly ✅

---

## Phase 5: Export (Save) Functionality

### Test 5.1: Export Valid Flow ✓

**Steps**:

1. Create flow with 3 nodes
2. Fill all required fields
3. Connect nodes with edges
4. Click "Сохранить" button
5. Check Downloads folder

**Verify**:

- [ ] File downloads immediately
- [ ] Filename format: `botforg-flow-{timestamp}.json`
- [ ] Success toast appears: "Сценарий экспортирован"
- [ ] No modal shown (direct download)
- [ ] File size reasonable (< 100KB for 3 nodes)

**Success Criteria**: Valid flow exports immediately ✅

---

### Test 5.2: Exported JSON Structure ✓

**Steps**:

1. Open downloaded JSON file in text editor
2. Verify structure

**Verify**:

- [ ] Has `meta` section with:
  - `created_at`: ISO timestamp string
  - `plan`: Current plan (e.g., "free")
  - `role`: Current role (e.g., "developer")
  - `node_count`: Number matching actual nodes
  - `edge_count`: Number matching actual edges
  - `version`: "1.0"
- [ ] Has `nodes` array with all nodes
- [ ] Has `edges` array with all edges
- [ ] JSON is valid (no syntax errors)
- [ ] All node settings preserved

**Success Criteria**: JSON structure correct ✅

---

### Test 5.3: Export Invalid Flow ✓

**Steps**:

1. Create flow with 2 nodes
2. Leave required field empty in 1 node
3. Click "Сохранить"
4. Observe modal

**Verify**:

- [ ] Warning modal appears
- [ ] Modal shows error count
- [ ] Modal has two buttons:
  - "Отмена" (Cancel)
  - "Всё равно сохранить" (Save Anyway)
- [ ] Modal lists which nodes have errors
- [ ] No file downloads yet

**Success Criteria**: Warning modal blocks export ✅

---

### Test 5.4: Export Modal Actions ✓

**Steps**:

1. With modal open from Test 5.3
2. Click "Отмена"
3. Try export again
4. This time click "Всё равно сохранить"

**Verify for Cancel**:

- [ ] Modal closes
- [ ] No file downloaded
- [ ] Can continue editing

**Verify for Confirm**:

- [ ] File downloads despite errors
- [ ] Toast appears
- [ ] Modal closes

**Success Criteria**: Both modal actions work ✅

---

## Phase 6: Import (Load) Functionality

### Test 6.1: Import Valid File ✓

**Steps**:

1. Export a flow (from Phase 5)
2. Clear canvas or refresh page
3. Click "Загрузить" button
4. Select the exported JSON file
5. Observe result

**Verify**:

- [ ] All nodes restored at correct positions
- [ ] All edges restored correctly
- [ ] All settings preserved exactly
- [ ] Success toast appears: "Сценарий импортирован"
- [ ] Validation runs automatically
- [ ] No console errors

**Success Criteria**: Flow restored perfectly ✅

---

### Test 6.2: Import Invalid Files ✓

**Steps**:
Create test files and try importing each:

**Test 6.2a: Missing nodes key**

1. Create JSON: `{"edges": []}`
2. Try to import

**Test 6.2b: Corrupted JSON**

1. Create file with invalid syntax: `{broken json`
2. Try to import

**Test 6.2c: Invalid node structure**

1. Create JSON with node missing settings:
   ```json
   {
     "nodes": [{ "id": "1", "data": {} }],
     "edges": []
   }
   ```
2. Try to import

**Verify**:

- [ ] Test 6.2a: Error toast "Некорректный формат файла: отсутствует nodes"
- [ ] Test 6.2b: Error toast "Файл повреждён или неверный формат"
- [ ] Test 6.2c: Error toast "Некорректная структура узлов: N узлов без settings"
- [ ] Canvas unchanged in all cases
- [ ] No crashes or freezes

**Success Criteria**: All invalid files rejected ✅

---

### Test 6.3: Import Validation ✓

**Steps**:

1. Create flow with invalid nodes (missing required fields)
2. Export it (using "Всё равно сохранить")
3. Clear canvas
4. Import the file
5. Check for error badges

**Verify**:

- [ ] Import succeeds
- [ ] Red borders visible on invalid nodes
- [ ] ⚠️ badges visible on invalid nodes
- [ ] Validation ran automatically
- [ ] Toast shows import success

**Success Criteria**: Auto-validation after import ✅

---

## Phase 7: Validation System

### Test 7.1: Visual Error Badges ✓

**Steps**:

1. Drag "Сообщение" block to canvas
2. Don't fill the required "text" field
3. Observe the node

**Verify**:

- [ ] Node has red border (instead of normal color)
- [ ] ⚠️ badge visible in bottom-right corner
- [ ] Badge is red/orange colored
- [ ] Badge has shadow/glow effect
- [ ] Hover over badge shows tooltip
- [ ] Tooltip text: "Заполните обязательные поля: Текст сообщения"

**Success Criteria**: Error badge visible and informative ✅

---

### Test 7.2: Badge Removal ✓

**Steps**:

1. With invalid node from Test 7.1
2. Click node to open settings
3. Fill the required "text" field
4. Observe the node

**Verify**:

- [ ] Badge disappears immediately
- [ ] Border returns to normal color (blue)
- [ ] No delay in update
- [ ] Change is instant

**Success Criteria**: Badge disappears when fixed ✅

---

### Test 7.3: Validation Modal ✓

**Steps**:

1. Create 3 nodes with missing required fields
2. Click "Проверить" button (in toolbar)
3. Observe modal

**Verify**:

- [ ] Modal opens
- [ ] Shows error count: "Найдено ошибок: 3"
- [ ] Lists each invalid node with:
  - Node ID
  - Block title
  - Missing fields list
  - "Перейти" button (may be placeholder)
- [ ] Modal is scrollable if many errors
- [ ] Close button (X) works

**Success Criteria**: Modal lists all errors ✅

---

### Test 7.4: Validation Success State ✓

**Steps**:

1. Fill all required fields in all nodes
2. Click "Проверить" button
3. Observe modal

**Verify**:

- [ ] Modal opens
- [ ] Shows success message with ✅ icon
- [ ] Message: "Все узлы настроены правильно" or similar
- [ ] No error list shown
- [ ] Green/positive color scheme

**Success Criteria**: Success state displays correctly ✅

---

### Test 7.5: Real-Time Validation ✓

**Steps**:

1. Select a node with filled required field
2. Clear the field value
3. Observe badge appearance
4. Fill field again
5. Observe badge disappearance

**Verify**:

- [ ] Badge appears instantly when field cleared
- [ ] Badge disappears instantly when field filled
- [ ] No delay (< 100ms response)
- [ ] No flickering
- [ ] Smooth transitions

**Success Criteria**: Real-time validation instant ✅

---

### Test 7.6: Export Validation Integration ✓

**Steps**:

1. Create flow with invalid nodes
2. Try to export
3. Observe modal
4. Click "Отмена"
5. Fix all errors
6. Try export again

**Verify**:

- [ ] First export: Warning modal appears
- [ ] Modal blocks download until confirmed
- [ ] After fixing: Export succeeds without modal
- [ ] Validation runs before export
- [ ] Integration seamless

**Success Criteria**: Export validation works ✅

---

## Phase 8: Code Quality (Browser Tests)

### Test 8.1: Console Errors ✓

**Steps**:

1. Open DevTools Console
2. Clear console
3. Perform all major actions:
   - Load page
   - Drag blocks
   - Edit settings
   - Export flow
   - Import flow
   - Validate flow

**Verify**:

- [ ] No red errors in console
- [ ] No yellow warnings (or only acceptable ones)
- [ ] Only info/log messages (blue)
- [ ] No failed network requests
- [ ] No React warnings

**Success Criteria**: Clean console ✅

---

### Test 8.2: Network Performance ✓

**Steps**:

1. Open DevTools Network tab
2. Clear network log
3. Reload page
4. Check /blocks request

**Verify**:

- [ ] GET /blocks request completes
- [ ] Response time < 100ms
- [ ] Status: 200 OK
- [ ] Response size reasonable (< 50KB)
- [ ] No redundant requests
- [ ] Headers correct (Content-Type: application/json)

**Success Criteria**: Network optimized ✅

---

### Test 8.3: React Flow Performance ✓

**Steps** (requires React DevTools Profiler):

1. Open React DevTools
2. Go to Profiler tab
3. Start recording
4. Drag 10 nodes to canvas
5. Stop recording
6. Analyze flame graph

**Verify**:

- [ ] No excessive re-renders
- [ ] nodeTypes/edgeTypes not re-creating
- [ ] Most components under 16ms render time
- [ ] No red/orange slow renders
- [ ] Smooth 60fps performance

**Success Criteria**: Good performance profile ✅

---

## Phase 10: Final Comprehensive Tests

### Test 10.1: Full User Flow ✓

**Steps**:

1. Start fresh browser session (incognito)
2. Navigate to editor
3. Create complete flow:
   - Add 5+ nodes
   - Connect nodes with edges
   - Fill all required settings
   - Export flow to file
4. Clear canvas (refresh page)
5. Import the exported file
6. Verify everything restored

**Verify**:

- [ ] Flow creation smooth
- [ ] All nodes added successfully
- [ ] Edges connect properly
- [ ] Settings save correctly
- [ ] Export downloads file
- [ ] Import restores perfectly
- [ ] No errors throughout entire flow

**Success Criteria**: Complete workflow functional ✅

---

### Test 10.2: Cross-Browser Testing ✓

**Steps**:
Repeat Test 10.1 in multiple browsers:

1. Chrome 120+
2. Firefox 120+
3. Edge 120+

**Verify for each browser**:

- [ ] Page loads correctly
- [ ] All features work identically
- [ ] Drag-and-drop works
- [ ] Export/import works
- [ ] Visual appearance consistent
- [ ] No browser-specific bugs

**Success Criteria**: Works in all major browsers ✅

---

### Test 10.3: Stress Test ✓

**Steps**:

1. Create flow with 50+ nodes
2. Connect many edges
3. Test all operations

**Verify**:

- [ ] Page remains responsive
- [ ] Drag-and-drop still smooth
- [ ] Validation instant (< 1s for all nodes)
- [ ] Export succeeds (file size reasonable)
- [ ] Import succeeds and fast (< 3s)
- [ ] No memory leaks (check Task Manager)
- [ ] No freezes or crashes

**Success Criteria**: Handles large flows well ✅

---

### Test 10.4: Error Recovery ✓

**Steps**:
Test error scenarios:

1. **Backend down**: Stop backend, try operations
2. **Invalid JSON**: Import corrupted file
3. **Network issues**: Throttle network to slow 3G

**Verify**:

- [ ] Backend down: Error toast shown, app doesn't crash
- [ ] Invalid JSON: Clear error message, state unchanged
- [ ] Slow network: Loading indicators shown
- [ ] App recovers gracefully from all errors
- [ ] No data loss
- [ ] No crashes or white screens

**Success Criteria**: Robust error handling ✅

---

### Test 10.5: Basic Accessibility ✓

**Steps**:

1. Test keyboard navigation:
   - Tab through interface
   - Enter to activate buttons
   - Escape to close modals
2. Check focus indicators
3. Test with screen reader (optional)

**Verify**:

- [ ] Can navigate with keyboard only
- [ ] Focus indicators visible on all interactive elements
- [ ] Tab order logical
- [ ] Escape closes modals/panels
- [ ] Enter activates buttons
- [ ] ARIA labels present (check DOM)
- [ ] Screen reader announces elements (if tested)

**Success Criteria**: Basic accessibility present ✅

---

## Testing Checklist Summary

**Total Tests**: 30 test cases across 5 phases

### By Phase:

- **Phase 2 (BlockLibrary)**: 4 tests ✓
- **Phase 3 (Drag-and-Drop)**: 4 tests ✓
- **Phase 4 (Settings Panel)**: 5 tests ✓
- **Phase 5 (Export)**: 4 tests ✓
- **Phase 6 (Import)**: 3 tests ✓
- **Phase 7 (Validation)**: 6 tests ✓
- **Phase 8 (Code Quality)**: 3 tests ✓
- **Phase 10 (Final Checks)**: 5 tests ✓

### Completion Tracking:

- [ ] All 30 test cases completed
- [ ] All issues documented
- [ ] Results logged
- [ ] Sign-off obtained

---

## Issue Tracking Template

**Use this template to document any issues found during testing**:

```
### Issue #X: [Brief Description]

**Test**: Test X.Y - [Test Name]
**Severity**: Critical / High / Medium / Low
**Browser**: Chrome 120 / Firefox / Edge
**Steps to Reproduce**:
1.
2.
3.

**Expected**:
**Actual**:
**Screenshots**:
**Console Errors**:

**Status**: Open / In Progress / Fixed / Won't Fix
**Assigned**:
**Fix Version**:
```

---

## Final Sign-Off

**Tester Name**: **\*\*\*\***\_**\*\*\*\***
**Date**: **\*\*\*\***\_**\*\*\*\***
**Overall Result**: PASS / FAIL / PASS WITH ISSUES
**Total Tests**: 30
**Passed**: **\_
**Failed**: \_**
**Skipped**: \_\_\_

**Notes**:

---

---

---

**Recommendation**: Ready for Production / Needs Fixes / Major Issues Found

---

**Last Updated**: January 13, 2025
**Next Review**: Before Phase 2 deployment
