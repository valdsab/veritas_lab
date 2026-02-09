
# Veritas Lab

**One truth. Every tool. Zero drift.**

<img width="676" height="667" alt="Veritas Lab Home" src="https://github.com/user-attachments/assets/d087e71c-f408-44ee-86cb-46d46a7d1772" />

<img width="671" height="599" alt="VeritasLab Forward" src="https://github.com/user-attachments/assets/93d34928-0b42-430f-be28-5156806144db" />



---

## Why "Veritas Lab"

*Veritas* is Latin for **truth**. In science, the lab is where raw inputs are refined into something precise and repeatable. That's exactly what this tool does.

Before Veritas Lab, setting up an AI-assisted development environment meant maintaining separate configuration files for each tool — one format for Cursor, another for Copilot, another for Claude Code, another for Aider — each with its own syntax, conventions, and quirks. Your project's "truth" (the coding standards, the architecture, the rules your team agreed on) got scattered across a dozen files that inevitably drifted out of sync.

Veritas Lab eliminates that drift. You define your project once — its stack, its standards, its structure — and the tool generates native configuration files for every AI coding tool you use. One source of truth, refracted into every format that matters.

The seal logo is deliberate: part university emblem (truth as a discipline), part laboratory instrument (precision as a practice). A flask with a terminal prompt at its center — science meets software.

---

## The Problem

Starting a new project with AI coding tools shouldn't take half a day.

If you're serious about code quality, you want your AI assistants to understand your project's conventions before they write a single line. That means configuring rules, skills, agent personas, MCP servers, commit conventions, linter settings, CI workflows, and documentation scaffolds. Multiply that setup across every tool your team uses — Claude Code, Cursor, Windsurf, Copilot, Cline, Roo Code, Aider — and you're looking at hours of boilerplate before any real work begins.

Worse, those configurations are siloed. The security rules you wrote for Cursor don't carry over to Copilot. The agent personas you designed for Claude Code don't exist in Roo Code. The `.editorconfig` doesn't match the linter settings. The CI workflow tests things the Makefile doesn't cover. Nothing talks to each other.

## The Solution

Veritas Lab is a single-page React application that generates your entire AI coding environment from one wizard. You fill out what matters — your stack, your standards, your team's conventions — and it produces every configuration file, in every tool's native format, all consistent with each other.

One session produces: the AI tool configs, the linter settings, the CI pipeline, the Makefile, the editor config, the git attributes, the project documentation, and optionally the global configs that apply across all your projects. Everything aligned. Everything from the same source.

**Without an API key**, it's a deterministic template engine with thousands of lines of pre-written, battle-tested content. Fast, offline, zero dependencies.

**With an API key**, it uses AI to analyze your project description and rewrite every tool's main configuration with project-specific conventions, pitfalls, and architectural guidance — all 8 targets enhanced in parallel.

---

## What It Generates

### AI Tool Configurations (8 Export Targets)

Every target produces files in that tool's native format. Select any combination — at least one.

