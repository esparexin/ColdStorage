# Permanent Rule: Anti-Overengineering, No Speculative Assumptions & HTML Form Integrity

**Scope**: All packages (`packages/contracts`, `packages/backend`, `packages/frontend`)  
**Status**: ACTIVE, PERMANENT & MANDATORY — NO EXCEPTIONS

---

## 1. Anti-Overengineering & Zero-Assumption Mandate (YAGNI & KISS)

When building or modifying features with AI assistance, all changes must strictly address the immediate task without inventing unrequested future capabilities.

1. **No Speculative Generalization (YAGNI - You Aren't Gonna Need It)**:
   - Solve **only** the exact problem described in the current request.
   - Never create preemptive abstractions, generic factories, plugin systems, configurable wrappers, or "future-proofing" layers for hypothetical scenarios.
   - Do not add fields, parameters, or configurations based on *"we might need this in the future"* assumptions.

2. **Minimal Blast Radius & Small Reviewable Changes**:
   - Limit file modifications strictly to the files necessary to implement the single requested change.
   - Do not perform drive-by refactorings, file reorganization, or stylistic rewrites in unrelated files.
   - If a change spans across multiple independent sub-domains, STOP and split it into separate, focused tasks.

3. **No Unrequested Dependencies ("Alien Code" Prevention)**:
   - Do not install new npm packages or external libraries when standard JavaScript/TypeScript, React built-ins, or existing project dependencies can fulfill the requirement.
   - Always adhere to the established project coding idioms, naming patterns, and existing architecture conventions.

4. **Avoid Hasty Abstractions (Rule of Three)**:
   - Duplication is far cheaper than the wrong abstraction. Do not create shared utility abstractions until a pattern is identical across at least 3 distinct call sites.

5. **Plain Explanation Before Broad Changes**:
   - For any non-trivial modification, explain the exact intended file changes in simple, direct language before executing.

---

## 2. HTML Form Structure & Semantic Integrity

All form layouts across `packages/frontend/src/` must adhere strictly to HTML/DOM standards and accessibility requirements:

1. **Strict Prohibition on Nested `<form>` Tags**:
   - A `<form>` must **never** be placed inside another `<form>`.
   - When a modal, popup, or step-wizard contains a form, ensure it renders via a Portal outside the parent form element, or link external controls using the HTML5 `form="form-id"` attribute.

2. **Strict Prohibition on Invalid Table/Form Nesting**:
   - Never insert a `<form>` directly inside `<table>`, `<tbody>`, or between `<tr>` elements.
   - Either wrap the entire `<table>` inside the `<form>`, or contain individual forms entirely within a single `<td>` cell.

3. **Mandatory Explicit `type` on All `<button>` Elements**:
   - Inside or outside forms, every `<button>` must declare an explicit `type`:
     - `type="button"` for cancellation, dialog closing, navigation, or generic click triggers.
     - `type="submit"` exclusively for primary form submission actions.
     - `type="reset"` for form reset actions.
   - Never omit the `type` attribute; omitting it defaults to `type="submit"` and triggers accidental form submissions.

4. **No Nested Interactive Elements**:
   - Never nest `<button>` inside `<a>`, `<a>` inside `<button>`, or interactive elements inside `<label>` (other than the associated control itself).

5. **Form Label & Accessible Name Association**:
   - Every `<input>`, `<select>`, and `<textarea>` must have an associated `<label>` using matching `id` and `htmlFor`, an implicit wrapping `<label>`, or consume the canonical UI primitives (`Input`, `Select`) with a declared `label` prop.
   - Element `id` attributes must remain globally unique per page to prevent label/aria misdirection.
