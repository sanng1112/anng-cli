# Settings & Models Logic Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all logic errors and technical debt in ANNG CLI's settings/models/providers interaction layer — data corruption between scopes, stale UI state after cancellation, missing model variants, destructive defaults, and duplicate constants.

**Architecture:** The settings system has three persistent stores: (1) `settings.json` (user `~/.anng/` + project `.anng/`) stores model name, thinking config, and env overrides; (2) `providers.json` stores API provider credentials; (3) `models.json` stores the model registry. Resolution merges these sources at runtime (`resolveSettingsSources`). The UI layer (`SettingsView`, `ModelsDropdown`, `PromptInput`) reads resolved settings and writes back to the project/user scope. Fixes target: (a) broken default URL, (b) missing model variants in capability sets, (c) stale `pickProviderForModel` state on escape, (d) destructive `loadModels` threshold, (e) models registry not visible in Settings model picker, (f) `/model` dropdown stale until restart, (g) duplicate `MODEL_COMMAND_MODELS` constant, (h) confusing `applyModelConfigSelection` branch logic.

**Tech Stack:** TypeScript, React Ink (terminal UI), Node.js `fs`, OpenAI SDK

---

## File Structure

### Files to modify (7 source + 1 test + 1 config):

| File | Responsibility | Change summary |
|------|----------------|----------------|
| `src/common/model-capabilities.ts` | Capability sets for thinking/multimodal | Add `-free` variants to `DEEPSEEK_V4_MODELS` and `NON_MULTIMODAL_MODELS` |
| `src/settings.ts` | Settings resolution + persistence | Fix `DEFAULT_BASE_URL`; simplify `applyModelConfigSelection` |
| `src/team/provider-types.ts` | Provider/model registry I/O | Import `MODEL_COMMAND_MODELS` from `ModelsDropdown` (remove dupe); fix destructive `loadModels` threshold |
| `src/ui/components/ModelsDropdown/index.tsx` | `/model` slash-command dropdown | Accept `additionalModels` prop; merge predefined + registry models dynamically |
| `src/ui/views/PromptInput.tsx` | Main input with slash commands | Load registry models fresh each time `/model` opens (not cached-once with `useMemo`) |
| `src/ui/views/SettingsView.tsx` | Full settings TUI | Clear `pickProviderForModel` on Esc; show registry models in model picker |
| `src/tests/model-capabilities.test.ts` | Unit tests for capability sets | Add tests for `-free` variants |
| `run/media/sanng/New\ Volume/Seminar/Anng_cli/.anng/settings.json` | Project-level config | Fix `model` field and `API_KEY` |

### No new files needed.

---

## Task 1: Fix model-capabilities to include -free variants

**Files:**
- Modify: `src/common/model-capabilities.ts` (entire file, 16 lines)
- Test: `src/tests/model-capabilities.test.ts` (add 4 assertions)

### Step 1.1: Add -free models to DEEPSEEK_V4_MODELS

Open `src/common/model-capabilities.ts` and replace lines 1-8 (the two Set declarations).

**Before (lines 1-8):**
```typescript
export const DEEPSEEK_V4_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);

export const NON_MULTIMODAL_MODELS = new Set([
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-chat",
  "deepseek-reasoner",
]);
```

**After:**
```typescript
export const DEEPSEEK_V4_MODELS = new Set([
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash-free",
  "deepseek-v4-pro-free",
]);

export const NON_MULTIMODAL_MODELS = new Set([
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-v4-flash-free",
  "deepseek-v4-pro-free",
  "deepseek-chat",
  "deepseek-reasoner",
]);
```

The `defaultsToThinkingMode` function (line 10-12) uses `DEEPSEEK_V4_MODELS.has(model)` so it will automatically return `true` for `deepseek-v4-flash-free` and `deepseek-v4-pro-free` — no change needed there.

The `supportsMultimodal` function (line 14-16) uses `!NON_MULTIMODAL_MODELS.has(model.trim())` so free models will correctly be flagged as non-multimodal along with their paid counterparts.

### Step 1.2: Add test assertions for -free variants

