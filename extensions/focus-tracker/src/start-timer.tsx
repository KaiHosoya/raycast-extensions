import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  closeMainWindow,
  launchCommand,
  LaunchType,
  showHUD,
  popToRoot,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  getTimerState,
  setTimerState,
  clearTimerState,
  addSession,
  getCurrentElapsed,
  getConfig,
  getRemaining,
  formatTime,
  formatDuration,
  TimerState,
  Session,
} from "./storage";

export default function StartTimer() {
  const config = getConfig();
  const [existing, setExisting] = useState<TimerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const state = await getTimerState();
      setExisting(state);
      setIsLoading(false);
    }
    load();
  }, []);

  async function startSession(type: "focus" | "short-break" | "long-break") {
    // If a timer is running, save it as abandoned/completed first
    if (existing && existing.isRunning) {
      const elapsed = getCurrentElapsed(existing);
      const session: Session = {
        id: Date.now().toString(),
        startedAt: existing.startedAt || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        duration: existing.duration,
        elapsed: Math.min(elapsed, existing.duration),
        type: existing.type,
        completed: elapsed >= existing.duration,
      };
      await addSession(session);
    }

    const durationMap = {
      focus: config.focusDuration,
      "short-break": config.shortBreakDuration,
      "long-break": config.longBreakDuration,
    };

    const sessionCount = existing?.sessionCount || 0;
    const newState: TimerState = {
      isRunning: true,
      startedAt: new Date().toISOString(),
      elapsed: 0,
      duration: durationMap[type],
      type,
      sessionCount,
    };
    await setTimerState(newState);

    const labels = {
      focus: "🍅 Focus",
      "short-break": "☕ Short Break",
      "long-break": "🌴 Long Break",
    };
    await showHUD(`${labels[type]} started: ${formatTime(durationMap[type])}`);

    // Refresh menu bar immediately
    try {
      await launchCommand({
        name: "menu-bar-timer",
        type: LaunchType.Background,
      });
    } catch {
      // Menu bar command might not be active yet
    }

    await popToRoot();
    await closeMainWindow();
  }

  async function stopTimer() {
    if (existing && existing.isRunning) {
      const elapsed = getCurrentElapsed(existing);
      const session: Session = {
        id: Date.now().toString(),
        startedAt: existing.startedAt || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        duration: existing.duration,
        elapsed: Math.min(elapsed, existing.duration),
        type: existing.type,
        completed: elapsed >= existing.duration,
      };
      await addSession(session);
    }
    await clearTimerState();
    setExisting(null);
    await showHUD("⏹ Timer stopped");

    try {
      await launchCommand({
        name: "menu-bar-timer",
        type: LaunchType.Background,
      });
    } catch {
      // ignore
    }
  }

  const sessionTypes: {
    id: string;
    title: string;
    subtitle: string;
    icon: { source: Icon; tintColor: Color };
    type: "focus" | "short-break" | "long-break";
  }[] = [
    {
      id: "focus",
      title: "Focus",
      subtitle: formatDuration(config.focusDuration),
      icon: { source: Icon.Clock, tintColor: Color.Red },
      type: "focus",
    },
    {
      id: "short-break",
      title: "Short Break",
      subtitle: formatDuration(config.shortBreakDuration),
      icon: { source: Icon.Mug, tintColor: Color.Green },
      type: "short-break",
    },
    {
      id: "long-break",
      title: "Long Break",
      subtitle: formatDuration(config.longBreakDuration),
      icon: { source: Icon.Palm, tintColor: Color.Blue },
      type: "long-break",
    },
  ];

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Choose a session type...">
      {/* Show active timer section if running */}
      {existing && existing.isRunning && (
        <List.Section title="Active Timer">
          <List.Item
            icon={{
              source: existing.type === "focus" ? Icon.Clock : Icon.Mug,
              tintColor: existing.type === "focus" ? Color.Red : Color.Green,
            }}
            title={existing.type === "focus" ? "Focus" : existing.type === "short-break" ? "Short Break" : "Long Break"}
            subtitle={`${formatTime(getRemaining(existing))} remaining`}
            accessories={[{ tag: { value: "Running", color: Color.Green } }]}
            actions={
              <ActionPanel>
                <Action title="Stop Timer" icon={Icon.Stop} style={Action.Style.Destructive} onAction={stopTimer} />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {/* Session type selection */}
      <List.Section title="Start New Session">
        {sessionTypes.map((item) => (
          <List.Item
            key={item.id}
            icon={item.icon}
            title={item.title}
            subtitle={item.subtitle}
            actions={
              <ActionPanel>
                <Action title={`Start ${item.title}`} icon={Icon.Play} onAction={() => startSession(item.type)} />
                {existing && existing.isRunning && (
                  <Action
                    title="Stop Current Timer"
                    icon={Icon.Stop}
                    style={Action.Style.Destructive}
                    onAction={stopTimer}
                  />
                )}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
