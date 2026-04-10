import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Select } from "@opencode-ai/ui/select"
import { Switch } from "@opencode-ai/ui/switch"
import { Tag } from "@opencode-ai/ui/tag"
import { Tabs } from "@opencode-ai/ui/tabs"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { useMutation } from "@tanstack/solid-query"
import type { Agent } from "@opencode-ai/sdk/v2/client"
import { batch, createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

type Props = {
  directory?: string
  initialSelected?: string
}

type AgentMode = Agent["mode"]
type EditorTab = "identity" | "execution" | "memory"
type MemoryMode = "inherit" | "project-shared" | "disabled"

type AgentForm = {
  key: string
  description: string
  mode: AgentMode
  hidden: boolean
  model: string
  variant: string
  steps: string
  prompt: string
  memoryMode: MemoryMode
  isNew: boolean
  native: boolean
  err: {
    key?: string
    model?: string
    steps?: string
  }
}

type ConfigAgent = Record<string, unknown> & {
  disable?: boolean
  description?: string
  mode?: AgentMode
  hidden?: boolean
  model?: string
  variant?: string
  steps?: number
  prompt?: string
  options?: Record<string, unknown>
}

function nextCustomKey(existing: Set<string>) {
  let index = 1
  while (true) {
    const key = `custom-agent-${index}`
    if (!existing.has(key)) return key
    index += 1
  }
}

function modeLabel(language: ReturnType<typeof useLanguage>, mode: AgentMode) {
  if (mode === "primary") return language.t("settings.agents.badge.mode.primary")
  if (mode === "all") return language.t("settings.agents.badge.mode.all")
  return language.t("settings.agents.badge.mode.subagent")
}

function memoryModeValue(value: unknown): MemoryMode {
  if (value === "project-shared") return "project-shared"
  if (value === "disabled") return "disabled"
  return "inherit"
}

function readMemoryMode(input: { options?: Record<string, unknown> }): MemoryMode {
  const sineflow = input.options?.sineflow
  if (!sineflow || typeof sineflow !== "object") return "inherit"
  return memoryModeValue((sineflow as Record<string, unknown>).memory)
}

function memoryModeLabel(language: ReturnType<typeof useLanguage>, mode: MemoryMode) {
  if (mode === "project-shared") return language.t("settings.agents.manage.field.memory.mode.projectShared")
  if (mode === "disabled") return language.t("settings.agents.manage.field.memory.mode.disabled")
  return language.t("settings.agents.manage.field.memory.mode.inherit")
}

function surfaceLabel(language: ReturnType<typeof useLanguage>, input: { mode: AgentMode; hidden: boolean }) {
  if (input.hidden) return language.t("settings.agents.detail.value.surface.hidden")
  if (input.mode === "subagent") return language.t("settings.agents.detail.value.surface.specialist")
  return language.t("settings.agents.detail.value.surface.main")
}

function OverviewItem(props: { label: string; value: string; hint?: string }) {
  return (
    <div class="rounded-lg border border-border-weak-base bg-surface-base px-4 py-3">
      <div class="text-12-medium text-text-weak">{props.label}</div>
      <div class="mt-1 text-13-medium text-text-strong">{props.value}</div>
      <Show when={props.hint}>
        <div class="mt-1 text-12-regular text-text-weak">{props.hint}</div>
      </Show>
    </div>
  )
}

export function DialogManageAgents(props: Props) {
  const dialog = useDialog()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const [selectedKey, setSelectedKey] = createSignal<string | undefined>(props.initialSelected)
  const [activeTab, setActiveTab] = createSignal<EditorTab>("identity")

  const store = createMemo(() => {
    if (!props.directory) return
    return globalSync.peek(props.directory, { bootstrap: false })[0]
  })

  const sdk = createMemo(() => {
    if (!props.directory) return
    return globalSDK.createClient({
      directory: props.directory,
      throwOnError: true,
    })
  })

  const configAgents = createMemo(() => (store()?.config.agent ?? {}) as Record<string, ConfigAgent>)

  const agents = createMemo(() => {
    const items = Array.isArray(store()?.agent) ? store()!.agent : []
    return items
      .filter((item) => !!item?.name)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  const knownKeys = createMemo(() => new Set([...agents().map((item) => item.name), ...Object.keys(configAgents())]))

  const [form, setForm] = createStore<AgentForm>({
    key: "",
    description: "",
    mode: "all",
    hidden: false,
    model: "",
    variant: "",
    steps: "",
    prompt: "",
    memoryMode: "inherit",
    isNew: false,
    native: false,
    err: {},
  })

  createEffect(() => {
    if (form.isNew) return
    const list = agents()
    const current = selectedKey()
    if (!current && props.initialSelected && list.some((item) => item.name === props.initialSelected)) {
      setSelectedKey(props.initialSelected)
      return
    }
    if (current && list.some((item) => item.name === current)) return
    if (list.length === 0) return
    setSelectedKey(list[0]?.name)
  })

  createEffect(() => {
    const key = selectedKey()
    if (!key) return
    const resolved = agents().find((item) => item.name === key)
    const config = configAgents()[key]
    if (!resolved) return

    batch(() => {
      setForm("key", key)
      setForm("description", String(config?.description ?? resolved.description ?? ""))
      setForm("mode", (config?.mode as AgentMode | undefined) ?? resolved.mode)
      setForm("hidden", Boolean(config?.hidden ?? resolved.hidden))
      setForm(
        "model",
        typeof config?.model === "string"
          ? config.model
          : resolved.model
            ? `${resolved.model.providerID}/${resolved.model.modelID}`
            : "",
      )
      setForm("variant", typeof config?.variant === "string" ? config.variant : (resolved.variant ?? ""))
      setForm("steps", String(config?.steps ?? resolved.steps ?? ""))
      setForm("prompt", typeof config?.prompt === "string" ? config.prompt : "")
      setForm("memoryMode", readMemoryMode(config ?? resolved))
      setForm("isNew", false)
      setForm("native", resolved.native === true)
      setForm("err", {})
    })
  })

  const modeOptions = createMemo(() => [
    { value: "primary" as const, label: language.t("settings.agents.badge.mode.primary") },
    { value: "all" as const, label: language.t("settings.agents.badge.mode.all") },
    { value: "subagent" as const, label: language.t("settings.agents.badge.mode.subagent") },
  ])
  const memoryOptions = createMemo(() => [
    { value: "inherit" as const, label: language.t("settings.agents.manage.field.memory.mode.inherit") },
    {
      value: "project-shared" as const,
      label: language.t("settings.agents.manage.field.memory.mode.projectShared"),
    },
    { value: "disabled" as const, label: language.t("settings.agents.manage.field.memory.mode.disabled") },
  ])

  const selectedResolved = createMemo(() => agents().find((item) => item.name === selectedKey()))
  const currentConfig = createMemo(() => {
    const key = form.key.trim()
    if (!key) return
    return configAgents()[key]
  })
  const overrideStatus = createMemo(() => {
    if (form.isNew) return language.t("settings.agents.manage.overview.override.workspace")
    const value = currentConfig()
    if (value && value.disable !== true) return language.t("settings.agents.manage.overview.override.workspace")
    return language.t("settings.agents.manage.overview.override.default")
  })
  const modelSummary = createMemo(() => form.model.trim() || language.t("settings.agents.detail.value.model.default"))
  const surfaceSummary = createMemo(() => surfaceLabel(language, { mode: form.mode, hidden: form.hidden }))
  const memorySummary = createMemo(() => memoryModeLabel(language, form.memoryMode))
  const selectAgent = (key: string) => {
    setSelectedKey(key)
    setActiveTab("identity")
  }

  const validate = () => {
    const nextErr: AgentForm["err"] = {}
    const key = form.key.trim()
    const model = form.model.trim()
    const steps = form.steps.trim()

    if (!key) nextErr.key = language.t("settings.agents.manage.validation.key.required")
    else if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) {
      nextErr.key = language.t("settings.agents.manage.validation.key.format")
    } else if (form.isNew && knownKeys().has(key) && configAgents()[key]?.disable !== true) {
      nextErr.key = language.t("settings.agents.manage.validation.key.duplicate")
    }

    if (model && !model.includes("/")) {
      nextErr.model = language.t("settings.agents.manage.validation.model.format")
    }

    if (steps) {
      const value = Number(steps)
      if (!Number.isInteger(value) || value <= 0) {
        nextErr.steps = language.t("settings.agents.manage.validation.steps.positive")
      }
    }

    setForm("err", nextErr)
    if (Object.keys(nextErr).length > 0) return

    const patch: ConfigAgent = {
      disable: false,
      description: form.description.trim(),
      mode: form.mode,
      hidden: form.hidden,
      variant: form.variant.trim(),
      prompt: form.prompt,
      options: {
        sineflow: {
          memory: form.memoryMode,
        },
      },
    }

    if (model) patch.model = model
    if (steps) patch.steps = Number(steps)

    return { key, patch }
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async () => {
      const result = validate()
      if (!result) throw new Error("validation")
      const client = sdk()
      if (!client) throw new Error("missing directory")
      await client.config.update({
        config: {
          agent: {
            [result.key]: result.patch,
          },
        },
      })
      return result.key
    },
    onSuccess: (key) => {
      setSelectedKey(key)
      setForm("isNew", false)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.agents.manage.toast.saved.title"),
        description: language.t("settings.agents.manage.toast.saved.description", { agent: key }),
      })
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "validation") return
      showToast({
        title: language.t("settings.agents.manage.toast.saveFailed.title"),
        description: err instanceof Error ? err.message : String(err),
      })
    },
  }))

  const deleteMutation = useMutation(() => ({
    mutationFn: async (key: string) => {
      const client = sdk()
      if (!client) throw new Error("missing directory")
      await client.config.update({
        config: {
          agent: {
            [key]: {
              disable: true,
            },
          },
        },
      })
      return key
    },
    onSuccess: (key) => {
      const next = agents().find((item) => item.name !== key)?.name
      setSelectedKey(next)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.agents.manage.toast.deleted.title"),
        description: language.t("settings.agents.manage.toast.deleted.description", { agent: key }),
      })
    },
    onError: (err) => {
      showToast({
        title: language.t("settings.agents.manage.toast.deleteFailed.title"),
        description: err instanceof Error ? err.message : String(err),
      })
    },
  }))

  const createNew = () => {
    const key = nextCustomKey(knownKeys())
    batch(() => {
      setSelectedKey(undefined)
      setActiveTab("identity")
      setForm("key", key)
      setForm("description", "")
      setForm("mode", "all")
      setForm("hidden", false)
      setForm("model", "")
      setForm("variant", "")
      setForm("steps", "")
      setForm("prompt", "")
      setForm("memoryMode", "inherit")
      setForm("isNew", true)
      setForm("native", false)
      setForm("err", {})
    })
  }

  const deleteSelected = () => {
    if (!form.key || deleteMutation.isPending) return
    if (form.isNew) {
      setSelectedKey(agents()[0]?.name)
      return
    }
    deleteMutation.mutate(form.key)
  }

  return (
    <Dialog
      title={language.t("settings.agents.manage.title")}
      description={language.t("settings.agents.manage.description")}
      action={
        <Button size="small" variant="secondary" icon="plus-small" onClick={createNew}>
          {language.t("settings.agents.manage.add")}
        </Button>
      }
      transition
    >
      <div class="flex max-h-[70vh] min-h-[520px] min-w-[880px] overflow-hidden">
        <div class="flex w-[260px] flex-shrink-0 flex-col border-r border-border-weak-base px-3 py-3">
          <div class="pb-3 text-12-medium text-text-weak">{language.t("settings.agents.manage.listTitle")}</div>
          <div class="flex flex-1 flex-col gap-2 overflow-y-auto">
            <For each={agents()}>
              {(agent) => (
                <button
                  type="button"
                  class="rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface-hover"
                  classList={{ "bg-surface-hover": selectedKey() === agent.name && !form.isNew }}
                  onClick={() => selectAgent(agent.name)}
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-13-medium text-text-strong">{agent.name}</span>
                    <Tag>
                      {agent.native
                        ? language.t("settings.agents.badge.native")
                        : language.t("settings.agents.manage.custom")}
                    </Tag>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <Tag>{modeLabel(language, agent.mode)}</Tag>
                    <Show when={agent.hidden}>
                      <Tag>{language.t("settings.agents.badge.hidden")}</Tag>
                    </Show>
                  </div>
                </button>
              )}
            </For>

            <Show when={form.isNew}>
              <div class="rounded-lg bg-surface-hover px-3 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-13-medium text-text-strong">{form.key}</span>
                  <Tag>{language.t("settings.agents.manage.new")}</Tag>
                </div>
              </div>
            </Show>
          </div>
        </div>

        <div class="flex min-w-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          <div class="flex items-start justify-between gap-3 pb-4">
            <div class="flex min-w-0 flex-col gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-16-medium text-text-strong">
                  {form.isNew ? language.t("settings.agents.manage.new") : form.key}
                </h3>
                <Show when={!form.isNew && form.native}>
                  <Tag>{language.t("settings.agents.manage.nativeReadonly")}</Tag>
                </Show>
              </div>
              <p class="text-12-regular text-text-weak">
                {form.isNew
                  ? language.t("settings.agents.manage.form.newDescription")
                  : form.native
                    ? language.t("settings.agents.manage.form.nativeDescription")
                    : language.t("settings.agents.manage.form.customDescription")}
              </p>
              <p class="text-12-regular text-text-weak">{language.t("settings.agents.manage.scopeNote")}</p>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="small" onClick={() => dialog.close()}>
                {language.t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                size="small"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? language.t("common.saving") : language.t("common.save")}
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 xl:grid-cols-5">
            <OverviewItem
              label={language.t("settings.agents.manage.overview.source")}
              value={form.native ? language.t("settings.agents.detail.value.source.native") : language.t("settings.agents.detail.value.source.custom")}
            />
            <OverviewItem
              label={language.t("settings.agents.manage.overview.mode")}
              value={modeLabel(language, form.mode)}
            />
            <OverviewItem
              label={language.t("settings.agents.manage.overview.surface")}
              value={surfaceSummary()}
            />
            <OverviewItem
              label={language.t("settings.agents.manage.overview.override.label")}
              value={overrideStatus()}
              hint={modelSummary()}
            />
            <OverviewItem label={language.t("settings.agents.manage.overview.memory")} value={memorySummary()} />
          </div>

          <Tabs
            value={activeTab()}
            onChange={(value) => setActiveTab(value as EditorTab)}
            class="mt-5 rounded-xl border border-border-weak-base bg-surface-base overflow-hidden"
            variant="alt"
          >
            <Tabs.List class="border-b border-border-weak-base px-4 pt-3 pb-0 gap-4 h-10 bg-transparent">
              <Tabs.Trigger value="identity" class="text-12-regular">
                {language.t("settings.agents.manage.tab.identity")}
              </Tabs.Trigger>
              <Tabs.Trigger value="execution" class="text-12-regular">
                {language.t("settings.agents.manage.tab.execution")}
              </Tabs.Trigger>
              <Tabs.Trigger value="memory" class="text-12-regular">
                {language.t("settings.agents.manage.tab.memory")}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="identity" class="px-4 py-4">
              <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <TextField
                  label={language.t("settings.agents.manage.field.key.label")}
                  description={language.t("settings.agents.manage.field.key.description")}
                  value={form.key}
                  onChange={(value) => {
                    setForm("key", value)
                    setForm("err", "key", undefined)
                  }}
                  disabled={!form.isNew}
                  validationState={form.err.key ? "invalid" : undefined}
                  error={form.err.key}
                />

                <div class="flex flex-col gap-1.5">
                  <span class="text-12-medium text-text-weak">
                    {language.t("settings.agents.manage.field.mode.label")}
                  </span>
                  <Select
                    options={modeOptions()}
                    current={modeOptions().find((item) => item.value === form.mode)}
                    value={(item) => item.value}
                    label={(item) => item.label}
                    onSelect={(item) => item && setForm("mode", item.value)}
                    variant="secondary"
                    size="small"
                    triggerStyle={{ "min-width": "180px" }}
                    triggerProps={{ "aria-label": language.t("settings.agents.manage.field.mode.label") }}
                  />
                </div>
              </div>

              <div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <TextField
                  label={language.t("settings.agents.manage.field.description.label")}
                  description={language.t("settings.agents.manage.field.description.description")}
                  value={form.description}
                  onChange={(value) => setForm("description", value)}
                />

                <div class="rounded-lg border border-border-weak-base px-4 py-3">
                  <div class="flex items-center justify-between gap-4">
                    <div class="flex min-w-0 flex-col gap-0.5">
                      <span class="text-14-medium text-text-strong">
                        {language.t("settings.agents.manage.field.hidden.label")}
                      </span>
                      <span class="text-12-regular text-text-weak">
                        {language.t("settings.agents.manage.field.hidden.description")}
                      </span>
                    </div>
                    <Switch checked={form.hidden} onChange={(checked) => setForm("hidden", checked)} />
                  </div>
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content value="execution" class="px-4 py-4">
              <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <TextField
                  label={language.t("settings.agents.manage.field.model.label")}
                  description={language.t("settings.agents.manage.field.model.description")}
                  value={form.model}
                  onChange={(value) => {
                    setForm("model", value)
                    setForm("err", "model", undefined)
                  }}
                  placeholder="provider/model"
                  validationState={form.err.model ? "invalid" : undefined}
                  error={form.err.model}
                />
                <TextField
                  label={language.t("settings.agents.manage.field.variant.label")}
                  description={language.t("settings.agents.manage.field.variant.description")}
                  value={form.variant}
                  onChange={(value) => setForm("variant", value)}
                />
                <TextField
                  label={language.t("settings.agents.manage.field.steps.label")}
                  description={language.t("settings.agents.manage.field.steps.description")}
                  value={form.steps}
                  onChange={(value) => {
                    setForm("steps", value)
                    setForm("err", "steps", undefined)
                  }}
                  validationState={form.err.steps ? "invalid" : undefined}
                  error={form.err.steps}
                />
              </div>

              <div class="mt-4">
                <TextField
                  multiline
                  label={language.t("settings.agents.manage.field.prompt.label")}
                  description={language.t("settings.agents.manage.field.prompt.description")}
                  value={form.prompt}
                  onChange={(value) => setForm("prompt", value)}
                  class="max-h-36 overflow-y-auto"
                />
              </div>

              <Show when={selectedResolved()?.description}>
                <div class="mt-4 rounded-lg border border-border-weak-base bg-background-strong px-4 py-3">
                  <div class="text-12-medium text-text-weak">
                    {language.t("settings.agents.manage.currentResolved")}
                  </div>
                  <div class="mt-1 text-13-regular text-text-strong">{selectedResolved()?.description}</div>
                </div>
              </Show>
            </Tabs.Content>

            <Tabs.Content value="memory" class="px-4 py-4">
              <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <span class="text-12-medium text-text-weak">
                    {language.t("settings.agents.manage.field.memory.label")}
                  </span>
                  <Select
                    options={memoryOptions()}
                    current={memoryOptions().find((item) => item.value === form.memoryMode)}
                    value={(item) => item.value}
                    label={(item) => item.label}
                    onSelect={(item) => item && setForm("memoryMode", item.value)}
                    variant="secondary"
                    size="small"
                    triggerStyle={{ "min-width": "220px" }}
                    triggerProps={{ "aria-label": language.t("settings.agents.manage.field.memory.label") }}
                  />
                  <p class="text-12-regular text-text-weak">
                    {language.t("settings.agents.manage.field.memory.description")}
                  </p>
                </div>

                <div class="rounded-lg border border-border-weak-base bg-background-strong px-4 py-3">
                  <div class="text-12-medium text-text-weak">
                    {language.t("settings.agents.manage.field.memory.sourceTitle")}
                  </div>
                  <div class="mt-1 text-13-regular text-text-strong">
                    {language.t("settings.agents.manage.field.memory.sourceDescription")}
                  </div>
                  <div class="mt-3 text-12-regular text-text-weak">
                    <code class="font-mono">.sineflow/MEMORY.md</code>
                    {" / "}
                    <code class="font-mono">.opencode/sineflow/MEMORY.md</code>
                  </div>
                </div>
              </div>

              <div class="mt-4 rounded-lg border border-border-weak-base px-4 py-3">
                <div class="text-12-medium text-text-weak">
                  {language.t("settings.agents.manage.field.memory.behaviorTitle")}
                </div>
                <div class="mt-1 text-13-regular text-text-strong">
                  {language.t("settings.agents.manage.field.memory.behaviorDescription")}
                </div>
              </div>
            </Tabs.Content>
          </Tabs>

          <div class="mt-5 flex items-center justify-between gap-3 rounded-lg border border-border-weak-base px-4 py-3">
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-14-medium text-text-strong">
                {form.native
                  ? language.t("settings.agents.manage.delete.nativeTitle")
                  : language.t("settings.agents.manage.delete.customTitle")}
              </span>
              <span class="text-12-regular text-text-weak">
                {form.native
                  ? language.t("settings.agents.manage.delete.nativeDescription")
                  : language.t("settings.agents.manage.delete.customDescription")}
              </span>
            </div>
            <Button
              variant="ghost"
              size="small"
              disabled={!form.key || form.isNew || deleteMutation.isPending}
              onClick={deleteSelected}
            >
              {form.native
                ? language.t("settings.agents.manage.delete.disable")
                : language.t("settings.agents.manage.delete.remove")}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