Open `src/tests/model-capabilities.test.ts`.

**Before the edit** — find the `DEEPSEEK_V4_MODELS` describe block (lines 10-20) and the `defaultsToThinkingMode` describe block (lines 30-46).

**In the `DEEPSEEK_V4_MODELS` block (after line 14, "contains deepseek-v4-flash and deepseek-v4-pro"):**
```typescript
  it("includes free variants", () => {
    assert.equal(DEEPSEEK_V4_MODELS.has("deepseek-v4-flash-free"), true);
    assert.equal(DEEPSEEK_V4_MODELS.has("deepseek-v4-pro-free"), true);
  });
```

**In the `defaultsToThinkingMode` block, update the "returns true for deepseek V4 models" test (lines 31-34):**
```typescript
  it("returns true for deepseek V4 models", () => {
    assert.equal(defaultsToThinkingMode("deepseek-v4-pro"), true);
    assert.equal(defaultsToThinkingMode("deepseek-v4-flash"), true);
    assert.equal(defaultsToThinkingMode("deepseek-v4-flash-free"), true);
    assert.equal(defaultsToThinkingMode("deepseek-v4-pro-free"), true);
  });
```

### Step 1.3: Run the tests

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsx --test src/tests/model-capabilities.test.ts
```

**Expected output (9 tests, all pass):**
```
# tests 9
# suites 4
# pass 9
# fail 0
```

### Step 1.4: Commit

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add src/common/model-capabilities.ts src/tests/model-capabilities.test.ts && git commit -m "fix(model-capabilities): add -free model variants to DEEPSEEK_V4_MODELS and NON_MULTIMODAL_MODELS sets"
```

---

## Task 2: Fix DEFAULT_BASE_URL from /zen/go/v1 to /zen/v1

**Files:**
- Modify: `src/settings.ts` (line 546)

### Step 2.1: Change the default constant

Open `src/settings.ts` and find line 546:
```typescript
export const DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1";
```

Change to:
```typescript
export const DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";
```

**Rationale:** The `/go` sub-path is the "Go API" endpoint that only accepts paid (non-free) models. The `/v1` endpoint accepts both free and paid models. Using `/zen/go/v1` as default causes requests with `-free` models to fail with HTTP 400.

This constant is consumed at:
- `src/settings.ts` line 614-623: `resolveCurrentSettings` passes it as the `baseURL` default.
- `src/settings.ts` line 347-501: `resolveSettingsSources` falls back to `defaults.baseURL` when no env/settings override exists.
- `src/common/openai-client.ts` line 166: `createProxyClient` default fallback (hardcoded separately, but uses `/zen/v1` already — correct).

No tests hardcode this URL, so no test changes needed.

### Step 2.2: Verify TypeScript

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsc --noEmit --pretty
```

**Expected:** No output (exit code 0).

### Step 2.3: Run settings tests

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsx --test src/tests/settings-and-notify.test.ts 2>&1 | tail -5
```

**Expected:** `# pass 27` `# fail 0`

### Step 2.4: Commit

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add src/settings.ts && git commit -m "fix(settings): change DEFAULT_BASE_URL from /zen/go/v1 to /zen/v1 to support free models"
```

---

## Task 3: Fix applyModelConfigSelection logic

**Files:**
- Modify: `src/settings.ts` (lines 527-531)

### Step 3.1: Simplify the condition

Find the `applyModelConfigSelection` function (around line 520-539). The current model-write logic at lines 527-531:

```typescript
  if (selected.model !== current.model || Object.prototype.hasOwnProperty.call(next, "model")) {
    next.model = selected.model;
  } else {
    delete next.model;
  }
```

Replace with:

```typescript
  if (selected.model !== current.model) {
    next.model = selected.model;
  }
```

**Why:** The `hasOwnProperty` branch was meant to handle the case where a settings file already had a `model` field and the user only changed the thinking mode. But the `delete next.model` path in the `else` branch would **remove** the model setting from the written settings object, which breaks the config (model would fall back to defaults). The simplified version always preserves `model` in settings — it only overwrites it when the name actually changes.

### Step 3.2: Run settings tests

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsx --test src/tests/settings-and-notify.test.ts 2>&1 | grep -E "(tests|pass|fail)" | tail -3
```

