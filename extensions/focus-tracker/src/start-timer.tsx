import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  closeMainWindow,
  launchCommand,
  LaunchType,
  showHUD,
  popToRoot,
  useNavigation,
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
  getLabels,
  addLabel,
  removeLabel,
  TimerState,
  Session,
} from "./storage";

type SessionType = "focus" | "short-break" | "long-break" | "meeting";

const SESSION_LABELS: Record<SessionType, string> = {
  focus: "Focus",
  "short-break": "Short Break",
  "long-break": "Long Break",
  meeting: "Meeting",
};

function CreateLabelForm({ onSave }: { onSave: (label: string) => Promise<void> }) {
  const { pop } = useNavigation();
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= 30;

  return (
    <Form
      navigationTitle="Create Label"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create"
            icon={Icon.Plus}
            onSubmit={async () => {
              if (isValid) {
                await onSave(trimmed);
                pop();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="label"
        title="Label Name"
        placeholder="e.g. Work, Side Project, Study"
        value={value}
        onChange={setValue}
        error={!isValid && value.length > 0 ? "Enter 1\u201330 characters" : undefined}
      />
    </Form>
  );
}

function ManageLabelsView({ labels, onUpdate }: { labels: string[]; onUpdate: () => Promise<void> }) {
  return (
    <List navigationTitle="Manage Labels" searchBarPlaceholder="Search labels\u2026">
      {labels.length === 0 ? (
        <List.EmptyView title="No Labels" description="Create a label from the Start Timer screen" />
      ) : (
        labels.map((lbl) => (
          <List.Item
            key={lbl}
            icon={{ source: Icon.Tag, tintColor: Color.Blue }}
            title={lbl}
            actions={
              <ActionPanel>
                <Action
                  title="Delete Label"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={async () => {
                    await removeLabel(lbl);
                    await onUpdate();
                  }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

function CustomDurationForm({
  type,
  defaultMinutes,
  onStart,
}: {
  type: SessionType;
  defaultMinutes: number;
  onStart: (seconds: number) => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [value, setValue] = useState(String(defaultMinutes));
  const parsed = parseInt(value);
  const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= 999;

  return (
    <Form
      navigationTitle={`Custom ${SESSION_LABELS[type]} Duration`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Start Timer"
            icon={Icon.Play}
            onSubmit={async () => {
              if (isValid) {
                pop();
                await onStart(parsed * 60);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="duration"
        title="Duration (minutes)"
        placeholder="e.g. 25"
        value={value}
        onChange={setValue}
        error={!isValid && value.length > 0 ? "Enter a number between 1 and 999" : undefined}
      />
    </Form>
  );
}

export default function StartTimer() {
  const config = getConfig();
  const durationMap = {
    focus: config.focusDuration,
    "short-break": config.shortBreakDuration,
    "long-break": config.longBreakDuration,
    meeting: config.meetingDuration,
  };
  const [existing, setExisting] = useState<TimerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [labels, setLabels] = useState<string[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(undefined);

  useEffect(() => {
    async function load() {
      const [state, savedLabels] = await Promise.all([getTimerState(), getLabels()]);
      setExisting(state);
      setLabels(savedLabels);
      setIsLoading(false);
    }
    load();
  }, []);

  async function startSession(type: SessionType, customDuration?: number) {
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
        label: existing.label,
      };
      await addSession(session);
    }

    const duration = customDuration ?? durationMap[type];
    const sessionCount = existing?.sessionCount || 0;
    const newState: TimerState = {
      isRunning: true,
      startedAt: new Date().toISOString(),
      elapsed: 0,
      duration,
      type,
      sessionCount,
      label: selectedLabel,
    };
    await setTimerState(newState);

    const hudLabels: Record<string, string> = {
      focus: "🍅 Focus",
      "short-break": "☕ Short Break",
      "long-break": "🌴 Long Break",
      meeting: "👥 Meeting",
    };
    const labelSuffix = selectedLabel ? ` · ${selectedLabel}` : "";
    await showHUD(`${hudLabels[type]} started: ${formatTime(duration)}${labelSuffix}`);

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
        label: existing.label,
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
    type: SessionType;
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
      icon: { source: Icon.Tree, tintColor: Color.Blue },
      type: "long-break",
    },
    {
      id: "meeting",
      title: "Meeting",
      subtitle: formatDuration(config.meetingDuration),
      icon: { source: Icon.TwoPeople, tintColor: Color.Purple },
      type: "meeting",
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

      {/* Label Picker */}
      <List.Section title="Project Label">
        <List.Item
          icon={{ source: Icon.Tag, tintColor: selectedLabel ? Color.Blue : Color.SecondaryText }}
          title={selectedLabel || "No Label"}
          subtitle={selectedLabel ? "Selected" : "Optional — tag your session"}
          accessories={selectedLabel ? [{ tag: { value: selectedLabel, color: Color.Blue } }] : []}
          actions={
            <ActionPanel>
              {labels.map((lbl) => (
                <Action
                  key={lbl}
                  title={`Select "${lbl}"`}
                  icon={selectedLabel === lbl ? Icon.CheckCircle : Icon.Circle}
                  onAction={() => setSelectedLabel(selectedLabel === lbl ? undefined : lbl)}
                />
              ))}
              {selectedLabel && (
                <Action title="Clear Label" icon={Icon.XMarkCircle} onAction={() => setSelectedLabel(undefined)} />
              )}
              <Action.Push
                title="Create New Label…"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
                target={
                  <CreateLabelForm
                    onSave={async (newLabel) => {
                      await addLabel(newLabel);
                      const updated = await getLabels();
                      setLabels(updated);
                      setSelectedLabel(newLabel);
                    }}
                  />
                }
              />
              <Action.Push
                title="Manage Labels…"
                icon={Icon.List}
                shortcut={{ modifiers: ["cmd"], key: "l" }}
                target={
                  <ManageLabelsView
                    labels={labels}
                    onUpdate={async () => {
                      const updated = await getLabels();
                      setLabels(updated);
                      if (selectedLabel && !updated.includes(selectedLabel)) {
                        setSelectedLabel(undefined);
                      }
                    }}
                  />
                }
              />
            </ActionPanel>
          }
        />
      </List.Section>

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
                <Action.Push
                  title="Custom Duration…"
                  icon={Icon.Clock}
                  target={
                    <CustomDurationForm
                      type={item.type}
                      defaultMinutes={durationMap[item.type] / 60}
                      onStart={(seconds) => startSession(item.type, seconds)}
                    />
                  }
                />
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
