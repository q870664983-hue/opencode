import type { Agent } from "@opencode-ai/sdk/v2/client"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Tag } from "@opencode-ai/ui/tag"
import { Icon } from "@opencode-ai/ui/icon"
import { useParams } from "@solidjs/router"
import { type Component, For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSync } from "@/context/global-sync"
import { decode64 } from "@/utils/base64"
import { DialogManageAgents } from "./dialog-manage-agents"
import { SettingsList } from "./settings-list"

type AgentMode = Agent["mode"]
type MemoryMode = "inherit" | "project-shared" | "disabled"

type AgentCard = {
  name: string
  description?: string
  hidden: boolean
  native: boolean
  mode: AgentMode
  badges: string[]
  modelLabel: string
  variantLabel: string
  stepsLabel: string
  sourceLabel: string
  surfaceLabel: string
  autoPlanLabel: string
  directSelectionLabel: string
  toolProfileLabel: string
  memoryProfileLabel: string
}

function isAgentMode(value: unknown): value is AgentMode {
  return value === "primary" || value === "subagent" || value === "all"
}

function memoryModeValue(value: unknown): MemoryMode {
  if (value === "project-shared") return "project-shared"
  if (value === "disabled") return "disabled"
  return "inherit"
}

function agentMemoryProfile(language: ReturnType<typeof useLanguage>, item: Agent) {
  const sineflow = item.options?.sineflow
  const mode =
    sineflow && typeof sineflow === "object"
      ? memoryModeValue((sineflow as Record<string, unknown>).memory)
      : "inherit"

  if (mode === "disabled") return language.t("settings.agents.detail.value.memory.disabled")
  if (item.mode === "subagent") return language.t("settings.agents.detail.value.memory.delegated")
  return language.t("settings.agents.detail.value.memory.projectShared")
}

const SummaryCard: Component<{ label: string; value: number }> = (props) => {
  return (
    <div class="rounded-lg bg-surface-base px-4 py-4">
      <div class="text-24-semibold text-text-strong">{props.value}</div>
      <div class="mt-1 text-12-regular text-text-weak">{props.label}</div>
    </div>
  )
}

const AgentListSection: Component<{
  title: string
  description: string
  empty: string
  agents: AgentCard[]
  selected?: string
  onSelect: (name: string) => void
}> = (props) => {
  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-col gap-1 pb-1">
        <h3 class="text-14-medium text-text-strong">{props.title}</h3>
        <p class="text-12-regular text-text-weak">{props.description}</p>
      </div>

      <SettingsList>
        <Show
          when={props.agents.length > 0}
          fallback={<div class="py-4 text-14-regular text-text-weak">{props.empty}</div>}
        >
          <For each={props.agents}>
            {(agent) => (
              <div class="border-b border-border-weak-base py-2 last:border-none">
                <button
                  type="button"
                  class="w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface-hover"
                  classList={{
                    "bg-surface-hover": props.selected === agent.name,
                  }}
                  onClick={() => props.onSelect(agent.name)}
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-14-medium text-text-strong">{agent.name}</span>
                    <Tag>{agent.sourceLabel}</Tag>
                    <Tag>{agent.surfaceLabel}</Tag>
                  </div>

                  <Show when={agent.description}>
                    <p class="mt-2 text-13-regular text-text-weak">{agent.description}</p>
                  </Show>

                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <For each={agent.badges}>{(badge) => <Tag>{badge}</Tag>}</For>
                  </div>
                </button>
              </div>
            )}
          </For>
        </Show>
      </SettingsList>
    </div>
  )
}

const DetailSection: Component<{ title: string; children: JSX.Element }> = (props) => {
  return (
    <div class="flex flex-col gap-3 rounded-lg bg-surface-base px-4 py-4">
      <h3 class="text-14-medium text-text-strong">{props.title}</h3>
      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">{props.children}</div>
    </div>
  )
}

