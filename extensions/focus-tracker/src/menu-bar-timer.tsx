import { Icon, launchCommand, LaunchType, MenuBarExtra, showHUD } from "@raycast/api";
import { useEffect, useState } from "react";
import {
  clearTimerState,
  formatTime,
  getCurrentElapsed,
  getDailyGoal,
  getRemaining,
  getTimerState,
  setTimerState,
  addSession,
  getSessions,
  computeDailyStats,
  formatDuration,
  TimerState,
  Session,
} from "./storage";

export default function MenuBarTimer() {
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [todayStats, setTodayStats] = useState<{
    sessions: number;
    focusTime: number;
    goal: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load timer state
  useEffect(() => {
    async function load() {
      const state = await getTimerState();
      setTimer(state);

      const goal = await getDailyGoal();
      const sessions = await getSessions();
      const stats = computeDailyStats(sessions);
      setTodayStats({
        sessions: stats.sessionsCompleted,
        focusTime: stats.totalFocusTime,
        goal,
      });

      // Check if timer completed
      if (state && state.isRunning) {
        const remaining = getRemaining(state);
        if (remaining <= 0) {
          // Timer completed - save session and notify
          const session: Session = {
            id: Date.now().toString(),
            startedAt: state.startedAt || new Date().toISOString(),
            endedAt: new Date().toISOString(),
            duration: state.duration,
            elapsed: state.duration,
            type: state.type,
            completed: true,
            label: state.label,
          };
          await addSession(session);

          const newState: TimerState = {
            ...state,
            isRunning: false,
            elapsed: state.duration,
            sessionCount: state.type === "focus" ? state.sessionCount + 1 : state.sessionCount,
          };
          await setTimerState(newState);
          setTimer(newState);

          const emoji = state.type === "focus" ? "✅" : "☕";
          const label = state.type === "focus" ? "Focus complete!" : "Break over!";
          await showHUD(`${emoji} ${label}`);

          // Open Start Timer so the user can pick the next session
          try {
            await launchCommand({ name: "start-timer", type: LaunchType.UserInitiated });
          } catch {
            // Raycast window may not be focused — user can open manually
          }
        }
      }

      setIsLoading(false);
    }
    load();
  }, []);

  // Build title
  let title = "🍅";
  let tooltip = "Focus Tracker - No active timer";

  if (timer && timer.isRunning) {
    const remaining = getRemaining(timer);
    const timeStr = formatTime(remaining);
    const icon = timer.type === "focus" ? "🍅" : timer.type === "meeting" ? "👥" : "☕";
    const label = timer.type === "focus" ? "Focusing" : timer.type === "meeting" ? "Meeting" : "Break";
    const projectSuffix = timer.label ? ` · ${timer.label}` : "";
    title = `${icon} ${timeStr}${projectSuffix}`;
    tooltip = `Focus Tracker - ${label}: ${timeStr} left${timer.label ? ` (${timer.label})` : ""}`;
  } else if (timer && !timer.isRunning && getCurrentElapsed(timer) >= timer.duration) {
    title = timer.type === "focus" ? "✅ Done" : timer.type === "meeting" ? "👥 Done" : "☕ Done";
    tooltip = "Focus Tracker - Session complete! Start next one.";
  }

  return (
    <MenuBarExtra icon={undefined} title={title} tooltip={tooltip} isLoading={isLoading}>
      {/* Current status */}
      <MenuBarExtra.Section title="Timer">
        {timer && timer.isRunning ? (
          <>
            <MenuBarExtra.Item
              title={`${timer.type === "focus" ? "Focusing" : timer.type === "meeting" ? "In Meeting" : "On Break"}: ${formatTime(getRemaining(timer))}`}
              icon={timer.type === "focus" ? Icon.Clock : timer.type === "meeting" ? Icon.TwoPeople : Icon.Pause}
            />
            <MenuBarExtra.Item
              title="Stop Timer"
              icon={Icon.Stop}
              onAction={async () => {
                if (timer) {
                  const elapsed = getCurrentElapsed(timer);
                  const session: Session = {
                    id: Date.now().toString(),
                    startedAt: timer.startedAt || new Date().toISOString(),
                    endedAt: new Date().toISOString(),
                    duration: timer.duration,
                    elapsed: Math.min(elapsed, timer.duration),
                    type: timer.type,
                    completed: elapsed >= timer.duration,
                    label: timer.label,
                  };
                  await addSession(session);
                  await clearTimerState();
                  await showHUD("⏹ Timer stopped");
                }
              }}
            />
            <MenuBarExtra.Item
              title="Skip to Next"
              icon={Icon.Forward}
              onAction={async () => {
                try {
                  await launchCommand({
                    name: "start-timer",
                    type: LaunchType.UserInitiated,
                  });
                } catch {
                  await showHUD("Could not skip");
                }
              }}
            />
          </>
        ) : (
          <MenuBarExtra.Item
            title="Start Session"
            icon={Icon.Play}
            onAction={async () => {
              try {
                await launchCommand({
                  name: "start-timer",
                  type: LaunchType.UserInitiated,
                });
              } catch {
                await showHUD("Could not start timer");
              }
            }}
          />
        )}
      </MenuBarExtra.Section>

      {/* Today's progress */}
      {todayStats && (
        <MenuBarExtra.Section title="Today">
          {timer && timer.isRunning && timer.label && (
            <MenuBarExtra.Item title={`Project: ${timer.label}`} icon={Icon.Tag} />
          )}
          <MenuBarExtra.Item title={`Sessions: ${todayStats.sessions} / ${todayStats.goal}`} icon={Icon.Checkmark} />
          <MenuBarExtra.Item title={`Focus Time: ${formatDuration(todayStats.focusTime)}`} icon={Icon.Clock} />
          <MenuBarExtra.Item
            title={`Goal: ${Math.round((todayStats.sessions / todayStats.goal) * 100)}%`}
            icon={Icon.BarChart}
          />
        </MenuBarExtra.Section>
      )}

      {/* Quick actions */}
      <MenuBarExtra.Section title="Quick Actions">
        <MenuBarExtra.Item
          title="Open Dashboard"
          icon={Icon.AppWindowGrid3x3}
          onAction={async () => {
            try {
              await launchCommand({
                name: "dashboard",
                type: LaunchType.UserInitiated,
              });
            } catch {
              await showHUD("Could not open dashboard");
            }
          }}
        />
        <MenuBarExtra.Item
          title="Reset Today"
          icon={Icon.Trash}
          onAction={async () => {
            await clearTimerState();
            await showHUD("🗑 Timer reset");
          }}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
