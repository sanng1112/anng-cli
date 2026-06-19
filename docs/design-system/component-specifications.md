# Component Specifications --- Anng CLI Design System

> **Platform:** Terminal UI (Ink + React for Node.js)
> **Framework:** Ink v7 + React 19 + TypeScript 6
> **Scope:** Reusable, keyboard-navigable terminal components
> **Accent Color:** #D4704B (burnt copper)

---

## 1. Design Tokens

### 1.1 Color Palette
All colors are expressed as hex strings passed directly to Ink or chalk props.

| Token | Hex Value | Usage |
|---|---|---|
| colorAccent | #D4704B | Primary accent, highlights, focus indicators |
| colorAccentDimmed | #D4704Be6 | Dimmed accent for borders, subpued highlights |
| colorSuccess | #50C878 | Success/confirm actions |
| colorError | #EF5350 | Error state, destructive actions |
| colorInfo | #42A5F5 | Informational highlights |
| colorBorderFocus | #D4704B | Focused/selected border |
### 1.2 Typography

Terminal rendering uses monospace fonts. Sized via Ink props (bold, dimColor).

### 1.3 Spacing

| Token | Value | Usage |
|---|---|---|
| spacingSM | 1 | Tight padding between siblings |
| spacingMD | 2 | Default gap between sections |
| spacingLG | 3 | Section separation |
| spacingXL < 4 1> Major layout breaks |
| alt: marginTop | 1 | Standard top margin for stacked components |

### 1.4 Border Styles

| Style | Usage |
|---|---|
| round | Selected for dialogs, modals, panels |
| single | Tables, secondary groupings |
| double | Emphasis, completion summaries |

---

## 2. Button Component

### 2.1 Purpose
A keyboard-navigable action trigger rendered as a styled inline element.

### 2.2 Props

```tsx
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = {
  children: React.ReactNode;
  variant?: ButtonVariant;
  isFocused?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onPress?: () => void;
  color?: string;
};
```

### 2.3 Variants

| Variant | Focused Border | Focused Text | Usage |
|---|---|---|---|
| primary | #D4704B | #D4704B bold | Confirm, Save, Submit |
| secondary | dim | default | Cancel, Back |
| danger | #EF5350 | #EF5350 | Delete, Remove |
| ghost | none | accent | Inline actions |

### 2.4 States

- Default: dim border, dim text
- Focused: ccent border, bold accent text
- Disabled: dimmed text, no focus
- Loading: spinner appended to text

### 2.5 Keyboard

- Tab/Shift+Tab: move focus
- Enter: activate (onPress)

### 2.6 Examples

```tsx
<Button variant="primary" isFocused onPress={handleSave}>Save</Button>
<Button variant="danger" onPress={handleDelete}>Delete</Button>
<Button variant="ghost" fullWidth onPress={handleAdd}>+ Add Item</Button>
```

---

## 3. Modal Component

### 3.1 Purpose
A focused dialog that overlays the main content area, trapping focus until dismissed.

### 3.2 Props

```tsx
type ModalProps = {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  visible: boolean;
  onClose: () => void;
  widthRatio?: number;       // default 0.6
  dismissable?: boolean;     // default true
};
```

### 3.3 Layout

- Width: floor(columns * widthRatio), clamped 40..columns-4
- Height: grows with content, scrolls internally if overflow

### 3.4 Structure

Header: bold title | Content: children (scrollable) | Footer: action buttons

### 3.5 States

- Open: rendered with border, background dimmed behind
- Closing: instant removal
- Empty: dim placeholder message

### 3.6 Keyboard

- Esc/Ctrl+C: onClose (if dismissable)
- Tab: cycle focus within modal
- Enter: activate focused element

### 3.7 Focus Trap
On open, focus set to first focusable element. Keyboard events outside are consumed.

### 3.8 Examples