const DetailItem: Component<{ label: string; value: JSX.Element }> = (props) => {
  return (
    <div class="flex flex-col gap-1 rounded-md border border-border-weak-base px-3 py-3">
      <span class="text-12-medium text-text-weak">{props.label}</span>
      <div class="text-13-regular text-text-strong">{props.value}</div>
    </div>
  )
}

export const SettingsAgents: Component = () => {
  const params = useParams()
  const dialog = useDialog()
  const language = useLanguage()
  const globalSync = useGlobalSync()
  const [selectedName, setSelectedName] = createSignal<string | undefined>()

  const modeLabel = (mode: AgentMode) => {
    if (mode === "primary") return language.t("settings.agents.badge.mode.primary")
    if (mode === "all") return language.t("settings.agents.badge.mode.all")
    return language.t("settings.agents.badge.mode.subagent")
  }

  const directory = createMemo(() => {
    const dir = decode64(params.dir)
    if (!dir) return
    return globalSync.peek(dir, { bootstrap: false })[0].path.directory || dir
  })

  const store = createMemo(() => {
    const value = directory()
    if (!value) return
    return globalSync.peek(value, { bootstrap: false })[0]
  })

  const normalized = createMemo<AgentCard[]>(() => {
    const items = Array.isArray(store()?.agent) ? store()!.agent : []

    return items.flatMap((item: Agent) => {
      if (!item || typeof item !== "object") return []
      if (typeof item.name !== "string") return []
      if (!isAgentMode(item.mode)) return []

      const modelLabel = item.model
        ? `${item.model.providerID}/${item.model.modelID}`
        : language.t("settings.agents.detail.value.model.default")
      const variantLabel = item.variant
        ? language.t("settings.agents.badge.variant", { variant: item.variant })
        : language.t("common.default")
      const stepsLabel =
        typeof item.steps === "number"
          ? language.t("settings.agents.badge.steps", { count: item.steps })
          : language.t("settings.agents.detail.value.steps.inherit")
      const sourceLabel = item.native
        ? language.t("settings.agents.detail.value.source.native")
        : language.t("settings.agents.detail.value.source.custom")
      const surfaceLabel = item.hidden
        ? language.t("settings.agents.detail.value.surface.hidden")
        : item.mode === "subagent"
          ? language.t("settings.agents.detail.value.surface.specialist")
          : language.t("settings.agents.detail.value.surface.main")
      const autoPlanLabel =
        item.mode === "subagent" || item.mode === "all"
          ? language.t("settings.agents.detail.value.enabled")
          : language.t("settings.agents.detail.value.disabled")
      const directSelectionLabel =
        item.mode !== "subagent" && !item.hidden
          ? language.t("settings.agents.detail.value.enabled")
          : language.t("settings.agents.detail.value.disabled")
      const toolProfileLabel = item.native
        ? language.t("settings.agents.detail.value.tools.workspaceDefault")
        : language.t("settings.agents.detail.value.tools.customized")
      const memoryProfileLabel = agentMemoryProfile(language, item)

      const badges = [modeLabel(item.mode)]
      if (item.native) badges.push(language.t("settings.agents.badge.native"))
      if (item.hidden) badges.push(language.t("settings.agents.badge.hidden"))
      if (item.model) badges.push(modelLabel)
      if (item.variant) badges.push(language.t("settings.agents.badge.variant", { variant: item.variant }))
      if (typeof item.steps === "number") {
        badges.push(language.t("settings.agents.badge.steps", { count: item.steps }))
      }

      return [
        {
          name: item.name,
          description: typeof item.description === "string" ? item.description : undefined,
          hidden: item.hidden === true,
          native: item.native === true,
          mode: item.mode,
          badges,
          modelLabel,
          variantLabel,
          stepsLabel,
          sourceLabel,
          surfaceLabel,
          autoPlanLabel,
          directSelectionLabel,
          toolProfileLabel,
          memoryProfileLabel,
        },
      ]
    })
  })

  createEffect(() => {
    const items = normalized()
    const current = selectedName()
    if (items.length === 0) {
      if (current !== undefined) setSelectedName(undefined)
      return
    }
    if (current && items.some((item) => item.name === current)) return
    setSelectedName(items[0]?.name)
  })

  const mainAgents = createMemo(() => normalized().filter((item) => item.mode !== "subagent" && !item.hidden))
  const specialistAgents = createMemo(() => normalized().filter((item) => item.mode === "subagent" && !item.hidden))
  const hiddenAgents = createMemo(() => normalized().filter((item) => item.hidden))
  const selectedAgent = createMemo(() => normalized().find((item) => item.name === selectedName()))
  const loading = createMemo(() => store()?.status === "loading" && normalized().length === 0)

  return (
    <div class="flex h-full flex-col overflow-y-auto px-4 pb-10 no-scrollbar sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex max-w-[1080px] flex-col gap-4 pb-6 pt-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-2">
              <h2 class="text-16-medium text-text-strong">{language.t("settings.agents.title")}</h2>
              <p class="text-13-regular text-text-weak">{language.t("settings.agents.description")}</p>
            </div>

            <Button
              variant="secondary"
              size="small"
              icon="sliders"
              disabled={!directory()}
              onClick={() => {
                dialog.show(() => <DialogManageAgents directory={directory()} initialSelected={selectedName()} />)
              }}
            >
              {language.t("settings.agents.manage.open")}
            </Button>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard label={language.t("settings.agents.summary.main")} value={mainAgents().length} />
            <SummaryCard label={language.t("settings.agents.summary.specialists")} value={specialistAgents().length} />
            <SummaryCard label={language.t("settings.agents.summary.hidden")} value={hiddenAgents().length} />
          </div>
        </div>
      </div>

      <div class="flex max-w-[1080px] flex-col gap-8">
        <Show
          when={!loading()}
          fallback={<div class="py-8 text-14-regular text-text-weak">{language.t("common.loading")}</div>}
        >
          <Show
            when={directory()}
            fallback={
              <div class="rounded-lg bg-surface-base px-4 py-8 text-center">
                <div class="mx-auto flex size-10 items-center justify-center rounded-full bg-surface-hover">
                  <Icon name="brain" class="text-icon-weak-base" />
                </div>
                <h3 class="mt-4 text-14-medium text-text-strong">
                  {language.t("settings.agents.workspace.empty.title")}
                </h3>
                <p class="mx-auto mt-2 max-w-[480px] text-13-regular text-text-weak">
                  {language.t("settings.agents.workspace.empty.description")}
                </p>
              </div>
            }
          >
            <div class="flex flex-col gap-6 xl:flex-row xl:items-start">
              <div class="flex w-full min-w-0 flex-col gap-6 xl:w-[360px] xl:flex-shrink-0">
                <AgentListSection
                  title={language.t("settings.agents.section.main.title")}
                  description={language.t("settings.agents.section.main.description")}
                  empty={language.t("settings.agents.empty.main")}
                  agents={mainAgents()}
                  selected={selectedName()}
                  onSelect={setSelectedName}
                />

                <AgentListSection
                  title={language.t("settings.agents.section.specialists.title")}
                  description={language.t("settings.agents.section.specialists.description")}
                  empty={language.t("settings.agents.empty.specialists")}
                  agents={specialistAgents()}
                  selected={selectedName()}
                  onSelect={setSelectedName}
                />

                <AgentListSection
                  title={language.t("settings.agents.section.hidden.title")}
                  description={language.t("settings.agents.section.hidden.description")}
                  empty={language.t("settings.agents.empty.hidden")}
                  agents={hiddenAgents()}
                  selected={selectedName()}
                  onSelect={setSelectedName}
                />
              </div>

              <div class="flex min-w-0 flex-1 flex-col gap-4">
                <Show
                  when={selectedAgent()}
                  fallback={
                    <div class="rounded-lg bg-surface-base px-4 py-8 text-center">
                      <div class="mx-auto flex size-10 items-center justify-center rounded-full bg-surface-hover">
                        <Icon name="sliders" class="text-icon-weak-base" />
                      </div>
                      <h3 class="mt-4 text-14-medium text-text-strong">
                        {language.t("settings.agents.detail.empty.title")}
                      </h3>
                      <p class="mx-auto mt-2 max-w-[480px] text-13-regular text-text-weak">
                        {language.t("settings.agents.detail.empty.description")}
                      </p>
                    </div>
                  }
                >
                  {(agent) => (
                    <>
                      <div class="rounded-lg bg-surface-base px-4 py-4">
                        <div class="flex flex-col gap-3">
                          <div class="flex flex-wrap items-start justify-between gap-3">
                            <div class="flex min-w-0 flex-col gap-2">
                              <div class="flex flex-wrap items-center gap-2">
                                <h3 class="text-16-medium text-text-strong">{agent().name}</h3>
                                <Tag>{agent().sourceLabel}</Tag>
                                <Tag>{agent().surfaceLabel}</Tag>
                                <Tag>{modeLabel(agent().mode)}</Tag>
                              </div>
                              <Show when={agent().description}>
                                <p class="text-13-regular text-text-weak">{agent().description}</p>
                              </Show>
                            </div>
                          </div>

                          <div class="rounded-md border border-border-weak-base bg-surface-hover px-3 py-3">
                            <div class="text-12-medium text-text-strong">
                              {language.t("settings.agents.detail.preview.title")}
                            </div>
                            <div class="mt-1 text-12-regular text-text-weak">
                              {language.t("settings.agents.detail.preview.description")}
                            </div>
                          </div>
                        </div>
                      </div>

                      <DetailSection title={language.t("settings.agents.detail.section.identity")}>
                        <DetailItem label={language.t("settings.agents.detail.row.name")} value={agent().name} />
                        <DetailItem
                          label={language.t("settings.agents.detail.row.description")}
                          value={agent().description ?? language.t("common.unknown")}
                        />
                        <DetailItem
                          label={language.t("settings.agents.detail.row.source")}
                          value={agent().sourceLabel}
                        />
                        <DetailItem
                          label={language.t("settings.agents.detail.row.surface")}
                          value={agent().surfaceLabel}
                        />
                      </DetailSection>

                      <DetailSection title={language.t("settings.agents.detail.section.model")}>
                        <DetailItem
                          label={language.t("settings.agents.detail.row.model")}
                          value={<code class="font-mono text-12-medium">{agent().modelLabel}</code>}
                        />
                        <DetailItem
                          label={language.t("settings.agents.detail.row.variant")}
                          value={agent().variantLabel}
                        />
                        <DetailItem label={language.t("settings.agents.detail.row.steps")} value={agent().stepsLabel} />
                        <DetailItem
                          label={language.t("settings.agents.detail.row.invocation")}
                          value={modeLabel(agent().mode)}
                        />
                      </DetailSection>

                      <DetailSection title={language.t("settings.agents.detail.section.orchestration")}>
                        <DetailItem
                          label={language.t("settings.agents.detail.row.autoPlan")}
                          value={agent().autoPlanLabel}
                        />
                        <DetailItem
                          label={language.t("settings.agents.detail.row.directSelection")}
                          value={agent().directSelectionLabel}
                        />
                        <DetailItem
                          label={language.t("settings.agents.detail.row.tools")}
                          value={agent().toolProfileLabel}
                        />
                        <DetailItem
                          label={language.t("settings.agents.detail.row.memory")}
                          value={agent().memoryProfileLabel}
                        />
                      </DetailSection>
                    </>
                  )}
                </Show>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