**Expected:**
```
# tests 27
# pass 27
# fail 0
```

### Step 3.3: Commit

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add src/settings.ts && git commit -m "fix(settings): simplify applyModelConfigSelection — remove delete-branch that could erase model setting"
```

---

## Task 4: Fix provider-types — remove duplicate MODEL_COMMAND_MODELS, fix destructive threshold

**Files:**
- Modify: `src/team/provider-types.ts` (lines 1, 72-112)

### Step 4.1: Add import from ModelsDropdown

Insert at line 3 (after the existing imports):
```typescript
import { MODEL_COMMAND_MODELS } from "../ui/components/ModelsDropdown";
```

### Step 4.2: Remove the duplicate constant declaration

Delete lines 72-80 which are the local `const MODEL_COMMAND_MODELS = [...]` declaration. The `MODEL_COMMAND_MODELS` identifier is now imported from `ModelsDropdown/index.tsx` where it is defined as `export const MODEL_COMMAND_MODELS = [...] as const;`

After deletion, the `createDefaultModels` function at line 82+ which uses `MODEL_COMMAND_MODELS.map(...)` will use the imported constant.

### Step 4.3: Fix the destructive threshold

At line 90 (formerly line 98), change:
```typescript
    if (valid.length < MODEL_COMMAND_MODELS.length / 2) {
```

to:
```typescript
    if (valid.length === 0) {
```

**Why:** The original threshold `MODEL_COMMAND_MODELS.length / 2` = 3. If the user deleted models they didn't want and had only 2 or 3 models left, the file would be **reset to defaults**, destroying their custom registry. The fix only resets when the file is completely empty (`length === 0`).

### Step 4.4: Run TypeScript check

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsc --noEmit --pretty
```

**Expected:** No output (exit code 0).

### Step 4.5: Commit

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add src/team/provider-types.ts && git commit -m "fix(provider-types): remove duplicate MODEL_COMMAND_MODELS (import from ModelsDropdown); set loadModels reset threshold to only-on-empty"
```

---

## Task 5: Fix ModelsDropdown — accept additionalModels prop, merge dynamically

**Files:**
- Modify: `src/ui/components/ModelsDropdown/index.tsx`

### Step 5.1: Add additionalModels to Props type

Find the `Props` type (lines 39-46) and add:
```typescript
  /** Additional model names from registry (`.anng/models.json`), merged dynamically */
  additionalModels?: string[];
```

### Step 5.2: Add useMemo merge of allModels

Inside the component body (after `const [pendingModel, ...]` lines), add:
```typescript
  // Merge predefined + registry models (dedup, preserve order)
  const allModels: string[] = useMemo(() => {
    const set = new Set<string>(MODEL_COMMAND_MODELS);
    const result: string[] = [...MODEL_COMMAND_MODELS];
    if (additionalModels) {
      for (const m of additionalModels) {
        if (!set.has(m)) {
          set.add(m);
          result.push(m);
        }
      }
    }
    return result;
  }, [additionalModels]);
```

### Step 5.3: Replace all references to MODEL_COMMAND_MODELS with allModels

In `useEffect` initialization (lines 66-76):
```typescript
  const displayModel = pendingModel ?? modelConfig.model;
  const hasCustomModel = !allModels.includes(displayModel);
  const modelOptionCount = allModels.length + (hasCustomModel ? 1 : 0);

  useEffect(() => {
    if (open) {
      const currentIndex = allModels.findIndex((m) => m === modelConfig.model);
      setPendingModel(null);
      setStep("model");
      setActiveIndex(currentIndex >= 0 ? currentIndex + (hasCustomModel ? 1 : 0) : 0);
    } else {
      setStep(null);
    }
  }, [open, modelConfig.model, allModels]);
```

### Step 5.4: Update selectItem function

In the `selectItem` function (around line 89-98):
```typescript
  function selectItem(): void {
    if (step === "model") {
      const model = hasCustomModel && activeIndex === 0
        ? displayModel
        : predefinedModel ?? modelConfig.model;
      setPendingModel(model);
      setStep("thinking");
      setActiveIndex(getThinkingOptionIndex(modelConfig));
      return;
    }
```

### Step 5.5: Update the items rendering

Replace the items mapping for the model step (around lines 152-172):
```typescript
  const items =
    step === "model"
      ? [
          ...(hasCustomModel
            ? [
                {
                  key: displayModel,
                  label: `${displayModel} (current)`,
                  description: "custom model",
                  selected: true,
                },
              ]
            : []),
          ...allModels.map((model) => ({
            key: model,
            label: model,
            description: model === displayModel ? "current model" : "",
            selected: model === displayModel,
          })),
        ]
```

### Step 5.6: Verify TypeScript

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsc --noEmit --pretty
```

**Expected:** No output (exit code 0).

### Step 5.7: Commit

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add src/ui/components/ModelsDropdown/index.tsx && git commit -m "feat(ModelsDropdown): dynamic model merge — accept additionalModels prop, merge predefined + registry, show custom at top"
```

---

## Task 6: Fix PromptInput — refresh registry models on dropdown open

**Files:**
- Modify: `src/ui/views/PromptInput.tsx` (lines 154-158)

### Step 6.1: Change useMemo to useState + useEffect

**Before:**
```typescript
  // Load additional model names from registry (`.anng/models.json`) for dynamic display
  const registryModelNames = React.useMemo(
    () => loadModels(projectRoot).map((m) => m.name),
    [projectRoot]
  );
```

**After:**
```typescript
  // Load additional model names from registry (`.anng/models.json`) — refreshed each time dropdown opens
  const [registryModelNames, setRegistryModelNames] = useState<string[]>(() =>
    loadModels(projectRoot).map((m) => m.name)
  );
  // Reload registry models whenever the model dropdown opens
  React.useEffect(() => {
    if (showModelDropdown) {
      setRegistryModelNames(loadModels(projectRoot).map((m) => m.name));
    }
  }, [showModelDropdown, projectRoot]);
```

Also add `loadModels` import at the top of the file:
```typescript
import { loadModels } from "../../team/provider-types";
```

### Step 6.2: Pass registryModelNames to ModelsDropdown

Find the `<ModelsDropdown>` usage and add the prop:
```typescript
      <ModelsDropdown
        open={showModelDropdown}
        modelConfig={modelConfig}
        width={screenWidth}
        onClose={() => setShowModelDropdown(false)}
        onModelConfigChange={onModelConfigChange}
        onStatusMessage={setStatusMessage}
        additionalModels={registryModelNames}
      />
```

### Step 6.3: Verify TypeScript

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsc --noEmit --pretty
```

**Expected:** No output (exit code 0).

### Step 6.4: Commit

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add src/ui/views/PromptInput.tsx && git commit -m "fix(PromptInput): refresh registry models on each /model dropdown open instead of caching once"
```

---

## Task 7: Fix SettingsView — clear pickProviderForModel on Esc, show registry models

**Files:**
- Modify: `src/ui/views/SettingsView.tsx`

### Step 7.1: Clear pickProviderForModel when pressing Esc from provider screen

Find the escape handler (around line 445-452) and ensure it clears `pickProviderForModel`:
```typescript
    if (key.escape) {
      if (screen === "main") {
        onExit();
      } else {
        setScreen("main");
        // Clear provider-pick mode when canceling provider selection
        if (pickProviderForModel) {
          setPickProviderForModel(null);
        }
      }
      return;
    }
```

**Why:** When the user goes to Settings → Models → picks a model → lands on Provider picker → presses Esc, the `screen` goes back to "main" but `pickProviderForModel` stays set. Next time they enter provider picker for any reason (e.g., adding a new provider), the stale `pickProviderForModel` will make it auto-select the provider and write the old model + env vars to settings.

### Step 7.2: Show registry models in the model items dropdown

Find the `modelItems` useMemo (around line 157-186). Replace the current MODEL_COMMAND_MODELS-only mapping:

**Before:**
```typescript
  const modelItems: DropdownMenuItem[] = useMemo(() => {
    const items: DropdownMenuItem[] = MODEL_COMMAND_MODELS.map((m) => ({
      key: m,
      label: m,
      selected: activeSettings.model === m || (!activeSettings.model && resolved.model === m),
    }));

    // Add custom models if they aren't in the standard list
    if (activeSettings.model && !(MODEL_COMMAND_MODELS as readonly string[]).includes(activeSettings.model)) {
      items.unshift({
        key: activeSettings.model,
        label: activeSettings.model,
        selected: true,
      });
    }
    ...
```

**After:**
```typescript
  const modelItems: DropdownMenuItem[] = useMemo(() => {
    // Merge predefined + registry models (dedup, preserve order)
    const registryNames = models.map((m) => m.name);
    const allModelNames: string[] = [...new Set([...MODEL_COMMAND_MODELS, ...registryNames])];

    const items: DropdownMenuItem[] = allModelNames.map((m) => ({
      key: m,
      label: m,
      selected: activeSettings.model === m || (!activeSettings.model && resolved.model === m),
    }));

    // Add current model at top if it's custom (not in any list)
    if (activeSettings.model && !allModelNames.includes(activeSettings.model)) {
      items.unshift({
        key: activeSettings.model,
        label: activeSettings.model,
        selected: true,
      });
    }
    ...
```

Also update the useMemo dependency array: add `models` at the end:
```typescript
  }, [activeSettings.model, resolved.model, models]);
```

**Why:** Previously, the model picker in Settings only showed models from `MODEL_COMMAND_MODELS` + the currently-set custom model. Models registered in `.anng/models.json` (via Settings → Models Registry) were invisible in the model picker. Now all registry models appear alongside the predefined list, deduplicated.

### Step 7.3: Verify TypeScript

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsc --noEmit --pretty
```

**Expected:** No output (exit code 0).

### Step 7.4: Commit

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add src/ui/views/SettingsView.tsx && git commit -m "fix(SettingsView): clear pickProviderForModel on Esc; show registry models in model picker"
```

---

## Task 8: Fix project-level settings.json

**Files:**
- Modify: `run/media/sanng/New\ Volume/Seminar/Anng_cli/.anng/settings.json`

### Step 8.1: Verify current state

```bash
cat /run/media/sanng/New\\ Volume/Seminar/Anng_cli/.anng/settings.json
```

Check that these fields are correct:
- `model` must be `"deepseek-v4-flash-free"` (NOT `"ds1"` — that's a provider ID)
- `env.API_KEY` must be a key with active credits
- `env.BASE_URL` must be `"https://opencode.ai/zen/v1"`

If any field is wrong, overwrite the file:
```bash
cat > /run/media/sanng/New\\ Volume/Seminar/Anng_cli/.anng/settings.json << 'CONFIGEOF'
{
  "env": {
    "API_KEY": "sk-yJwc3NM1lBmrnDtVNTsvccrm5vpHVATb6FKd7Y6kpyEIQKgnDLc0LDCV2tGAq5bf",
    "BASE_URL": "https://opencode.ai/zen/v1"
  },
  "model": "deepseek-v4-flash-free",
  "thinkingEnabled": true,
  "reasoningEffort": "high",
  "geminiApiKey": "",
  "geminiBaseURL": "",
  "proxyApiKey": "sk-qtJoA9JAib99MhqBto7asGsBnyUWLjDVHUE491Cxw7EZPF1trgunWIKDsdvokE3O,sk-jaac9Wrmx87GO5sfdE8S3wHbTcF6YXY0UCxbgQXpAlMjj9yYcwfww81CrGArKBmn,sk-ycW6QlvfefTx9AqjVfzDg77Ej6WYvcUTp9tyOwn0aQUxwTvZaNPFUPNh69PboJil,sk-Gse0bWcsdEBl944UUe4PyM7SXHDDCAMaZoMcZQA6DUCoYFzaYKaMfMOFewAGeSHb",
  "proxyBaseURL": "https://opencode.ai/zen/v1",
  "proxyModel": "deepseek-v4-flash-free"
}
CONFIGEOF
```

### Step 8.2: Commit

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add .anng/settings.json && git commit -m "fix(settings.json): restore model field to deepseek-v4-flash-free with working API key"
```

---

## Task 9: Final build, test, and API verification

**Files:**
- Check: `dist/cli.js`

### Step 9.1: Full TypeScript check

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsc --noEmit --pretty
```

**Expected:** No output, exit code 0.

### Step 9.2: Run ALL tests

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npx tsx --test src/tests/model-capabilities.test.ts src/tests/settings-and-notify.test.ts src/tests/slash-commands.test.ts src/tests/prompt.test.ts 2>&1 | grep -E "(# tests|# pass|# fail)" | tail -3
```

**Expected:**
```
# tests 51
# pass 51
# fail 0
```

### Step 9.3: Bundle

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && npm run bundle 2>&1
```

**Expected:**
```
  dist/cli.js  716.xkb
⚡ Done in XXms
Copied bundled built-in skills to dist/bundled/
```

### Step 9.4: API smoke test

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && curl -s --connect-timeout 10 -w '\nHTTP:%{http_code}' 'https://opencode.ai/zen/v1/chat/completions' -H 'Content-Type: application/json' -H "Authorization: Bearer $(node -e "console.log(JSON.parse(require('fs').readFileSync('.anng/settings.json','utf8')).env.API_KEY)")" -d '{"model":"deepseek-v4-flash-free","messages":[{"role":"user","content":"Respond with just the word OK"}],"stream":false}' 2>&1 | grep -E '"cost"|"content"|"finish_reason"|HTTP:'
```

**Expected:**
```
..."content":"OK"...
..."cost":"0"...
"finish_reason":"stop"
HTTP:200
```

### Step 9.5: Commit everything

```bash
cd /run/media/sanng/New\\ Volume/Seminar/Anng_cli && git add -A && git commit -m "fix: overhaul settings/models/providers interaction layer

- model-capabilities: add -free variants to DEEPSEEK_V4_MODELS/NON_MULTIMODAL_MODELS
- settings: fix DEFAULT_BASE_URL to /zen/v1; simplify applyModelConfigSelection
- provider-types: remove duplicate MODEL_COMMAND_MODELS; fix destructive loadModels threshold
- ModelsDropdown: dynamic model merge via additionalModels prop
- PromptInput: refresh registry models on each /model open
- SettingsView: clear pickProviderForModel on Esc; show registry models
- settings.json: restore correct model field and working API key"
```

---

## Final Verification Checklist

Run each check and mark complete (`[x]`) when verified:

- [ ] `npx tsx --test src/tests/model-capabilities.test.ts` → 9/9 pass
- [ ] `npx tsx --test src/tests/settings-and-notify.test.ts` → 27/27 pass
- [ ] `npx tsc --noEmit --pretty` → silent exit 0
- [ ] `npm run bundle` → `dist/cli.js` built
- [ ] `.anng/settings.json` has `model: "deepseek-v4-flash-free"`
- [ ] `.anng/settings.json` has `env.API_KEY` with working credits
- [ ] `.anng/settings.json` has `env.BASE_URL: "https://opencode.ai/zen/v1"`
- [ ] API smoke test returns `HTTP:200` and `"cost":"0"`
- [ ] `src/team/provider-types.ts` imports `MODEL_COMMAND_MODELS` (no duplicate)
- [ ] `src/team/provider-types.ts`: `loadModels` threshold is `valid.length === 0`
- [ ] `src/ui/views/SettingsView.tsx`: escape handler clears `pickProviderForModel`
- [ ] `src/ui/views/SettingsView.tsx`: modelItems uses `allModelNames` (includes registry models)
- [ ] `src/ui/views/PromptInput.tsx`: `registryModelNames` refreshed via `useEffect` on `showModelDropdown`
- [ ] `src/ui/components/ModelsDropdown/index.tsx`: has `additionalModels?: string[]` prop
- [ ] `src/ui/components/ModelsDropdown/index.tsx`: uses `allModels` (not `MODEL_COMMAND_MODELS`) for items
