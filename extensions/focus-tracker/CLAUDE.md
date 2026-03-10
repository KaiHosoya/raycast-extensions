# CLAUDE.md — Focus Tracker Raycast Extension

## Project Overview

Rize-inspired Pomodoro timer + daily work dashboard as a Raycast extension. Built with TypeScript, React, and the Raycast API. All state is persisted in Raycast's LocalStorage — no backend, no external services.

## Quick Reference

```bash
npm install        # Install dependencies
npm run dev        # Start dev mode with hot reload
npm run build      # Production build
npm run lint       # Run ESLint
npm run fix-lint   # Auto-fix lint issues
```

## Architecture

```
src/
├── storage.ts          # Core data layer — types, LocalStorage CRUD, stats computation
├── start-timer.tsx     # view command: List UI to pick session type → starts timer
├── menu-bar-timer.tsx  # menu-bar command: persistent countdown + quick actions
└── dashboard.tsx       # view command: Detail markdown with stats/charts
```

### Command Modes

| File | Mode | Lifecycle |
|------|------|-----------|
| `start-timer.tsx` | `view` | React component returning `<List>`. User picks Focus / Short Break / Long Break, timer starts, window closes via `popToRoot()` + `closeMainWindow()`. |
| `menu-bar-timer.tsx` | `menu-bar` | Persistent menu bar item. Refreshes every 10s via `interval: "10s"`. Exports React component returning `<MenuBarExtra>`. Detects session completion and saves records. |
| `dashboard.tsx` | `view` | Standard Raycast view. Exports React component returning `<List>` with sectioned stats, accessories, and tags. |

### Data Flow

```
start-timer (write) ──→ LocalStorage ←── menu-bar-timer (read/write, 10s poll)
        │                    ↑
        │               dashboard (read)
        │
        └── launchCommand("menu-bar-timer", Background) ── triggers immediate refresh
```

- `start-timer` presents a List of session types. On selection it writes `TimerState` to LocalStorage, then triggers a menu-bar refresh via `launchCommand`
- `menu-bar-timer` polls state every 10s, calculates remaining time from `startedAt` timestamp, detects completion (`remaining <= 0`), saves `Session` records
- `dashboard` reads all `Session` records and computes daily/weekly stats on the fly

### User Flow

```
Raycast search "Start Timer"
  → List UI shows:
      [Active Timer section — if running, shows type + remaining + Stop action]
      [Start New Session section]
        🍅 Focus          25m
        ☕ Short Break     5m
        🌴 Long Break     15m
  → User selects one
  → Timer starts → HUD confirmation → window closes
  → Menu bar shows: 🍅 22:30 (updates every 10s)
  → On completion: menu-bar detects remaining=0, saves Session, shows HUD
```

### Key Types (defined in `storage.ts`)

```typescript
TimerState {
  isRunning: boolean
  startedAt?: string       // ISO timestamp — elapsed is computed from this
  pausedAt?: string        // reserved for future pause feature
  elapsed: number          // seconds accumulated before current run
  duration: number         // target duration in seconds
  type: "focus" | "short-break" | "long-break"
  sessionCount: number     // for long-break-every-4 logic
}

Session {
  id: string               // Date.now() as string
  startedAt: string        // ISO timestamp
  endedAt?: string
  duration: number          // planned duration (seconds)
  elapsed: number           // actual elapsed (seconds)
  type: "focus" | "short-break" | "long-break"
  completed: boolean
  label?: string            // reserved for future task labeling
}
```

### LocalStorage Keys

| Key | Value | Notes |
|-----|-------|-------|
| `focus-tracker:timer` | `JSON<TimerState>` | Single active timer state |
| `focus-tracker:sessions` | `JSON<Session[]>` | Rolling 30-day session log |
| `focus-tracker:stats:*` | Reserved | Prefix reserved for future cached stats |

## Timer Logic

The timer does NOT use `setInterval`. Instead:

1. `startedAt` (ISO timestamp) is recorded when timer begins
2. Elapsed = `state.elapsed + (now - startedAt)` — computed on read via `getCurrentElapsed()`
3. Menu bar refreshes every 10s via Raycast's `interval` setting
4. Completion is detected when `getRemaining(state) <= 0`

This approach survives Raycast restarts — no in-memory timers to lose.

### Session Cycle

The user manually picks the session type from the List UI. The auto-cycling logic (focus → break → focus) was removed in favor of explicit selection. `sessionCount` still tracks completed focus sessions for stats.

## Raycast API Patterns Used

### Imports

```typescript
// view commands (start-timer, dashboard)
import { List, Action, ActionPanel, Icon, Color, closeMainWindow, popToRoot } from "@raycast/api";
import { Detail } from "@raycast/api";  // dashboard only

// menu-bar commands
import { MenuBarExtra, Icon, showHUD, launchCommand, LaunchType } from "@raycast/api";

// storage (all commands)
import { LocalStorage, getPreferenceValues } from "@raycast/api";
```

### Cross-command communication

