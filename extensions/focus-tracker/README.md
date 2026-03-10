# Focus Tracker

Rize-inspired Pomodoro timer with a daily work dashboard, right in Raycast.

## Features

- **Pomodoro Timer** — 25/5/15 min cycles (configurable)
- **Menu Bar Timer** — Always-visible countdown in macOS menu bar
- **Daily Dashboard** — Focus time, sessions, hourly activity chart, weekly overview
- **Session History** — 30-day rolling log stored locally

## Commands

| Command | Description | Mode |
|---------|-------------|------|
| `Start Timer` | Pick a session type and start the timer | view (List) |
| `Today's Dashboard` | View daily stats, hourly chart, weekly trend | view (List) |
| `Pomodoro Timer` | Menu bar countdown + quick actions | menu-bar |

## Setup

```bash
# Clone or copy this folder
cd sprint

# Install dependencies
npm install

# Start development
npm run dev
```

Open Raycast → search "Start Timer" to begin.

## Configuration

Set these in Raycast Extension Preferences:

| Preference | Default | Description |
|------------|---------|-------------|
| Focus Duration | 25 min | Length of focus sessions |
| Short Break | 5 min | Break after each session |
| Long Break | 15 min | Break after 4 sessions |
| Daily Goal | 8 sessions | Target sessions per day |

## Architecture

```
src/
├── storage.ts          # Shared types, LocalStorage helpers, stats computation
├── start-timer.tsx     # View command: List UI to pick session type
├── menu-bar-timer.tsx  # Menu bar: countdown display + quick actions
└── dashboard.tsx       # View command: daily stats + weekly overview
```

All data is stored in Raycast's `LocalStorage` — no external services needed.

## How It Works

1. **Start Timer** presents a List of session types. On selection it writes a `TimerState` to LocalStorage and closes the window.
2. **Menu Bar Timer** reads state every 10s (via `interval: "10s"`), calculates remaining time from the `startedAt` timestamp, and detects completion.
3. When a session completes, it's saved as a `Session` record.
4. **Dashboard** aggregates sessions into daily/weekly stats.

## License

MIT
