---
name: react-design
description: Use when building, reviewing, or refactoring React components — audits for oversized components, unnecessary re-renders, and state management. Prefers local state; escalates to Context + useSyncExternalStore only when justified. Trigger /react-design
---

# /react-design

Audit and refactor React components for proper separation and controlled re-rendering. Default to local state — only introduce Context API when genuinely needed.

## Usage

```
/react-design <file or folder path>
```

## What You Must Do When Invoked

Follow these steps in order. Do not skip steps.

### Step 1 - Read and audit the target

Read the file(s) specified. Identify every problem from this checklist:

**Component separation:**
- [ ] Component exceeds ~150 JSX lines — split into sub-components
- [ ] Multiple unrelated responsibilities in one component — extract each into its own file
- [ ] Repeated UI patterns — extract shared component
- [ ] Inline callbacks or derived values that don't depend on local state — lift out

**Re-rendering problems:**
- [ ] Parent state change re-renders children that don't use that state
- [ ] A single state value triggers re-render of the entire tree
- [ ] Objects/arrays created inline in JSX (new reference every render)
- [ ] Missing `memo()` on child components that receive stable props

**State management — choose the simplest level that works:**

| Level | When to use |
|-------|-------------|
| **Local state** (`useState`) | State used by one component or passed down 1-2 levels. **This is the default.** |
| **Lifted state** | Two siblings need the same state — lift to their common parent, pass as props. |
| **Component extraction** | Only one child uses a parent's state value — extract that child so the parent stops re-rendering. |
| **Context API** | State needed by 3+ levels deep **AND** prop drilling is actively painful (3+ intermediate components just forwarding props they don't use). |
| **Context + useSyncExternalStore** | Context exists **AND** multiple consumers only need different slices — prevents full-tree re-render on any state change. |

**Context is NOT justified when:**
- State only crosses 1-2 component boundaries — just pass props
- Only one component consumes the value — local state or lift it
- You're adding context "just in case" or for cleanliness — premature abstraction
- A simple callback prop solves the problem

Present findings as a numbered list with file:line references. For each state-related finding, state which level from the table above applies and why.

### Step 2 - Plan the refactor

For each finding, state the fix. Follow these patterns:

#### Component separation pattern

```
src/features/FeatureName/
  index.tsx              # public export
  FeatureName.tsx        # container — assembles sub-components, holds no UI logic
  SubComponentA.tsx      # leaf — receives props, renders UI
  SubComponentB.tsx
  hooks/
    useFeatureName.ts    # data fetching, business logic
  context/
    FeatureContext.tsx    # only if Context is justified (see table above)
```

#### When to extract a component

Apply this rule: **if a piece of JSX depends on a state value that nothing else in the parent uses, extract it.**

```tsx
// BAD — entire Form re-renders when charCount changes
function Form() {
  const [title, setTitle] = useState('');
  const [charCount, setCharCount] = useState(0);
  return (
    <div>
      <input value={title} onChange={(e) => { setTitle(e.target.value); setCharCount(e.target.value.length); }} />
      <span>{charCount}/100</span>   {/* only this needs charCount */}
      <HeavyPreview title={title} /> {/* re-renders unnecessarily */}
    </div>
  );
}

// GOOD — CharCounter owns its own concern, Form doesn't re-render for it
function CharCounter({ value }: { value: string }) {
  return <span>{value.length}/100</span>;
}

function Form() {
  const [title, setTitle] = useState('');
  return (
    <div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <CharCounter value={title} />
      <HeavyPreview title={title} />
    </div>
  );
}
```

#### Subscription-based context pattern (ONLY when Context is justified)

Use this **only** when the audit in Step 1 confirmed Context is needed (3+ levels, multiple consumers needing different slices). Split into a **store + selectors** pattern:

```tsx
// context/store.ts
import { useSyncExternalStore, useRef, createContext, useContext } from 'react';

type Listener = () => void;

function createStore<T>(initialState: T) {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    setState: (partial: Partial<T> | ((prev: T) => Partial<T>)) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// context/FeatureContext.tsx
type Store = ReturnType<typeof createStore<FeatureState>>;
const StoreContext = createContext<Store | null>(null);

function FeatureProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<Store>();
  if (!storeRef.current) {
    storeRef.current = createStore<FeatureState>(initialState);
  }
  return (
    <StoreContext.Provider value={storeRef.current}>
      {children}
    </StoreContext.Provider>
  );
}

// hooks/useFeatureSelector.ts — only re-renders when selected slice changes
function useFeatureSelector<R>(selector: (state: FeatureState) => R): R {
  const store = useContext(StoreContext)!;
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
  );
}

// hooks/useFeatureDispatch.ts — never causes re-render
function useFeatureDispatch() {
  const store = useContext(StoreContext)!;
  return store.setState;
}
```

**Usage:**
```tsx
// Only re-renders when `count` changes, ignores other state changes
function CountDisplay() {
  const count = useFeatureSelector((s) => s.count);
  return <span>{count}</span>;
}

// Never re-renders from state changes — dispatch is stable
function IncrementButton() {
  const dispatch = useFeatureDispatch();
  return <button onClick={() => dispatch((s) => ({ count: s.count + 1 }))}>+</button>;
}
```

#### If Context already exists but shouldn't

If the audit finds Context used where local state or prop passing would suffice:
- Remove the context provider
- Move state into the component that owns it
- Pass values as props where needed
- This is a simplification, not a regression

### Step 3 - Confirm with user

Present the refactoring plan as a before/after summary:
- Which components get extracted
- State management decisions: what stays local, what gets lifted, what (if anything) needs Context
- Expected re-render improvement (which components stop re-rendering)

Ask: "Ready to apply these changes?"

### Step 4 - Apply the refactor

Execute the plan. For each change:
- Extract components into separate files
- Keep state local by default — only create context when justified
- If context is justified, use the `useSyncExternalStore` store pattern with `useFeatureSelector` / `useFeatureDispatch`
- Wrap expensive children in `memo()` where props are stable
- Remove inline object/array/function creation in JSX where it causes re-renders
- Update imports and exports

### Step 5 - Verify

- Run `npx tsc --noEmit` to catch type errors
- Run existing tests if they exist
- Check that no circular imports were introduced