Commands communicate ONLY through LocalStorage. To trigger a menu-bar refresh after starting a timer:

```typescript
await launchCommand({ name: "menu-bar-timer", type: LaunchType.Background });
```

Always wrap in try/catch — command may not be active.

When opening the start-timer List UI from menu bar or dashboard, use `LaunchType.UserInitiated`:

```typescript
await launchCommand({ name: "start-timer", type: LaunchType.UserInitiated });
```

### Closing Raycast after action

After starting a timer in `start-timer.tsx`, the window is dismissed:

```typescript
await popToRoot();       // reset navigation stack
await closeMainWindow(); // close Raycast window
```

### Preferences

Defined in `package.json` under `"preferences"`. Accessed via:

```typescript
const prefs = getPreferenceValues<Preferences>();
```

All preference values come as strings (even numbers) — always `parseInt()` with fallback.

## Development Guidelines

### Adding a New Command

1. Add entry to `package.json` → `commands[]` with `name`, `title`, `mode`
2. Create `src/{name}.ts` or `.tsx` matching the `name` field exactly
3. Export default function (React component for `view`/`menu-bar`, async function for `no-view`)
4. If the command reads/writes timer or session data, import from `./storage`
5. If the command modifies timer state, trigger menu-bar refresh via `launchCommand`

### Adding a New Preference

1. Add to `package.json` → `preferences[]`
2. Add field to `Preferences` interface in `storage.ts`
3. Update `getConfig()` to parse the new value

### Modifying Storage Schema

- `TimerState` and `Session` changes affect all three commands
- If changing `Session` shape, consider migration: read old format, write new format in `getSessions()`
- `addSession()` auto-prunes to 30 days — safe for LocalStorage size limits

### Dashboard Layout (List View)

Dashboard uses Raycast's `<List>` with sections, accessories, and colored tags:

- **Active Timer** — shown only when timer is running, with colored tag
- **Today's Summary** — goal progress, total focus time, remaining sessions, streak, avg per session
- **Hourly Activity** — only hours with recorded activity, showing duration as accessory text
- **This Week** — 7-day list with day name, session count, focus time, "Today" tag
- **Today's Sessions** — reverse-chronological log with Done/Stopped tags

Use `List.Item` accessories for right-aligned data (text, tags). Use `Icon` + `Color` tintColor for visual hierarchy. Avoid markdown block characters — the List view handles all formatting natively.

### Menu Bar Best Practices

- Keep `MenuBarExtra` title SHORT — macOS truncates long titles
- Always set `isLoading` to `false` when done — Raycast won't unload otherwise
- Use `MenuBarExtra.Section` to group items
- Items without `onAction` render as disabled/headers
- Menu bar "Start Session" opens the start-timer List UI via `LaunchType.UserInitiated`

## Known Limitations & Future Work

### Current Limitations

- No pause/resume — `pausedAt` field exists in `TimerState` but is unused
- No sound/notification on completion — relies on `showHUD` which requires Raycast focus
- Dashboard doesn't auto-refresh — user must press `⌘R` or reopen
- `extension-icon.png` in `assets/` is a placeholder — needs actual icon
- Sessions store only start time hour — hourly breakdown is approximate for sessions spanning hours
- No data export — all data locked in Raycast LocalStorage
- Menu bar updates every 10s, not in real-time — countdown jumps in 10s increments

### Planned Features (priority order)

1. **Pause/Resume** — Use `pausedAt` to freeze elapsed calculation
2. **Session Labels** — `label` field on `Session` exists, needs Form UI to set it
3. **macOS Notification** — Use `node-notifier` or Raycast's notification API when available
4. **Category/Project Tracking** — Tag sessions by project for per-project stats
5. **CSV Export** — Export session history for analysis
6. **Monthly View** — Extend dashboard with 30-day trends

## Testing

No test framework is set up. To manually test:

1. `npm run dev` to start in development mode
2. Open Raycast → search "Start Timer" → pick a session type → verify menu bar shows countdown
3. Wait for completion or use short durations (edit preferences to 1 min) → verify HUD and session saved
4. Open "Today's Dashboard" → verify stats reflect completed sessions
5. Check LocalStorage state: add temporary `console.log(await LocalStorage.allItems())` in any command
6. To reset all data: run `await LocalStorage.clear()` from any command (or add a dev-only "Reset All" action)

## Gotchas

- `getPreferenceValues()` can only be called inside a command execution context, not at module top level
- `launchCommand()` for menu-bar commands uses `LaunchType.Background`; for opening a view command use `LaunchType.UserInitiated`
- Menu bar `interval: "10s"` means Raycast re-executes the command from scratch every 10 seconds — keep initialization fast
- `new Date().toISOString()` uses UTC — daily boundaries in `computeDailyStats` use UTC date, not local. This may cause incorrect day grouping for users far from UTC. Fix by using local date string instead
- `popToRoot()` and `closeMainWindow()` should be called after state writes are complete, not before
- If a timer is already running when user starts a new session from the List, the old session is saved as completed/abandoned before starting the new one
