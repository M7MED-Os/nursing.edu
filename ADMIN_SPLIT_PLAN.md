# Phase 2.2: admin.js File Splitting Plan

## Current Structure Analysis

**File**: `admin.js` (2,250 lines)

### Logical Sections Identified:

1. **STATE & AUTH** (Lines 1-167)
   - Imports
   - Global state variables
   - Auth check (`checkAdminAuth`)
   - DOM event listeners
   - Logout handler

2. **NAVIGATION & VIEWS** (Lines 168-209)
   - Context selection (`selectContext`)
   - View switching (`showView`)
   - Label helpers (`getContextLabel`)

3. **SUBJECT LIST MANAGEMENT** (Lines 210-369)
   - Load subjects (`loadSubjects`)
   - Add subject modal (`openAddSubjectModal`)
   - Edit subject modal (`openEditSubjectModal`)
   - Delete subject (`deleteSubject`)

4. **SUBJECT MANAGER (TREE VIEW)** (Lines 370-469)
   - Open subject manager (`openSubjectManager`)
   - Load content tree (`loadContentTree`)
   - Create tree node (`createTreeNode`)

5. **EDITORS & FORMS** (Lines 470-675)
   - Add chapter modal (`openAddChapterModal`)
   - Open editor (`openEditor`)
   - Add lesson/exam modals
   - Delete item
   - Edit node modal (`openEditNodeModal`)
   - Save lecture data (`saveLectureData`)

6. **QUESTION MANAGER** (Lines 676-978)
   - Render exam questions (`renderExamQuestions`)
   - Save question (`saveQuestion`)
   - Edit question (`editQuestion`)
   - Reset question form (`resetQuestionForm`)
   - Delete question (`deleteQuestion`)

7. **SHARED MODAL LOGIC** (Lines 979-1012)
   - Open/close modals
   - Modal event listeners

8. **STUDENT MANAGEMENT** (Lines 1013+)
   - Load students
   - Analytics/charts
   - (Not shown in outline, but exists)

---

## Proposed Split Strategy

### File 1: `admin/admin-core.js` (~300 lines)
**Purpose**: Main orchestrator, auth, navigation, shared utilities

**Contents**:
- Imports
- Global state (shared across modules)
- `checkAdminAuth()`
- `selectContext()`
- `showView()`
- `getContextLabel()`
- `setupModalListeners()`
- `openModal()`, `closeModal()`
- `triggerCelebration()`
- DOM initialization code
- Export: `{ currentContext, currentUser, checkAdminAuth, ...utilities }`

**Reason**: This is the entry point andcontains shared logic needed by all other modules.

---

### File 2: `admin/admin-subjects.js` (~400 lines)
**Purpose**: Subject CRUD operations

**Contents**:
- `loadSubjects()`
- `openAddSubjectModal()`
- `openEditSubjectModal()`
- `deleteSubject()`
- Export: `{ loadSubjects, openAddSubjectModal, openEditSubjectModal, deleteSubject }`

**Imports from core**:
- `currentContext`
- `showView()`
- `openModal()`, `closeModal()`

**Reason**: Self-contained CRUD operations for subjects.

---

### File 3: `admin/admin-content.js` (~500 lines)
**Purpose**: Chapter/Lesson/Exam tree management

**Contents**:
- `openSubjectManager()`
- `loadContentTree()`
- `createTreeNode()`
- `openAddChapterModal()`
- `openEditor()`
- `openAddLessonModal()`
- `openAddExamModal()`
- `deleteItem()`
- `openEditNodeModal()`
- `saveLectureData()`
- Export: `{ openSubjectManager, loadContentTree, ... }`

**Imports from core**:
- `currentContext`
- `openModal()`, `closeModal()`

**Reason**: Manages the hierarchical content structure (chapters → lessons → exams).

---

### File 4: `admin/admin-questions.js` (~500 lines)
**Purpose**: Question editor and management

**Contents**:
- `renderExamQuestions()`
- `saveQuestion()`
- `editQuestion()`
- `resetQuestionForm()`
- `deleteQuestion()`
- State: `editingQuestionId`, `existingQuestionImages`
- Export: `{ renderExamQuestions, saveQuestion, editQuestion, ... }`

**Imports from core**:
- None (self-contained)

**Reason**: Complex question editor is isolated, only called from `openEditor()`.

---

### File 5: `admin/admin-students.js` (~550 lines)
**Purpose**: Student management and analytics

**Contents**:
- `loadStudents()`
- `showStudentsView()`
- `updateStreamFilter()`
- Chart logic
- Student filtering/search
- Export: `{ loadStudents, showStudentsView, ... }`

**Imports from core**:
- `currentContext`

**Reason**: Student management is a separate domain from content management.

---

## Migration Strategy

### Step 1: Create `admin-core.js` (Foundation)
- Extract shared state & utilities
- Keep `admin.js` as main entry point initially
- Test: Admin panel loads

### Step 2: Extract `admin-questions.js` (Isolated)
- Move question management (no dependencies)
- Import in `admin-core.js`
- Test: Question editor works

### Step 3: Extract `admin-content.js`
- Move content tree management
- Import in `admin-core.js`
- Test: Content manager works

### Step 4: Extract `admin-subjects.js`
- Move subject CRUD
- Import in `admin-core.js`
- Test: Subject list works

### Step 5: Extract `admin-students.js`
- Move student management
- Import in `admin-core.js`
- Test: Student view works

### Step 6: Clean up `admin.js`
- Make it a thin wrapper that imports all modules
- Or rename `admin-core.js` to `admin.js`

---

## Dependencies Map

```
admin.js (entry point)
  ├── admin-core.js (foundation)
  │   ├── Exports: state, navigation, modals
  │   └── No imports from other admin modules
  │
  ├── admin-subjects.js
  │   └── Imports: admin-core (currentContext, modals)
  │
  ├── admin-content.js
  │   └── Imports: admin-core (currentContext, modals)
  │
  ├── admin-questions.js
  │   └── Imports: admin-core (modals) - optional
  │
  └── admin-students.js
      └── Imports: admin-core (currentContext)
```

---

## Risk Assessment

**Low Risk**:
- ✅ Question manager extraction (isolated)
- ✅ Student manager extraction (separate view)

**Medium Risk**:
- ⚠️ Subject CRUD (tightly coupled to navigation)
- ⚠️ Content tree (calls between files)

**High Risk**:
- 🔴 Global state split (if not done carefully)
- 🔴 Modal system (used everywhere)

**Mitigation**:
- Keep global state in core
- Keep modal system in core
- Each module imports what it needs from core
- Test after each extraction

---

## Testing Checklist (After Each Step)

1. [ ] Admin panel loads without errors
2. [ ] Navigation between views works
3. [ ] Subject list displays
4. [ ] Add/Edit/Delete subject works
5. [ ] Content tree displays
6. [ ] Question editor opens
7. [ ] Add/Edit/Delete questions works
8. [ ] Student list displays
9. [ ] No console errors
10. [ ] All imports resolve correctly

---

## Execution Order

1. Create timings constants ✅ (DONE)
2. Create admin-core.js (next)
3. Extract admin-questions.js
4. Extract admin-content.js
5. Extract admin-subjects.js
6. Extract admin-students.js
7. Update admin.js to import modules
8. Test comprehensively

---

**Ready to proceed with Step 2: Create admin-core.js**