```tsx
<Modal title="Confirm" visible={open} onClose={close}
  footer={<><Button variant="secondary" onPress={close}>Cancel</Button>
           <Button variant="danger" isFocused onPress={del}>Delete</Button></>>}
  closeModal={close}>
  <Text>Are you sure?</Text>
</Modal>
```

---

## 4. Table Component

### 4.1 Purpose
A scrollable column-based data display for structured information.

### 4.2 Props

```tsx
type Column<T> = {
  header: string;
  accessor: (row: T) => React.ReactNode;
  width: number | "flex";
  align?: "left" | "right" | "center";
  truncate?: boolean;
};

type TableProps<T> = {
  columns: Column<T>[];
  data: T[];
  selectedIndex?: number;
  onSelectChange?: (index: number) => void;
  onRowActivate?: (row: T, index: number) => void;
  maxVisibleRows?: number;   // default 8
  keyExtractor?: (row: T, index: number) => string;
  showRowNumbers?: boolean;
  emptyMessage?: string;
};
```

### 4.3 Width Calculation
Flex columns fill remaining space after fixed-width columns.

### 4.4 Rendering

- Headers: bold with accent color
- Selected: ">" prefix + accent highlight
- Columns: two-space gap

### 4.5 States

Default, Selected (>, accent), Empty (message), Scrolled (indicator)

### 4.6 Keyboard

| Key | Action |
|---|---|
| Up/k | Move selection up |
| Down/j | Move selection down |
| Home/g | Jump to first |
| End/G | Jump to last |
| Enter | Activate row |

### 4.7 Examples

```tsx
<Table
  columns={[
    { header: "Name", accessor: (s) => s.name, width: 30, truncate: true },
    { header: "Status", accessor: (s) => s.status, width: 12, align: "center" },
    { header: "Model", accessor: (s) => s.model, width: 15 },
    { header: "Tokens", accessor: (s) => String(s.tokens), width: "flex", align: "right" },
  ]}
  data={sessions}
  selectedIndex={index}
  onSelectChange={setIndex}
  onRowActivate={(s) => resumeSession(s)}
  maxVisibleRows={10}
  emptyMessage="No sessions yet."/>
```

---

## 5. Integration Patterns

### 5.1 Composition
All three components work together: Table inside Modal, Buttons in Modal footer.

### 5.2 State Management
All components are controlled. Parent owns state; children report via callbacks.

| Component | Controlled Prop | Callback |
|---|---|---|
| Button | isFocused, disabled | onPress |
| Modal | visible | onClose |
| Table | selectedIndex, data | onSelectChange, onRowActivate |

### 5.3 Focus Hierarchy

```
App -> Modal (focus trap when open)
         -> Table (arrow keys)
         -> Buttons (Tab)
     -> UndoSelector / SessionList (full-screen)
```

### 5.4 Theming
Color tokens are passed as props. No theme provider.

---

## 6. Edge Cases

| Component | Case | Behavior |
|---|---|---|
| Button | empty children | return null |
| Modal | small terminal | min-width: columns-2 |
| Table | long cell | truncate at width-1 |
| All | terminal resize | auto re-render via useWindowSize |

---

## 7. File Locations

| Component | Path |
|---|---|
| Button | src/ui/components/Button.tsx |
| Modal | src/ui/components/Modal.tsx |
| Table | src/ui/components/Table.tsx |
| Barrel export | src/ui/components/index.ts |

---

## 8. Implementation Checklist

- [ ] Button.tsx -- 4 variants, focus/disabled, keyboard handlers
- [ ] Modal.tsx -- overlay, focus trap, Esc close, scroll, footer
- [ ] Table.tsx -- columns, keyboard nav, scroll offset, selection, empty state
- [ ] Update index.ts -- re-export all three
- [ ] Tests -- one .test.ts per component in src/tests/

---

## 9. Design Principles

1. Keyboard-first -- arrow keys, Tab, Enter
2. Terminal-native -- Ink primitives only
3. Controlled -- parent owns state
4. Minimal deps -- ink + react + TS only
5. Consistent accent -- #D4704B everywhere
