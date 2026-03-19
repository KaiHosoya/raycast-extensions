import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  launchCommand,
  LaunchType,
  showHUD,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  addSession,
  clearTimerState,
  computeDailyStats,
  computeLabelStats,
  computeWeeklyStats,
  formatDuration,
  formatTime,
  getDailyGoal,
  getLabels,
  getRemaining,
  getSessions,
  getTimerState,
  setDailyGoal,
  Session,
  TimerState,
} from "./storage";

// ─── Log Past Session Form ───────────────────────────────────────────────────

function LogPastSessionForm({ labels, onSave }: { labels: string[]; onSave: () => Promise<void> }) {
  const { pop } = useNavigation();

  const defaultStart = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
  const [startedAt, setStartedAt] = useState<Date>(defaultStart);
  const [duration, setDuration] = useState("30");
  const [type, setType] = useState<Session["type"]>("focus");
  const [label, setLabel] = useState("");
  const [completed, setCompleted] = useState(true);

  const parsedDuration = parseInt(duration);
  const isDurationValid = !isNaN(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 999;

  return (
    <Form
      navigationTitle="Log Past Session"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Session"
            icon={Icon.Plus}
            onSubmit={async () => {
              if (!isDurationValid) return;
              const durationSecs = parsedDuration * 60;
              const endedAt = new Date(startedAt.getTime() + durationSecs * 1000);
              const session: Session = {
                id: Date.now().toString(),
                startedAt: startedAt.toISOString(),
                endedAt: endedAt.toISOString(),
                duration: durationSecs,
                elapsed: durationSecs,
                type,
                completed,
                label: label || undefined,
              };
              await addSession(session);
              await showHUD("✅ Session logged");
              pop();
              await onSave();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.DatePicker
        id="startedAt"
        title="Started At"
        type={Form.DatePicker.Type.DateTime}
        value={startedAt}
        onChange={(d) => d && setStartedAt(d)}
      />
      <Form.TextField
        id="duration"
        title="Duration (minutes)"
        placeholder="e.g. 30"
        value={duration}
        onChange={setDuration}
        error={!isDurationValid && duration.length > 0 ? "Enter a number between 1 and 999" : undefined}
      />
      <Form.Dropdown id="type" title="Type" value={type} onChange={(v) => setType(v as Session["type"])}>
        <Form.Dropdown.Item value="focus" title="Focus" icon="🍅" />
        <Form.Dropdown.Item value="meeting" title="Meeting" icon="👥" />
        <Form.Dropdown.Item value="short-break" title="Short Break" icon="☕" />
        <Form.Dropdown.Item value="long-break" title="Long Break" icon="🌴" />
      </Form.Dropdown>
      {labels.length > 0 && (
        <Form.Dropdown id="label" title="Label" value={label} onChange={setLabel}>
          <Form.Dropdown.Item value="" title="None" />
          {labels.map((l) => (
            <Form.Dropdown.Item key={l} value={l} title={l} />
          ))}
        </Form.Dropdown>
      )}
      <Form.Checkbox id="completed" label="Completed" value={completed} onChange={setCompleted} />
    </Form>
  );
}

// ─── Goal Edit Form ─────────────────────────────────────────────────────────

function EditGoalForm(props: { currentGoal: number; onSave: (goal: number) => void }) {
  const { pop } = useNavigation();
  const [value, setValue] = useState(props.currentGoal.toString());
  const parsed = parseInt(value);
  const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= 99;

  return (
    <Form
      navigationTitle="Edit Daily Goal"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            icon={Icon.Check}
            onSubmit={() => {
              if (isValid) {
                props.onSave(parsed);
                pop();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="dailyGoal"
        title="Daily Goal"
        placeholder="Number of sessions (1–99)"
        value={value}
        onChange={setValue}
        error={!isValid && value.length > 0 ? "Enter a number between 1 and 99" : undefined}
      />
      <Form.Description title="Current" text={`${props.currentGoal} sessions`} />
      <Form.Description
        title="Presets"
        text="Common goals: 4 (light), 6 (moderate), 8 (standard), 10 (intensive), 12 (max)"
      />
    </Form>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [dailyGoal, setDailyGoalState] = useState<number>(8);
  const [labels, setLabels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function reload() {
    const [s, t, g, l] = await Promise.all([getSessions(), getTimerState(), getDailyGoal(), getLabels()]);
    setSessions(s);
    setTimer(t);
    setDailyGoalState(g);
    setLabels(l);
  }

  useEffect(() => {
    async function load() {
      await reload();
      setIsLoading(false);
    }
    load();
  }, []);

  async function handleGoalSave(newGoal: number) {
    await setDailyGoal(newGoal);
    setDailyGoalState(newGoal);
    await showHUD(`🎯 Daily goal set to ${newGoal} sessions`);
  }

  const daily = computeDailyStats(sessions);
  const weekly = computeWeeklyStats(sessions);
  const labelStats = computeLabelStats(sessions);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // ─── Timer status ────────────────────────────────────────────────────────

  const isTimerRunning = timer && timer.isRunning;
  const remaining = timer ? getRemaining(timer) : 0;

  // ─── Goal progress ───────────────────────────────────────────────────────

  const goalProgress = Math.min(daily.sessionsCompleted / dailyGoal, 1);
  const goalPercent = Math.round(goalProgress * 100);
  const sessionsRemaining = Math.max(dailyGoal - daily.sessionsCompleted, 0);

  // ─── Hourly breakdown — only hours with activity ─────────────────────────

  const activeHours = Object.entries(daily.hourlyBreakdown)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, secs]) => ({
      hour,
      secs,
      label: `${parseInt(hour)}:00–${parseInt(hour) + 1}:00`,
    }));

  // ─── Weekly (Monday-based, 3 weeks) ────────────────────────────────────────

  const weeks = weekly; // WeekSummary[]

  // ─── Today's sessions ────────────────────────────────────────────────────

  const todaySessions = sessions
    .filter((s) => {
      const d = new Date(s.startedAt);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return dateStr === today && s.type === "focus";
    })
    .reverse();

  // ─── Shared actions ──────────────────────────────────────────────────────

  const sharedActions = (
    <ActionPanel>
      <Action
        title="Start Timer"
        icon={Icon.Play}
        onAction={async () => {
          try {
            await launchCommand({ name: "start-timer", type: LaunchType.UserInitiated });
          } catch {
            await showHUD("Could not open Start Timer");
          }
        }}
      />
      <Action.Push
        title="Log Past Session"
        icon={Icon.Clock}
        shortcut={{ modifiers: ["cmd"], key: "l" }}
        target={<LogPastSessionForm labels={labels} onSave={reload} />}
      />
      {isTimerRunning && (
        <Action
          title="Stop Timer"
          icon={Icon.Stop}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["cmd"], key: "s" }}
          onAction={async () => {
            await clearTimerState();
            setTimer(null);
            await showHUD("⏹ Timer stopped");
          }}
        />
      )}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={async () => {
          setIsLoading(true);
          await reload();
          setIsLoading(false);
        }}
      />
    </ActionPanel>
  );

  // ─── Goal item actions ────────────────────────────────────────────────────

  const goalActions = (
    <ActionPanel>
      <Action.Push
        title="Edit Daily Goal"
        icon={Icon.Pencil}
        target={<EditGoalForm currentGoal={dailyGoal} onSave={handleGoalSave} />}
      />
      <Action
        title="Start Timer"
        icon={Icon.Play}
        onAction={async () => {
          try {
            await launchCommand({ name: "start-timer", type: LaunchType.UserInitiated });
          } catch {
            await showHUD("Could not open Start Timer");
          }
        }}
      />
      {isTimerRunning && (
        <Action
          title="Stop Timer"
          icon={Icon.Stop}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["cmd"], key: "s" }}
          onAction={async () => {
            await clearTimerState();
            setTimer(null);
            await showHUD("⏹ Timer stopped");
          }}
        />
      )}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={async () => {
          setIsLoading(true);
          await reload();
          setIsLoading(false);
        }}
      />
    </ActionPanel>
  );

  return (
    <List isLoading={isLoading} navigationTitle="Today's Dashboard" searchBarPlaceholder="Dashboard">
      {/* ─── Active Timer ──────────────────────────────────────────────── */}
      {isTimerRunning && timer && (
        <List.Section title="Active Timer">
          <List.Item
            icon={{
              source: timer.type === "focus" ? Icon.Clock : Icon.Mug,
              tintColor: timer.type === "focus" ? Color.Red : Color.Green,
            }}
            title={timer.type === "focus" ? "Focus" : timer.type === "short-break" ? "Short Break" : "Long Break"}
            subtitle={`${formatTime(remaining)} remaining${timer.label ? ` · ${timer.label}` : ""}`}
            accessories={[
              ...(timer.label ? [{ tag: { value: timer.label, color: Color.Blue } }] : []),
              { tag: { value: "Running", color: Color.Green } },
            ]}
            actions={sharedActions}
          />
        </List.Section>
      )}

      {/* ─── Daily Summary ─────────────────────────────────────────────── */}
      <List.Section title="Today's Summary">
        <List.Item
          icon={{ source: Icon.BullsEye, tintColor: goalPercent >= 100 ? Color.Green : Color.Orange }}
          title="Daily Goal"
          subtitle={`${daily.sessionsCompleted} / ${dailyGoal} sessions`}
          accessories={[
            {
              tag: {
                value: goalPercent >= 100 ? "Complete!" : `${goalPercent}%`,
                color: goalPercent >= 100 ? Color.Green : goalPercent >= 50 ? Color.Orange : Color.SecondaryText,
              },
            },
            { icon: Icon.Pencil },
          ]}
          actions={goalActions}
        />
        <List.Item
          icon={{ source: Icon.Clock, tintColor: Color.Blue }}
          title="Total Focus Time"
          accessories={[{ text: formatDuration(daily.totalFocusTime) }]}
          actions={sharedActions}
        />
        {daily.meetingsCompleted > 0 && (
          <List.Item
            icon={{ source: Icon.TwoPeople, tintColor: Color.Purple }}
            title="Meeting Time"
            subtitle={`${daily.meetingsCompleted} ${daily.meetingsCompleted === 1 ? "meeting" : "meetings"}`}
            accessories={[{ text: formatDuration(daily.totalMeetingTime) }]}
            actions={sharedActions}
          />
        )}
        {sessionsRemaining > 0 && (
          <List.Item
            icon={{ source: Icon.ArrowRight, tintColor: Color.Purple }}
            title="Remaining"
            accessories={[{ text: `${sessionsRemaining} sessions to go` }]}
            actions={sharedActions}
          />
        )}
        <List.Item
          icon={{ source: Icon.Bolt, tintColor: Color.Yellow }}
          title="Longest Streak"
          accessories={[{ text: `${daily.longestStreak} ${daily.longestStreak === 1 ? "session" : "sessions"}` }]}
          actions={sharedActions}
        />
        {daily.sessionsCompleted > 0 && (
          <List.Item
            icon={{ source: Icon.Gauge, tintColor: Color.SecondaryText }}
            title="Avg per Session"
            accessories={[{ text: formatDuration(Math.round(daily.totalFocusTime / daily.sessionsCompleted)) }]}
            actions={sharedActions}
          />
        )}
      </List.Section>

      {/* ─── By Project ────────────────────────────────────────────────── */}
      {labelStats.length > 0 && (
        <List.Section title="By Project">
          {labelStats.map((ls) => (
            <List.Item
              key={ls.label}
              icon={{
                source: Icon.Tag,
                tintColor: ls.label === "Unlabeled" ? Color.SecondaryText : Color.Blue,
              }}
              title={ls.label}
              subtitle={`${ls.sessionsCompleted} ${ls.sessionsCompleted === 1 ? "session" : "sessions"}`}
              accessories={[{ text: formatDuration(ls.totalFocusTime) }]}
              actions={sharedActions}
            />
          ))}
        </List.Section>
      )}

      {/* ─── Hourly Activity ───────────────────────────────────────────── */}
      {activeHours.length > 0 && (
        <List.Section title="Hourly Activity">
          {activeHours.map(({ hour, secs, label }) => (
            <List.Item
              key={hour}
              icon={{ source: Icon.Calendar, tintColor: Color.Blue }}
              title={label}
              accessories={[{ text: formatDuration(secs) }]}
              actions={sharedActions}
            />
          ))}
        </List.Section>
      )}

      {/* ─── Weekly Overview ──────────────────────────────────────────── */}
      {weeks.map((week, wi) => {
        const mondayDate = new Date(week.monday + "T12:00:00");
        const sundayDate = new Date(week.sunday + "T12:00:00");
        const rangeLabel = `${mondayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sundayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

        // This week: show daily breakdown
        if (wi === 0) {
          return (
            <List.Section key={week.monday} title={`${week.label} — ${rangeLabel}`}>
              {week.dailyTotals.map((d) => {
                const dateObj = new Date(d.date + "T12:00:00");
                const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                const monthDay = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const isToday = d.date === today;
                // Future dates in the current week
                const isFuture = d.date > today;

                return (
                  <List.Item
                    key={d.date}
                    icon={{
                      source: isFuture ? Icon.Circle : d.focusTime > 0 ? Icon.CheckCircle : Icon.Circle,
                      tintColor: isToday ? Color.Blue : d.focusTime > 0 ? Color.Green : Color.SecondaryText,
                    }}
                    title={`${dayName}  ${monthDay}`}
                    subtitle={d.sessions > 0 ? `${d.sessions} ${d.sessions === 1 ? "session" : "sessions"}` : undefined}
                    accessories={[
                      ...(isToday
                        ? [{ tag: { value: "Today", color: Color.Blue } as { value: string; color: Color } }]
                        : []),
                      { text: isFuture ? "—" : d.focusTime > 0 ? formatDuration(d.focusTime) : "0m" },
                    ]}
                    actions={sharedActions}
                  />
                );
              })}
              <List.Item
                icon={{ source: Icon.BarChart, tintColor: Color.Orange }}
                title="Week Total"
                accessories={[
                  { text: week.totalFocusTime > 0 ? formatDuration(week.totalFocusTime) : "0m" },
                  {
                    tag: {
                      value: `${week.sessionsCompleted} sessions`,
                      color: Color.Orange,
                    },
                  },
                ]}
                actions={sharedActions}
              />
            </List.Section>
          );
        }

        // Past weeks: show summary only
        return (
          <List.Section key={week.monday} title={`${week.label} — ${rangeLabel}`}>
            <List.Item
              icon={{
                source: week.totalFocusTime > 0 ? Icon.CheckCircle : Icon.Circle,
                tintColor: week.totalFocusTime > 0 ? Color.Green : Color.SecondaryText,
              }}
              title="Total"
              accessories={[
                { text: week.totalFocusTime > 0 ? formatDuration(week.totalFocusTime) : "0m" },
                {
                  tag: {
                    value: `${week.sessionsCompleted} sessions`,
                    color: week.sessionsCompleted > 0 ? Color.Green : Color.SecondaryText,
                  },
                },
              ]}
              actions={sharedActions}
            />
          </List.Section>
        );
      })}

      {/* ─── Today's Sessions ──────────────────────────────────────────── */}
      {todaySessions.length > 0 && (
        <List.Section title="Today's Sessions">
          {todaySessions.map((s, i) => {
            const time = new Date(s.startedAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
            return (
              <List.Item
                key={s.id}
                icon={{
                  source: s.completed ? Icon.Checkmark : Icon.XMarkCircle,
                  tintColor: s.completed ? Color.Green : Color.Red,
                }}
                title={`#${todaySessions.length - i}`}
                subtitle={`Started ${time}`}
                accessories={[
                  ...(s.label ? [{ tag: { value: s.label, color: Color.Blue } }] : []),
                  { text: formatDuration(s.elapsed) },
                  {
                    tag: {
                      value: s.completed ? "Done" : "Stopped",
                      color: s.completed ? Color.Green : Color.Red,
                    },
                  },
                ]}
                actions={sharedActions}
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
