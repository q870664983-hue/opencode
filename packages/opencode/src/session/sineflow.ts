import fs from "fs/promises"
import path from "path"
import type { Agent } from "@/agent/agent"
import { Instance } from "@/project/instance"
import type { MessageV2 } from "./message-v2"

const SINEFLOW_DIRECTIVE = /<sineflow(?:\s+execution="(?<execution>[^"]+)")?\s*\/>/i
const LEGACY_LINES = new Set([
  "Automatic planning mode is enabled.",
  "When the task would benefit from it, first plan the work, orchestrate multiple specialized agents or subtasks, and use project memory and local tools.",
  "Keep the user-facing interaction concise and preserve the normal single-agent conversation flow unless the user explicitly asks for orchestration details.",
])
const MEMORY_CANDIDATES = [".sineflow/MEMORY.md", ".opencode/sineflow/MEMORY.md"]
const TOOLCHAIN_CANDIDATES = [".sineflow/TOOLCHAIN.md", ".opencode/sineflow/TOOLCHAIN.md"]
const MAX_CONTEXT_CHARS = 12_000
type MemoryMode = "inherit" | "project-shared" | "disabled"

type ParsedUserSystem = {
  enabled: boolean
  execution: "auto"
  cleaned?: string
}

async function readContextFile(candidates: string[]) {
  const locations = Array.from(
    new Set(
      candidates.flatMap((relative) => [
        path.join(Instance.directory, relative),
        path.join(Instance.worktree, relative),
      ]),
    ),
  )

  for (const filepath of locations) {
    const text = await fs.readFile(filepath, "utf8").catch(() => "")
    const trimmed = text.trim()
    if (!trimmed) continue

    const content =
      trimmed.length > MAX_CONTEXT_CHARS
        ? `${trimmed.slice(0, MAX_CONTEXT_CHARS)}\n\n[truncated to ${MAX_CONTEXT_CHARS} chars]`
        : trimmed

    return {
      filepath,
      content,
    }
  }
}

function memoryMode(agent: Agent.Info): MemoryMode {
  const sineflow = agent.options?.sineflow
  if (!sineflow || typeof sineflow !== "object") return "inherit"
  const value = (sineflow as Record<string, unknown>).memory
  if (value === "project-shared") return "project-shared"
  if (value === "disabled") return "disabled"
  return "inherit"
}

export namespace SineFlowPrompt {
  export function parseUserSystem(system?: string): ParsedUserSystem {
    if (!system?.trim()) {
      return {
        enabled: false,
        execution: "auto",
      }
    }

    const directive = system.match(SINEFLOW_DIRECTIVE)
    const legacy = Array.from(LEGACY_LINES).some((line) => system.includes(line))
    const enabled = !!directive || legacy

    const cleaned = system
      .replace(SINEFLOW_DIRECTIVE, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !LEGACY_LINES.has(line))
      .join("\n")

    return {
      enabled,
      execution: "auto",
      cleaned: cleaned || undefined,
    }
  }

  export async function system(input: {
    agent: Agent.Info
    user: MessageV2.User
  }) {
    if (input.agent.mode === "subagent") return []

    const parsed = parseUserSystem(input.user.system)
    if (!parsed.enabled) return []

    const prompts = [
      [
        "SineFlow execution mode is active.",
        "Operate as a lead engineer-orchestrator while preserving the normal single-agent chat experience.",
        "Execution policy:",
        "- Break complex goals into explicit work packets and use the task tool to delegate when doing so is meaningfully faster, safer, or clearer.",
        "- Prefer these specialists when delegation helps: system-architect, rtl-designer, verification-engineer, implementation-engineer, toolchain-engineer, documentation-engineer.",
        "- Use system-architect for decomposition, interfaces, dependency analysis, and role allocation.",
        "- Use rtl-designer for code-oriented implementation structure and interface shaping.",
        "- Use verification-engineer for tests, acceptance criteria, regressions, and failure analysis.",
        "- Use implementation-engineer for integration, performance, build fixes, and execution details.",
        "- Use toolchain-engineer for local commands, scripts, automation, and diagnostics through the bash tool.",
        "- Use documentation-engineer to record durable decisions, constraints, interfaces, and project memory updates.",
        "- Avoid delegating trivial work that is faster to complete directly.",
        "- After a specialist finishes, synthesize the result, identify the next unblocked task, and keep moving unless user input is actually required.",
        "- Prefer executable verification, repository facts, and local tool output over speculation.",
        "- If project memory exists, treat it as durable shared context and keep it aligned with important decisions.",
      ].join("\n"),
    ]

    const [memory, toolchain] = await Promise.all([
      memoryMode(input.agent) === "disabled" ? Promise.resolve(undefined) : readContextFile(MEMORY_CANDIDATES),
      readContextFile(TOOLCHAIN_CANDIDATES),
    ])

    if (memory) {
      prompts.push(`Project shared memory from: ${memory.filepath}\n${memory.content}`)
    }

    if (toolchain) {
      prompts.push(`Local toolchain notes from: ${toolchain.filepath}\n${toolchain.content}`)
    }

    return prompts
  }
}