| Target | Files Generated | Format |
|---|---|---|
| **Claude Code** | `CLAUDE.md`, `.claude/settings.json`, `.claude/rules/*.md`, `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`, `.claude/contexts/*.md`, `.mcp.json`, hook scripts | Full environment with 18 tools, 3-tier permissions, memory persistence |
| **Cursor** | `.cursorrules`, `.cursor/rules/*.mdc` | MDC frontmatter with `description`, `globs`, `alwaysApply` |
| **Windsurf** | `.windsurfrules`, `.windsurf/rules/*.md` | NEVER/ALWAYS sections, Cascade behavior guidelines |
| **GitHub Copilot** | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/agents/*.md` | `applyTo` scoping, rich agent personas |
| **Cline** | `.clinerules/*.md` | Numbered rule files with workflow sections |
| **Roo Code** | `.roo/rules/*.md`, `.roo/rules-code/*`, `.roomodes` | 5 custom modes (Code, Architect, Ask, Review, Debug) |
| **AGENTS.md** | `AGENTS.md` | Universal standard — works with Copilot, Codex, Windsurf, Roo |
| **Aider** | `CONVENTIONS.md`, `.aider.conf.yml` | Full YAML config with auto-commit and lint-cmd |

### Universal Files (Always Generated)

These ensure your editor, linter, CI, and build system all agree with each other.

| File | Purpose |
|---|---|
| `.editorconfig` | Consistent formatting across editors (language-aware indent/tab settings) |
| `.gitattributes` | Line ending normalization, diff drivers per language |
| `.vscode/settings.json` | Editor settings, formatter associations, language-specific config |
| `.vscode/extensions.json` | Recommended extensions matching your stack |
| `.github/workflows/ci.yml` | Multi-language CI with matrix builds |
| `Makefile` | `make lint`, `make test`, `make format`, `make check` per language |
| Linter configs | `.eslintrc.json` + `.prettierrc` (JS/TS), `ruff.toml` + `pyproject.toml` (Python), `rustfmt.toml` + `clippy.toml` (Rust), `.golangci.yml` (Go) |

### Project Documents (11 Templates)

Toggleable scaffolds so your documentation is born alongside your code, not bolted on later.

| Document | What You Get |
|---|---|
| `README.md` | Quick start, tech stack, project structure, dev commands — adapted to your framework |
| `docs/PRD.md` | Product Requirements Document with goals, user stories, technical requirements, success metrics |
| `CONTRIBUTING.md` | PR process, code standards per language, commit convention, branch strategy |
| `.env.example` | Environment variables with descriptions — includes the right DB URLs for your selected databases |
| `SECURITY.md` | Vulnerability reporting, response timeline, security practices |
| `CHANGELOG.md` | Keep a Changelog format with Semantic Versioning |
| `docs/ARCHITECTURE.md` | System diagram, Architecture Decision Records (ADR), data flow, scaling strategy |
| `docs/API.md` | Base URL, auth, endpoints, error responses, rate limits |
| `docker-compose.yml` | App + database services (PostgreSQL, Redis, MongoDB — conditional on your stack) |
| `Taskfile.yml` | Modern Makefile alternative via taskfile.dev |
| `INSTRUCTIONS.md` | Custom AI instructions shared across all tools |

All documents adapt to your selected languages, frameworks, databases, and conventions.

### Global Configs (Per-Target)

When enabled, generates home-directory configs that apply across all your projects — one per active target.

| Target | Global Config Path |
|---|---|
| Claude Code | `~/.claude/CLAUDE.md` + `~/.claude/settings.json` |
| Cursor | `~/.cursor/rules/global.mdc` (with `alwaysApply` frontmatter) |
| Windsurf | `~/.windsurf/rules/global.md` |
| Copilot | `~/.github/copilot-instructions.md` |
| Cline | `~/.cline/rules/global.md` |
| Roo Code | `~/.roo/rules/global.md` |
| Aider | `~/.aider.conf.yml` |

Only generates globals for your active targets — no orphan files.

---

## LLM Providers (10)

For AI-enhanced generation (auto-detect + config rewrite), connect any provider:

| Provider | Default Model | Format |
|---|---|---|
| 🟠 Anthropic | claude-sonnet-4-5 | Native |
| 🟢 OpenAI | gpt-4o | OpenAI |
| 🔀 OpenRouter | claude-sonnet-4-5 | OpenAI |
| 🔵 Google AI | gemini-2.5-flash | OpenAI |
| 🦙 Ollama (local) | llama3.1 | OpenAI |
| 🤝 Together AI | meta-llama/Llama-3.3-70B | OpenAI |
| ⚡ Groq | llama-3.3-70b-versatile | OpenAI |
| 🌙 Kimi (Moonshot) | kimi-k2-0711-preview | OpenAI |
| 🤗 Hugging Face | Qwen2.5-Coder-32B | OpenAI |
| 🔧 Custom Endpoint | User-defined | OpenAI |

API keys are stored in `localStorage` only and sent directly to the provider's endpoint.

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/veritas-lab.git
cd veritas-lab
npm install
npm run dev
```

Open `http://localhost:5173` — that's it.

**Alternatively**, paste `universal-ai-coding-generator.jsx` directly into a Claude.ai artifact to run it without any local setup.

---

## Usage

1. **Open the app** — paste the JSX into a Claude.ai artifact, or run locally with Vite/Next.js
2. **Select export targets** on the landing screen (any combination of the 8 tools)
3. **Choose your mode**:
   - **Forward** — new project: fill the wizard from scratch or pick a preset
   - **Reverse** — retrofit: paste a GitHub URL or repo structure for gap analysis
4. **Configure** — project name, stack, rules, skills, agents, MCP servers, project docs
5. **Generate** — all files appear in a file browser organized by target
6. **Download** — combined `setup.sh`, per-target scripts, or copy individual files

### Quick Presets

The landing screen offers one-click combos:

- **VS Code Stack**: Claude Code + Copilot + Cursor
- **Open Source**: Claude Code + AGENTS.md + Copilot
- **Full Coverage**: All 8 targets
- **Terminal First**: Claude Code + Aider + AGENTS.md

---

## Architecture

```
User Input → buildCfg() → generateForTargets(cfg, targets)
                              ├── claude-code adapter  → CLAUDE.md, .claude/*, .mcp.json
                              ├── cursor adapter       → .cursorrules, .cursor/rules/*.mdc
                              ├── windsurf adapter     → .windsurfrules, .windsurf/rules/*.md
                              ├── copilot adapter      → .github/copilot-instructions.md, agents
                              ├── cline adapter        → .clinerules/*.md
                              ├── roo-code adapter     → .roo/rules/*.md, .roomodes
                              ├── agents-md adapter    → AGENTS.md
                              ├── aider adapter        → CONVENTIONS.md, .aider.conf.yml
                              ├── universal generators → CI, linters, Makefile, editorconfig
                              ├── project doc generator→ README, PRD, CONTRIBUTING, docker-compose, ...
                              └── global config gen    → ~/.<tool>/rules/global.* (per active target)
```

**Multi-target system**: Shared content generators produce tool-agnostic markdown. Per-target adapters wrap that content in each tool's native format — MDC frontmatter for Cursor, YAML for Aider, numbered files for Cline, `applyTo` scoping for Copilot, mode-specific rules for Roo Code.

**AI enhancement is optional and additive**. Without an API key, the template engine produces thousands of lines of deterministic, pre-written content. With an API key, two optional AI calls (auto-detect + parallel config rewrite across all targets) layer project-specific intelligence on top. Falls back to templates on any error.

---

## Stats

- **~6,000 lines** — single-file React component
- **8 export targets** with native format support
- **10 LLM providers** for AI-enhanced generation
- **11 project document** templates
- **18 Claude Code tools** configured
- **12 hook events** across 3 types (command, prompt, agent)
- **15+ MCP server** presets
- **5 Roo Code modes** with YAML definitions
- **6 Copilot agents** with rich personas
- **Memory persistence** with Aha Cards, recommendations, and backporting
- **Reverse mode** with GitHub URL import and gap analysis
- **Global configs** for 7 tools from one toggle
- **Per-target downloads** in the file browser
- **Config export/import** for sharing setups across teams

At max configuration (all 8 targets, all docs, global scope, 4 languages), Veritas Lab generates **134 files totaling 123 KB** — all from a single wizard session.

---

## Contributing

PRs welcome. Key areas for contribution:

- Mobile responsive breakpoints
- Component decomposition (single-file monolith → modular)
- TypeScript conversion
- Accessibility (ARIA labels, keyboard navigation)
- Test suite (currently validated via Node.js extraction)
- Additional targets (Continue.dev, Zed, JetBrains AI)
- Additional project doc templates
- i18n / localization

---

## License

MIT
