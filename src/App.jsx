import { useState, useCallback, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
//  COMPLETE CLAUDE CODE CONFIGURATION SCHEMA — EXHAUSTIVE TAXONOMY
//  Every configurable surface area Claude Code exposes, in one place.
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. BUILT-IN TOOLS (18) ──────────────────────────────────────────────
const TOOLS = {
  Read:         { cat: "File Ops",   perm: false, desc: "Read file contents",            patterns: ["Read", "Read(*.ext)", "Read(path/**)"] },
  Edit:         { cat: "File Ops",   perm: true,  desc: "Surgical line-level edits",     patterns: ["Edit", "Edit(*.ext)", "Edit(src/**)"] },
  MultiEdit:    { cat: "File Ops",   perm: true,  desc: "Batch edits across files",      patterns: ["MultiEdit", "MultiEdit(*.ext)"] },
  Write:        { cat: "File Ops",   perm: true,  desc: "Create/overwrite files",        patterns: ["Write", "Write(*.ext)", "Write(src/**)"] },
  Glob:         { cat: "Discovery",  perm: false, desc: "File pattern matching",         patterns: ["Glob"] },
  Grep:         { cat: "Discovery",  perm: false, desc: "Content search across files",   patterns: ["Grep"] },
  LS:           { cat: "Discovery",  perm: false, desc: "Directory listing",             patterns: ["LS"] },
  Bash:         { cat: "Execution",  perm: true,  desc: "Run shell commands",            patterns: ["Bash", "Bash(cmd *)", "Bash(npm run *)", "Bash(git *)"] },
  BashOutput:   { cat: "Execution",  perm: false, desc: "Read background process output",patterns: ["BashOutput"] },
  KillShell:    { cat: "Execution",  perm: false, desc: "Kill running processes",        patterns: ["KillShell"] },
  WebFetch:     { cat: "Web",        perm: true,  desc: "Fetch & parse web URLs",        patterns: ["WebFetch", "WebFetch(domain:*.com)"] },
  WebSearch:    { cat: "Web",        perm: true,  desc: "Search the internet",           patterns: ["WebSearch"] },
  NotebookRead: { cat: "Notebooks",  perm: false, desc: "Read Jupyter notebooks",        patterns: ["NotebookRead"] },
  NotebookEdit: { cat: "Notebooks",  perm: true,  desc: "Edit Jupyter notebook cells",   patterns: ["NotebookEdit", "NotebookEdit(*.ipynb)"] },
  TodoRead:     { cat: "Task Mgmt",  perm: false, desc: "Read session task list",        patterns: ["TodoRead"] },
  TodoWrite:    { cat: "Task Mgmt",  perm: false, desc: "Update session task list",      patterns: ["TodoWrite"] },
  Task:         { cat: "Agents",     perm: false, desc: "Launch sub-agents",             patterns: ["Task", "Task(agent:name)"] },
  ExitPlanMode: { cat: "Agents",     perm: false, desc: "Exit plan mode, begin execution",patterns: ["ExitPlanMode"] },
  SlashCommand: { cat: "Internal",   perm: false, desc: "Invoke slash commands",         patterns: ["SlashCommand"] },
};

// ── 2. ALL HOOK EVENTS (12) ─────────────────────────────────────────────
const HOOK_EVENTS = {
  PreToolUse:        { phase: "pre",    desc: "Before a tool runs — validate, gate, modify input",              matcher: true,  returnsDecision: true },
  PostToolUse:       { phase: "post",   desc: "After a tool succeeds — lint, format, log, notify",             matcher: true,  returnsDecision: false },
  PostToolUseFailure:{ phase: "post",   desc: "After a tool fails — retry, fallback, error handling",          matcher: true,  returnsDecision: false },
  Notification:      { phase: "notify", desc: "When Claude needs permission — custom approval flows",          matcher: false, returnsDecision: true },
  Stop:              { phase: "stop",   desc: "When Claude finishes responding — post-processing",             matcher: false, returnsDecision: false },
  SubagentStop:      { phase: "stop",   desc: "When a sub-agent completes its task",                           matcher: false, returnsDecision: false },
  SubagentStart:     { phase: "start",  desc: "When a sub-agent launches — setup context",                     matcher: false, returnsDecision: false },
  SessionStart:      { phase: "start",  desc: "Session begins — load context, restore state, inject env",      matcher: false, returnsDecision: false },
  SessionEnd:        { phase: "end",    desc: "Session ends — save state, cleanup, persist learnings",         matcher: false, returnsDecision: false },
  PreCompact:        { phase: "pre",    desc: "Before context compaction — save state to survive",             matcher: false, returnsDecision: false },
  UserPromptSubmit:  { phase: "pre",    desc: "Before processing user input — validate/augment prompts",       matcher: false, returnsDecision: true },
  PermissionRequest: { phase: "pre",    desc: "Permission dialog — auto-approve/deny programmatically",        matcher: true,  returnsDecision: true },
};

// ── 3. HOOK TYPES ───────────────────────────────────────────────────────
const HOOK_TYPES = {
  command: { desc: "Run a shell command", fields: ["command", "timeout", "once"] },
  prompt:  { desc: "LLM-based evaluation (send to Haiku for decision)", fields: ["prompt", "model", "timeout"] },
  agent:   { desc: "Run a full agent as a hook", fields: ["agent", "timeout", "once"] },
};

// ── 4. PERMISSION PATTERN FORMATS ───────────────────────────────────────
const PERM_PATTERNS = {
  file:      { examples: ["Read(*.ts)", "Edit(src/**)", "Write(tests/**)", "Read(.env*)"], desc: "File/glob pattern scoping" },
  bash:      { examples: ["Bash(git *)", "Bash(npm run *)", "Bash(docker *)"], desc: "Command prefix scoping" },
  web:       { examples: ["WebFetch(domain:github.com)", "WebFetch(domain:*.internal.com)"], desc: "Domain-scoped web access" },
  agent:     { examples: ["Task(agent:security-reviewer)", "Task(agent:*)"], desc: "Sub-agent-specific permissions" },
  notebook:  { examples: ["NotebookEdit(*.ipynb)", "NotebookEdit(research/**)"], desc: "Notebook-specific permissions" },
  mcp:       { examples: ["mcp__github__*", "mcp__*__read_*", "mcp__slack__write_*"], desc: "MCP tool permissions" },
};

// ── 5. SETTINGS.JSON COMPLETE FIELD CATALOG ─────────────────────────────
const SETTINGS_FIELDS = {
  // Core
  model: { type: "string", desc: "Default model", category: "core" },
  outputStyle: { type: "enum", values: ["concise","verbose","Explanatory","minimal",""], desc: "Response style", category: "core" },
  cleanupPeriodDays: { type: "number", desc: "Auto-cleanup old sessions", category: "core" },
  // Permissions
  "permissions.allow": { type: "array", desc: "Auto-approved tool patterns", category: "permissions" },
  "permissions.ask": { type: "array", desc: "Requires confirmation", category: "permissions" },
  "permissions.deny": { type: "array", desc: "Always blocked", category: "permissions" },
  "permissions.defaultMode": { type: "enum", values: ["default","acceptEdits","bypassPermissions"], desc: "Permission mode", category: "permissions" },
  "permissions.additionalDirectories": { type: "array", desc: "Extra dirs Claude can access", category: "permissions" },
  // Hooks
  hooks: { type: "object", desc: "Event-driven automation hooks", category: "hooks" },
  disableAllHooks: { type: "boolean", desc: "Emergency hook disable", category: "hooks" },
  // Sandbox
  "sandbox.enabled": { type: "boolean", desc: "Enable bash sandboxing", category: "sandbox" },
  "sandbox.autoAllowBashIfSandboxed": { type: "boolean", desc: "Skip bash permission if sandboxed", category: "sandbox" },
  "sandbox.excludedCommands": { type: "array", desc: "Commands excluded from sandbox", category: "sandbox" },
  "sandbox.network.allowUnixSockets": { type: "array", desc: "Allowed Unix sockets (e.g. Docker)", category: "sandbox" },
  "sandbox.network.allowLocalBinding": { type: "boolean", desc: "Allow localhost binding (macOS)", category: "sandbox" },
  "sandbox.network.httpProxyPort": { type: "number", desc: "Custom HTTP proxy port", category: "sandbox" },
  "sandbox.network.socksProxyPort": { type: "number", desc: "SOCKS5 proxy port", category: "sandbox" },
  "sandbox.enableWeakerNestedSandbox": { type: "boolean", desc: "For unprivileged Docker", category: "sandbox" },
  "sandbox.allowUnsandboxedCommands": { type: "boolean", desc: "Enterprise lockdown toggle", category: "sandbox" },
  // Attribution
  "attribution.commit": { type: "string", desc: "Custom git commit attribution template", category: "attribution" },
  "attribution.pr": { type: "string", desc: "Custom PR attribution template", category: "attribution" },
  includeCoAuthoredBy: { type: "boolean", desc: "Git commit co-author (deprecated → use attribution)", category: "attribution" },
  // Auth & Enterprise
  apiKeyHelper: { type: "string", desc: "Script to generate temp API keys", category: "enterprise" },
  forceLoginMethod: { type: "enum", values: ["claudeai","api-key","oauth"], desc: "Restrict login type", category: "enterprise" },
  forceLoginOrgUUID: { type: "string", desc: "Auto-select organization", category: "enterprise" },
  companyAnnouncements: { type: "array", desc: "Messages shown on startup", category: "enterprise" },
  // MCP
  enableAllProjectMcpServers: { type: "boolean", desc: "Auto-approve project MCP servers", category: "mcp" },
  enabledMcpjsonServers: { type: "array", desc: "Allowlist of MCP servers", category: "mcp" },
  disabledMcpjsonServers: { type: "array", desc: "Denylist of MCP servers", category: "mcp" },
  // UI/UX
  statusLine: { type: "object", desc: "Custom status bar display", category: "ui" },
  fileSuggestions: { type: "object", desc: "Custom @ autocomplete command", category: "ui" },
  // AWS
  awsAuthRefresh: { type: "string", desc: "AWS credential refresh script", category: "aws" },
  awsCredentialExport: { type: "string", desc: "AWS credential export script", category: "aws" },
  // Environment
  env: { type: "object", desc: "Environment variables injected into sessions", category: "env" },
};

// ── 6. SKILL.md FRONTMATTER FIELDS ──────────────────────────────────────
const SKILL_FIELDS = {
  name: "Skill identifier",
  description: "When to invoke this skill",
  "allowed-tools": "Tool whitelist [Read, Write, Bash]",
  context: "Execution context: fork | inline",
  "disable-model-invocation": "User-only (no auto-invoke)",
  "user-invocable": "Whether user can call via /skill-name",
  agent: "Built-in agent to run (Explore, etc.)",
  model: "Per-skill model override (opus, sonnet, haiku)",
  memory: "Memory persistence directory (user, project)",
  skills: "Inject other skills as context",
  hooks: "Per-skill hook configuration",
};

// ── 7. AGENT FRONTMATTER FIELDS ─────────────────────────────────────────
const AGENT_FIELDS = {
  name: "Agent display name",
  description: "When to delegate to this agent",
  tools: "Tool whitelist [Read, Grep, Bash]",
  model: "Model override (opus for complex/security)",
  permissionMode: "default | acceptEdits | bypassPermissions",
  memory: "Memory persistence (user, project)",
  skills: "Skills available to this agent",
  hooks: "Per-agent hook overrides",
};

// ── 8. RULES DIRECTORY CATALOG ──────────────────────────────────────────
const RULES_CATALOG = {
  "security":      { desc: "Mandatory security checks, no hardcoded secrets", priority: "critical" },
  "coding-style":  { desc: "Immutability, file size limits, DRY, naming", priority: "critical" },
  "testing":       { desc: "TDD requirements, coverage mandates", priority: "high" },
  "git-workflow":  { desc: "Conventional commits, PR process, branching", priority: "high" },
  "agents":        { desc: "When to delegate to subagents vs inline", priority: "medium" },
  "performance":   { desc: "Model selection heuristics (Sonnet 90%, Opus for complex)", priority: "medium" },
  "documentation": { desc: "Doc standards, JSDoc/docstrings, README requirements", priority: "medium" },
  "error-handling":{ desc: "Try-catch patterns, error boundaries, logging", priority: "high" },
  "architecture":  { desc: "SOLID, DDD, clean architecture principles", priority: "medium" },
  "accessibility": { desc: "WCAG 2.1 AA, ARIA, keyboard nav", priority: "medium" },
};

// ── 9. DYNAMIC CONTEXTS ─────────────────────────────────────────────────
const CONTEXT_CATALOG = {
  dev:      { desc: "Development mode — fast iteration, less formal", usage: "claude --append-system-prompt contexts/dev.md" },
  review:   { desc: "Code review mode — thorough, critical analysis", usage: "claude --append-system-prompt contexts/review.md" },
  research: { desc: "Research/exploration mode — broad search, documentation", usage: "claude --append-system-prompt contexts/research.md" },
  debug:    { desc: "Debugging mode — systematic root cause analysis", usage: "claude --append-system-prompt contexts/debug.md" },
  refactor: { desc: "Refactoring mode — safe transformations, preserve tests", usage: "claude --append-system-prompt contexts/refactor.md" },
  deploy:   { desc: "Deployment mode — cautious, checklist-driven", usage: "claude --append-system-prompt contexts/deploy.md" },
};

// ── 10. PLUGIN MANIFEST SCHEMA ──────────────────────────────────────────
const PLUGIN_FIELDS = {
  name: "Plugin identifier (kebab-case)",
  version: "Semver version string",
  description: "What this plugin does",
  author: "Author name or org",
  keywords: "Discovery tags for marketplace",
  skills: "Bundled skills",
  agents: "Bundled agents",
  hooks: "Bundled hooks",
  mcpServers: "Bundled MCP server configs",
};

// ── 11. CONFIGURATION FILE LOCATIONS ────────────────────────────────────
const FILE_LOCATIONS = {
  "CLAUDE.md":                  { scope: "project",  desc: "Project instructions (always loaded)", required: true },
  ".claude/settings.json":      { scope: "project",  desc: "Project settings, permissions, hooks", required: true },
  ".claude/settings.local.json":{ scope: "local",    desc: "Local overrides (gitignored)", required: false },
  ".mcp.json":                  { scope: "project",  desc: "MCP server configurations", required: false },
  ".claude/rules/*.md":         { scope: "project",  desc: "Always-loaded modular guidelines", required: true },
  ".claude/skills/*/SKILL.md":  { scope: "project",  desc: "On-demand skill definitions", required: true },
  ".claude/agents/*.md":        { scope: "project",  desc: "Sub-agent definitions", required: false },
  ".claude/commands/*.md":      { scope: "project",  desc: "Legacy slash commands (→ skills)", required: false },
  ".claude/contexts/*.md":      { scope: "project",  desc: "Dynamic system prompt contexts", required: false },
  ".claude/memory/":            { scope: "project",  desc: "Session persistence directory", required: false },
  ".claude/scripts/":           { scope: "project",  desc: "Hook and skill support scripts", required: false },
  ".claude-plugin/plugin.json": { scope: "plugin",   desc: "Plugin manifest for distribution", required: false },
  "~/.claude/CLAUDE.md":        { scope: "global",   desc: "Global instructions (all projects)", required: false },
  "~/.claude/settings.json":    { scope: "global",   desc: "Global settings and deny rules", required: false },
  "~/.claude/rules/*.md":       { scope: "global",   desc: "Global rules (all projects)", required: false },
};

// ── 12. STACK → TOOLCHAIN MAPPINGS ──────────────────────────────────────
const STACKS = {
  JavaScript: {
    linters: ["eslint"], formatters: ["prettier"], typeCheckers: [], testRunners: ["jest","vitest"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.js)", cmd:"npx prettier --write $CLAUDE_FILE && npx eslint --fix $CLAUDE_FILE" },
      { event:"PostToolUse", matcher:"Edit(*.js)",  cmd:"npx prettier --write $CLAUDE_FILE && npx eslint --fix $CLAUDE_FILE" },
    ],
    bashAllow: ["Bash(npm run *)","Bash(npx *)","Bash(yarn *)","Bash(pnpm *)","Bash(node *)"],
    bashAsk: ["Bash(npm publish *)"],
    extensions: ["esbenp.prettier-vscode","dbaeumer.vscode-eslint"],
    rules: { "coding-style": "- Prefer const over let, never var\n- Use arrow functions for callbacks\n- Destructure objects and arrays\n- Template literals over concatenation" },
  },
  TypeScript: {
    linters: ["eslint","@typescript-eslint"], formatters: ["prettier"], typeCheckers: ["tsc"], testRunners: ["vitest","jest"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.ts)",  cmd:"npx prettier --write $CLAUDE_FILE && npx eslint --fix $CLAUDE_FILE" },
      { event:"PostToolUse", matcher:"Write(*.tsx)", cmd:"npx prettier --write $CLAUDE_FILE && npx eslint --fix $CLAUDE_FILE" },
      { event:"PostToolUse", matcher:"Edit(*.ts)",   cmd:"npx prettier --write $CLAUDE_FILE && npx eslint --fix $CLAUDE_FILE" },
      { event:"PostToolUse", matcher:"Edit(*.tsx)",  cmd:"npx prettier --write $CLAUDE_FILE && npx eslint --fix $CLAUDE_FILE" },
      { event:"Stop", matcher:null, cmd:"npx tsc --noEmit --pretty 2>&1 | tail -5" },
    ],
    bashAllow: ["Bash(npm run *)","Bash(npx *)","Bash(yarn *)","Bash(pnpm *)","Bash(tsc *)"],
    bashAsk: ["Bash(npm publish *)"],
    extensions: ["esbenp.prettier-vscode","dbaeumer.vscode-eslint"],
    rules: { "coding-style": "- Strict TypeScript: no any, no ts-ignore\n- Interface over type for object shapes\n- Exhaustive switch with never\n- Zod for runtime validation at boundaries\n- Branded types for domain identifiers" },
  },
  Python: {
    linters: ["ruff"], formatters: ["black","isort"], typeCheckers: ["mypy"], testRunners: ["pytest"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.py)", cmd:"python -m black $CLAUDE_FILE && python -m isort $CLAUDE_FILE && python -m ruff check --fix $CLAUDE_FILE" },
      { event:"PostToolUse", matcher:"Edit(*.py)",  cmd:"python -m black $CLAUDE_FILE && python -m ruff check --fix $CLAUDE_FILE" },
      { event:"Stop", matcher:null, cmd:"python -m mypy --ignore-missing-imports . 2>&1 | tail -5" },
    ],
    bashAllow: ["Bash(pip install *)","Bash(python *)","Bash(pytest *)","Bash(uv *)","Bash(poetry *)","Bash(ruff *)"],
    bashAsk: ["Bash(pip install --break-system-packages *)"],
    extensions: ["ms-python.python","charliermarsh.ruff","ms-python.mypy-type-checker"],
    rules: { "coding-style": "- Type hints on all functions\n- Pydantic for data validation\n- Dataclasses for value objects\n- Context managers for resources\n- List comprehensions over map/filter" },
  },
  Rust: {
    linters: ["clippy"], formatters: ["rustfmt"], typeCheckers: ["cargo check"], testRunners: ["cargo test"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.rs)", cmd:"rustfmt $CLAUDE_FILE && cargo clippy --fix --allow-dirty -- -W warnings 2>&1 | head -20" },
      { event:"PostToolUse", matcher:"Edit(*.rs)",  cmd:"rustfmt $CLAUDE_FILE" },
      { event:"Stop", matcher:null, cmd:"cargo check 2>&1 | tail -10" },
    ],
    bashAllow: ["Bash(cargo *)"],
    bashAsk: ["Bash(cargo publish *)"],
    extensions: ["rust-lang.rust-analyzer"],
    rules: { "coding-style": "- Prefer &str over String in function args\n- Use Result<T, E> for fallible operations\n- Derive Debug, Clone, PartialEq on structs\n- Lifetime annotations only when needed\n- No unwrap() outside tests" },
  },
  Go: {
    linters: ["golangci-lint"], formatters: ["gofmt","goimports"], typeCheckers: ["go vet"], testRunners: ["go test"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.go)", cmd:"gofmt -w $CLAUDE_FILE && goimports -w $CLAUDE_FILE" },
      { event:"PostToolUse", matcher:"Edit(*.go)",  cmd:"gofmt -w $CLAUDE_FILE" },
      { event:"Stop", matcher:null, cmd:"go vet ./... 2>&1 | tail -10" },
    ],
    bashAllow: ["Bash(go *)"],
    bashAsk: [],
    extensions: ["golang.go"],
    rules: { "coding-style": "- Accept interfaces, return structs\n- Errors are values — handle explicitly\n- Package names: short, lowercase, no underscores\n- Table-driven tests\n- Context propagation for cancellation" },
  },
  Java: {
    linters: ["checkstyle"], formatters: ["google-java-format"], typeCheckers: [], testRunners: ["mvn test","gradle test"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.java)", cmd:"google-java-format --replace $CLAUDE_FILE 2>/dev/null || true" },
    ],
    bashAllow: ["Bash(mvn *)","Bash(gradle *)","Bash(java *)"],
    bashAsk: ["Bash(mvn deploy *)"],
    extensions: ["vscjava.vscode-java-pack"],
    rules: { "coding-style": "- Immutable classes by default (final fields)\n- Builder pattern for complex constructors\n- Optional<T> over null returns\n- Stream API for collections\n- Records for data carriers (Java 16+)" },
  },
  "C#": {
    linters: ["dotnet-format"], formatters: ["dotnet-format"], typeCheckers: ["dotnet build"], testRunners: ["dotnet test"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.cs)", cmd:"dotnet format --include $CLAUDE_FILE 2>/dev/null || true" },
    ],
    bashAllow: ["Bash(dotnet *)"],
    bashAsk: ["Bash(dotnet publish *)"],
    extensions: ["ms-dotnettools.csharp","ms-dotnettools.csdevkit"],
    rules: { "coding-style": "- Nullable reference types enabled\n- Records for DTOs\n- async/await throughout\n- Pattern matching in switch\n- IOptions<T> for configuration" },
  },
  Ruby: {
    linters: ["rubocop"], formatters: ["rubocop -a"], typeCheckers: [], testRunners: ["rspec"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.rb)", cmd:"rubocop -a $CLAUDE_FILE 2>/dev/null || true" },
    ],
    bashAllow: ["Bash(bundle *)","Bash(rails *)","Bash(rake *)","Bash(ruby *)"],
    bashAsk: ["Bash(rails db:migrate *)"],
    extensions: ["Shopify.ruby-lsp"],
    rules: { "coding-style": "- Freeze string literals\n- Keyword arguments over positional\n- Guard clauses over nested ifs\n- Service objects for business logic\n- Concern modules for shared behavior" },
  },
  PHP: {
    linters: ["phpstan"], formatters: ["php-cs-fixer"], typeCheckers: ["phpstan"], testRunners: ["phpunit","pest"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.php)", cmd:"php-cs-fixer fix $CLAUDE_FILE 2>/dev/null || true" },
    ],
    bashAllow: ["Bash(composer *)","Bash(php *)","Bash(artisan *)"],
    bashAsk: [],
    extensions: ["bmewburn.vscode-intelephense-client"],
    rules: { "coding-style": "- Strict types declaration\n- Return type declarations\n- Named arguments for clarity\n- Enums over constants\n- Readonly properties (PHP 8.2+)" },
  },
  Swift: {
    linters: ["swiftlint"], formatters: ["swift-format"], typeCheckers: [], testRunners: ["swift test","XCTest"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.swift)", cmd:"swiftlint --fix $CLAUDE_FILE 2>/dev/null; swift-format -i $CLAUDE_FILE 2>/dev/null || true" },
    ],
    bashAllow: ["Bash(swift *)","Bash(xcodebuild *)"],
    bashAsk: [],
    extensions: ["sswg.swift-lang"],
    rules: { "coding-style": "- Protocol-oriented design\n- Value types (structs) over classes\n- Guard let for early returns\n- Result type for async errors\n- SwiftUI previews for UI components" },
  },
  Kotlin: {
    linters: ["ktlint","detekt"], formatters: ["ktlint -F"], typeCheckers: [], testRunners: ["gradle test"],
    hooks: [
      { event:"PostToolUse", matcher:"Write(*.kt)", cmd:"ktlint -F $CLAUDE_FILE 2>/dev/null || true" },
    ],
    bashAllow: ["Bash(gradle *)","Bash(kotlin *)"],
    bashAsk: [],
    extensions: ["fwcd.kotlin"],
    rules: { "coding-style": "- Data classes for value objects\n- Sealed classes for state machines\n- Extension functions over utility classes\n- Coroutines for async\n- Null safety — no !! operator" },
  },
};

const FW_HOOKS = {
  "Next.js":  [{ event:"PostToolUse", matcher:"Write(next.config.*)", cmd:"npm run build 2>&1 | tail -5" }],
  Django:     [{ event:"PostToolUse", matcher:"Write(*/models.py)",   cmd:"python manage.py makemigrations --check 2>&1 || true" }],
  Rails:      [{ event:"PostToolUse", matcher:"Write(*/migration*.rb)", cmd:"rails db:migrate:status 2>&1 || true" }],
  Laravel:    [{ event:"PostToolUse", matcher:"Write(*/migrations/*.php)", cmd:"php artisan migrate:status 2>&1 || true" }],
  NestJS:     [{ event:"PostToolUse", matcher:"Write(*.module.ts)",   cmd:"npx tsc --noEmit 2>&1 | head -10" }],
  FastAPI:    [{ event:"PostToolUse", matcher:"Write(*/routes/*.py)", cmd:"python -m mypy $CLAUDE_FILE --ignore-missing-imports 2>&1 | head -5" }],
};

const PROJECT_AGENTS = {
  "web-app":   ["code-reviewer","test-writer","performance-auditor","accessibility-checker","security-scanner"],
  api:         ["code-reviewer","test-writer","api-designer","security-scanner","load-tester"],
  fullstack:   ["code-reviewer","test-writer","api-designer","performance-auditor","security-scanner","db-migration-mgr"],
  mobile:      ["code-reviewer","test-writer","ux-reviewer","performance-auditor"],
  cli:         ["code-reviewer","test-writer","documentation-writer"],
  library:     ["code-reviewer","test-writer","documentation-writer","api-designer","semver-checker"],
  monorepo:    ["code-reviewer","test-writer","dependency-manager","change-detector"],
  saas:        ["code-reviewer","test-writer","security-scanner","performance-auditor","db-migration-mgr","api-designer"],
  "ai-ml":     ["code-reviewer","test-writer","data-validator","model-evaluator","documentation-writer"],
  infra:       ["code-reviewer","test-writer","security-scanner","documentation-writer"],
};

const MCP_CATALOG = {
  github:      { name:"GitHub",       cmd:"npx", args:["-y","@modelcontextprotocol/server-github"],      env:{ GITHUB_PERSONAL_ACCESS_TOKEN:"${input:github_token}" } },
  filesystem:  { name:"Filesystem",   cmd:"npx", args:["-y","@modelcontextprotocol/server-filesystem","."] },
  memory:      { name:"Memory",       cmd:"npx", args:["-y","@modelcontextprotocol/server-memory"] },
  postgres:    { name:"PostgreSQL",   cmd:"npx", args:["-y","@modelcontextprotocol/server-postgres"],    env:{ DATABASE_URL:"${input:db_url}" } },
  context7:    { name:"Context7",     cmd:"npx", args:["-y","@upstash/context7-mcp@latest"] },
  sentry:      { name:"Sentry",       cmd:"npx", args:["-y","@sentry/mcp-server"],                      env:{ SENTRY_AUTH_TOKEN:"${input:sentry_token}" } },
  browsertools:{ name:"Browser Tools",cmd:"npx", args:["-y","@anthropic-ai/mcp-server-browsertools"] },
  docker:      { name:"Docker",       cmd:"npx", args:["-y","@modelcontextprotocol/server-docker"] },
  linear:      { name:"Linear",       cmd:"npx", args:["-y","@linear/mcp-server"],                      env:{ LINEAR_API_KEY:"${input:linear_key}" } },
  notion:      { name:"Notion",       cmd:"npx", args:["-y","@notionhq/mcp-server"],                    env:{ NOTION_TOKEN:"${input:notion_token}" } },
  slack:       { name:"Slack",        cmd:"npx", args:["-y","@anthropic-ai/mcp-server-slack"],           env:{ SLACK_TOKEN:"${input:slack_token}" } },
  supabase:    { name:"Supabase",     cmd:"npx", args:["-y","@supabase/mcp-server"],                    env:{ SUPABASE_URL:"${input:supabase_url}", SUPABASE_KEY:"${input:supabase_key}" } },
  gitlab:      { name:"GitLab",       cmd:"npx", args:["-y","@modelcontextprotocol/server-gitlab"],      env:{ GITLAB_TOKEN:"${input:gitlab_token}" } },
  puppeteer:   { name:"Puppeteer",    cmd:"npx", args:["-y","@anthropic-ai/mcp-server-puppeteer"] },
  fetch:       { name:"Fetch",        cmd:"npx", args:["-y","@modelcontextprotocol/server-fetch"] },
  redis:       { name:"Redis",        cmd:"npx", args:["-y","@modelcontextprotocol/server-redis"],       env:{ REDIS_URL:"${input:redis_url}" } },
  vercel:      { name:"Vercel",       cmd:"npx", args:["-y","@vercel/mcp"],                              env:{ VERCEL_TOKEN:"${input:vercel_token}" } },
  railway:     { name:"Railway",      cmd:"npx", args:["-y","@railway/mcp-server"],                      env:{ RAILWAY_TOKEN:"${input:railway_token}" } },
};


// ═══════════════════════════════════════════════════════════════════════════
//  REVERSE MODE — REPO ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function analyzeRepo(input) {
  const t = (input || "").toLowerCase();
  const lines = input.split("\n").map(l => l.trim()).filter(Boolean);

  const found = {
    files: { claudeMd: false, settingsJson: false, settingsLocal: false, mcpJson: false, rules: [], skills: [], agents: [], commands: [], contexts: [], scripts: [], pluginJson: false, globalClaudeMd: false, globalSettings: false, memory: false },
    features: { hooks: { events: new Set(), types: new Set() }, permissions: { hasAllow: false, hasAsk: false, hasDeny: false, patterns: [] }, sandbox: { enabled: false, fields: new Set() }, mcp: { servers: [] }, settings: { fields: new Set() } },
    stack: { languages: new Set(), frameworks: new Set(), databases: new Set(), infra: new Set() },
  };

  // Detect files from tree output or direct mentions
  const filePatterns = {
    "claude.md": () => found.files.claudeMd = true,
    "settings.json": () => { if (t.includes(".claude/settings")) found.files.settingsJson = true; },
    "settings.local.json": () => found.files.settingsLocal = true,
    ".mcp.json": () => found.files.mcpJson = true,
    "plugin.json": () => found.files.pluginJson = true,
  };
  Object.entries(filePatterns).forEach(([pat, fn]) => { if (t.includes(pat)) fn(); });

  // Rules
  const ruleMatch = input.match(/\.claude\/rules\/([a-z-]+)\.md/gi);
  if (ruleMatch) found.files.rules = [...new Set(ruleMatch.map(m => m.split("/").pop().replace(".md","")))];

  // Skills (new format)
  const skillMatch = input.match(/\.claude\/skills\/([a-z-]+)\/SKILL\.md/gi);
  if (skillMatch) found.files.skills = [...new Set(skillMatch.map(m => { const parts = m.split("/"); return parts[parts.length-2]; }))];

  // Commands (old format)
  const cmdMatch = input.match(/\.claude\/commands\/([a-z-]+)\.md/gi);
  if (cmdMatch) found.files.commands = [...new Set(cmdMatch.map(m => m.split("/").pop().replace(".md","")))];

  // Agents
  const agentMatch = input.match(/\.claude\/agents\/([a-z-]+)\.md/gi);
  if (agentMatch) found.files.agents = [...new Set(agentMatch.map(m => m.split("/").pop().replace(".md","")))];

  // Contexts
  const ctxMatch = input.match(/\.claude\/contexts\/([a-z-]+)\.md/gi);
  if (ctxMatch) found.files.contexts = [...new Set(ctxMatch.map(m => m.split("/").pop().replace(".md","")))];

  // Scripts
  if (t.includes(".claude/scripts")) found.files.scripts = true;
  // Memory
  if (t.includes(".claude/memory")) found.files.memory = true;

  // Hook events
  Object.keys(HOOK_EVENTS).forEach(ev => { if (t.includes(ev.toLowerCase())) found.features.hooks.events.add(ev); });

  // Hook types
  if (t.includes('"type": "command"') || t.includes("type: command")) found.features.hooks.types.add("command");
  if (t.includes('"type": "prompt"') || t.includes("type: prompt")) found.features.hooks.types.add("prompt");
  if (t.includes('"type": "agent"') || t.includes("type: agent")) found.features.hooks.types.add("agent");

  // Permissions
  if (t.includes('"allow"') || t.includes("allow:")) found.features.permissions.hasAllow = true;
  if (t.includes('"ask"') || t.includes("ask:")) found.features.permissions.hasAsk = true;
  if (t.includes('"deny"') || t.includes("deny:")) found.features.permissions.hasDeny = true;

  // Sandbox
  if (t.includes("sandbox")) {
    found.features.sandbox.enabled = true;
    ["allowUnixSockets","allowLocalBinding","httpProxyPort","socksProxyPort","enableWeakerNestedSandbox","allowUnsandboxedCommands","autoAllowBashIfSandboxed","excludedCommands"].forEach(f => {
      if (t.includes(f.toLowerCase())) found.features.sandbox.fields.add(f);
    });
  }

  // MCP servers
  Object.keys(MCP_CATALOG).forEach(id => { if (t.includes(id)) found.features.mcp.servers.push(id); });

  // Stack detection
  Object.keys(STACKS).forEach(lang => { if (t.includes(lang.toLowerCase())) found.stack.languages.add(lang); });
  // Framework hints
  const fwMap = { "next.js":"Next.js", nextjs:"Next.js", react:"React", vue:"Vue", angular:"Angular", django:"Django", fastapi:"FastAPI", flask:"Flask", express:"Express", nestjs:"NestJS", rails:"Rails", laravel:"Laravel", "spring boot":"Spring Boot" };
  Object.entries(fwMap).forEach(([k,v]) => { if (t.includes(k)) found.stack.frameworks.add(v); });
  // DB hints
  const dbMap = { postgres:"PostgreSQL", mysql:"MySQL", mongo:"MongoDB", sqlite:"SQLite", redis:"Redis", supabase:"Supabase", prisma:"Prisma", drizzle:"Drizzle ORM" };
  Object.entries(dbMap).forEach(([k,v]) => { if (t.includes(k)) found.stack.databases.add(v); });
  // Infra hints
  const infraMap = { docker:"Docker", kubernetes:"Kubernetes", terraform:"Terraform", aws:"AWS", vercel:"Vercel", netlify:"Netlify", railway:"Railway" };
  Object.entries(infraMap).forEach(([k,v]) => { if (t.includes(k)) found.stack.infra.add(v); });

  // Settings fields detection
  Object.keys(SETTINGS_FIELDS).forEach(f => { if (t.includes(f.toLowerCase().replace(".", ""))) found.features.settings.fields.add(f); });

  return found;
}

function computeGaps(analysis) {
  const gaps = [];
  const scores = {};

  // File structure gaps
  if (!analysis.files.claudeMd) gaps.push({ cat:"files", sev:"critical", item:"CLAUDE.md", desc:"No project instructions file — Claude operates blind" });
  if (!analysis.files.settingsJson) gaps.push({ cat:"files", sev:"critical", item:".claude/settings.json", desc:"No settings — no permissions, hooks, or model config" });
  if (!analysis.files.mcpJson) gaps.push({ cat:"files", sev:"medium", item:".mcp.json", desc:"No MCP servers configured" });
  if (analysis.files.rules.length === 0) gaps.push({ cat:"files", sev:"high", item:".claude/rules/", desc:"No rules directory — missing always-loaded guidelines" });
  if (analysis.files.skills.length === 0 && analysis.files.commands.length === 0) gaps.push({ cat:"files", sev:"high", item:".claude/skills/", desc:"No skills defined — Claude has no reusable workflows" });
  if (analysis.files.commands.length > 0 && analysis.files.skills.length === 0) gaps.push({ cat:"files", sev:"medium", item:"commands → skills", desc:"Using legacy commands/ format — migrate to skills/SKILL.md" });
  if (analysis.files.skills.length > 0 && !analysis.files.skills.includes("self-learning")) gaps.push({ cat:"files", sev:"medium", item:"self-learning skill", desc:"No self-learning skill — agent cannot autonomously research new technologies" });
  if (analysis.files.agents.length === 0) gaps.push({ cat:"files", sev:"medium", item:".claude/agents/", desc:"No sub-agents — all work runs inline (no delegation)" });
  if (analysis.files.contexts.length === 0) gaps.push({ cat:"files", sev:"low", item:".claude/contexts/", desc:"No dynamic contexts — missing mode-specific prompts" });
  if (!analysis.files.memory) gaps.push({ cat:"files", sev:"medium", item:".claude/memory/", desc:"No memory persistence — sessions start from scratch" });
  if (!analysis.files.pluginJson) gaps.push({ cat:"files", sev:"low", item:".claude-plugin/", desc:"No plugin manifest — not distributable" });

  // Hooks
  const hookEventCount = analysis.features.hooks.events.size;
  const totalHookEvents = Object.keys(HOOK_EVENTS).length;
  if (hookEventCount === 0) gaps.push({ cat:"hooks", sev:"critical", item:"No hooks", desc:"Zero automation — no auto-lint, format, or validation" });
  else if (hookEventCount < 5) gaps.push({ cat:"hooks", sev:"high", item:`${hookEventCount}/${totalHookEvents} hook events`, desc:`Missing: ${Object.keys(HOOK_EVENTS).filter(e => !analysis.features.hooks.events.has(e)).join(", ")}` });

  if (!analysis.features.hooks.types.has("prompt")) gaps.push({ cat:"hooks", sev:"medium", item:"No prompt hooks", desc:"Missing LLM-based evaluation hooks (type: prompt)" });
  if (!analysis.features.hooks.types.has("agent")) gaps.push({ cat:"hooks", sev:"low", item:"No agent hooks", desc:"Missing full-agent hooks (type: agent)" });

  // Session lifecycle
  if (!analysis.features.hooks.events.has("SessionStart")) gaps.push({ cat:"lifecycle", sev:"high", item:"SessionStart", desc:"No session initialization — state not restored" });
  if (!analysis.features.hooks.events.has("SessionEnd")) gaps.push({ cat:"lifecycle", sev:"high", item:"SessionEnd", desc:"No session teardown — state not persisted" });
  if (!analysis.features.hooks.events.has("PreCompact")) gaps.push({ cat:"lifecycle", sev:"medium", item:"PreCompact", desc:"No pre-compaction save — state lost on compact" });

  // Permissions
  if (!analysis.features.permissions.hasAllow && !analysis.features.permissions.hasDeny) gaps.push({ cat:"permissions", sev:"high", item:"No permissions", desc:"No permission rules — Claude asks about everything or nothing" });
  if (!analysis.features.permissions.hasDeny) gaps.push({ cat:"permissions", sev:"high", item:"No deny rules", desc:"Nothing explicitly blocked — secrets/prod configs accessible" });

  // Sandbox
  if (!analysis.features.sandbox.enabled) gaps.push({ cat:"sandbox", sev:"medium", item:"Sandbox disabled", desc:"Bash runs unsandboxed — no isolation" });

  // Rules gaps
  const criticalRules = ["security","coding-style","testing","git-workflow"];
  criticalRules.forEach(r => {
    if (!analysis.files.rules.includes(r)) gaps.push({ cat:"rules", sev:"high", item:`rules/${r}.md`, desc:RULES_CATALOG[r]?.desc || "Missing rule" });
  });

  // Compute coverage scores
  const maxFiles = Object.keys(FILE_LOCATIONS).length;
  const foundFileCount = [analysis.files.claudeMd, analysis.files.settingsJson, analysis.files.settingsLocal, analysis.files.mcpJson, analysis.files.pluginJson, analysis.files.rules.length > 0, analysis.files.skills.length > 0, analysis.files.agents.length > 0, analysis.files.contexts.length > 0, analysis.files.memory].filter(Boolean).length;
  scores.files = Math.round((foundFileCount / maxFiles) * 100);
  scores.hooks = Math.round((hookEventCount / totalHookEvents) * 100);
  scores.permissions = [analysis.features.permissions.hasAllow, analysis.features.permissions.hasAsk, analysis.features.permissions.hasDeny].filter(Boolean).length * 33;
  scores.sandbox = analysis.features.sandbox.enabled ? Math.max(25, Math.round((analysis.features.sandbox.fields.size / 8) * 100)) : 0;
  scores.mcp = Math.min(100, Math.round((analysis.features.mcp.servers.length / 5) * 100));
  scores.rules = Math.round((analysis.files.rules.length / Object.keys(RULES_CATALOG).length) * 100);
  scores.overall = Math.round((scores.files + scores.hooks + scores.permissions + scores.sandbox + scores.mcp + scores.rules) / 6);

  return { gaps, scores };
}


// ═══════════════════════════════════════════════════════════════════════════
//  FILE GENERATORS — V4 FORMAT (RULES, SKILLS, AGENTS, CONTEXTS, MEMORY)
// ═══════════════════════════════════════════════════════════════════════════

function buildHooks(languages, frameworks, includeLifecycle) {
  const hooks = {};
  languages.forEach(lang => {
    (STACKS[lang]?.hooks || []).forEach(h => {
      if (!hooks[h.event]) hooks[h.event] = [];
      if (!hooks[h.event].find(x => x.matcher === h.matcher))
        hooks[h.event].push({ matcher: h.matcher, hooks: [{ type:"command", command: h.cmd }] });
    });
  });
  frameworks.forEach(fw => {
    (FW_HOOKS[fw] || []).forEach(h => {
      if (!hooks[h.event]) hooks[h.event] = [];
      hooks[h.event].push({ matcher: h.matcher, hooks: [{ type:"command", command: h.cmd }] });
    });
  });
  if (includeLifecycle) {
    hooks.SessionStart = [{ hooks: [{ type:"command", command:"$CLAUDE_PROJECT_DIR/.claude/scripts/session-start.sh" }] }];
    hooks.SessionEnd = [{ hooks: [{ type:"command", command:"$CLAUDE_PROJECT_DIR/.claude/scripts/session-end.sh" }] }];
    hooks.PreCompact = [{ hooks: [{ type:"command", command:"$CLAUDE_PROJECT_DIR/.claude/scripts/pre-compact.sh" }] }];
  }
  return hooks;
}

function buildPermissions(cfg) {
  const allow = new Set(["Read","Edit","MultiEdit","Write","Glob","Grep","LS","Bash(git *)"]);
  const ask = new Set(["Bash(git push *)","Bash(rm -rf *)"]);
  const deny = new Set(["Read(.env)","Read(.env.*)","Read(secrets/**)","Write(production.config.*)"]);

  cfg.languages.forEach(l => {
    (STACKS[l]?.bashAllow || []).forEach(p => allow.add(p));
    (STACKS[l]?.bashAsk || []).forEach(p => ask.add(p));
  });
  if (cfg.webTools) { allow.add("WebFetch"); allow.add("WebSearch"); }
  if (cfg.notebooks) { allow.add("NotebookRead"); allow.add("NotebookEdit"); }
  allow.add("TodoRead"); allow.add("TodoWrite");
  if (cfg.infra.includes("Docker")) { allow.add("Bash(docker *)"); allow.add("Bash(docker-compose *)"); ask.add("Bash(docker rm *)"); }
  if (cfg.allowGhCli) allow.add("Bash(gh *)");
  cfg.mcpServers.forEach(m => allow.add(`mcp__${m}__*`));
  (cfg.customMcps || []).forEach(m => allow.add(`mcp__${m.id}__*`));
  (cfg.denyPatterns || []).forEach(p => deny.add(p));

  return { allow:[...allow], ask:[...ask], deny:[...deny] };
}

function genSettingsJson(cfg) {
  const s = { "$schema":"https://json.schemastore.org/claude-code-settings.json" };
  if (cfg.model) s.model = cfg.model;
  if (cfg.outputStyle) s.outputStyle = cfg.outputStyle;
  s.permissions = buildPermissions(cfg);
  if (cfg.defaultMode !== "default") s.permissions.defaultMode = cfg.defaultMode;
  if (cfg.additionalDirs) s.permissions.additionalDirectories = cfg.additionalDirs.split("\n").filter(Boolean);
  const hooks = buildHooks(cfg.languages, cfg.frameworks, cfg.memoryPersistence);
  if (Object.keys(hooks).length) s.hooks = hooks;
  if (cfg.sandbox) {
    s.sandbox = { enabled:true, autoAllowBashIfSandboxed:true };
    if (cfg.infra.includes("Docker")) s.sandbox.network = { allowUnixSockets:["/var/run/docker.sock"] };
  }
  if (cfg.statusLine) s.statusLine = { type:"command", command:'echo "$(git branch --show-current 2>/dev/null) | $(git log --oneline -1 2>/dev/null)"' };
  if (cfg.enableAllProjectMcpServers) s.enableAllProjectMcpServers = true;
  s.attribution = { commit:"Co-authored-by: Claude <noreply@anthropic.com>", pr:"Generated with Claude Code" };
  if (cfg.env) {
    s.env = {};
    cfg.env.split("\n").forEach(l => { const [k,...v] = l.split("="); if (k?.trim() && v.length) s.env[k.trim()] = v.join("=").trim(); });
  }
  return JSON.stringify(s, null, 2);
}

function genMcpJson(servers, customMcps) {
  const out = {};
  servers.forEach(id => {
    const c = MCP_CATALOG[id];
    if (!c) return;
    const entry = { command:c.cmd, args:c.args };
    if (c.env) entry.env = c.env;
    out[id] = entry;
  });
  // Custom MCP servers from repo URLs
  (customMcps || []).forEach(m => {
    if (m.transport === "sse") {
      out[m.id] = { url: m.url };
    } else {
      const entry = { command: m.cmd || "npx", args: m.args || ["-y", m.name] };
      out[m.id] = entry;
    }
  });
  return JSON.stringify({ servers:out }, null, 2);
}

function genRule(id, cfg) {
  const tech = cfg.languages.join(", ");
  const R = {
    security: `# Security Rules\n\n> Always loaded. These rules are non-negotiable.\n\n## Secrets\n- NEVER hardcode API keys, tokens, passwords, or connection strings\n- All credentials via environment variables or secret managers\n- Scan for secrets before every commit: \`grep -rn "API_KEY\\|SECRET\\|PASSWORD\\|TOKEN" --include="*.{${cfg.languages.map(l=>l==="TypeScript"?"ts,tsx":l==="JavaScript"?"js,jsx":l==="Python"?"py":l.toLowerCase()).join(",")}}" .\`\n\n## Input Validation\n- Validate and sanitize ALL user inputs at system boundaries\n- Use parameterized queries — never string interpolation for SQL/NoSQL\n- Validate file paths to prevent directory traversal\n\n## Authentication & Authorization\n- Check auth on every endpoint/handler\n- Principle of least privilege for all service accounts\n- Rate limit all public endpoints\n\n## Dependencies\n- Pin dependency versions\n- Audit before adding new dependencies\n- Never run \`curl | bash\` or equivalent\n\n## Sensitive Files — NEVER read or modify:\n- \`.env\`, \`.env.*\`\n- \`secrets/\`, \`credentials/\`\n- Private keys (\`*.pem\`, \`*.key\`)`,

    "coding-style": `# Coding Style Rules\n\n> Always loaded. Consistency across the codebase.\n\n## General\n- Functions: max 40 lines, max 4 parameters\n- Files: max 300 lines (split if larger)\n- Nesting: max 3 levels deep\n- DRY: extract if repeated 3+ times\n- Single Responsibility: one reason to change per unit\n\n## Naming\n- Variables/functions: descriptive, no abbreviations\n- Booleans: \`is\`, \`has\`, \`should\` prefix\n- Constants: UPPER_SNAKE_CASE\n- Types/Classes: PascalCase\n\n## Immutability\n- Prefer immutable data structures\n- Never mutate function arguments\n- Use spread/copy for state updates\n\n${cfg.languages.map(l => STACKS[l]?.rules?.["coding-style"] ? `## ${l}\n${STACKS[l].rules["coding-style"]}` : "").filter(Boolean).join("\n\n")}`,

    testing: `# Testing Rules\n\n> Always loaded. Quality gates.\n\n## Requirements\n- Every new feature: tests FIRST (TDD when possible)\n- Every bug fix: regression test that fails without the fix\n- Coverage target: 80% branch coverage minimum\n\n## Test Structure\n- One assertion per test (logical grouping OK)\n- Descriptive names as specifications: \`should_reject_negative_amounts\`\n- Arrange → Act → Assert pattern\n- Independent tests — no shared mutable state\n\n## Mocking\n- Mock at boundaries (HTTP, DB, filesystem, clock)\n- Never mock the unit under test\n- Prefer fakes over mocks when practical\n\n## Categories\n- Unit tests: fast, isolated, no I/O\n- Integration tests: real dependencies, slower\n- E2E tests: critical user journeys only`,

    "git-workflow": `# Git Workflow Rules\n\n> Always loaded. Consistent version control.\n\n## Branches\n- Pattern: \`${cfg.gitBranch || "feature/TICKET-description"}\`\n- Never commit directly to main/master\n- Delete branches after merge\n\n## Commits\n- Convention: ${cfg.commitConv || "conventional commits (feat:, fix:, chore:, docs:, refactor:, test:)"}\n- Atomic: one logical change per commit\n- Message format: \`type(scope): imperative description\`\n- Max 72 chars in subject line\n\n## Pull Requests\n- Squash merge to main\n- Require at least 1 review\n- All CI checks must pass\n- PR description: what, why, how to test\n\n## Pre-Commit Checks\n- Run linters before committing\n- Run type checker before pushing\n- Never commit \`.env\`, secrets, or generated files`,

    agents: `# Agent Delegation Rules\n\n> Always loaded. When to delegate work to sub-agents.\n\n## Use Sub-Agents (Task tool) When:\n- The work is self-contained and well-defined\n- It requires a different expertise domain (security, performance, docs)\n- Parallel execution would speed things up\n- The task has a clear deliverable\n\n## Do NOT Delegate When:\n- The change is < 20 lines\n- Context from the current conversation is critical\n- The task requires back-and-forth clarification\n- File changes are interdependent across the task\n\n## Agent Selection\n${(cfg.agents || []).map(a => `- **${a}**: use for ${a.replace(/-/g," ")} tasks`).join("\n")}\n\n## Model Routing\n- Default: Sonnet for ~90% of tasks (fast, capable)\n- Upgrade to Opus: security reviews, complex architecture, critical decisions\n- Downgrade to Haiku: simple lookups, formatting, boilerplate`,

    performance: `# Performance Rules\n\n> Always loaded. Model selection and context optimization.\n\n## Model Selection Heuristics\n- **Sonnet 4.5** (default, ~90% of tasks): coding, refactoring, tests, docs\n- **Opus 4.6** (upgrade when needed): security audits, architecture decisions, complex debugging, multi-file refactors with subtle dependencies\n- **Haiku 4.5** (downgrade when possible): formatting, simple completions, boilerplate generation\n\n## Context Window Management\n- Keep CLAUDE.md under 500 lines — move details to rules/skills\n- Use \`@path/to/file\` imports in CLAUDE.md for modularity\n- Disable unused MCP servers (each consumes ~5-15k tokens)\n- Warn: >80 active tools → context shrinks from 200k to ~70k\n\n## Token Efficiency\n- Use skills with \`context: fork\` for isolated tasks\n- Compact strategically — don't wait for auto-compact\n- Write concise instructions — Claude reads everything every turn`,

    documentation: `# Documentation Rules\n\n> Always loaded. Documentation standards.\n\n## Code Documentation\n- Public APIs: JSDoc/docstrings with types, params, returns, examples\n- Complex logic: explain WHY not WHAT\n- No documentation for obvious code\n- Keep docs adjacent to code (not in separate files)\n\n## Project Documentation\n- README: quick start in < 5 minutes\n- Architecture: high-level diagrams, data flow\n- API: endpoint reference with examples\n- CHANGELOG: notable changes per version`,

    "error-handling": `# Error Handling Rules\n\n> Always loaded. Robust error management.\n\n## Principles\n- Never swallow errors silently\n- Catch specific exceptions, not generic\n- Fail fast at boundaries, recover gracefully internally\n- Log errors with context (user, request, stack)\n\n## Patterns\n- Use typed errors / error codes\n- Return errors as values when language supports it\n- Error boundaries for UI components\n- Circuit breakers for external services\n- Retry with exponential backoff for transient failures`,
  };
  return R[id] || `# ${id.charAt(0).toUpperCase() + id.slice(1)} Rules\n\n> Always loaded.\n\nTODO: Define ${id} rules for ${cfg.name}.`;
}

function genSkillV4(id, cfg) {
  const tech = cfg.languages.join(", ");
  const S = {
    "lint-fix": { fm: `---\nname: lint-fix\ndescription: Run linters and auto-fix across changed files\nallowed-tools: [Bash, Read, Glob, Grep]\ncontext: fork\nuser-invocable: true\n---`, body: `Run the full lint/format/typecheck pipeline for ${cfg.name}.\n\n${cfg.languages.map(l => { const tc = STACKS[l]; return tc ? `**${l}**: ${[...tc.formatters,...tc.linters,...tc.typeCheckers].join(" → ")}` : ""; }).filter(Boolean).join("\n")}\n\nTarget: $ARGUMENTS\n\nReport: issues found, auto-fixed, remaining.` },
    refactor: { fm: `---\nname: refactor\ndescription: Analyze complexity and plan safe refactoring\nallowed-tools: [Read, Glob, Grep, Bash]\ncontext: fork\nmodel: opus\nuser-invocable: true\n---`, body: `## Safe Refactoring Protocol\n\n1. ANALYZE: cyclomatic complexity, code smells, coupling\n2. MAP: dependency graph of affected modules\n3. PLAN: step-by-step with risk (LOW/MED/HIGH)\n4. PRESENT plan — do NOT modify until approved\n5. Execute one step at a time, verify tests between\n6. One refactoring per commit\n\nTarget: $ARGUMENTS` },
    review: { fm: `---\nname: review\ndescription: Review changes for quality, security, performance\nallowed-tools: [Read, Glob, Grep, Bash]\ncontext: fork\nmodel: opus\nskills: [security-review]\nuser-invocable: true\n---`, body: `Review current changes for ${cfg.name} (${tech}):\n\n1. **Correctness** — logic, race conditions, error handling\n2. **Security** — injection, auth, secrets, input validation\n3. **Performance** — N+1, re-renders, memory leaks, O(n²)\n4. **Types** — proper annotations, no unsafe casts\n5. **Tests** — coverage of new behavior\n6. **Standards** — project conventions followed\n\n\`\`\`bash\ngit diff HEAD\n\`\`\`\n\nSeverity: 🔴 Critical | 🟡 Warning | 🟢 Suggestion` },
    test: { fm: `---\nname: test\ndescription: Generate comprehensive tests for a module\nallowed-tools: [Read, Write, Glob, Grep, Bash]\ncontext: fork\nuser-invocable: true\n---`, body: `Generate tests following TDD for ${cfg.name}:\n\n1. Read existing test patterns\n2. Cover: happy path, errors, edge cases, boundaries\n3. Each test = ONE behavior\n4. Descriptive names as specs\n5. Mock external dependencies\n6. Target: 80% branch coverage minimum\n\nModule: $ARGUMENTS` },
    "deploy-check": { fm: `---\nname: deploy-check\ndescription: Pre-deployment validation checklist\nallowed-tools: [Read, Bash, Glob, Grep]\ncontext: fork\nuser-invocable: true\n---`, body: `## Pre-Deploy Checklist: ${cfg.name}\n\n- [ ] All tests passing\n- [ ] Zero lint/type errors\n- [ ] No hardcoded secrets (grep scan)\n- [ ] Dependencies audited\n- [ ] DB migrations ready & reversible\n- [ ] Bundle size within budget\n- [ ] Rollback procedure documented\n- [ ] Monitoring/alerts configured\n\nEnvironment: $ARGUMENTS` },
    "security-review": { fm: `---\nname: security-review\ndescription: Comprehensive security audit\nallowed-tools: [Read, Bash, Glob, Grep]\ncontext: fork\nmodel: opus\nuser-invocable: true\n---`, body: `## Security Audit: ${cfg.name}\n\n1. **Dependencies**: audit for known vulnerabilities\n2. **Secrets**: scan for hardcoded keys, check .gitignore\n3. **Injection**: SQL, NoSQL, command, path traversal\n4. **Auth**: session management, CSRF, CORS\n5. **Data**: encryption at rest/transit, PII handling\n6. **Config**: HTTPS, security headers, rate limiting\n\n🔴 CRITICAL | 🟡 MEDIUM | 🟢 LOW + remediation steps` },
    plan: { fm: `---\nname: plan\ndescription: Create execution plan for complex tasks\nallowed-tools: [Read, Glob, Grep, TodoWrite]\ncontext: inline\nuser-invocable: true\n---`, body: `Create a detailed execution plan:\n\n1. Break task into atomic steps\n2. Identify dependencies between steps\n3. Estimate complexity per step (S/M/L)\n4. Write plan to TodoWrite for tracking\n5. Present for approval before executing\n\nTask: $ARGUMENTS` },
    "search-codebase": { fm: `---\nname: search-codebase\ndescription: Deep codebase search and analysis\nallowed-tools: [Glob, Grep, LS, Read]\ncontext: fork\nuser-invocable: true\n---`, body: `Efficiently search the codebase:\n\n1. Glob: find files matching pattern\n2. Grep: search content across matches\n3. LS: explore directory structure\n4. Read: examine relevant files\n5. Summarize findings with file locations\n\nSearch: $ARGUMENTS` },
    "doc-gen": { fm: `---\nname: doc-gen\ndescription: Generate or update project documentation\nallowed-tools: [Read, Write, Glob, Grep, WebFetch]\ncontext: fork\nuser-invocable: true\n---`, body: `Generate docs for ${cfg.name}:\n\nFor module ($ARGUMENTS): purpose, public API, config, errors, examples\nFor project: README, API reference, architecture, CHANGELOG\n\nWrite for tomorrow's new team member.` },
    "fix-issue": { fm: `---\nname: fix-issue\ndescription: Fix issue with proper git workflow\nallowed-tools: [Read, Write, Edit, MultiEdit, Bash, Glob, Grep]\ncontext: fork\nuser-invocable: true\n---`, body: `Fix issue #$ARGUMENTS:\n\n1. Understand & reproduce the issue\n2. \`git checkout -b fix/$ARGUMENTS\`\n3. Locate relevant code\n4. Apply minimal targeted fix\n5. Add/update regression tests\n6. Run full test suite\n7. \`git commit -m "fix: resolve #$ARGUMENTS"\`` },
    "continuous-learning": { fm: `---\nname: continuous-learning\ndescription: Record reusable "Aha Cards" — knowledge discovered during sessions. Use after fixing tricky bugs, discovering patterns, or finding better approaches. Captures learnings into persistent JSONL storage so future sessions don't start from scratch.\nallowed-tools: [Read, Write, Glob, Grep, Bash]\ncontext: fork\nuser-invocable: true\n---`, body: `## Aha Card Recorder — Session Knowledge Capture\n\nAfter completing work, analyze the session and record reusable knowledge.\n\n### What to Capture\n\n**Aha Cards** — Durable, reusable knowledge:\n- A bug fix that required non-obvious investigation\n- A pattern that solved a recurring problem\n- A configuration that was hard to find in docs\n- An anti-pattern that wasted time\n- A tool combination that was especially effective\n\n**Recommendations** — Improvements for future runs:\n- "Next time, check X before trying Y"\n- "The migration requires Z step that docs don't mention"\n- "This API silently fails when..."\n\n### Recording Format\n\nAppend to \`.claude/memory/aha_cards.jsonl\` (one JSON object per line):\n\n\\\`\\\`\\\`json\n{"id":"aha_<timestamp>","type":"aha","title":"<short title>","insight":"<what was learned>","context":"<when this applies>","evidence":"<what proved it>","scope":"project|portable","tags":["<topic>"],"confidence":0.9,"created":"<ISO-8601>"}\n\\\`\\\`\\\`\n\nAppend recommendations to \`.claude/memory/recommendations.jsonl\`:\n\n\\\`\\\`\\\`json\n{"id":"rec_<timestamp>","type":"recommendation","title":"<short title>","action":"<what to do differently>","rationale":"<why>","scope":"project|portable","status":"proposed","created":"<ISO-8601>"}\n\\\`\\\`\\\`\n\n### Scope Rules\n\n- **project**: Specific to this repo (references local files, env, config)\n- **portable**: Generally reusable (good candidate for backporting into a skill)\n\nPortable writing checklist:\n- Replace repo-specific values with placeholders (\\\`<repo-root>\\\`, \\\`<ENV>\\\`)\n- Prefer patterns/templates over raw dumps\n- Avoid absolute paths\n\n### Update INDEX.md\n\nAfter recording, regenerate \`.claude/memory/INDEX.md\` — a human-readable dashboard:\n\n\\\`\\\`\\\`markdown\n# Session Learnings\n*Last updated: <date>*\n\n## Recent Aha Cards\n| ID | Title | Scope | Confidence |\n|----|-------|-------|------------|\n| aha_... | ... | project | 0.9 |\n\n## Open Recommendations\n| ID | Action | Status |\n|----|--------|--------|\n| rec_... | ... | proposed |\n\\\`\\\`\\\`\n\n### Quality Standards\n- 1-5 cards per session (don't over-record)\n- Each card must be actionable (not just "this was hard")\n- Confidence: 0.5 = hunch, 0.7 = likely, 0.9 = proven\n- If unsure about scope, default to "project"` },
    "aha-review": { fm: `---\nname: aha-review\ndescription: Review past learnings before starting work. Load Aha Cards and recommendations from memory to avoid repeating mistakes and apply proven patterns.\nallowed-tools: [Read, Glob, Grep, Bash]\ncontext: inline\nuser-invocable: true\n---`, body: `## Aha Card Review — Apply Past Learnings\n\nBefore starting work, review what was learned in previous sessions.\n\n### Step 1: Load Memory\n\n1. Read \`.claude/memory/INDEX.md\` for a dashboard overview\n2. Read \`.claude/memory/aha_cards.jsonl\` for detailed cards\n3. Read \`.claude/memory/recommendations.jsonl\` for open actions\n\n### Step 2: Filter Relevant Cards\n\nBased on the current task ($ARGUMENTS), filter cards by:\n- **Tags** matching the current work area\n- **Scope** = "project" (always relevant) + "portable" (if applicable)\n- **Confidence** ≥ 0.7 (skip low-confidence hunches unless directly relevant)\n- **Recency** — prioritize recent cards but don't ignore old proven patterns\n\n### Step 3: Present Summary\n\nOutput a brief summary:\n- 🧠 **Relevant learnings**: cards that apply to the current task\n- ⚠️ **Open recommendations**: actions not yet addressed\n- 🔄 **Portable patterns**: reusable knowledge to apply\n\n### Step 4: Recommend Backports\n\nIf any portable Aha Cards have been validated multiple times (confidence ≥ 0.9),\nsuggest backporting them into a permanent skill:\n\n"Card aha_123 has been proven 3x — consider backporting to .claude/skills/<topic>/SKILL.md"\n\n### Usage\n- \\\`/aha-review\\\` — review all recent learnings\n- \\\`/aha-review auth\\\` — filter for auth-related learnings\n- \\\`/aha-review --portable\\\` — show only portable/reusable patterns` },
    "backport": { fm: `---\nname: backport\ndescription: Graduate proven Aha Cards into permanent skill improvements. Use when a portable learning has reached confidence ≥ 0.9 and should become part of the project's permanent knowledge base.\nallowed-tools: [Read, Write, Glob, Grep, Bash]\ncontext: fork\nuser-invocable: true\n---`, body: `## Backport — Graduate Learnings to Permanent Skills\n\nPromote validated Aha Cards from session memory into permanent skills.\n\n### Step 1: IDENTIFY Candidates\n\n1. Read \`.claude/memory/aha_cards.jsonl\`\n2. Filter for: scope = "portable" AND confidence ≥ 0.9\n3. If $ARGUMENTS provided, filter by tags/keywords matching $ARGUMENTS\n4. Present candidates:\n\n\\\`\\\`\\\`\n🎓 Backport Candidates:\n  [1] aha_123: "OAuth refresh needs 30s buffer" (confidence: 0.95, tags: auth)\n  [2] aha_456: "Use connection pooling for DB" (confidence: 0.9, tags: database)\n\\\`\\\`\\\`\n\n### Step 2: SELECT Target Skill\n\nFor each selected card:\n1. Glob \`.claude/skills/*/SKILL.md\` to find existing skills\n2. Match card tags to skill topics\n3. If no matching skill exists, offer to create one:\n   - "No auth skill exists. Create .claude/skills/auth/SKILL.md?"\n\n### Step 3: GENERALIZE Content\n\nBefore backporting, ensure content is portable:\n- Replace repo-specific values with placeholders (\\\`<repo-root>\\\`, \\\`<ENV>\\\`)\n- Describe patterns/principles, not specific implementations\n- Remove absolute paths or environment-specific references\n- Present the generalized version for confirmation\n\n### Step 4: APPLY Backport\n\n1. Read the target skill file\n2. Append a "## Backported Learnings" section (or append to existing one)\n3. Format each card as:\n\n\\\`\\\`\\\`markdown\n### <Card Title>\n*Backported from: <aha_id> (confidence: <score>)*\n\n<Generalized insight>\n\n**When to apply:** <context>\n\\\`\\\`\\\`\n\n4. Write the updated skill file\n\n### Step 5: LOG the Backport\n\nAppend to \`.claude/memory/backports.jsonl\`:\n\n\\\`\\\`\\\`json\n{"id":"bp_<timestamp>","type":"backport","source_ids":["aha_123"],"target_skill":".claude/skills/auth/SKILL.md","changes_summary":"Added OAuth refresh buffer pattern","created":"<ISO-8601>"}\n\\\`\\\`\\\`\n\n### Step 6: VERIFY\n\n1. Read the updated skill to confirm formatting\n2. Run \\\`bash .claude/scripts/memory-manage.sh backport-inspect <target>\\\` to verify markers\n3. Report summary:\n\n\\\`\\\`\\\`\n✅ Backported 2 cards to .claude/skills/auth/SKILL.md\n📋 Logged in backports.jsonl\n🧹 Consider marking source cards as graduated\n\\\`\\\`\\\`\n\n### Usage\n- \\\`/backport\\\` — interactive: show all candidates, choose targets\n- \\\`/backport auth\\\` — backport auth-related cards only\n- \\\`/backport --ids aha_123,aha_456\\\` — backport specific cards\n- \\\`/backport --dry-run\\\` — preview without writing` },
    "self-learning": { fm: `---\nname: self-learning\ndescription: Autonomously research any library, framework, or tool from the web and generate a reusable SKILL.md. Use when you encounter an unfamiliar technology or need to create project-specific reference documentation.\nallowed-tools: [WebSearch, WebFetch, Read, Write, Glob, Grep]\ncontext: fork\nmodel: opus\nuser-invocable: true\n---`, body: `## Self-Learning Skill — Autonomous Skill Generator\n\nWhen invoked with \`/learn <topic>\`, research a technology and generate a reusable skill.\n\n### Phase 1: DISCOVER\n1. WebSearch for \`<topic> official documentation\`\n2. WebSearch for \`<topic> getting started guide\`\n3. WebSearch for \`<topic> API reference\`\n4. Identify the **authoritative source** (official docs, GitHub repo, RFC)\n5. Ignore SEO spam, Medium reposts, outdated tutorials\n\n### Phase 2: EXTRACT\n1. WebFetch each authoritative URL\n2. Extract: installation, basic usage, API surface, configuration, common patterns\n3. For SDKs: extract code samples in languages relevant to this project (${tech})\n4. For frameworks: extract project structure, CLI commands, config files\n5. For APIs: extract endpoints, auth, request/response shapes, rate limits\n\n### Phase 3: SYNTHESIZE\nGenerate a structured SKILL.md following the reference guide at:\n\`.claude/skills/self-learning/references/skill_creation_guide.md\`\n\nRequired sections:\n- **Frontmatter table**: name, description (when to use this skill)\n- **Quick Reference**: docs URL, install command, key versions\n- **Installation**: per-language install commands\n- **Basic Usage**: minimal working examples\n- **Core Concepts**: key abstractions, architecture\n- **Common Patterns**: recipes for typical use cases\n- **API Reference**: most-used functions/methods with signatures\n- **Troubleshooting**: common errors and fixes\n- **Sources**: URLs scraped with date\n\n### Phase 4: SAVE\n1. Check existing skills: \`Glob .claude/skills/*/SKILL.md\`\n2. Create directory: \`.claude/skills/<topic-slug>/\`\n3. Write: \`.claude/skills/<topic-slug>/SKILL.md\`\n4. Confirm with summary of what was learned\n\n### Quality Standards\n- Code samples must be **copy-pasteable** (no placeholders without explanation)\n- Version-pin all install commands\n- Include the scrape date so skills can be refreshed\n- Prefer official docs over third-party tutorials\n- If docs are gated/unavailable, note it and use best available source\n- Keep total length under 500 lines — this is a reference, not a textbook\n\n### Example Output Structure\n\`\`\`markdown\n| name | description |\n|------|-------------|\n| <topic> | <when to use this skill> |\n\n# <Topic Name>\n<One-line description>\n\n## Quick Reference\n- **Docs**: <url>\n- **Install**: \\\`<command>\\\`\n- **Version**: <latest stable>\n\n## Installation\n### <Language>\n\\\`\\\`\\\`<lang>\n<install command>\n\\\`\\\`\\\`\n\n## Basic Usage\n...\n\n---\n*Sources scraped: <date> from <domains>*\n\`\`\`` },
  };
  const s = S[id];
  if (!s) return null;
  return `${s.fm}\n\n${s.body}`;
}

function genSkillCreationGuide(cfg) {
  return `# Skill Creation Guide

Reference for creating high-quality, reusable SKILL.md files for Claude Code.

## What Makes a Good Skill

A skill is a **reusable instruction set** that Claude Code loads into context when invoked.
Good skills are specific enough to be actionable but general enough to reuse across sessions.

## SKILL.md Format

### Frontmatter (YAML between \`---\` fences)

\`\`\`yaml
---
name: skill-name                    # kebab-case identifier
description: When to use this       # Triggers skill selection — be specific
allowed-tools: [Read, Write, Bash]  # Restrict tool access for safety
context: fork                       # fork (subagent) or inline (main context)
model: opus                         # Optional: override model for complex tasks
user-invocable: true                # Can user call via /skill-name?
disable-model-invocation: false     # If true, no LLM calls (pure scripting)
memory: true                        # Persist learnings across sessions
skills: [other-skill]               # Compose with other skills
hooks:                              # Skill-specific hooks
  PostToolUse:
    - matcher: Write
      command: "echo 'File written'"
---
\`\`\`

### Alternative: Frontmatter Table (simpler)

\`\`\`markdown
| name | description |
|------|-------------|
| my-skill | Brief description of when to use this skill |
\`\`\`

### Body Structure

1. **Title + one-liner** — what this skill does
2. **Quick Reference** — links, install commands, versions
3. **Step-by-step instructions** — numbered, imperative
4. **Code samples** — real, copy-pasteable, version-pinned
5. **Quality standards** — what "done" looks like
6. **Sources** — where the information came from + date

## Principles

### Be Opinionated
Bad: "You can use either REST or GraphQL"
Good: "Use REST with JSON:API envelope unless the project already uses GraphQL"

### Be Concrete
Bad: "Write good tests"
Good: "Each test covers ONE behavior. Name format: \`should <expected> when <condition>\`"

### Be Current
- Pin versions: \`npm install zod@3.23\` not \`npm install zod\`
- Include scrape date: \`*Sources scraped: 2026-02-07 from docs.example.com*\`
- Note deprecations: "⚠️ \`oldMethod()\` deprecated in v3, use \`newMethod()\`"

### Scope Tools Tightly
- Read-only analysis? \`allowed-tools: [Read, Glob, Grep]\`
- Code generation? Add \`[Write, Edit]\`
- Needs shell? Add \`[Bash]\` — but consider if Bash is actually needed
- Web research? Add \`[WebSearch, WebFetch]\`

### Use Fork Context for Heavy Work
- \`context: fork\` runs in a subagent — won't pollute main conversation
- Use for: reviews, refactoring analysis, test generation, research
- \`context: inline\` for quick tasks that need to see current conversation

## File Organization

\`\`\`
.claude/skills/
├── self-learning/
│   ├── SKILL.md                    # Main skill instructions
│   └── references/
│       └── skill_creation_guide.md # This file
├── continuous-learning/
│   └── SKILL.md                    # Record Aha Cards
├── aha-review/
│   └── SKILL.md                    # Review past learnings
├── backport/
│   └── SKILL.md                    # Graduate learnings to skills
├── lint-fix/
│   └── SKILL.md
├── <auto-generated>/               # Skills created by self-learning
│   └── SKILL.md
\`\`\`

## Skill Quality Checklist

- [ ] Frontmatter has name + description
- [ ] allowed-tools is minimal (principle of least privilege)
- [ ] Instructions are step-by-step and imperative
- [ ] Code samples are copy-pasteable
- [ ] Version numbers are pinned
- [ ] Sources cited with dates
- [ ] Total length < 500 lines
- [ ] Tested by invoking at least once
`;
}

function genAgent(id, cfg) {
  const tech = cfg.languages.join(", ");
  const db = cfg.databases.length ? `\nDatabases: ${cfg.databases.join(", ")}` : "";
  const A = {
    "code-reviewer": { tools:"[Read, Grep, Glob, Bash]", model:"opus", body:`Code quality reviewer for **${cfg.name}** (${tech}).${db}\n\n## Review Checklist\n1. Correctness — logic errors, race conditions, null handling\n2. Security — injection, auth bypass, secret exposure\n3. Performance — N+1 queries, O(n²), memory leaks\n4. Readability — naming, complexity, documentation\n5. Testing — adequate coverage, edge cases\n\nSeverity: 🔴 must fix | 🟡 should fix | 🟢 nitpick` },
    "test-writer": { tools:"[Read, Write, Glob, Grep, Bash]", model:"sonnet", body:`Test engineer for **${cfg.name}** (${tech}).\n\n## Standards\n- Follow existing test patterns\n- One assertion per test (logically grouped)\n- Cover: happy, error, edge, boundary\n- Mock at boundaries only\n- Target: 80% branch coverage` },
    "security-scanner": { tools:"[Read, Grep, Glob, Bash]", model:"opus", body:`Security auditor for **${cfg.name}**.\n\n1. Dependency vulnerabilities\n2. Hardcoded secrets\n3. Injection vectors (SQL, XSS, command, path)\n4. Auth/authz gaps\n5. Data exposure risks\n\n🔴 CRITICAL → immediate fix required` },
    "api-designer": { tools:"[Read, Grep, Glob]", model:"sonnet", body:`API architect for **${cfg.name}**.\n\n- RESTful: plural nouns, proper HTTP methods\n- Consistent envelope: { data, error, meta }\n- Cursor-based pagination\n- Schema validation on all inputs\n- Rate limit tiers documented` },
    "performance-auditor": { tools:"[Read, Grep, Glob, Bash]", model:"sonnet", body:`Performance engineer for **${cfg.name}**.${db}\n\n- DB: N+1, missing indexes, connection pooling\n- App: re-renders, memory leaks, O(n²)\n- Network: bundle size, code splitting, caching\n- Infra: container limits, autoscaling` },
    "documentation-writer": { tools:"[Read, Write, Glob, Grep]", model:"sonnet", body:`Technical writer for **${cfg.name}**.\n\n- README: quick start in < 5 minutes\n- API docs: every public interface\n- Architecture: diagrams + data flow\n- Inline: JSDoc/docstrings on public APIs` },
    "db-migration-mgr": { tools:"[Read, Write, Bash, Glob]", model:"sonnet", body:`Database architect for **${cfg.name}**.${db}\n\n1. Never drop columns without deprecation\n2. All migrations reversible (up + down)\n3. Indexes in separate migrations\n4. Test against production-size data` },
    "accessibility-checker": { tools:"[Read, Grep, Glob]", model:"sonnet", body:`A11y auditor for **${cfg.name}** — WCAG 2.1 AA.\n\n- Images: alt text\n- Contrast: ≥ 4.5:1\n- Keyboard: fully navigable\n- ARIA: proper labels\n- Focus: visible indicators` },
    "load-tester": { tools:"[Read, Write, Bash]", model:"sonnet", body:`Load testing engineer for **${cfg.name}**.\n\n1. Identify critical user journeys\n2. Define profiles: ramp, steady, spike\n3. Set SLOs: p50/p95/p99 latency\n4. Monitor: CPU, memory, DB connections` },
    "ux-reviewer": { tools:"[Read, Grep, Glob]", model:"sonnet", body:`UX reviewer for **${cfg.name}**.\n\n1. Consistency across patterns\n2. Responsive: mobile, tablet, desktop\n3. Loading states: skeletons, optimistic\n4. Error states: helpful recovery\n5. Empty states: guidance` },
    "dependency-manager": { tools:"[Read, Bash, Glob, Grep]", model:"sonnet", body:`Dependency manager for **${cfg.name}** monorepo.\n\n1. Detect circular deps\n2. Consistent versions across packages\n3. Unused dependency detection\n4. Security vulnerability audit` },
    "change-detector": { tools:"[Read, Bash, Grep, Glob]", model:"sonnet", body:`Change impact analyzer for **${cfg.name}**.\n\n1. Analyze git diff → changed files\n2. Map files → packages\n3. Trace dependency graph\n4. Output minimum test/build scope` },
    "data-validator": { tools:"[Read, Bash, Glob, Grep]", model:"sonnet", body:`Data validation for **${cfg.name}**.\n\n1. Schema validation\n2. Distribution analysis\n3. Feature engineering correctness\n4. Train/test leakage detection` },
    "model-evaluator": { tools:"[Read, Bash, Write]", model:"opus", body:`ML model evaluator for **${cfg.name}**.\n\n1. Metrics: accuracy, precision, recall, F1, AUC\n2. Fairness across groups\n3. Latency benchmarks\n4. Model card generation` },
    "semver-checker": { tools:"[Read, Bash, Grep, Glob]", model:"sonnet", body:`Semver analyst for **${cfg.name}**.\n\nMAJOR: breaking API | MINOR: new features | PATCH: bug fixes\n\nAnalyze diff → determine bump → flag unintentional breaks.` },
    "refactoring-agent": { tools:"[Read, Write, Edit, Glob, Grep, Bash]", model:"sonnet", body:`Refactoring specialist for **${cfg.name}** (${tech}).\n\n1. Measure complexity\n2. Map dependencies\n3. Plan step-by-step\n4. Verify tests pass at each step\n5. One refactoring per commit` },
  };
  const a = A[id];
  if (!a) return null;
  return `---\nname: ${id}\ndescription: ${id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}\ntools: ${a.tools}\nmodel: ${a.model}\npermissionMode: ${a.model === "opus" ? "acceptEdits" : "default"}\n---\n\n${a.body}`;
}

function genContext(id, cfg) {
  const C = {
    dev: `# Development Mode\n\nYou are in rapid development mode for **${cfg.name}**.\n\n## Priorities\n1. Speed of iteration over perfection\n2. Working code over clean code (refactor later)\n3. Console.log debugging is OK temporarily\n4. Skip comprehensive tests — write TODO markers\n5. Use existing patterns, don't architect new ones\n\n## Allowed Shortcuts\n- any types temporarily OK (mark with TODO)\n- Inline styles OK for prototyping\n- Skip error boundaries until feature works\n\n## NOT Allowed\n- Skipping security (no hardcoded secrets ever)\n- Breaking existing tests\n- Committing .env files`,
    review: `# Code Review Mode\n\nYou are in thorough code review mode for **${cfg.name}**.\n\n## Review Depth\n- Line-by-line analysis of all changes\n- Cross-reference with project conventions\n- Security implications of every change\n- Performance impact assessment\n- Test coverage verification\n\n## Output Format\n🔴 CRITICAL — must fix before merge\n🟡 WARNING — should fix, creates tech debt\n🟢 SUGGESTION — nice to have\n\n## Always Check\n- Input validation at boundaries\n- Error handling completeness\n- Race conditions in async code\n- SQL injection / XSS vectors\n- Secrets accidentally committed`,
    research: `# Research Mode\n\nYou are in exploration/research mode for **${cfg.name}**.\n\n## Approach\n1. Broad search before narrowing\n2. Document findings as you go\n3. Compare multiple approaches\n4. Prototype before committing to architecture\n5. Use WebFetch and WebSearch liberally\n\n## Deliverable\n- Summary of options with pros/cons\n- Recommendation with rationale\n- Proof of concept if feasible\n- Links to relevant documentation`,
    debug: `# Debug Mode\n\nYou are in systematic debugging mode for **${cfg.name}**.\n\n## Process\n1. REPRODUCE: confirm the exact failure\n2. ISOLATE: binary search to narrow scope\n3. HYPOTHESIZE: form specific theory\n4. TEST: validate hypothesis\n5. FIX: minimal targeted change\n6. VERIFY: regression test\n\n## Tools\n- Use Bash for log analysis\n- Use Grep for pattern matching\n- Use Read for examining state\n- Add strategic logging to narrow scope`,
    refactor: `# Refactor Mode\n\nYou are in safe refactoring mode for **${cfg.name}**.\n\n## Rules\n1. NEVER refactor without existing test coverage\n2. One refactoring per commit\n3. Run tests after every change\n4. Preserve all public interfaces\n5. Measure complexity before and after\n\n## Safe Transforms\n- Extract method/function\n- Rename for clarity\n- Remove dead code\n- Simplify conditionals\n- Introduce polymorphism`,
    deploy: `# Deploy Mode\n\nYou are in cautious deployment mode for **${cfg.name}**.\n\n## Checklist (every item required)\n- [ ] All tests green\n- [ ] No lint/type errors\n- [ ] Secrets scan clean\n- [ ] Dependencies audited\n- [ ] Migrations tested\n- [ ] Rollback procedure documented\n- [ ] Monitoring configured\n- [ ] Team notified\n\n## Proceed with extreme caution.\n- Double-check destructive operations\n- Verify environment variables\n- Confirm database backup exists`,
  };
  return C[id] || `# ${id.charAt(0).toUpperCase()+id.slice(1)} Mode\n\nContext for ${cfg.name} in ${id} mode.\n\nTODO: Define ${id} context.`;
}

function genClaudeMd(cfg) {
  const s = [];
  s.push(`# ${cfg.name}\n`);
  s.push(cfg.description + "\n");
  s.push("## Tech Stack\n");
  if (cfg.languages.length) s.push(`**Languages**: ${cfg.languages.join(", ")}`);
  if (cfg.frameworks.length) s.push(`**Frameworks**: ${cfg.frameworks.join(", ")}`);
  if (cfg.databases.length) s.push(`**Data**: ${cfg.databases.join(", ")}`);
  if (cfg.infra.length) s.push(`**Infrastructure**: ${cfg.infra.join(", ")}`);
  s.push("");
  if (cfg.directories) { s.push("## Project Structure\n"); s.push(cfg.directories + "\n"); }
  if (cfg.commonCmds) { s.push("## Common Commands\n"); s.push("```\n" + cfg.commonCmds + "\n```\n"); }

  // Rules reference
  s.push("## Rules\n");
  s.push("Always-loaded guidelines in `.claude/rules/`:\n");
  (cfg.selectedRules || []).forEach(r => s.push(`- \`@.claude/rules/${r}.md\` — ${RULES_CATALOG[r]?.desc || r}`));
  (cfg.customItems || []).filter(i => i.type === "rule").forEach(i => s.push(`- \`@.claude/rules/${i.id}.md\` — ${i.desc || i.name} *(custom)*`));
  s.push("");

  // Skills reference
  s.push("## Skills\n");
  s.push("On-demand workflows in `.claude/skills/`:\n");
  (cfg.skills || []).forEach(sk => s.push(`- \`/${sk}\` — invoke with \`/skill ${sk}\``));
  (cfg.customItems || []).filter(i => i.type === "skill").forEach(i => s.push(`- \`/${i.id}\` — ${i.desc || i.name} *(custom)*`));
  s.push("");

  // Agents reference
  s.push("## Agents\n");
  s.push("Specialized sub-agents in `.claude/agents/`:\n");
  (cfg.agents || []).forEach(a => s.push(`- **${a}** — delegate with \`Task(agent:${a})\``));
  (cfg.customItems || []).filter(i => i.type === "agent").forEach(i => s.push(`- **${i.id}** — ${i.desc || i.name} *(custom)*`));
  s.push("");

  // Contexts
  if (cfg.selectedContexts?.length) {
    s.push("## Dynamic Contexts\n");
    s.push("Mode-specific system prompts in `.claude/contexts/`:\n");
    cfg.selectedContexts.forEach(c => s.push(`- \`${c}\` — \`claude --append-system-prompt .claude/contexts/${c}.md\``));
    (cfg.customItems || []).filter(i => i.type === "context").forEach(i => s.push(`- \`${i.id}\` — ${i.desc || i.name} *(custom)*`));
    s.push("");
  }

  // MCP Servers
  const allMcpIds = [...(cfg.mcpServers || [])];
  const allCustomMcpNames = (cfg.customMcps || []).map(m => m.name);
  if (allMcpIds.length || allCustomMcpNames.length) {
    s.push("## MCP Servers\n");
    s.push("Configured in `.mcp.json` — each server adds tools to your context:\n");
    allMcpIds.forEach(id => {
      const cat = MCP_CATALOG[id];
      s.push(`- **${cat?.name || id}** — \`mcp__${id}__*\` tools`);
    });
    (cfg.customMcps || []).forEach(m => {
      s.push(`- **${m.name}** — ${m.transport === "sse" ? "SSE endpoint" : "external server"} *(custom)*`);
    });
    s.push("");
  }

  // Self-Learning Policy (if enabled)
  if ((cfg.skills || []).includes("self-learning") || (cfg.skills || []).includes("continuous-learning")) {
    s.push("## Self-Learning Policy\n");
    s.push("This project uses a **learning lifecycle** that captures, reviews, and graduates knowledge.\n");
    s.push("### Before Starting Work");
    s.push("- Review prior learnings: `/aha-review` or check `.claude/memory/INDEX.md`");
    s.push("- Apply relevant Aha Cards to avoid repeating mistakes");
    s.push("- Check open recommendations for unresolved actions\n");
    s.push("### During Work");
    s.push("- When you encounter an unfamiliar library: `/learn <topic>` auto-generates a skill");
    s.push("- Generated skills saved to `.claude/skills/<topic>/SKILL.md`");
    s.push("- Check existing skills first: `Glob .claude/skills/*/SKILL.md`\n");
    s.push("### After Finishing Work");
    s.push("- Record 1-5 Aha Cards via `/continuous-learning`");
    s.push("- Capture: tricky bug fixes, discovered patterns, effective tool combos");
    s.push("- Set scope: `project` (this repo only) or `portable` (generally reusable)");
    s.push("- Record recommendations for next session\n");
    s.push("### Backporting (Graduating Knowledge)");
    s.push("When a portable Aha Card reaches confidence ≥ 0.9:");
    s.push("1. Generalize it (remove repo-specific references)");
    s.push("2. Run `/backport` or use: `bash .claude/scripts/memory-manage.sh export-backport --skill-path <target> --ids <ids> --apply`");
    s.push("3. Log the backport in `.claude/memory/backports.jsonl`\n");
    s.push("### Memory Storage");
    s.push("- `.claude/memory/aha_cards.jsonl` — Append-only knowledge cards");
    s.push("- `.claude/memory/recommendations.jsonl` — Open action items");
    s.push("- `.claude/memory/backports.jsonl` — Graduated knowledge log");
    s.push("- `.claude/memory/INDEX.md` — Auto-generated dashboard");
    s.push("- `.claude/memory/FORMAT.md` — Schema reference");
    s.push("- `.claude/memory/RUBRIC.md` — Quality scoring guide");
    s.push("- `.claude/memory/PORTABILITY.md` — Storage and sharing guide\n");
  }

  // Model routing
  s.push("## Model Routing\n");
  s.push("- **Sonnet 4.5** (~90%): coding, refactoring, tests, documentation");
  s.push("- **Opus 4.6**: security reviews, architecture, complex debugging");
  s.push("- **Haiku 4.5**: formatting, boilerplate, simple lookups\n");

  // Token budget note
  s.push("## Context Budget\n");
  s.push("This file should stay under ~500 lines. Move detailed instructions to rules, skills, or agents.");
  s.push("Disable unused MCP servers — each consumes 5-15k tokens of context.\n");

  return s.join("\n");
}

function genSessionScript(type) {
  if (type === "start") return `#!/bin/bash
# Session Start Hook — restore state and load learnings
set -e

MEMORY_DIR="$CLAUDE_PROJECT_DIR/.claude/memory"
mkdir -p "$MEMORY_DIR"

# Restore last session state
if [ -f "$MEMORY_DIR/last-session.json" ]; then
  echo "📋 Restored session state from $(jq -r '.timestamp' "$MEMORY_DIR/last-session.json" 2>/dev/null || echo 'unknown')"
  cat "$MEMORY_DIR/last-session.json"
fi

# Load Aha Cards summary
if [ -f "$MEMORY_DIR/aha_cards.jsonl" ]; then
  CARD_COUNT=$(wc -l < "$MEMORY_DIR/aha_cards.jsonl" | tr -d ' ')
  RECENT=$(tail -3 "$MEMORY_DIR/aha_cards.jsonl" 2>/dev/null | jq -r '.title' 2>/dev/null | head -3)
  echo "🧠 Loaded $CARD_COUNT Aha Cards. Recent:"
  echo "$RECENT"
fi

# Load open recommendations
if [ -f "$MEMORY_DIR/recommendations.jsonl" ]; then
  OPEN=$(grep '"proposed"' "$MEMORY_DIR/recommendations.jsonl" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$OPEN" -gt 0 ]; then
    echo "⚠️  $OPEN open recommendations — review with /aha-review"
  fi
fi

# Load learned patterns (legacy support)
if [ -f "$MEMORY_DIR/patterns.json" ]; then
  echo "📚 Loaded $(jq 'length' "$MEMORY_DIR/patterns.json" 2>/dev/null || echo '0') legacy patterns"
fi`;

  if (type === "end") return `#!/bin/bash
# Session End Hook — save state and prompt for Aha Cards
set -e

MEMORY_DIR="$CLAUDE_PROJECT_DIR/.claude/memory"
mkdir -p "$MEMORY_DIR"

# Save session state
jq -n \\
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
  --arg branch "$(git branch --show-current 2>/dev/null || echo 'unknown')" \\
  --arg last_commit "$(git log --oneline -1 2>/dev/null || echo 'none')" \\
  --arg files_changed "$(git diff --stat HEAD~1 2>/dev/null | tail -1 || echo 'unknown')" \\
  '{ timestamp: $timestamp, branch: $branch, lastCommit: $last_commit, filesChanged: $files_changed }' \\
  > "$MEMORY_DIR/last-session.json"

# Regenerate INDEX.md from JSONL files
INDEX="$MEMORY_DIR/INDEX.md"
echo "# Session Learnings" > "$INDEX"
echo "*Last updated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")*" >> "$INDEX"
echo "" >> "$INDEX"

if [ -f "$MEMORY_DIR/aha_cards.jsonl" ]; then
  echo "## Aha Cards ($(wc -l < "$MEMORY_DIR/aha_cards.jsonl" | tr -d ' ') total)" >> "$INDEX"
  echo "| ID | Title | Scope | Confidence |" >> "$INDEX"
  echo "|----|-------|-------|------------|" >> "$INDEX"
  tail -10 "$MEMORY_DIR/aha_cards.jsonl" | while IFS= read -r line; do
    ID=$(echo "$line" | jq -r '.id' 2>/dev/null)
    TITLE=$(echo "$line" | jq -r '.title' 2>/dev/null)
    SCOPE=$(echo "$line" | jq -r '.scope' 2>/dev/null)
    CONF=$(echo "$line" | jq -r '.confidence' 2>/dev/null)
    echo "| $ID | $TITLE | $SCOPE | $CONF |" >> "$INDEX"
  done
  echo "" >> "$INDEX"
fi

if [ -f "$MEMORY_DIR/recommendations.jsonl" ]; then
  OPEN=$(grep '"proposed"' "$MEMORY_DIR/recommendations.jsonl" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$OPEN" -gt 0 ]; then
    echo "## Open Recommendations ($OPEN)" >> "$INDEX"
    echo "| ID | Action | Status |" >> "$INDEX"
    echo "|----|--------|--------|" >> "$INDEX"
    grep '"proposed"' "$MEMORY_DIR/recommendations.jsonl" | while IFS= read -r line; do
      ID=$(echo "$line" | jq -r '.id' 2>/dev/null)
      ACTION=$(echo "$line" | jq -r '.action' 2>/dev/null)
      STATUS=$(echo "$line" | jq -r '.status' 2>/dev/null)
      echo "| $ID | $ACTION | $STATUS |" >> "$INDEX"
    done
    echo "" >> "$INDEX"
  fi
fi

echo "✅ Session state saved. INDEX.md regenerated."`;

  if (type === "pre-compact") return `#!/bin/bash
# Pre-Compact Hook — checkpoint state before context compaction
set -e

MEMORY_DIR="$CLAUDE_PROJECT_DIR/.claude/memory"
mkdir -p "$MEMORY_DIR"

# Save pre-compaction checkpoint
CHECKPOINT="$MEMORY_DIR/pre-compact-$(date +%s).json"
jq -n \\
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
  --arg reason "context_compaction" \\
  --arg branch "$(git branch --show-current 2>/dev/null || echo 'unknown')" \\
  '{ timestamp: $timestamp, reason: $reason, branch: $branch, note: "State saved before compaction" }' \\
  > "$CHECKPOINT"

echo "💾 Pre-compaction state saved to $CHECKPOINT"

# Remind about Aha Cards if none recorded this session
if [ -f "$MEMORY_DIR/aha_cards.jsonl" ]; then
  LATEST=$(tail -1 "$MEMORY_DIR/aha_cards.jsonl" | jq -r '.created' 2>/dev/null || echo '')
  echo "📝 Last Aha Card: $LATEST — consider recording new learnings before compaction"
fi`;

  return "#!/bin/bash\n# Hook script\necho 'Running hook'";
}

function genMemoryFormatRef() {
  return `# Aha Card Memory Format Reference

## Storage Structure

\`\`\`
.claude/memory/
├── INDEX.md                # Human-readable dashboard (auto-regenerated)
├── FORMAT.md               # This file — format reference
├── RUBRIC.md               # Quality scoring guide for Aha Cards
├── PORTABILITY.md          # Storage, scoping, and sharing guide
├── last-session.json       # Last session state (branch, commit, timestamp)
├── aha_cards.jsonl          # Append-only Aha Cards (one JSON per line)
├── recommendations.jsonl    # Append-only recommendations
├── backports.jsonl          # Log of knowledge graduated to skills
└── pre-compact-*.json       # Pre-compaction checkpoints
\`\`\`

## Aha Card Schema

\`\`\`json
{
  "id": "aha_1707350400",
  "type": "aha",
  "title": "Short descriptive title",
  "insight": "What was learned — the core knowledge",
  "context": "When this applies — conditions, triggers",
  "evidence": "What proved this — command output, test results",
  "scope": "project|portable",
  "tags": ["auth", "api", "performance"],
  "confidence": 0.9,
  "created": "2026-02-07T18:00:00Z"
}
\`\`\`

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | ✅ | Unique ID: \`aha_<unix_timestamp>\` |
| type | string | ✅ | Always "aha" |
| title | string | ✅ | Short title (< 80 chars) |
| insight | string | ✅ | The core learning |
| context | string | ✅ | When/where this applies |
| evidence | string | ⬜ | What proved it |
| scope | string | ✅ | "project" or "portable" |
| tags | array | ✅ | Topic tags for filtering |
| confidence | number | ✅ | 0.0-1.0 (0.5=hunch, 0.7=likely, 0.9=proven) |
| created | string | ✅ | ISO 8601 timestamp |

## Recommendation Schema

\`\`\`json
{
  "id": "rec_1707350400",
  "type": "recommendation",
  "title": "Short action title",
  "action": "What to do differently next time",
  "rationale": "Why this matters",
  "scope": "project|portable",
  "status": "proposed|in_progress|completed|rejected",
  "created": "2026-02-07T18:00:00Z"
}
\`\`\`

### Status Lifecycle

\`\`\`
proposed → in_progress → completed
                       → rejected
\`\`\`

## Backport Schema

\`\`\`json
{
  "id": "bp_1707350400",
  "type": "backport",
  "source_ids": ["aha_123", "aha_456"],
  "target_skill": ".claude/skills/auth/SKILL.md",
  "changes_summary": "Added OAuth token refresh pattern",
  "created": "2026-02-07T18:00:00Z"
}
\`\`\`

## Scope Guide

| Scope | Meaning | Example |
|-------|---------|---------|
| project | Specific to this repo | "Our API uses X-Custom-Auth header" |
| portable | Generally reusable | "OAuth refresh tokens need 30s buffer before expiry" |

### Making Content Portable

- Replace repo-specific values: \`src/api/auth.ts\` → \`<auth-module>\`
- Use generic placeholders: \`<ENV>\`, \`<SERVICE>\`, \`<API_URL>\`
- Describe patterns, not implementations
- Avoid absolute paths

## Backporting Workflow

1. **Identify**: Review portable Aha Cards with confidence ≥ 0.9
2. **Generalize**: Ensure no project-specific references remain
3. **Target**: Choose or create a skill to receive the knowledge
4. **Apply**: Append the insight to the target skill's SKILL.md
5. **Log**: Record the backport in backports.jsonl
`;
}

function genRubricRef() {
  return `# Aha Card Quality Rubric

Scoring guide for evaluating whether a learning should be recorded as an Aha Card.

## Recording Threshold

An insight should be recorded if it scores ≥ 6/10 on this rubric.

## Scoring Criteria

| Criterion | 0 pts | 1 pt | 2 pts |
|-----------|-------|------|-------|
| **Reusability** | One-off fix, never applies again | Applies to similar situations in this project | Applies across projects (portable) |
| **Non-Obvious** | Documented in official docs (first result) | Required digging or combining multiple sources | Discovered through experimentation or failure |
| **Time Saved** | < 5 minutes next time | 5-30 minutes saved | 30+ minutes or prevents a production issue |
| **Specificity** | Vague ("be careful with X") | Actionable ("check Y before doing X") | Precise recipe ("run A, then B, verify with C") |
| **Evidence** | Hunch, no proof | Worked once, seems right | Validated multiple times or has test/log proof |

## Confidence Mapping

| Score | Confidence | Meaning |
|-------|-----------|---------|
| 0-3 | Don't record | Too vague or obvious |
| 4-5 | 0.5 (hunch) | Worth noting but unproven |
| 6-7 | 0.7 (likely) | Good evidence, record it |
| 8-9 | 0.9 (proven) | Validated, consider backporting |
| 10 | 1.0 (certain) | Immediately backport to a skill |

## Anti-Patterns (Don't Record)

- ❌ "This was hard" — not actionable
- ❌ "I used X library" — not an insight
- ❌ "The API returns JSON" — obvious/documented
- ❌ "Fixed a typo in config" — not reusable
- ❌ Secrets, credentials, or sensitive data

## Good Examples

### Score 8/10 — Record as Aha Card
\`\`\`json
{
  "title": "PostgreSQL JSONB index requires explicit operator class",
  "insight": "CREATE INDEX ON table USING GIN (col jsonb_path_ops) — without jsonb_path_ops, the index exists but @> queries don't use it. EXPLAIN ANALYZE shows seq scan.",
  "context": "Any PostgreSQL project using JSONB containment queries",
  "evidence": "EXPLAIN ANALYZE showed 200ms → 2ms after adding operator class",
  "scope": "portable",
  "confidence": 0.9
}
\`\`\`

### Score 4/10 — Skip or record as low-confidence
\`\`\`json
{
  "title": "React re-renders seem slow",
  "insight": "Component re-renders a lot",
  "context": "Maybe useMemo would help?",
  "confidence": 0.5
}
\`\`\`

## Session Recording Limits

- **Minimum**: 0 cards (not every session produces insights)
- **Target**: 1-3 cards per substantial session
- **Maximum**: 5 cards (if recording more, raise your quality bar)
- **Recommendations**: 0-2 per session
`;
}

function genPortabilityRef() {
  return `# Portability & Storage Guide

How session memory is stored, scoped, and shared.

## Storage Locations

### Project-Local (Default)
\`\`\`
<project-root>/.claude/memory/
├── aha_cards.jsonl
├── recommendations.jsonl
├── backports.jsonl
├── INDEX.md
├── patterns.json
└── pre-compact-*.json
\`\`\`

- Tied to this repository
- Add \`.claude/memory/\` to \`.gitignore\` to keep learnings local
- Or commit it to share learnings with your team

### Global (User-Level)
\`\`\`
~/.claude/memory/
├── aha_cards.jsonl
├── recommendations.jsonl
└── INDEX.md
\`\`\`

- Shared across all projects for the current user
- Best for portable, cross-project learnings
- Create manually if needed

## Scope Field

Each Aha Card and Recommendation has a \`scope\` field:

| Scope | Stored In | Shared? | Backport Target |
|-------|-----------|---------|-----------------|
| \`project\` | Project memory | Same repo only | Project skills |
| \`portable\` | Project memory (promote to global) | Cross-project | Any skill |

## Promotion Workflow

When a project-scoped card becomes portable:

1. **Reclassify**: Update the card's scope to "portable"
   \`\`\`bash
   # In recommendations (has CLI support):
   bash .claude/scripts/memory-manage.sh rec-status --id rec_123 --scope portable --note "Generalized"
   
   # For Aha Cards: use /continuous-learning to update, or manually edit JSONL
   \`\`\`

2. **Generalize**: Remove project-specific references
   - Replace \`src/api/auth.ts\` → \`<auth-module>\`
   - Replace \`MY_API_KEY\` → \`<API_KEY>\`
   - Replace absolute paths → relative patterns

3. **Backport**: Graduate to a permanent skill
   \`\`\`bash
   bash .claude/scripts/memory-manage.sh export-backport \\
     --skill-path .claude/skills/auth/SKILL.md \\
     --ids aha_123 --apply
   \`\`\`

4. **Optionally copy to global**: For cross-project reuse
   \`\`\`bash
   # Append portable cards to global memory
   grep '"portable"' .claude/memory/aha_cards.jsonl >> ~/.claude/memory/aha_cards.jsonl
   \`\`\`

## Team Sharing

### Option A: Commit Memory (Shared Knowledge Base)
\`\`\`bash
# Remove .claude/memory from .gitignore
# Commit curated Aha Cards for the team
git add .claude/memory/aha_cards.jsonl .claude/memory/INDEX.md
git commit -m "chore: share session learnings"
\`\`\`

### Option B: Plugin Distribution
Package learnings into a plugin:
\`\`\`json
{
  "name": "team-learnings",
  "skills": [".claude/skills/*/SKILL.md"],
  "memory": ".claude/memory/aha_cards.jsonl"
}
\`\`\`

## Per-User Isolation

When multiple users share a repo, isolate memory by user:

\`\`\`
.claude/memory/
├── users/
│   ├── alice/
│   │   ├── aha_cards.jsonl
│   │   └── INDEX.md
│   └── bob/
│       ├── aha_cards.jsonl
│       └── INDEX.md
└── shared/          # Team-wide learnings (committed)
    ├── aha_cards.jsonl
    └── INDEX.md
\`\`\`

Configure the user in session-start.sh:
\`\`\`bash
MEMORY_USER=\${CLAUDE_USER:-$(whoami)}
MEMORY_DIR="$PROJECT_DIR/.claude/memory/users/$MEMORY_USER"
\`\`\`

## Safety Rules

- ❌ Never store secrets, credentials, or tokens
- ❌ Never store PII or sensitive business data
- ✅ Store patterns, not payloads
- ✅ Use placeholders for environment-specific values
- ✅ Review before committing to shared repos
`;
}

function genMemoryManageScript() {
  return `#!/bin/bash
# Memory Management CLI — manage Aha Cards, recommendations, and backports
# Usage: bash .claude/scripts/memory-manage.sh <command> [options]
set -e

MEMORY_DIR="\${CLAUDE_PROJECT_DIR:-.}/.claude/memory"
mkdir -p "$MEMORY_DIR"

AHA_FILE="$MEMORY_DIR/aha_cards.jsonl"
REC_FILE="$MEMORY_DIR/recommendations.jsonl"
BP_FILE="$MEMORY_DIR/backports.jsonl"
INDEX_FILE="$MEMORY_DIR/INDEX.md"

command="\${1:-help}"
shift 2>/dev/null || true

case "$command" in
  review)
    # Review recent Aha Cards
    DAYS=\${1:-7}
    SCOPE=\${2:-all}
    CUTOFF=$(date -u -d "-$DAYS days" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-\${DAYS}d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "1970-01-01T00:00:00Z")
    
    echo "🧠 Aha Cards (last $DAYS days):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [ -f "$AHA_FILE" ]; then
      while IFS= read -r line; do
        CREATED=$(echo "$line" | jq -r '.created' 2>/dev/null)
        CARD_SCOPE=$(echo "$line" | jq -r '.scope' 2>/dev/null)
        if [[ "$SCOPE" != "all" && "$CARD_SCOPE" != "$SCOPE" ]]; then continue; fi
        if [[ "$CREATED" > "$CUTOFF" || "$CUTOFF" == "1970"* ]]; then
          TITLE=$(echo "$line" | jq -r '.title' 2>/dev/null)
          CONF=$(echo "$line" | jq -r '.confidence' 2>/dev/null)
          ID=$(echo "$line" | jq -r '.id' 2>/dev/null)
          echo "  [$CARD_SCOPE] $TITLE (confidence: $CONF) — $ID"
        fi
      done < "$AHA_FILE"
    else
      echo "  No Aha Cards recorded yet."
    fi
    
    echo ""
    echo "⚠️  Open Recommendations:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [ -f "$REC_FILE" ]; then
      grep '"proposed"' "$REC_FILE" 2>/dev/null | while IFS= read -r line; do
        TITLE=$(echo "$line" | jq -r '.title' 2>/dev/null)
        ID=$(echo "$line" | jq -r '.id' 2>/dev/null)
        echo "  $TITLE — $ID"
      done
    else
      echo "  No recommendations recorded yet."
    fi
    ;;

  list)
    # Search Aha Cards by query
    QUERY="\${1:-}"
    if [ -z "$QUERY" ]; then
      echo "Usage: memory-manage.sh list <query>"
      exit 1
    fi
    echo "🔍 Searching for: $QUERY"
    if [ -f "$AHA_FILE" ]; then
      grep -i "$QUERY" "$AHA_FILE" | while IFS= read -r line; do
        TITLE=$(echo "$line" | jq -r '.title' 2>/dev/null)
        INSIGHT=$(echo "$line" | jq -r '.insight' 2>/dev/null)
        ID=$(echo "$line" | jq -r '.id' 2>/dev/null)
        echo "  📌 $TITLE ($ID)"
        echo "     $INSIGHT"
        echo ""
      done
    fi
    ;;

  stats)
    # Show memory statistics
    echo "📊 Memory Statistics"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    AHA_COUNT=0; REC_COUNT=0; BP_COUNT=0
    [ -f "$AHA_FILE" ] && AHA_COUNT=$(wc -l < "$AHA_FILE" | tr -d ' ')
    [ -f "$REC_FILE" ] && REC_COUNT=$(wc -l < "$REC_FILE" | tr -d ' ')
    [ -f "$BP_FILE" ] && BP_COUNT=$(wc -l < "$BP_FILE" | tr -d ' ')
    
    echo "  Aha Cards:       $AHA_COUNT"
    echo "  Recommendations: $REC_COUNT"
    echo "  Backports:       $BP_COUNT"
    
    if [ -f "$AHA_FILE" ]; then
      PROJECT=$(grep '"project"' "$AHA_FILE" | wc -l | tr -d ' ')
      PORTABLE=$(grep '"portable"' "$AHA_FILE" | wc -l | tr -d ' ')
      echo "  Scope: $PROJECT project / $PORTABLE portable"
      
      HIGH_CONF=$(jq -r 'select(.confidence >= 0.9) | .id' "$AHA_FILE" 2>/dev/null | wc -l | tr -d ' ')
      echo "  High confidence (≥0.9): $HIGH_CONF (backport candidates)"
    fi
    ;;

  record)
    # Record Aha Card or Recommendation from JSON payload
    PAYLOAD="\${1:-}"
    if [ -z "$PAYLOAD" ]; then
      echo "Usage: memory-manage.sh record --json <file.json>"
      echo "       memory-manage.sh record --inline '<json>'"
      echo ""
      echo "Payload must contain 'type': 'aha' or 'recommendation'"
      exit 1
    fi
    if [ "$PAYLOAD" = "--json" ]; then
      JSON_FILE="\${2:-}"
      [ ! -f "$JSON_FILE" ] && echo "❌ File not found: $JSON_FILE" && exit 1
      CONTENT=$(cat "$JSON_FILE")
    elif [ "$PAYLOAD" = "--inline" ]; then
      CONTENT="\${2:-}"
    else
      CONTENT="$PAYLOAD"
    fi

    TYPE=$(echo "$CONTENT" | jq -r '.type' 2>/dev/null)
    if [ "$TYPE" = "aha" ]; then
      # Auto-generate ID and timestamp if missing
      CONTENT=$(echo "$CONTENT" | jq --arg id "aha_$(date +%s)" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \\
        'if .id == null or .id == "" then .id = $id else . end | if .created == null or .created == "" then .created = $ts else . end')
      echo "$CONTENT" >> "$AHA_FILE"
      TITLE=$(echo "$CONTENT" | jq -r '.title')
      echo "✅ Recorded Aha Card: $TITLE"
    elif [ "$TYPE" = "recommendation" ]; then
      CONTENT=$(echo "$CONTENT" | jq --arg id "rec_$(date +%s)" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \\
        'if .id == null or .id == "" then .id = $id else . end | if .created == null or .created == "" then .created = $ts else . end | if .status == null then .status = "proposed" else . end')
      echo "$CONTENT" >> "$REC_FILE"
      TITLE=$(echo "$CONTENT" | jq -r '.title')
      echo "✅ Recorded Recommendation: $TITLE"
    else
      echo "❌ Unknown type: $TYPE (must be 'aha' or 'recommendation')"
      exit 1
    fi
    # Rebuild INDEX.md
    bash .claude/scripts/session-end.sh 2>/dev/null || true
    ;;

  rec-status)
    # Update recommendation status
    REC_ID=""
    NEW_STATUS=""
    NEW_SCOPE=""
    NOTE=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --id) REC_ID="$2"; shift 2 ;;
        --status) NEW_STATUS="$2"; shift 2 ;;
        --scope) NEW_SCOPE="$2"; shift 2 ;;
        --note) NOTE="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -z "$REC_ID" ] || [ -z "$NEW_STATUS" ]; then
      echo "Usage: memory-manage.sh rec-status --id <rec_id> --status <status> [--scope portable] [--note 'text']"
      echo ""
      echo "Statuses: proposed | in_progress | completed | rejected"
      exit 1
    fi
    if [ ! -f "$REC_FILE" ]; then
      echo "❌ No recommendations file found"
      exit 1
    fi
    # Update in place: rewrite JSONL with updated status
    TMPFILE=$(mktemp)
    FOUND=0
    while IFS= read -r line; do
      ID=$(echo "$line" | jq -r '.id' 2>/dev/null)
      if [ "$ID" = "$REC_ID" ]; then
        FOUND=1
        UPDATED=$(echo "$line" | jq --arg s "$NEW_STATUS" '.status = $s')
        [ -n "$NEW_SCOPE" ] && UPDATED=$(echo "$UPDATED" | jq --arg sc "$NEW_SCOPE" '.scope = $sc')
        [ -n "$NOTE" ] && UPDATED=$(echo "$UPDATED" | jq --arg n "$NOTE" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.status_note = $n | .status_updated = $ts')
        echo "$UPDATED" >> "$TMPFILE"
      else
        echo "$line" >> "$TMPFILE"
      fi
    done < "$REC_FILE"
    if [ "$FOUND" = "1" ]; then
      mv "$TMPFILE" "$REC_FILE"
      echo "✅ Updated $REC_ID → $NEW_STATUS"
      [ -n "$NEW_SCOPE" ] && echo "   Scope → $NEW_SCOPE"
      [ -n "$NOTE" ] && echo "   Note: $NOTE"
    else
      rm "$TMPFILE"
      echo "❌ Recommendation not found: $REC_ID"
    fi
    ;;

  export-backport)
    # Graduate Aha Cards into a target skill
    TARGET_SKILL=""
    IDS=""
    MAKE_DIFF=0
    APPLY=0
    while [ $# -gt 0 ]; do
      case "$1" in
        --skill-path) TARGET_SKILL="$2"; shift 2 ;;
        --ids) IDS="$2"; shift 2 ;;
        --make-diff) MAKE_DIFF=1; shift ;;
        --apply) APPLY=1; shift ;;
        *) shift ;;
      esac
    done
    if [ -z "$TARGET_SKILL" ] || [ -z "$IDS" ]; then
      echo "Usage: memory-manage.sh export-backport --skill-path <path> --ids <id1,id2> [--make-diff|--apply]"
      exit 1
    fi
    
    echo "📦 Backport Bundle"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Target: $TARGET_SKILL"
    echo "Cards:  $IDS"
    echo ""
    
    # Collect matching Aha Cards
    BUNDLE=""
    IFS=',' read -ra ID_ARR <<< "$IDS"
    for AHA_ID in "\${ID_ARR[@]}"; do
      if [ -f "$AHA_FILE" ]; then
        CARD=$(grep "\\"$AHA_ID\\"" "$AHA_FILE" 2>/dev/null | head -1)
        if [ -n "$CARD" ]; then
          TITLE=$(echo "$CARD" | jq -r '.title')
          INSIGHT=$(echo "$CARD" | jq -r '.insight')
          CONTEXT=$(echo "$CARD" | jq -r '.context')
          echo "  ✅ $AHA_ID: $TITLE"
          BUNDLE="$BUNDLE\\n## Backported: $TITLE\\n*Source: $AHA_ID*\\n\\n$INSIGHT\\n\\n**When to apply:** $CONTEXT\\n"
        else
          echo "  ❌ $AHA_ID: not found"
        fi
      fi
    done
    
    if [ "$MAKE_DIFF" = "1" ]; then
      echo ""
      echo "📝 Proposed additions to $TARGET_SKILL:"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo -e "$BUNDLE"
      echo ""
      echo "Run with --apply to write changes"
    fi
    
    if [ "$APPLY" = "1" ]; then
      if [ ! -f "$TARGET_SKILL" ]; then
        echo "❌ Target skill not found: $TARGET_SKILL"
        exit 1
      fi
      echo "" >> "$TARGET_SKILL"
      echo "# Backported Learnings" >> "$TARGET_SKILL"
      echo -e "$BUNDLE" >> "$TARGET_SKILL"
      
      # Log the backport
      BP_ENTRY=$(jq -n --arg ids "$IDS" --arg target "$TARGET_SKILL" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \\
        '{id: ("bp_" + (now | floor | tostring)), type: "backport", source_ids: ($ids | split(",")), target_skill: $target, created: $ts}')
      echo "$BP_ENTRY" >> "$BP_FILE"
      
      echo ""
      echo "✅ Backport applied to $TARGET_SKILL"
      echo "📋 Logged in backports.jsonl"
    fi
    ;;

  backport-inspect)
    # Check a target skill for existing backport markers
    TARGET="\${1:-}"
    if [ -z "$TARGET" ]; then
      echo "Usage: memory-manage.sh backport-inspect <skill-path>"
      exit 1
    fi
    if [ ! -f "$TARGET" ]; then
      echo "❌ File not found: $TARGET"
      exit 1
    fi
    echo "🔍 Inspecting: $TARGET"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    MARKERS=$(grep -c "Backported:" "$TARGET" 2>/dev/null || echo "0")
    echo "  Existing backport markers: $MARKERS"
    if [ "$MARKERS" -gt 0 ]; then
      grep "Backported:" "$TARGET" | while IFS= read -r line; do
        echo "  📌 $line"
      done
    fi
    # Check related backport log entries
    if [ -f "$BP_FILE" ]; then
      BP_MATCHES=$(grep "$TARGET" "$BP_FILE" 2>/dev/null | wc -l | tr -d ' ')
      echo "  Logged backports to this skill: $BP_MATCHES"
    fi
    ;;

  repair)
    # Rebuild INDEX.md from JSONL files
    echo "🔧 Rebuilding INDEX.md..."
    bash .claude/scripts/session-end.sh 2>/dev/null || true
    echo "✅ INDEX.md rebuilt"
    ;;

  help|*)
    echo "Memory Management CLI"
    echo ""
    echo "Commands:"
    echo "  review [days] [scope]   — Review recent Aha Cards (default: 7 days, all scopes)"
    echo "  list <query>            — Search Aha Cards by keyword"
    echo "  stats                   — Show memory statistics"
    echo "  record --json <file>    — Record Aha Card/Recommendation from JSON file"
    echo "  record --inline '<json>'— Record from inline JSON"
    echo "  rec-status --id <id> --status <status> [--scope portable] [--note 'text']"
    echo "                          — Update recommendation lifecycle status"
    echo "  export-backport --skill-path <path> --ids <id1,id2> [--make-diff|--apply]"
    echo "                          — Graduate Aha Cards into a permanent skill"
    echo "  backport-inspect <path> — Check a skill for existing backport markers"
    echo "  repair                  — Rebuild INDEX.md from JSONL files"
    echo ""
    echo "Scope: project | portable | all"
    echo "Statuses: proposed | in_progress | completed | rejected"
    echo ""
    echo "Claude Code skills:"
    echo "  /continuous-learning    — Record Aha Cards after completing work"
    echo "  /aha-review             — Review learnings before starting work"
    echo "  /backport               — Graduate proven learnings into permanent skills"
    echo "  /self-learning <topic>  — Generate a new skill from web research"
    ;;
esac
`;
}

function genPluginJson(cfg) {
  return JSON.stringify({
    name: cfg.name.toLowerCase().replace(/[^a-z0-9]+/g,"-"),
    version: "1.0.0",
    description: `Claude Code configuration for ${cfg.name}`,
    author: "Generated by Veritas Lab V4",
    keywords: [...cfg.languages.map(l=>l.toLowerCase()), cfg.type],
    skills: (cfg.skills || []).map(s => `.claude/skills/${s}/SKILL.md`),
    agents: (cfg.agents || []).map(a => `.claude/agents/${a}.md`),
  }, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORT TARGETS — Multi-tool adapter system
// ═══════════════════════════════════════════════════════════════════════════

const EXPORT_TARGETS = {
  "claude-code":  { id:"claude-code",  name:"Claude Code",     icon:"⚡", color:"#f97316", desc:"Full environment: CLAUDE.md, settings, rules, skills, agents, hooks, MCP" },
  "cursor":       { id:"cursor",       name:"Cursor",          icon:"🔮", color:"#a855f7", desc:".cursor/rules/*.mdc with frontmatter + .cursorrules fallback" },
  "windsurf":     { id:"windsurf",     name:"Windsurf",        icon:"🏄", color:"#06b6d4", desc:".windsurf/rules/*.md + .windsurfrules" },
  "copilot":      { id:"copilot",      name:"GitHub Copilot",  icon:"🐙", color:"#22c55e", desc:".github/copilot-instructions.md + agents + instructions" },
  "cline":        { id:"cline",        name:"Cline",           icon:"🔧", color:"#eab308", desc:".clinerules/ folder with numbered rule files" },
  "roo-code":     { id:"roo-code",     name:"Roo Code",        icon:"🦘", color:"#ec4899", desc:".roo/rules/*.md + mode-specific rules" },
  "agents-md":    { id:"agents-md",    name:"AGENTS.md",       icon:"🤝", color:"#3b82f6", desc:"Universal standard — works with Copilot, Codex, Windsurf, Roo" },
  "aider":        { id:"aider",        name:"Aider",           icon:"🔀", color:"#64748b", desc:"CONVENTIONS.md + .aider.conf.yml" },
};

// ── LLM Provider Configuration ──

// ── Project Document Templates ──

const PROJECT_DOCS = {
  "readme":         { id:"readme",         name:"README.md",          icon:"📖", desc:"Project overview, setup, usage, contributing" },
  "prd":            { id:"prd",            name:"PRD.md",             icon:"📋", desc:"Product Requirements Document — goals, scope, user stories" },
  "contributing":   { id:"contributing",   name:"CONTRIBUTING.md",    icon:"🤝", desc:"Contribution guidelines, PR process, code standards" },
  "env-example":    { id:"env-example",    name:".env.example",       icon:"🔐", desc:"Environment variable template with descriptions" },
  "security":       { id:"security",       name:"SECURITY.md",        icon:"🛡️", desc:"Security policy, vulnerability reporting, disclosure" },
  "changelog":      { id:"changelog",      name:"CHANGELOG.md",       icon:"📝", desc:"Version history following Keep a Changelog" },
  "architecture":   { id:"architecture",   name:"docs/ARCHITECTURE.md",icon:"🏗️", desc:"System architecture, data flow, key decisions (ADR)" },
  "api-spec":       { id:"api-spec",       name:"docs/API.md",        icon:"🔌", desc:"API documentation — endpoints, auth, examples" },
  "docker-compose": { id:"docker-compose", name:"docker-compose.yml", icon:"🐳", desc:"Docker Compose for local dev environment" },
  "taskfile":       { id:"taskfile",       name:"Taskfile.yml",       icon:"📦", desc:"Taskfile.dev runner — modern Makefile alternative" },
  "custom-instructions": { id:"custom-instructions", name:"INSTRUCTIONS.md", icon:"📜", desc:"Custom AI instructions shared across all tools" },
};

const LLM_PROVIDERS = {
  "anthropic": {
    id:"anthropic", name:"Anthropic", icon:"🟠", color:"#f97316",
    endpoint:"https://api.anthropic.com/v1/messages",
    defaultModel:"claude-sonnet-4-5-20250929",
    models:["claude-sonnet-4-5-20250929","claude-haiku-4-5-20251001","claude-opus-4-5-20250929"],
    placeholder:"sk-ant-...",
    keyPrefix:"sk-ant-",
    format:"anthropic", // uses anthropic message format
    note:"Direct Anthropic API — best for Claude Code configs",
  },
  "openai": {
    id:"openai", name:"OpenAI", icon:"🟢", color:"#10b981",
    endpoint:"https://api.openai.com/v1/chat/completions",
    defaultModel:"gpt-4o",
    models:["gpt-4o","gpt-4o-mini","gpt-4.1","o3-mini","o4-mini"],
    placeholder:"sk-...",
    keyPrefix:"sk-",
    format:"openai",
    note:"OpenAI API — GPT-4o, o3, o4-mini",
  },
  "openrouter": {
    id:"openrouter", name:"OpenRouter", icon:"🔀", color:"#a855f7",
    endpoint:"https://openrouter.ai/api/v1/chat/completions",
    defaultModel:"anthropic/claude-sonnet-4",
    models:["anthropic/claude-sonnet-4","openai/gpt-4o","google/gemini-2.5-pro","meta-llama/llama-4-maverick","deepseek/deepseek-r1","qwen/qwen3-235b-a22b"],
    placeholder:"sk-or-...",
    keyPrefix:"sk-or-",
    format:"openai",
    note:"100+ models from all providers via one API",
  },
  "google": {
    id:"google", name:"Google AI", icon:"🔵", color:"#4285f4",
    endpoint:"https://generativelanguage.googleapis.com/v1beta/chat/completions",
    defaultModel:"gemini-2.5-pro",
    models:["gemini-2.5-pro","gemini-2.5-flash","gemini-2.0-flash"],
    placeholder:"AIza...",
    keyPrefix:"AIza",
    format:"openai",
    note:"Google Gemini models — key via AI Studio",
  },
  "ollama": {
    id:"ollama", name:"Ollama (local)", icon:"🦙", color:"#64748b",
    endpoint:"http://localhost:11434/v1/chat/completions",
    defaultModel:"llama3.1",
    models:["llama3.1","qwen2.5-coder","codellama","deepseek-coder-v2","mistral","gemma2","kimi-k2"],
    placeholder:"(no key needed)",
    keyPrefix:"",
    format:"openai",
    note:"Free, local — requires Ollama running on your machine",
  },
  "together": {
    id:"together", name:"Together AI", icon:"🤝", color:"#3b82f6",
    endpoint:"https://api.together.xyz/v1/chat/completions",
    defaultModel:"meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models:["meta-llama/Llama-3.3-70B-Instruct-Turbo","deepseek-ai/DeepSeek-R1","Qwen/Qwen2.5-Coder-32B-Instruct","google/gemma-2-27b-it"],
    placeholder:"tok_...",
    keyPrefix:"",
    format:"openai",
    note:"Fast inference for open-source models",
  },
  "groq": {
    id:"groq", name:"Groq", icon:"⚡", color:"#f97316",
    endpoint:"https://api.groq.com/openai/v1/chat/completions",
    defaultModel:"llama-3.3-70b-versatile",
    models:["llama-3.3-70b-versatile","llama-3.1-8b-instant","gemma2-9b-it","deepseek-r1-distill-llama-70b"],
    placeholder:"gsk_...",
    keyPrefix:"gsk_",
    format:"openai",
    note:"Ultra-fast inference — free tier available",
  },
  "kimi": {
    id:"kimi", name:"Kimi (Moonshot)", icon:"🌙", color:"#6366f1",
    endpoint:"https://api.moonshot.cn/v1/chat/completions",
    defaultModel:"kimi-k2-0711-preview",
    models:["kimi-k2-0711-preview","moonshot-v1-128k","moonshot-v1-32k","moonshot-v1-8k"],
    placeholder:"sk-...",
    keyPrefix:"sk-",
    format:"openai",
    note:"Kimi K2 — 1T MoE model, 128K context, strong at coding",
  },
  "huggingface": {
    id:"huggingface", name:"Hugging Face", icon:"🤗", color:"#fbbf24",
    endpoint:"https://router.huggingface.co/v1/chat/completions",
    defaultModel:"Qwen/Qwen2.5-Coder-32B-Instruct",
    models:["Qwen/Qwen2.5-Coder-32B-Instruct","meta-llama/Llama-3.3-70B-Instruct","mistralai/Mistral-Small-24B-Instruct-2501","deepseek-ai/DeepSeek-R1","google/gemma-2-27b-it","HuggingFaceH4/zephyr-7b-beta"],
    placeholder:"hf_...",
    keyPrefix:"hf_",
    format:"openai",
    note:"Hugging Face Inference API — open-source models, free tier available",
  },
  "custom": {
    id:"custom", name:"Custom Endpoint", icon:"🔧", color:"#94a3b8",
    endpoint:"",
    defaultModel:"",
    models:[],
    placeholder:"your-api-key",
    keyPrefix:"",
    format:"openai",
    note:"Any OpenAI-compatible API (vLLM, LM Studio, etc.)",
  },
};

// ── Shared content generators (tool-agnostic markdown) ──

function genSharedProjectDesc(cfg) {
  const s = [];
  s.push(`# ${cfg.name}\n`);
  s.push(cfg.description + "\n");
  s.push("## Tech Stack\n");
  if (cfg.languages.length) s.push(`**Languages**: ${cfg.languages.join(", ")}`);
  if (cfg.frameworks.length) s.push(`**Frameworks**: ${cfg.frameworks.join(", ")}`);
  if (cfg.databases.length) s.push(`**Data**: ${cfg.databases.join(", ")}`);
  if (cfg.infra.length) s.push(`**Infrastructure**: ${cfg.infra.join(", ")}`);
  s.push("");
  if (cfg.directories) { s.push("## Project Structure\n"); s.push(cfg.directories + "\n"); }
  if (cfg.commonCmds) { s.push("## Common Commands\n"); s.push("```\n" + cfg.commonCmds + "\n```\n"); }
  // Dependencies context
  if (cfg.frameworks.length || cfg.databases.length) {
    s.push("## Key Dependencies\n");
    cfg.frameworks.forEach(fw => {
      if (fw === "Next.js") s.push("- **Next.js**: React meta-framework with App Router, server components, API routes");
      else if (fw === "React") s.push("- **React**: UI library with hooks, functional components, JSX");
      else if (fw === "Django") s.push("- **Django**: Full-stack Python framework with ORM, admin, auth, templates");
      else if (fw === "FastAPI") s.push("- **FastAPI**: Async Python API framework with Pydantic validation, OpenAPI docs");
      else if (fw === "Express") s.push("- **Express**: Minimal Node.js HTTP framework with middleware pipeline");
      else if (fw === "NestJS") s.push("- **NestJS**: Angular-style Node.js framework with DI, decorators, modules");
      else if (fw === "Rails") s.push("- **Rails**: Ruby convention-over-configuration framework with ActiveRecord");
      else if (fw === "Laravel") s.push("- **Laravel**: PHP framework with Eloquent ORM, Blade templates, Artisan CLI");
      else if (fw === "Spring Boot") s.push("- **Spring Boot**: Java/Kotlin framework with auto-configuration, DI, JPA");
      else s.push(`- **${fw}**: Framework dependency`);
    });
    cfg.databases.forEach(db => {
      if (db === "PostgreSQL") s.push("- **PostgreSQL**: Relational DB — use transactions, parameterized queries, migrations");
      else if (db === "MongoDB") s.push("- **MongoDB**: Document DB — use schemas, indexes, aggregation pipelines");
      else if (db === "Redis") s.push("- **Redis**: In-memory store — use for caching, sessions, pub/sub");
      else if (db === "SQLite") s.push("- **SQLite**: File-based DB — use WAL mode, connection pooling");
      else s.push(`- **${db}**: Database dependency`);
    });
    s.push("");
  }
  return s.join("\n");
}

function genSharedRuleContent(id, cfg) {
  // Returns pure markdown rule content without any tool-specific wrapping
  const r = genRule(id, cfg);
  return r || "";
}

function genSharedCodingStandards(cfg) {
  const s = [];
  s.push("## Coding Standards\n");
  cfg.languages.forEach(l => {
    const st = STACKS[l];
    if (!st) return;
    s.push(`### ${l}`);
    if (st.formatters.length) s.push(`- **Formatters**: ${st.formatters.join(", ")}`);
    if (st.linters.length) s.push(`- **Linters**: ${st.linters.join(", ")}`);
    if (st.typeCheckers.length) s.push(`- **Type checking**: ${st.typeCheckers.join(", ")}`);
    if (st.testRunners?.length) s.push(`- **Testing**: ${st.testRunners.join(", ")}`);
    // Language-specific idioms
    if (l === "TypeScript") s.push("- Use `strict: true` in tsconfig.json\n- Prefer `interface` over `type` for object shapes\n- Use `unknown` instead of `any` — narrow with type guards\n- Prefer `const` assertions for literal types");
    else if (l === "Python") s.push("- Follow PEP 8 and PEP 257 (docstrings)\n- Use type hints for all function signatures\n- Prefer dataclasses or Pydantic models over plain dicts\n- Use context managers for resource management");
    else if (l === "Rust") s.push("- Use `Result<T, E>` for recoverable errors, not `unwrap()`\n- Prefer references over cloning\n- Use `clippy` suggestions as law\n- Document public APIs with `///` doc comments");
    else if (l === "Go") s.push("- Follow Effective Go guidelines\n- Handle every error — never use `_` for error returns\n- Use interfaces for testability\n- Keep packages small and focused");
    else if (l === "JavaScript") s.push("- Use `const` by default, `let` when rebinding needed\n- Prefer arrow functions for callbacks\n- Use optional chaining (`?.`) and nullish coalescing (`??`)\n- Avoid `var`, `==`, and `arguments`");
    s.push("");
  });
  s.push("## General Principles\n");
  s.push("- **Naming**: Use descriptive names — no abbreviations, no single-letter variables (except loop indices)");
  s.push("- **Functions**: Keep under 30 lines, single responsibility, max 3-4 parameters");
  s.push("- **Error handling**: Handle errors at system boundaries — network, file I/O, user input, DB queries");
  s.push("- **Tests**: Write tests for new features and bug fixes, aim for behavior coverage over line coverage");
  s.push("- **Security**: Never hardcode secrets, validate all inputs, use parameterized queries");
  s.push("- **Dependencies**: Pin versions, audit regularly, prefer well-maintained packages");
  s.push("- **Comments**: Explain *why*, not *what* — code should be self-documenting for the *what*");
  s.push("- **DRY**: Extract shared logic, but don't over-abstract — duplicate is better than wrong abstraction");
  s.push("");
  return s.join("\n");
}

// ── Universal Files (added for all targets) ──

function genEditorConfig(cfg) {
  const lines = [];
  lines.push("# EditorConfig — consistent formatting across all editors and IDEs");
  lines.push(`# Project: ${cfg.name}`);
  lines.push("root = true");
  lines.push("");
  lines.push("[*]");
  lines.push("charset = utf-8");
  lines.push("end_of_line = lf");
  lines.push("insert_final_newline = true");
  lines.push("trim_trailing_whitespace = true");
  const useTabs = cfg.languages.includes("Go");
  const tabSize = cfg.languages.includes("Python") ? 4
                : cfg.languages.includes("Rust") ? 4
                : cfg.languages.includes("Java") ? 4
                : 2;
  lines.push(`indent_style = ${useTabs ? "tab" : "space"}`);
  lines.push(`indent_size = ${tabSize}`);
  lines.push("");
  if (cfg.languages.includes("Python")) {
    lines.push("[*.py]");
    lines.push("indent_size = 4");
    lines.push("max_line_length = 88");
    lines.push("");
  }
  if (cfg.languages.includes("Go")) {
    lines.push("[*.go]");
    lines.push("indent_style = tab");
    lines.push("indent_size = 4");
    lines.push("");
  }
  if (cfg.languages.includes("Rust")) {
    lines.push("[*.rs]");
    lines.push("indent_size = 4");
    lines.push("");
  }
  lines.push("[*.md]");
  lines.push("trim_trailing_whitespace = false");
  lines.push("");
  lines.push("[*.{yml,yaml}]");
  lines.push("indent_size = 2");
  lines.push("");
  lines.push("[Makefile]");
  lines.push("indent_style = tab");
  lines.push("");
  return lines.join("\n");
}

function genGitAttributes(cfg) {
  const lines = [];
  lines.push("# Auto-detect text files and normalize line endings");
  lines.push("* text=auto");
  lines.push("");
  lines.push("# Source files");
  if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
    lines.push("*.ts text diff=typescript");
    lines.push("*.tsx text diff=typescript");
    lines.push("*.js text diff=javascript");
    lines.push("*.jsx text diff=javascript");
    lines.push("*.mjs text diff=javascript");
    lines.push("*.json text");
  }
  if (cfg.languages.includes("Python")) {
    lines.push("*.py text diff=python");
    lines.push("*.pyi text diff=python");
  }
  if (cfg.languages.includes("Rust")) {
    lines.push("*.rs text diff=rust");
    lines.push("*.toml text");
  }
  if (cfg.languages.includes("Go")) {
    lines.push("*.go text diff=golang");
    lines.push("go.sum text");
    lines.push("go.mod text");
  }
  if (cfg.languages.includes("Java") || cfg.languages.includes("Kotlin")) {
    lines.push("*.java text diff=java");
    lines.push("*.kt text diff=kotlin");
    lines.push("*.gradle text");
  }
  if (cfg.languages.includes("Ruby")) {
    lines.push("*.rb text diff=ruby");
    lines.push("Gemfile text");
    lines.push("Gemfile.lock text -diff");
  }
  if (cfg.languages.includes("PHP")) {
    lines.push("*.php text diff=php");
  }
  lines.push("");
  lines.push("# Documentation");
  lines.push("*.md text diff=markdown");
  lines.push("*.txt text");
  lines.push("*.yml text");
  lines.push("*.yaml text");
  lines.push("");
  lines.push("# Binary files");
  lines.push("*.png binary");
  lines.push("*.jpg binary");
  lines.push("*.jpeg binary");
  lines.push("*.gif binary");
  lines.push("*.ico binary");
  lines.push("*.woff binary");
  lines.push("*.woff2 binary");
  lines.push("");
  lines.push("# Lock files — track but don't diff");
  if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
    lines.push("package-lock.json text -diff");
    lines.push("yarn.lock text -diff");
    lines.push("pnpm-lock.yaml text -diff");
  }
  if (cfg.languages.includes("Python")) {
    lines.push("poetry.lock text -diff");
  }
  if (cfg.languages.includes("Rust")) {
    lines.push("Cargo.lock text -diff");
  }
  lines.push("");
  return lines.join("\n");
}

function genVSCodeSettings(cfg) {
  const settings = {};
  // Editor basics
  settings["editor.formatOnSave"] = true;
  settings["editor.tabSize"] = cfg.languages.includes("Python") || cfg.languages.includes("Rust") ? 4 : 2;
  settings["editor.insertSpaces"] = !cfg.languages.includes("Go");
  settings["files.trimTrailingWhitespace"] = true;
  settings["files.insertFinalNewline"] = true;

  // Language-specific
  if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
    settings["editor.defaultFormatter"] = "esbenp.prettier-vscode";
    settings["typescript.preferences.importModuleSpecifier"] = "relative";
    settings["[typescript]"] = { "editor.defaultFormatter": "esbenp.prettier-vscode" };
    settings["[typescriptreact]"] = { "editor.defaultFormatter": "esbenp.prettier-vscode" };
  }
  if (cfg.languages.includes("Python")) {
    settings["[python]"] = { "editor.defaultFormatter": "charliermarsh.ruff", "editor.formatOnSave": true };
    settings["python.analysis.typeCheckingMode"] = "basic";
  }
  if (cfg.languages.includes("Rust")) {
    settings["[rust]"] = { "editor.defaultFormatter": "rust-lang.rust-analyzer" };
    settings["rust-analyzer.checkOnSave.command"] = "clippy";
  }
  if (cfg.languages.includes("Go")) {
    settings["[go]"] = { "editor.defaultFormatter": "golang.go", "editor.insertSpaces": false };
    settings["gopls"] = { "ui.semanticTokens": true };
  }

  // Exclude patterns
  settings["files.exclude"] = {
    "**/.git": true,
    "**/node_modules": true,
    "**/.DS_Store": true,
    "**/__pycache__": true,
    "**/.pytest_cache": true,
    "**/target": cfg.languages.includes("Rust"),
  };

  // Search exclude
  settings["search.exclude"] = {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true,
    "**/coverage": true,
  };

  return JSON.stringify(settings, null, 2);
}

function genVSCodeExtensions(cfg) {
  const recs = [];
  // Universal
  recs.push("editorconfig.editorconfig");
  recs.push("streetsidesoftware.code-spell-checker");
  // Language-specific
  if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
    recs.push("esbenp.prettier-vscode", "dbaeumer.vscode-eslint");
  }
  if (cfg.languages.includes("Python")) {
    recs.push("charliermarsh.ruff", "ms-python.python", "ms-python.vscode-pylance");
  }
  if (cfg.languages.includes("Rust")) {
    recs.push("rust-lang.rust-analyzer", "serayuzgur.crates");
  }
  if (cfg.languages.includes("Go")) {
    recs.push("golang.go");
  }
  if (cfg.languages.includes("Java")) {
    recs.push("vscjava.vscode-java-pack");
  }
  if (cfg.languages.includes("Ruby")) {
    recs.push("shopify.ruby-lsp");
  }
  if (cfg.languages.includes("PHP")) {
    recs.push("bmewburn.vscode-intelephense-client");
  }
  // Framework-specific
  if (cfg.frameworks.includes("React") || cfg.frameworks.includes("Next.js")) {
    recs.push("dsznajder.es7-react-js-snippets");
  }
  if (cfg.frameworks.includes("Vue") || cfg.frameworks.includes("Nuxt")) {
    recs.push("Vue.volar");
  }
  if (cfg.frameworks.includes("Svelte") || cfg.frameworks.includes("SvelteKit")) {
    recs.push("svelte.svelte-vscode");
  }
  if (cfg.databases.includes("PostgreSQL") || cfg.databases.includes("MySQL") || cfg.databases.includes("SQLite")) {
    recs.push("mtxr.sqltools");
  }
  if (cfg.databases.includes("Prisma")) {
    recs.push("Prisma.prisma");
  }
  if (cfg.infra.includes("Docker")) {
    recs.push("ms-azuretools.vscode-docker");
  }
  if (cfg.infra.includes("Terraform")) {
    recs.push("hashicorp.terraform");
  }
  // AI coding tools matching export targets
  recs.push("continue.continue");
  const obj = { recommendations: [...new Set(recs)] };
  return JSON.stringify(obj, null, 2);
}

// ── Universal Linter/Formatter Config Generation ──

function genLinterConfigs(cfg) {
  const files = {};
  // ESLint for JS/TS
  if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
    const isTS = cfg.languages.includes("TypeScript");
    const hasReact = cfg.frameworks.some(f => ["React","Next.js","Remix"].includes(f));
    const ext = [];
    ext.push("eslint:recommended");
    if (isTS) ext.push("plugin:@typescript-eslint/recommended");
    if (hasReact) ext.push("plugin:react/recommended","plugin:react-hooks/recommended");
    files[".eslintrc.json"] = JSON.stringify({
      root: true,
      env: { browser: hasReact, node: true, es2024: true },
      extends: ext,
      ...(isTS ? { parser: "@typescript-eslint/parser", parserOptions: { ecmaVersion: "latest", sourceType: "module", ...(hasReact ? { ecmaFeatures: { jsx: true } } : {}) } } : {}),
      rules: {
        "no-console": "warn",
        "no-unused-vars": "off",
        ...(isTS ? { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] } : {}),
        "prefer-const": "error",
        "no-var": "error",
        "eqeqeq": ["error", "always"],
      },
      ...(hasReact ? { settings: { react: { version: "detect" } } } : {}),
    }, null, 2);

    // Prettier
    const prettier = { semi: true, singleQuote: true, trailingComma: "es5", tabWidth: 2, printWidth: 100 };
    if (cfg.frameworks.includes("Vue") || cfg.frameworks.includes("Nuxt")) prettier.vueIndentScriptAndStyle = true;
    files[".prettierrc"] = JSON.stringify(prettier, null, 2);
    files[".prettierignore"] = ["node_modules","dist","build",".next","coverage","*.min.js","package-lock.json","pnpm-lock.yaml"].join("\n") + "\n";
  }

  // Ruff for Python
  if (cfg.languages.includes("Python")) {
    const ruff = [];
    ruff.push("# Ruff configuration");
    ruff.push(`# Project: ${cfg.name}`);
    ruff.push("");
    ruff.push("[tool.ruff]");
    ruff.push("target-version = \"py311\"");
    ruff.push("line-length = 88");
    ruff.push("");
    ruff.push("[tool.ruff.lint]");
    ruff.push('select = ["E", "F", "I", "N", "W", "UP", "B", "A", "C4", "SIM", "TCH"]');
    ruff.push('ignore = ["E501"]  # line length handled by formatter');
    ruff.push("");
    ruff.push("[tool.ruff.lint.isort]");
    ruff.push("known-first-party = [\"" + (cfg.name||"app").toLowerCase().replace(/[^a-z0-9]/g,"_") + "\"]");
    ruff.push("");
    ruff.push("[tool.ruff.format]");
    ruff.push('quote-style = "double"');
    ruff.push("indent-style = \"space\"");
    ruff.push("");
    files["ruff.toml"] = ruff.join("\n");

    // pyproject.toml (basic)
    const pyp = [];
    pyp.push("[project]");
    pyp.push(`name = "${(cfg.name||"app").toLowerCase().replace(/[^a-z0-9]+/g,"-")}"`);
    pyp.push('version = "0.1.0"');
    pyp.push(`description = "${cfg.description}"`);
    pyp.push('requires-python = ">=3.11"');
    pyp.push("");
    pyp.push("[tool.pytest.ini_options]");
    pyp.push("testpaths = [\"tests\"]");
    pyp.push('addopts = "-v --tb=short"');
    pyp.push("");
    pyp.push("[tool.mypy]");
    pyp.push("python_version = \"3.11\"");
    pyp.push("warn_return_any = true");
    pyp.push("warn_unused_configs = true");
    pyp.push("disallow_untyped_defs = true");
    pyp.push("");
    files["pyproject.toml"] = pyp.join("\n");
  }

  // Rustfmt for Rust
  if (cfg.languages.includes("Rust")) {
    files["rustfmt.toml"] = [
      "# Rust formatter config",
      "edition = \"2021\"",
      "max_width = 100",
      "tab_spaces = 4",
      "use_small_heuristics = \"Max\"",
      "imports_granularity = \"Crate\"",
      "group_imports = \"StdExternalCrate\"",
      "",
    ].join("\n");

    files["clippy.toml"] = [
      "# Clippy config",
      "cognitive-complexity-threshold = 25",
      "too-many-arguments-threshold = 7",
      "",
    ].join("\n");
  }

  // .golangci.yml for Go
  if (cfg.languages.includes("Go")) {
    files[".golangci.yml"] = [
      "# golangci-lint config",
      `# Project: ${cfg.name}`,
      "",
      "linters:",
      "  enable:",
      "    - errcheck",
      "    - govet",
      "    - staticcheck",
      "    - unused",
      "    - gosimple",
      "    - ineffassign",
      "    - misspell",
      "    - gofmt",
      "    - goimports",
      "",
      "linters-settings:",
      "  errcheck:",
      "    check-type-assertions: true",
      "  govet:",
      "    check-shadowing: true",
      "",
      "issues:",
      "  max-issues-per-linter: 50",
      "  max-same-issues: 5",
      "",
    ].join("\n");
  }

  return files;
}

// ── CI/CD Workflow Generation ──

function genCIWorkflow(cfg) {
  const files = {};
  const y = [];
  y.push(`# CI — ${cfg.name}`);
  y.push("# Generated by Veritas Lab V4");
  y.push("");
  y.push("name: CI");
  y.push("");
  y.push("on:");
  y.push("  push:");
  y.push("    branches: [main, master]");
  y.push("  pull_request:");
  y.push("    branches: [main, master]");
  y.push("");
  y.push("jobs:");

  if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
    const pm = cfg.frameworks.includes("Next.js") || cfg.frameworks.includes("Remix") ? "npm" : "npm";
    y.push("  lint-and-test:");
    y.push("    runs-on: ubuntu-latest");
    y.push("    strategy:");
    y.push("      matrix:");
    y.push("        node-version: [18, 20, 22]");
    y.push("    steps:");
    y.push("      - uses: actions/checkout@v4");
    y.push("      - uses: actions/setup-node@v4");
    y.push("        with:");
    y.push("          node-version: ${{ matrix.node-version }}");
    y.push("          cache: npm");
    y.push(`      - run: ${pm} ci`);
    y.push(`      - run: ${pm} run lint`);
    if (cfg.languages.includes("TypeScript")) y.push(`      - run: ${pm} run typecheck || npx tsc --noEmit`);
    y.push(`      - run: ${pm} test`);
    if (cfg.frameworks.includes("Next.js")) y.push(`      - run: ${pm} run build`);
    y.push("");
  }

  if (cfg.languages.includes("Python")) {
    y.push("  python-checks:");
    y.push("    runs-on: ubuntu-latest");
    y.push("    strategy:");
    y.push("      matrix:");
    y.push("        python-version: ['3.11', '3.12']");
    y.push("    steps:");
    y.push("      - uses: actions/checkout@v4");
    y.push("      - uses: actions/setup-python@v5");
    y.push("        with:");
    y.push("          python-version: ${{ matrix.python-version }}");
    y.push("      - run: pip install -e '.[dev]' || pip install -r requirements.txt");
    y.push("      - run: ruff check .");
    y.push("      - run: ruff format --check .");
    y.push("      - run: mypy . --ignore-missing-imports");
    y.push("      - run: pytest");
    y.push("");
  }

  if (cfg.languages.includes("Rust")) {
    y.push("  rust-checks:");
    y.push("    runs-on: ubuntu-latest");
    y.push("    steps:");
    y.push("      - uses: actions/checkout@v4");
    y.push("      - uses: dtolnay/rust-toolchain@stable");
    y.push("        with:");
    y.push("          components: clippy, rustfmt");
    y.push("      - uses: Swatinem/rust-cache@v2");
    y.push("      - run: cargo fmt --check");
    y.push("      - run: cargo clippy -- -D warnings");
    y.push("      - run: cargo test");
    y.push("");
  }

  if (cfg.languages.includes("Go")) {
    y.push("  go-checks:");
    y.push("    runs-on: ubuntu-latest");
    y.push("    steps:");
    y.push("      - uses: actions/checkout@v4");
    y.push("      - uses: actions/setup-go@v5");
    y.push("        with:");
    y.push("          go-version: stable");
    y.push("      - run: go vet ./...");
    y.push("      - uses: golangci/golangci-lint-action@v4");
    y.push("      - run: go test -race -coverprofile=coverage.out ./...");
    y.push("");
  }

  files[".github/workflows/ci.yml"] = y.join("\n");
  return files;
}

// ── Makefile Generation ──

function genMakefile(cfg) {
  const lines = [];
  lines.push(`# Makefile — ${cfg.name}`);
  lines.push("# Generated by Veritas Lab V4");
  lines.push(".PHONY: help lint test format build clean");
  lines.push("");
  lines.push("help: ## Show this help");
  lines.push('\t@grep -E \'^[a-zA-Z_-]+:.*?## .*$$\' $(MAKEFILE_LIST) | sort | awk \'BEGIN {FS = ":.*?## "}; {printf "\\033[36m%-15s\\033[0m %s\\n", $$1, $$2}\'');
  lines.push("");

  if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
    lines.push("install: ## Install dependencies");
    lines.push("\tnpm ci");
    lines.push("");
    lines.push("lint: ## Run ESLint");
    lines.push("\tnpx eslint . --fix");
    lines.push("");
    lines.push("format: ## Run Prettier");
    lines.push("\tnpx prettier --write .");
    lines.push("");
    lines.push("test: ## Run tests");
    lines.push("\tnpm test");
    lines.push("");
    if (cfg.languages.includes("TypeScript")) {
      lines.push("typecheck: ## TypeScript type check");
      lines.push("\tnpx tsc --noEmit");
      lines.push("");
    }
    if (cfg.frameworks.includes("Next.js")) {
      lines.push("build: ## Build Next.js app");
      lines.push("\tnpm run build");
      lines.push("");
      lines.push("dev: ## Start dev server");
      lines.push("\tnpm run dev");
      lines.push("");
    }
  }
  if (cfg.languages.includes("Python")) {
    lines.push("install: ## Install dependencies");
    lines.push("\tpip install -e '.[dev]'");
    lines.push("");
    lines.push("lint: ## Run ruff linter");
    lines.push("\truff check . --fix");
    lines.push("");
    lines.push("format: ## Format with ruff");
    lines.push("\truff format .");
    lines.push("");
    lines.push("typecheck: ## Run mypy");
    lines.push("\tmypy . --ignore-missing-imports");
    lines.push("");
    lines.push("test: ## Run pytest");
    lines.push("\tpytest -v");
    lines.push("");
  }
  if (cfg.languages.includes("Rust")) {
    lines.push("build: ## Build project");
    lines.push("\tcargo build");
    lines.push("");
    lines.push("lint: ## Run clippy");
    lines.push("\tcargo clippy -- -D warnings");
    lines.push("");
    lines.push("format: ## Run rustfmt");
    lines.push("\tcargo fmt");
    lines.push("");
    lines.push("test: ## Run tests");
    lines.push("\tcargo test");
    lines.push("");
  }
  if (cfg.languages.includes("Go")) {
    lines.push("build: ## Build project");
    lines.push("\tgo build ./...");
    lines.push("");
    lines.push("lint: ## Run golangci-lint");
    lines.push("\tgolangci-lint run");
    lines.push("");
    lines.push("format: ## Run gofmt");
    lines.push("\tgofmt -w .");
    lines.push("");
    lines.push("test: ## Run tests");
    lines.push("\tgo test -race ./...");
    lines.push("");
  }
  lines.push("clean: ## Clean build artifacts");
  if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) lines.push("\trm -rf node_modules dist .next build coverage");
  if (cfg.languages.includes("Python")) lines.push("\trm -rf __pycache__ .pytest_cache .mypy_cache .ruff_cache dist *.egg-info");
  if (cfg.languages.includes("Rust")) lines.push("\tcargo clean");
  if (cfg.languages.includes("Go")) lines.push("\tgo clean -cache");
  lines.push("");

  // All-in-one check
  lines.push("check: lint format test ## Run all checks");
  lines.push("");

  return lines.join("\n");
}

// ── Project Document Generators ──

function genProjectDocs(cfg) {
  const files = {};
  const docs = cfg.projectDocs || [];
  if (!docs.length) return files;

  if (docs.includes("readme")) {
    const r = [];
    r.push(`# ${cfg.name}\n`);
    r.push(cfg.description + "\n");
    r.push("## Quick Start\n");
    r.push("```bash");
    r.push("git clone <repo-url>");
    r.push(`cd ${(cfg.name||"project").toLowerCase().replace(/[^a-z0-9]+/g,"-")}`);
    if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
      r.push("npm install");
      r.push("cp .env.example .env  # configure environment");
      r.push("npm run dev");
    }
    if (cfg.languages.includes("Python")) {
      r.push("python -m venv .venv && source .venv/bin/activate");
      r.push("pip install -e '.[dev]'");
      r.push("cp .env.example .env");
      if (cfg.frameworks.includes("Django")) r.push("python manage.py runserver");
      else if (cfg.frameworks.includes("FastAPI")) r.push("uvicorn app.main:app --reload");
      else r.push("python -m " + (cfg.name||"app").toLowerCase().replace(/[^a-z0-9]/g,"_"));
    }
    if (cfg.languages.includes("Rust")) r.push("cargo build && cargo run");
    if (cfg.languages.includes("Go")) r.push("go build && go run .");
    r.push("```\n");
    r.push("## Tech Stack\n");
    if (cfg.languages.length) r.push("- **Languages**: " + cfg.languages.join(", "));
    if (cfg.frameworks.length) r.push("- **Frameworks**: " + cfg.frameworks.join(", "));
    if (cfg.databases.length) r.push("- **Databases**: " + cfg.databases.join(", "));
    if (cfg.infra.length) r.push("- **Infrastructure**: " + cfg.infra.join(", "));
    r.push("");
    if (cfg.directories) { r.push("## Project Structure\n"); r.push("```"); r.push(cfg.directories); r.push("```\n"); }
    r.push("## Development\n");
    r.push("```bash");
    r.push("make lint      # Run linters");
    r.push("make test      # Run tests");
    r.push("make format    # Auto-format code");
    r.push("make check     # Run all checks");
    r.push("```\n");
    r.push("## Contributing\n");
    r.push("See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.\n");
    r.push("## License\n");
    r.push("MIT\n");
    files["README.md"] = r.join("\n");
  }

  if (docs.includes("prd")) {
    const p = [];
    p.push(`# Product Requirements Document: ${cfg.name}\n`);
    p.push("## Overview\n");
    p.push(`${cfg.description}\n`);
    p.push("## Goals\n");
    p.push("1. <!-- Primary business goal -->");
    p.push("2. <!-- Secondary goal -->");
    p.push("3. <!-- Technical goal -->\n");
    p.push("## Non-Goals\n");
    p.push("- <!-- What this project explicitly does NOT do -->\n");
    p.push("## User Stories\n");
    p.push("### Core User Flows\n");
    p.push("- **As a** [user type], **I want** [action], **so that** [outcome]");
    p.push("- **As a** [user type], **I want** [action], **so that** [outcome]\n");
    p.push("## Technical Requirements\n");
    p.push(`- **Stack**: ${cfg.languages.join(", ")}${cfg.frameworks.length ? " + " + cfg.frameworks.join(", ") : ""}`);
    p.push(`- **Data**: ${cfg.databases.length ? cfg.databases.join(", ") : "TBD"}`);
    p.push(`- **Infrastructure**: ${cfg.infra.length ? cfg.infra.join(", ") : "TBD"}\n`);
    p.push("## Architecture\n");
    p.push("<!-- Link to docs/ARCHITECTURE.md or describe high-level architecture -->\n");
    p.push("## Success Metrics\n");
    p.push("| Metric | Target | Measurement |");
    p.push("|--------|--------|-------------|");
    p.push("| <!-- e.g., Response time --> | <!-- <200ms --> | <!-- p95 latency --> |");
    p.push("| <!-- e.g., Test coverage --> | <!-- >80% --> | <!-- CI report --> |\n");
    p.push("## Timeline\n");
    p.push("| Phase | Scope | Target Date |");
    p.push("|-------|-------|-------------|");
    p.push("| MVP | Core features | <!-- date --> |");
    p.push("| V1 | Full feature set | <!-- date --> |");
    p.push("| V2 | Scale + optimization | <!-- date --> |\n");
    p.push("## Open Questions\n");
    p.push("- [ ] <!-- Decision that needs to be made -->");
    p.push("- [ ] <!-- Technical spike needed -->\n");
    files["docs/PRD.md"] = p.join("\n");
  }

  if (docs.includes("contributing")) {
    const c = [];
    c.push(`# Contributing to ${cfg.name}\n`);
    c.push("## Getting Started\n");
    c.push("1. Fork the repository");
    c.push("2. Create a feature branch: `git checkout -b feature/your-feature`");
    c.push("3. Make your changes");
    c.push("4. Run checks: `make check`");
    c.push("5. Commit with " + (cfg.commitConv === "conventional" ? "Conventional Commits" : "descriptive messages") + ": `git commit -m \"feat: add feature\"`");
    c.push("6. Push and open a PR\n");
    c.push("## Code Standards\n");
    cfg.languages.forEach(l => {
      if (l === "TypeScript" || l === "JavaScript") c.push("- **" + l + "**: ESLint + Prettier — run `npm run lint` before committing");
      else if (l === "Python") c.push("- **Python**: Ruff for linting and formatting — run `ruff check . && ruff format .`");
      else if (l === "Rust") c.push("- **Rust**: `cargo fmt` and `cargo clippy` must pass with no warnings");
      else if (l === "Go") c.push("- **Go**: `gofmt` and `golangci-lint` must pass");
    });
    c.push("");
    c.push("## Commit Convention\n");
    if (cfg.commitConv === "conventional") {
      c.push("We use [Conventional Commits](https://www.conventionalcommits.org/):\n");
      c.push("- `feat:` — New feature");
      c.push("- `fix:` — Bug fix");
      c.push("- `docs:` — Documentation only");
      c.push("- `refactor:` — Code change that neither fixes a bug nor adds a feature");
      c.push("- `test:` — Adding or updating tests");
      c.push("- `chore:` — Build process or auxiliary tool changes\n");
    }
    c.push("## Pull Request Process\n");
    c.push("1. Update relevant documentation");
    c.push("2. Add tests for new functionality");
    c.push("3. Ensure CI passes");
    c.push("4. Request review from a maintainer");
    c.push("5. Squash and merge after approval\n");
    c.push("## Reporting Issues\n");
    c.push("Use GitHub Issues with the appropriate template. Include:");
    c.push("- Steps to reproduce");
    c.push("- Expected vs actual behavior");
    c.push("- Environment details\n");
    files["CONTRIBUTING.md"] = c.join("\n");
  }

  if (docs.includes("env-example")) {
    const e = [];
    e.push(`# Environment Variables — ${cfg.name}`);
    e.push("# Copy to .env and fill in values: cp .env.example .env\n");
    e.push("# Application");
    e.push("NODE_ENV=development");
    e.push("PORT=3000");
    e.push("LOG_LEVEL=debug\n");
    if (cfg.databases.includes("PostgreSQL")) {
      e.push("# PostgreSQL");
      e.push("DATABASE_URL=postgresql://user:password@localhost:5432/" + (cfg.name||"app").toLowerCase().replace(/[^a-z0-9]/g,"_"));
      e.push("");
    }
    if (cfg.databases.includes("Redis")) {
      e.push("# Redis");
      e.push("REDIS_URL=redis://localhost:6379");
      e.push("");
    }
    if (cfg.databases.includes("MongoDB")) {
      e.push("# MongoDB");
      e.push("MONGODB_URI=mongodb://localhost:27017/" + (cfg.name||"app").toLowerCase().replace(/[^a-z0-9]/g,"_"));
      e.push("");
    }
    e.push("# Auth (replace with real values)");
    e.push("JWT_SECRET=change-me-to-a-random-string");
    e.push("SESSION_SECRET=change-me-to-a-random-string\n");
    e.push("# Third-party APIs");
    e.push("# STRIPE_SECRET_KEY=sk_test_...");
    e.push("# SENDGRID_API_KEY=SG....");
    e.push("# AWS_ACCESS_KEY_ID=");
    e.push("# AWS_SECRET_ACCESS_KEY=");
    e.push("# AWS_REGION=us-east-1\n");
    if (cfg.frameworks.includes("Next.js")) {
      e.push("# Next.js");
      e.push("NEXT_PUBLIC_API_URL=http://localhost:3000/api");
      e.push("");
    }
    files[".env.example"] = e.join("\n");
  }

  if (docs.includes("security")) {
    const s = [];
    s.push(`# Security Policy — ${cfg.name}\n`);
    s.push("## Reporting a Vulnerability\n");
    s.push("**Please do NOT open public issues for security vulnerabilities.**\n");
    s.push("Instead, email: **security@your-domain.com**\n");
    s.push("Include:");
    s.push("- Description of the vulnerability");
    s.push("- Steps to reproduce");
    s.push("- Potential impact");
    s.push("- Suggested fix (if any)\n");
    s.push("## Response Timeline\n");
    s.push("- **Acknowledgment**: Within 48 hours");
    s.push("- **Assessment**: Within 1 week");
    s.push("- **Fix + Disclosure**: Within 30 days (90 days for complex issues)\n");
    s.push("## Scope\n");
    s.push("In-scope:");
    s.push("- Application code and APIs");
    s.push("- Authentication and authorization");
    s.push("- Data exposure or injection vulnerabilities");
    s.push("- Dependency vulnerabilities\n");
    s.push("Out of scope:");
    s.push("- Social engineering");
    s.push("- Denial of service attacks");
    s.push("- Issues in third-party services\n");
    s.push("## Security Practices\n");
    s.push("- All secrets stored in environment variables");
    s.push("- Dependencies audited weekly");
    s.push("- Input validation at all boundaries");
    s.push("- Parameterized queries for all database access");
    s.push("- HTTPS enforced in production\n");
    files["SECURITY.md"] = s.join("\n");
  }

  if (docs.includes("changelog")) {
    const c = [];
    c.push(`# Changelog — ${cfg.name}\n`);
    c.push("All notable changes to this project will be documented in this file.\n");
    c.push("Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),");
    c.push("adhering to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n");
    c.push("## [Unreleased]\n");
    c.push("### Added");
    c.push("- Initial project setup");
    c.push("- " + cfg.languages.join(", ") + " configuration");
    if (cfg.frameworks.length) c.push("- " + cfg.frameworks.join(", ") + " integration");
    c.push("");
    c.push("### Changed\n");
    c.push("### Fixed\n");
    c.push("### Removed\n");
    c.push("## [0.1.0] - " + new Date().toISOString().split("T")[0] + "\n");
    c.push("### Added");
    c.push("- Project scaffolding");
    c.push("- AI coding environment configuration\n");
    files["CHANGELOG.md"] = c.join("\n");
  }

  if (docs.includes("architecture")) {
    const a = [];
    a.push(`# Architecture — ${cfg.name}\n`);
    a.push("## Overview\n");
    a.push(cfg.description + "\n");
    a.push("## System Diagram\n");
    a.push("```");
    if (cfg.type === "web" || cfg.type === "saas") {
      a.push("┌──────────┐     ┌──────────┐     ┌──────────┐");
      a.push("│  Client  │────▶│   API    │────▶│ Database │");
      a.push("│ (Browser)│     │ (Server) │     │          │");
      a.push("└──────────┘     └──────────┘     └──────────┘");
    } else {
      a.push("┌──────────┐     ┌──────────┐");
      a.push("│  Input   │────▶│  Core    │────▶ Output");
      a.push("└──────────┘     └──────────┘");
    }
    a.push("```\n");
    a.push("## Key Decisions (ADRs)\n");
    a.push("### ADR-001: " + (cfg.frameworks[0] || cfg.languages[0]) + " as primary framework\n");
    a.push("- **Status**: Accepted");
    a.push("- **Context**: " + cfg.description);
    a.push("- **Decision**: Use " + (cfg.frameworks[0] || cfg.languages[0]) + " for " + (cfg.type === "web" ? "server-rendered UI with API routes" : "core application logic"));
    a.push("- **Consequences**: Team must be proficient in " + cfg.languages[0] + "\n");
    if (cfg.databases.length) {
      a.push("### ADR-002: " + cfg.databases[0] + " as primary data store\n");
      a.push("- **Status**: Accepted");
      a.push("- **Decision**: " + cfg.databases[0] + " for " + (cfg.databases[0] === "PostgreSQL" ? "ACID compliance and relational data" : cfg.databases[0] === "MongoDB" ? "flexible schema and document storage" : "data persistence"));
      a.push("");
    }
    a.push("## Data Flow\n");
    a.push("1. Request → Validation → Auth check");
    a.push("2. Business logic → Data access layer");
    a.push("3. Response serialization → Client\n");
    a.push("## Scaling Strategy\n");
    a.push("- Horizontal scaling via " + (cfg.infra.includes("Kubernetes") ? "Kubernetes pods" : cfg.infra.includes("Docker") ? "Docker containers" : "process replication"));
    a.push("- " + (cfg.databases.includes("Redis") ? "Redis for caching and session management" : "In-memory caching at application layer"));
    a.push("- " + (cfg.infra.includes("AWS") ? "AWS managed services" : cfg.infra.includes("GCP") ? "GCP managed services" : "Cloud-native deployment") + "\n");
    files["docs/ARCHITECTURE.md"] = a.join("\n");
  }

  if (docs.includes("api-spec")) {
    const a = [];
    a.push(`# API Documentation — ${cfg.name}\n`);
    a.push("## Base URL\n");
    a.push("```");
    a.push("Development: http://localhost:3000/api");
    a.push("Production:  https://api.your-domain.com");
    a.push("```\n");
    a.push("## Authentication\n");
    a.push("```http");
    a.push("Authorization: Bearer <token>");
    a.push("```\n");
    a.push("## Endpoints\n");
    a.push("### Health Check\n");
    a.push("```http");
    a.push("GET /api/health");
    a.push("```\n");
    a.push("Response: `200 OK`");
    a.push("```json");
    a.push('{ "status": "ok", "version": "0.1.0" }');
    a.push("```\n");
    a.push("### [Resource Name]\n");
    a.push("```http");
    a.push("GET    /api/[resource]          # List all");
    a.push("POST   /api/[resource]          # Create");
    a.push("GET    /api/[resource]/:id       # Get one");
    a.push("PUT    /api/[resource]/:id       # Update");
    a.push("DELETE /api/[resource]/:id       # Delete");
    a.push("```\n");
    a.push("## Error Responses\n");
    a.push("```json");
    a.push('{ "error": { "code": "NOT_FOUND", "message": "Resource not found" } }');
    a.push("```\n");
    a.push("| Status | Meaning |");
    a.push("|--------|---------|");
    a.push("| 400 | Bad Request — validation error |");
    a.push("| 401 | Unauthorized — missing/invalid token |");
    a.push("| 403 | Forbidden — insufficient permissions |");
    a.push("| 404 | Not Found |");
    a.push("| 429 | Rate Limited |");
    a.push("| 500 | Internal Server Error |\n");
    a.push("## Rate Limits\n");
    a.push("- **Authenticated**: 1000 requests/minute");
    a.push("- **Unauthenticated**: 60 requests/minute\n");
    files["docs/API.md"] = a.join("\n");
  }

  if (docs.includes("docker-compose")) {
    const d = [];
    d.push(`# Docker Compose — ${cfg.name}`);
    d.push("# Generated by Veritas Lab V4\n");
    d.push("services:");
    d.push("  app:");
    d.push("    build: .");
    d.push("    ports:");
    d.push('      - "3000:3000"');
    d.push("    env_file: .env");
    d.push("    volumes:");
    d.push("      - .:/app");
    d.push("      - /app/node_modules");
    const deps = [];
    if (cfg.databases.includes("PostgreSQL")) {
      deps.push("postgres");
      d.push("    depends_on:");
      d.push("      postgres:");
      d.push('        condition: service_healthy');
    }
    d.push("");
    if (cfg.databases.includes("PostgreSQL")) {
      d.push("  postgres:");
      d.push("    image: postgres:16-alpine");
      d.push("    environment:");
      d.push("      POSTGRES_USER: dev");
      d.push("      POSTGRES_PASSWORD: dev");
      d.push("      POSTGRES_DB: " + (cfg.name||"app").toLowerCase().replace(/[^a-z0-9]/g,"_"));
      d.push("    ports:");
      d.push('      - "5432:5432"');
      d.push("    volumes:");
      d.push("      - pgdata:/var/lib/postgresql/data");
      d.push("    healthcheck:");
      d.push('      test: ["CMD-SHELL", "pg_isready -U dev"]');
      d.push("      interval: 5s");
      d.push("      timeout: 5s");
      d.push("      retries: 5\n");
    }
    if (cfg.databases.includes("Redis")) {
      d.push("  redis:");
      d.push("    image: redis:7-alpine");
      d.push("    ports:");
      d.push('      - "6379:6379"');
      d.push("    volumes:");
      d.push("      - redisdata:/data\n");
    }
    if (cfg.databases.includes("MongoDB")) {
      d.push("  mongo:");
      d.push("    image: mongo:7");
      d.push("    ports:");
      d.push('      - "27017:27017"');
      d.push("    volumes:");
      d.push("      - mongodata:/data/db\n");
    }
    d.push("volumes:");
    if (cfg.databases.includes("PostgreSQL")) d.push("  pgdata:");
    if (cfg.databases.includes("Redis")) d.push("  redisdata:");
    if (cfg.databases.includes("MongoDB")) d.push("  mongodata:");
    if (!cfg.databases.length) d.push("  appdata:");
    d.push("");
    files["docker-compose.yml"] = d.join("\n");
  }

  if (docs.includes("taskfile")) {
    const t = [];
    t.push(`# Taskfile — ${cfg.name}`);
    t.push("# https://taskfile.dev\n");
    t.push("version: '3'\n");
    t.push("vars:");
    t.push("  PROJECT: " + (cfg.name||"app").toLowerCase().replace(/[^a-z0-9]+/g,"-"));
    t.push("");
    t.push("tasks:");
    t.push("  default:");
    t.push("    cmds:");
    t.push("      - task --list");
    t.push("    silent: true\n");
    if (cfg.languages.includes("TypeScript") || cfg.languages.includes("JavaScript")) {
      t.push("  dev:");
      t.push("    desc: Start development server");
      t.push("    cmds:");
      t.push("      - npm run dev\n");
      t.push("  lint:");
      t.push("    desc: Run ESLint");
      t.push("    cmds:");
      t.push("      - npx eslint . --fix\n");
      t.push("  test:");
      t.push("    desc: Run tests");
      t.push("    cmds:");
      t.push("      - npm test\n");
    }
    if (cfg.languages.includes("Python")) {
      t.push("  lint:");
      t.push("    desc: Run ruff");
      t.push("    cmds:");
      t.push("      - ruff check . --fix\n");
      t.push("  test:");
      t.push("    desc: Run pytest");
      t.push("    cmds:");
      t.push("      - pytest -v\n");
    }
    t.push("  check:");
    t.push("    desc: Run all checks");
    t.push("    cmds:");
    t.push("      - task: lint");
    t.push("      - task: test\n");
    files["Taskfile.yml"] = t.join("\n");
  }

  if (docs.includes("custom-instructions")) {
    const i = [];
    i.push(`# Custom Instructions — ${cfg.name}\n`);
    i.push("These instructions apply to ALL AI coding assistants working on this project.\n");
    i.push("## Project Context\n");
    i.push(cfg.description + "\n");
    i.push("## Architecture Principles\n");
    i.push("- <!-- e.g., Prefer composition over inheritance -->");
    i.push("- <!-- e.g., All data access through repository pattern -->");
    i.push("- <!-- e.g., No direct database queries in route handlers -->\n");
    i.push("## Domain-Specific Rules\n");
    i.push("- <!-- e.g., All monetary values stored as integers (cents) -->");
    i.push("- <!-- e.g., User-facing dates always in ISO 8601 -->");
    i.push("- <!-- e.g., All API responses follow JSON:API spec -->\n");
    i.push("## Code Conventions\n");
    i.push("- <!-- e.g., Use barrel exports (index.ts) for all modules -->");
    i.push("- <!-- e.g., Prefer named exports over default exports -->");
    i.push("- <!-- e.g., All React components use function declarations -->\n");
    i.push("## Forbidden Patterns\n");
    i.push("- <!-- e.g., Never use `any` type in TypeScript -->");
    i.push("- <!-- e.g., Never use ORM raw queries -->");
    i.push("- <!-- e.g., Never commit directly to main branch -->\n");
    i.push("## Testing Requirements\n");
    i.push("- <!-- e.g., Every API endpoint must have integration tests -->");
    i.push("- <!-- e.g., Minimum 80% branch coverage -->");
    i.push("- <!-- e.g., All edge cases documented with test names -->\n");
    files["INSTRUCTIONS.md"] = i.join("\n");
  }

  return files;
}

// ── Cursor Adapter ──

function genCursorFiles(cfg) {
  const files = {};
  // Main .cursorrules (legacy compat — comprehensive)
  const main = [];
  main.push(genSharedProjectDesc(cfg));
  main.push(genSharedCodingStandards(cfg));
  main.push("## AI Assistant Behavior\n");
  main.push("- Think step-by-step before writing code");
  main.push("- Always explain what you're changing and why");
  main.push("- Prefer small, focused changes over large refactors");
  main.push("- Run existing tests before making changes");
  main.push("- Never delete tests that are failing — fix them instead");
  main.push("- When unsure, ask for clarification rather than guessing");
  main.push(`- Use ${cfg.languages[0] || "TypeScript"} idioms and patterns\n`);
  if (cfg.frameworks.length) {
    main.push("## Framework Conventions\n");
    cfg.frameworks.forEach(fw => {
      if (fw === "Next.js") main.push("- Use App Router with `page.tsx` files in route directories\n- Client components must use `'use client'` directive\n- Prefer Server Components by default\n- Use `loading.tsx` and `error.tsx` for route-level UI states");
      else if (fw === "React") main.push("- Use functional components with hooks\n- Custom hooks for reusable logic\n- Keep components under 150 lines\n- Colocate tests with components");
      else if (fw === "Django") main.push("- Follow Django's MVT pattern\n- Use class-based views for CRUD\n- Keep business logic in models or services, not views\n- Use Django REST Framework serializers for API endpoints");
      else if (fw === "FastAPI") main.push("- Use Pydantic models for request/response validation\n- Async endpoints by default\n- Dependency injection for shared logic\n- Router-based organization");
      else if (fw === "Express") main.push("- Middleware-first architecture\n- Error handling middleware at the end\n- Router-based organization\n- Validate inputs with zod or joi");
      else main.push(`- Follow ${fw} best practices and conventions`);
      main.push("");
    });
  }
  if (cfg.gitBranch) main.push(`## Git\n- Branch format: \`${cfg.gitBranch}\`\n- ${cfg.commitConv}\n- Always run tests before committing\n- Keep commits focused and atomic\n`);
  files[".cursorrules"] = main.join("\n");

  // Modern .cursor/rules/*.mdc files with rich frontmatter
  (cfg.selectedRules || []).forEach(id => {
    const content = genSharedRuleContent(id, cfg);
    if (!content) return;
    const isAlways = ["security","coding-style"].includes(id);
    const globs = id === "testing" ? '["**/*.test.*","**/*.spec.*","**/tests/**","**/__tests__/**"]'
                : id === "api-design" ? '["**/api/**","**/routes/**","**/endpoints/**","**/controllers/**"]'
                : id === "database" ? '["**/db/**","**/migrations/**","**/models/**","**/schema/**","**/prisma/**"]'
                : id === "documentation" ? '["**/*.md","**/docs/**","**/README*"]'
                : id === "performance" ? '["**/components/**","**/pages/**","**/api/**"]'
                : '["**/*"]';
    files[`.cursor/rules/${id}.mdc`] = `---\ndescription: ${RULES_CATALOG[id]?.desc || id}\nglobs: ${globs}\nalwaysApply: ${isAlways}\n---\n${content}`;
  });

  // Add a project-info rule that's always applied
  files[".cursor/rules/project-info.mdc"] = `---\ndescription: Project context and structure for ${cfg.name}\nglobs: ["**/*"]\nalwaysApply: true\n---\n${genSharedProjectDesc(cfg)}`;

  return files;
}

// ── Windsurf Adapter ──

function genWindsurfFiles(cfg) {
  const files = {};
  // .windsurfrules (legacy — comprehensive single file)
  const main = [];
  main.push(genSharedProjectDesc(cfg));
  main.push(genSharedCodingStandards(cfg));
  main.push("## Cascade Behavior\n");
  main.push("- Think step-by-step before making changes");
  main.push("- Always explain your reasoning");
  main.push("- Prefer incremental changes over rewrites");
  main.push("- Run tests before and after changes");
  main.push("- Never remove failing tests — fix them\n");
  if (cfg.frameworks.length) {
    main.push("## Framework Guidelines\n");
    cfg.frameworks.forEach(fw => main.push(`- Follow ${fw} official documentation and best practices`));
    main.push("");
  }
  if (cfg.gitBranch) main.push(`## Git\n- Branch format: \`${cfg.gitBranch}\`\n- ${cfg.commitConv}\n`);
  // NEVER/ALWAYS section (Windsurf best practice)
  main.push("## NEVER");
  main.push("- Add npm/pip packages without checking peer dependencies first");
  main.push("- Hardcode API keys, tokens, or passwords");
  main.push("- Delete existing tests without explicit permission");
  main.push("- Modify .env files without asking\n");
  main.push("## ALWAYS");
  main.push("- Use environment variables for secrets");
  main.push("- Add error handling at system boundaries");
  main.push("- Write tests for new features");
  main.push("- Pin dependency versions");
  main.push(`- Use ${cfg.languages[0] || "the project's"} idioms and patterns\n`);
  files[".windsurfrules"] = main.join("\n");

  // .windsurf/rules/*.md (modern format)
  files[".windsurf/rules/project.md"] = genSharedProjectDesc(cfg);
  (cfg.selectedRules || []).forEach(id => {
    const content = genSharedRuleContent(id, cfg);
    if (content) files[`.windsurf/rules/${id}.md`] = content;
  });

  return files;
}

// ── GitHub Copilot Adapter ──

function genCopilotFiles(cfg) {
  const files = {};
  // Main instructions — comprehensive
  const main = [];
  main.push(genSharedProjectDesc(cfg));
  main.push(genSharedCodingStandards(cfg));
  main.push("## Development Workflow\n");
  main.push("- Run tests before committing");
  main.push("- Write tests for all new features and bug fixes");
  main.push("- Keep commits focused and atomic");
  main.push("- Use descriptive commit messages");
  if (cfg.gitBranch) main.push(`- Branch naming: \`${cfg.gitBranch}\`\n- Convention: ${cfg.commitConv}`);
  main.push("\n## Code Quality\n");
  main.push("- Prefer small, focused functions (< 30 lines)");
  main.push("- Add error handling at all system boundaries");
  main.push("- Use meaningful variable names — no single-letter names except loop indices");
  main.push("- Add comments only when the \"why\" isn't obvious from the code\n");
  files[".github/copilot-instructions.md"] = main.join("\n");

  // Scoped instruction files with rich applyTo patterns
  (cfg.selectedRules || []).forEach(id => {
    const content = genSharedRuleContent(id, cfg);
    if (!content) return;
    const applyTo = id === "testing" ? "**/*.test.*,**/*.spec.*,**/tests/**,**/__tests__/**"
                  : id === "api-design" ? "**/api/**,**/routes/**,**/controllers/**,**/endpoints/**"
                  : id === "database" ? "**/db/**,**/migrations/**,**/models/**,**/schema/**,**/prisma/**"
                  : id === "documentation" ? "**/*.md,**/docs/**"
                  : id === "performance" ? "**/components/**,**/pages/**"
                  : "**/*";
    files[`.github/instructions/${id}.instructions.md`] = `---\napplyTo: "${applyTo}"\n---\n${content}`;
  });

  // Custom agents with rich personas
  const agentDefs = {
    "architect": {
      desc: "Architecture planning and system design",
      body: `You are a senior software architect for ${cfg.name}, a ${cfg.type} project.\n\nYour role:\n- Design and plan system architecture\n- Review designs for scalability, security, and maintainability\n- Create Architecture Decision Records (ADRs)\n- Suggest patterns appropriate for ${cfg.languages.join("/")}${cfg.frameworks.length?" with "+cfg.frameworks.join(", "):""}\n\nBoundaries:\n- Do NOT modify source code directly\n- Do NOT run build commands\n- Write only to docs/ and architecture/ directories\n\nStack context:\n- Languages: ${cfg.languages.join(", ")}\n- Frameworks: ${cfg.frameworks.join(", ")}\n- Databases: ${cfg.databases.join(", ") || "TBD"}\n- Infrastructure: ${cfg.infra.join(", ") || "TBD"}`
    },
    "reviewer": {
      desc: "Code review and quality analysis",
      body: `You are a code review specialist for ${cfg.name}.\n\nYour role:\n- Review code for bugs, security issues, and style violations\n- Check for proper error handling\n- Verify test coverage\n- Suggest improvements with concrete examples\n\nBoundaries:\n- Do NOT modify source code\n- Do NOT push commits\n- Only add review comments\n\nReview checklist:\n- [ ] Error handling at boundaries\n- [ ] Input validation\n- [ ] No hardcoded secrets\n- [ ] Tests for new code paths\n- [ ] Consistent naming conventions\n- [ ] No unnecessary dependencies`
    },
    "test-writer": {
      desc: "Test generation and QA",
      body: `You are a QA engineer for ${cfg.name}.\n\nYour role:\n- Write unit, integration, and e2e tests\n- Run tests and analyze results\n- Improve test coverage\n\nBoundaries:\n- Write to test directories ONLY\n- NEVER modify source code\n- NEVER remove failing tests\n\nTesting stack:\n${cfg.languages.map(l => { const st = STACKS[l]; return st?.testRunners?.length ? `- ${l}: ${st.testRunners.join(", ")}` : ""; }).filter(Boolean).join("\n")}\n\nTest structure:\n- Arrange: Set up test data\n- Act: Execute the code under test\n- Assert: Verify expected outcomes`
    },
    "debugger": {
      desc: "Bug investigation and diagnosis",
      body: `You are a debugging specialist for ${cfg.name}.\n\nYour role:\n- Investigate bug reports and error logs\n- Identify root causes using systematic analysis\n- Suggest minimal, targeted fixes\n- Document findings\n\nDebugging approach:\n1. Reproduce the issue\n2. Narrow the scope (binary search through recent changes)\n3. Read error messages and stack traces carefully\n4. Check edge cases and boundary conditions\n5. Verify the fix doesn't break existing tests`
    },
    "doc-writer": {
      desc: "Documentation specialist",
      body: `You are a documentation specialist for ${cfg.name}.\n\nYour role:\n- Create and update README files\n- Write API documentation\n- Document architecture decisions\n- Maintain changelogs\n\nBoundaries:\n- Write only to docs/ and *.md files\n- Do NOT modify source code\n\nDocumentation standards:\n- Clear, scannable content with proper headings\n- Code examples for all APIs\n- Keep language concise and direct`
    },
    "security-auditor": {
      desc: "Security analysis specialist",
      body: `You are a security auditor for ${cfg.name}.\n\nYour role:\n- Audit code for security vulnerabilities (OWASP Top 10)\n- Review dependencies for known CVEs\n- Check for secrets in code\n- Verify authentication and authorization\n\nBoundaries:\n- Do NOT modify source code\n- Report findings in structured format\n\nChecklist:\n- [ ] No hardcoded secrets\n- [ ] Input validation on all endpoints\n- [ ] Parameterized queries (no SQL injection)\n- [ ] CSRF/XSS protections\n- [ ] Dependency audit (npm audit / pip audit)\n- [ ] Proper CORS configuration`
    },
  };
  (cfg.agents || []).forEach(id => {
    const a = agentDefs[id];
    if (!a) return;
    files[`.github/agents/${id}.md`] = `---\nname: ${id}\ndescription: ${a.desc}\n---\n${a.body}`;
  });

  return files;
}

// ── Cline Adapter ──

function genClineFiles(cfg) {
  const files = {};
  // Main project context
  const main = [];
  main.push(genSharedProjectDesc(cfg));
  main.push(genSharedCodingStandards(cfg));
  main.push("## Cline Guidelines\n");
  main.push("- Always explain your plan before making changes");
  main.push("- Ask for confirmation before modifying more than 3 files");
  main.push("- Run tests after every change");
  main.push("- Keep changes minimal and focused\n");
  files[".clinerules/01-project.md"] = main.join("\n");

  // Individual rules
  let idx = 2;
  (cfg.selectedRules || []).forEach(id => {
    const content = genSharedRuleContent(id, cfg);
    if (content) {
      const num = String(idx++).padStart(2, "0");
      files[`.clinerules/${num}-${id}.md`] = content;
    }
  });

  // Workflow rules
  files[`.clinerules/${String(idx++).padStart(2,"0")}-workflow.md`] = `# Workflow Rules\n\n## Before Starting\n- Read relevant source files before making changes\n- Check existing tests for the area you're modifying\n- Understand the current architecture before proposing changes\n\n## During Development\n- Make one logical change at a time\n- Run linters after each change: ${cfg.languages.map(l => {const st=STACKS[l]; return st?.linters?.[0]||null;}).filter(Boolean).join(", ") || "project linter"}\n- Commit with descriptive messages: ${cfg.commitConv || "conventional commits"}\n\n## After Changes\n- Run full test suite\n- Review your own changes for issues\n- Update documentation if behavior changed\n`;

  return files;
}

// ── Roo Code Adapter ──

function genRooCodeFiles(cfg) {
  const files = {};
  // General rules (apply to all modes)
  const main = [];
  main.push(genSharedProjectDesc(cfg));
  main.push(genSharedCodingStandards(cfg));
  files[".roo/rules/01-project.md"] = main.join("\n");

  // Individual rules
  let idx = 2;
  (cfg.selectedRules || []).forEach(id => {
    const content = genSharedRuleContent(id, cfg);
    if (content) {
      const num = String(idx++).padStart(2, "0");
      files[`.roo/rules/${num}-${id}.md`] = content;
    }
  });

  // Mode-specific rules
  files[".roo/rules-code/01-implementation.md"] = `# Implementation Mode\n\nWhen writing code for ${cfg.name}:\n\n## Language Standards\n${cfg.languages.map(l => { const st = STACKS[l]; if (!st) return ""; return `### ${l}\n- Formatters: ${st.formatters.join(", ")}\n- Linters: ${st.linters.join(", ")}\n${st.typeCheckers.length ? "- Type checking: " + st.typeCheckers.join(", ") : ""}\n- Test runners: ${(st.testRunners||[]).join(", ")}`; }).filter(Boolean).join("\n\n")}\n\n## Workflow\n1. Read existing code in the area you're modifying\n2. Write implementation following project patterns\n3. Run linter and formatter\n4. Write or update tests\n5. Run full test suite\n6. Commit with: ${cfg.commitConv || "conventional commits"}\n`;

  files[".roo/rules-architect/01-design.md"] = `# Architecture Mode\n\nWhen planning architecture for ${cfg.name}:\n\n## Stack\n- Languages: ${cfg.languages.join(", ")}\n- Frameworks: ${cfg.frameworks.join(", ")}\n- Databases: ${cfg.databases.join(", ") || "TBD"}\n- Infrastructure: ${cfg.infra.join(", ") || "TBD"}\n\n## Principles\n- Design for testability\n- Prefer composition over inheritance\n- Keep modules loosely coupled\n- Document architecture decisions as ADRs\n- Consider security implications of every design choice\n\n## Constraints\n- Do NOT modify source code in this mode\n- Write only to docs/ and architecture/ directories\n- Focus on design, not implementation details\n`;

  files[".roo/rules-ask/01-research.md"] = `# Research Mode\n\nWhen researching for ${cfg.name}:\n\n- Provide factual answers based on codebase analysis\n- List file names, dependencies, and patterns you observe\n- Do NOT propose solutions or modifications\n- Do NOT execute any code or commands\n- Report findings in structured format\n`;

  // .roomodes YAML
  const modes = [];
  modes.push("# Roo Code Custom Modes");
  modes.push(`# Generated for: ${cfg.name}`);
  modes.push("");
  const modeList = [
    { slug:"code", name:"Code", desc:"Implementation and coding", allowedTools:["read_file","write_to_file","list_files","search_files","execute_command","browser_action"], icon:"💻" },
    { slug:"architect", name:"Architect", desc:"System design and architecture", allowedTools:["read_file","list_files","search_files","write_to_file"], icon:"🏗️" },
    { slug:"ask", name:"Ask", desc:"Research and information gathering", allowedTools:["read_file","list_files","search_files"], icon:"❓" },
    { slug:"review", name:"Review", desc:"Code review and quality analysis", allowedTools:["read_file","list_files","search_files"], icon:"🔍" },
    { slug:"debug", name:"Debug", desc:"Debugging and troubleshooting", allowedTools:["read_file","list_files","search_files","execute_command"], icon:"🐛" },
  ];
  modes.push("customModes:");
  modeList.forEach(m => {
    modes.push(`  - slug: "${m.slug}"`);
    modes.push(`    name: "${m.name}"`);
    modes.push(`    roleDefinition: "You are a ${m.desc.toLowerCase()} specialist for ${cfg.name}, a ${cfg.type} using ${cfg.languages.join(", ")}."`);
    modes.push(`    groups:`);
    modes.push(`      - read`);
    if (m.allowedTools.includes("write_to_file")) modes.push(`      - edit`);
    if (m.allowedTools.includes("execute_command")) modes.push(`      - command`);
    if (m.allowedTools.includes("browser_action")) modes.push(`      - browser`);
    modes.push("");
  });
  files[".roomodes"] = modes.join("\n");

  return files;
}

// ── AGENTS.md Adapter (Universal Standard) ──

function genAgentsMdFiles(cfg) {
  const files = {};
  const s = [];
  s.push(`# ${cfg.name}\n`);
  s.push(cfg.description + "\n");
  s.push("## Dev Environment\n");
  if (cfg.languages.length) s.push(`- Languages: ${cfg.languages.join(", ")}`);
  if (cfg.frameworks.length) s.push(`- Frameworks: ${cfg.frameworks.join(", ")}`);
  if (cfg.databases.length) s.push(`- Databases: ${cfg.databases.join(", ")}`);
  if (cfg.infra.length) s.push(`- Infrastructure: ${cfg.infra.join(", ")}`);
  s.push("");
  if (cfg.commonCmds) { s.push("## Commands\n"); s.push("```"); s.push(cfg.commonCmds); s.push("```\n"); }
  if (cfg.directories) { s.push("## Project Structure\n"); s.push(cfg.directories + "\n"); }
  s.push("## Testing\n");
  cfg.languages.forEach(l => {
    const st = STACKS[l];
    if (st?.testRunners?.length) s.push(`- ${l}: \`${st.testRunners[0]}\``);
  });
  s.push("\n- Run all tests before merging");
  s.push("- Write tests for new features and bug fixes\n");
  s.push("## Code Style\n");
  cfg.languages.forEach(l => {
    const st = STACKS[l];
    if (st) s.push(`- ${l}: ${[...st.formatters,...st.linters].join(", ")}`);
  });
  s.push("\n- Prefer small, focused functions");
  s.push("- Use meaningful names — no abbreviations");
  s.push("- Handle errors at system boundaries\n");
  s.push("## Security\n");
  s.push("- Never hardcode secrets — use environment variables");
  s.push("- Validate all inputs at system boundaries");
  s.push("- Use parameterized queries for database operations");
  s.push("- Pin dependency versions\n");
  s.push("## Git\n");
  s.push(`- Branch: \`${cfg.gitBranch || "feature/TICKET-description"}\``);
  s.push(`- Commits: ${cfg.commitConv || "conventional commits"}`);
  s.push("- Keep commits atomic and focused");
  s.push("- Always run tests before pushing\n");
  files["AGENTS.md"] = s.join("\n");
  return files;
}

// ── Aider Adapter ──

function genAiderFiles(cfg) {
  const files = {};
  const s = [];
  s.push(`# ${cfg.name} Conventions\n`);
  s.push(cfg.description + "\n");
  s.push("## Tech Stack\n");
  if (cfg.languages.length) s.push(`- Languages: ${cfg.languages.join(", ")}`);
  if (cfg.frameworks.length) s.push(`- Frameworks: ${cfg.frameworks.join(", ")}`);
  if (cfg.databases.length) s.push(`- Databases: ${cfg.databases.join(", ")}`);
  if (cfg.infra.length) s.push(`- Infrastructure: ${cfg.infra.join(", ")}`);
  s.push("");
  s.push(genSharedCodingStandards(cfg));
  if (cfg.directories) { s.push("## Project Structure\n"); s.push(cfg.directories + "\n"); }
  s.push("## Workflow\n");
  s.push("- Make focused, minimal changes");
  s.push("- Run tests after every change");
  s.push("- Keep commits atomic");
  s.push(`- Commit convention: ${cfg.commitConv || "conventional commits"}\n`);
  s.push("## Security\n");
  s.push("- Never hardcode secrets");
  s.push("- Validate inputs at boundaries");
  s.push("- Use parameterized queries\n");
  files["CONVENTIONS.md"] = s.join("\n");

  // .aider.conf.yml (rich config)
  const yml = [];
  yml.push("# Aider configuration");
  yml.push(`# Project: ${cfg.name}`);
  yml.push(`# Generated: ${new Date().toISOString().split("T")[0]}`);
  yml.push("");
  yml.push("# Automatically include project conventions");
  yml.push("read:");
  yml.push("  - CONVENTIONS.md");
  if (cfg.selectedRules?.length) yml.push("  # Rules are embedded in CONVENTIONS.md");
  yml.push("");
  yml.push("# Auto-commit settings");
  yml.push("auto-commits: true");
  yml.push("dirty-commits: false");
  yml.push("attribute-author: false");
  yml.push("attribute-committer: true");
  yml.push("");
  yml.push("# Git settings");
  yml.push(`commit-prompt: "Write a ${cfg.commitConv || "conventional commit"} message for these changes."`);
  yml.push("");
  yml.push("# Linting");
  const lintCmds = cfg.languages.map(l => {
    const st = STACKS[l];
    if (!st?.linters?.length) return null;
    return l === "TypeScript" || l === "JavaScript" ? "npx eslint --fix"
         : l === "Python" ? "ruff check --fix"
         : l === "Rust" ? "cargo clippy --fix --allow-dirty"
         : l === "Go" ? "golangci-lint run --fix"
         : l === "Ruby" ? "bundle exec rubocop -A"
         : l === "PHP" ? "vendor/bin/php-cs-fixer fix"
         : null;
  }).filter(Boolean);
  if (lintCmds.length) {
    yml.push(`lint-cmd: "${lintCmds[0]}"`);
    yml.push("auto-lint: true");
  }
  yml.push("");
  yml.push("# Test command");
  const testCmds = cfg.languages.map(l => {
    const st = STACKS[l];
    return l === "TypeScript" || l === "JavaScript" ? "npm test"
         : l === "Python" ? "pytest"
         : l === "Rust" ? "cargo test"
         : l === "Go" ? "go test ./..."
         : l === "Ruby" ? "bundle exec rspec"
         : null;
  }).filter(Boolean);
  if (testCmds.length) {
    yml.push(`test-cmd: "${testCmds[0]}"`);
    yml.push("auto-test: false");
  }
  yml.push("");
  files[".aider.conf.yml"] = yml.join("\n");
  return files;
}

// ── Master multi-target generator ──

function generateForTargets(cfg, targets) {
  const allFiles = {};
  targets.forEach(t => {
    let tFiles = {};
    switch(t) {
      case "claude-code": tFiles = generateAllFiles(cfg); break;
      case "cursor":      tFiles = genCursorFiles(cfg); break;
      case "windsurf":    tFiles = genWindsurfFiles(cfg); break;
      case "copilot":     tFiles = genCopilotFiles(cfg); break;
      case "cline":       tFiles = genClineFiles(cfg); break;
      case "roo-code":    tFiles = genRooCodeFiles(cfg); break;
      case "agents-md":   tFiles = genAgentsMdFiles(cfg); break;
      case "aider":       tFiles = genAiderFiles(cfg); break;
    }
    Object.assign(allFiles, tFiles);
  });
  // Universal files (always included)
  allFiles[".editorconfig"] = genEditorConfig(cfg);
  allFiles[".gitattributes"] = genGitAttributes(cfg);
  allFiles[".vscode/settings.json"] = genVSCodeSettings(cfg);
  allFiles[".vscode/extensions.json"] = genVSCodeExtensions(cfg);
  // Linter/formatter configs
  const lintFiles = genLinterConfigs(cfg);
  Object.assign(allFiles, lintFiles);
  // CI workflow
  const ciFiles = genCIWorkflow(cfg);
  Object.assign(allFiles, ciFiles);
  // Makefile
  allFiles["Makefile"] = genMakefile(cfg);
  // Project documents (user-selected)
  const docFiles = genProjectDocs(cfg);
  Object.assign(allFiles, docFiles);
  // Global config — per-target global configuration files
  if (cfg.globalScope) {
    const globalInstructions = `# Global AI Coding Instructions\n\n## Environment\n- OS: ${cfg.os}\n- IDE: ${cfg.ide}\n\n## Universal Standards\n- Type annotations on all functions\n- Comprehensive error handling\n- SOLID principles\n- Never log secrets\n- Use env vars for all credentials\n- Test before committing\n- Prefer composition over inheritance\n\n## Code Quality\n- Functions under 50 lines\n- Files under 300 lines\n- Descriptive variable names\n- No magic numbers — use named constants\n- Handle all error paths explicitly`;

    targets.forEach(t => {
      switch(t) {
        case "claude-code":
          allFiles["~/.claude/CLAUDE.md"] = globalInstructions + `\n\n## Model Routing\n- Sonnet 4.5: 90% of tasks\n- Opus 4.6: security, architecture, complex\n- Haiku 4.5: simple, boilerplate\n\n## Tools\n- Use TodoWrite for multi-step task tracking\n- Use Task for complex sub-problems`;
          allFiles["~/.claude/settings.json"] = JSON.stringify({
            "$schema":"https://json.schemastore.org/claude-code-settings.json",
            model: cfg.model,
            permissions: { deny:["Read(.env)","Read(.env.*)","Read(secrets/**)","Read(**/credentials.json)"] },
          }, null, 2);
          break;
        case "cursor":
          allFiles["~/.cursor/rules/global.mdc"] = `---\ndescription: Global coding standards for all projects\nalwaysApply: true\n---\n\n${globalInstructions}`;
          break;
        case "windsurf":
          allFiles["~/.windsurf/rules/global.md"] = `# Global Windsurf Rules\n\n${globalInstructions}`;
          break;
        case "copilot":
          allFiles["~/.github/copilot-instructions.md"] = `# Global Copilot Instructions\n\n${globalInstructions}`;
          break;
        case "cline":
          allFiles["~/.cline/rules/global.md"] = `# Global Cline Rules\n\n${globalInstructions}`;
          break;
        case "roo-code":
          allFiles["~/.roo/rules/global.md"] = `# Global Roo Code Rules\n\n${globalInstructions}`;
          break;
        case "aider":
          allFiles["~/.aider.conf.yml"] = `# Global Aider configuration\nauto-commits: true\nlint-cmd: auto\nread:\n  - CONVENTIONS.md`;
          break;
      }
    });
  }
  return allFiles;
}

function generateAllFiles(cfg) {
  const files = {};

  // Core files
  files["CLAUDE.md"] = genClaudeMd(cfg);
  files[".claude/settings.json"] = genSettingsJson(cfg);
  files[".claude/settings.local.json"] = JSON.stringify({ "$schema":"https://json.schemastore.org/claude-code-settings.json", model:cfg.model }, null, 2);
  files[".mcp.json"] = genMcpJson(cfg.mcpServers, cfg.customMcps);

  // Rules directory
  (cfg.selectedRules || []).forEach(id => {
    files[`.claude/rules/${id}.md`] = genRule(id, cfg);
  });

  // Skills (new SKILL.md format)
  (cfg.skills || []).forEach(id => {
    const c = genSkillV4(id, cfg);
    if (c) files[`.claude/skills/${id}/SKILL.md`] = c;
  });

  // Self-learning reference guide (if self-learning skill is enabled)
  if ((cfg.skills || []).includes("self-learning")) {
    files[".claude/skills/self-learning/references/skill_creation_guide.md"] = genSkillCreationGuide(cfg);
  }

  // Agents (with frontmatter)
  (cfg.agents || []).forEach(id => {
    const c = genAgent(id, cfg);
    if (c) files[`.claude/agents/${id}.md`] = c;
  });

  // Dynamic contexts
  (cfg.selectedContexts || []).forEach(id => {
    files[`.claude/contexts/${id}.md`] = genContext(id, cfg);
  });

  // Custom items (user-created skills, rules, agents, contexts, files)
  (cfg.customItems || []).forEach(item => {
    if (item.path && item.content) {
      files[item.path] = item.content;
    }
  });

  // Custom hooks — merge into settings.json
  const customHooks = (cfg.customItems || []).filter(i => i.type === "hook");
  if (customHooks.length > 0) {
    let settings = JSON.parse(files[".claude/settings.json"] || "{}");
    if (!settings.hooks) settings.hooks = {};
    customHooks.forEach(h => {
      const ev = h.event || "PreToolUse";
      if (!settings.hooks[ev]) settings.hooks[ev] = [];
      const innerHook = {};
      if (h.hookType === "command") {
        innerHook.type = "command";
        innerHook.command = h.content || h.body || "echo 'hook fired'";
      } else if (h.hookType === "prompt") {
        innerHook.type = "prompt";
        innerHook.prompt = h.content || h.body || "Evaluate this action.";
      } else if (h.hookType === "agent") {
        innerHook.type = "agent";
        innerHook.prompt = h.content || h.body || "Execute the delegated task.";
      }
      const entry = { hooks: [innerHook] };
      if (h.matcher) entry.matcher = h.matcher;
      settings.hooks[ev].push(entry);
    });
    files[".claude/settings.json"] = JSON.stringify(settings, null, 2);
  }

  // Memory persistence scripts + Aha Card infrastructure
  if (cfg.memoryPersistence) {
    files[".claude/scripts/session-start.sh"] = genSessionScript("start");
    files[".claude/scripts/session-end.sh"] = genSessionScript("end");
    files[".claude/scripts/pre-compact.sh"] = genSessionScript("pre-compact");
    files[".claude/memory/.gitkeep"] = "# Memory persistence directory — session state, Aha Cards, and recommendations stored here\n# Add .claude/memory/ to .gitignore to keep learnings local";
    files[".claude/memory/INDEX.md"] = `# Session Learnings\n*Initialized: ${new Date().toISOString().split("T")[0]}*\n\nNo Aha Cards recorded yet. Use \`/continuous-learning\` after completing work to capture reusable knowledge.\n\n## How It Works\n\n1. **Record**: After fixing bugs or discovering patterns, run \`/continuous-learning\`\n2. **Review**: Before starting work, run \`/aha-review\` to load past learnings\n3. **Backport**: When a portable Aha Card reaches confidence ≥ 0.9, promote it to a permanent skill via \`/self-learning\`\n`;
    files[".claude/memory/FORMAT.md"] = genMemoryFormatRef();
    files[".claude/memory/RUBRIC.md"] = genRubricRef();
    files[".claude/memory/PORTABILITY.md"] = genPortabilityRef();
    files[".claude/scripts/memory-manage.sh"] = genMemoryManageScript();
  }

  // Plugin manifest
  if (cfg.generatePlugin) {
    files[".claude-plugin/plugin.json"] = genPluginJson(cfg);
  }

  // IDE config
  if (cfg.ide === "vscode") {
    const vs = { "editor.formatOnSave":true, "editor.tabSize":2, "files.trimTrailingWhitespace":true, "files.insertFinalNewline":true };
    if (cfg.languages.includes("Python")) vs["[python]"] = { "editor.tabSize":4 };
    files[".vscode/settings.json"] = JSON.stringify(vs, null, 2);
    const exts = new Set(["anthropic.claude-code","eamodio.gitlens","usernamehw.errorlens"]);
    cfg.languages.forEach(l => (STACKS[l]?.extensions||[]).forEach(e => exts.add(e)));
    files[".vscode/extensions.json"] = JSON.stringify({ recommendations:[...exts] }, null, 2);
    files[".vscode/mcp.json"] = genMcpJson(cfg.mcpServers, cfg.customMcps);
  }

  return files;
}


// ═══════════════════════════════════════════════════════════════════════════
//  UI — REACT APP
// ═══════════════════════════════════════════════════════════════════════════

const FONTS = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap";
const T = {
  bg:"#0a0a0c", card:"#111114", border:"#1c1c22", accent:"#f97316", accentDim:"rgba(249,115,22,0.1)",
  green:"#22c55e", greenDim:"rgba(34,197,94,0.08)", red:"#ef4444", redDim:"rgba(239,68,68,0.08)",
  yellow:"#eab308", yellowDim:"rgba(234,179,8,0.08)", blue:"#3b82f6", blueDim:"rgba(59,130,246,0.08)",
  text:"#e4e4e7", dim:"#71717a", muted:"#3f3f46",
};

// Shared components
const Chip = ({ label, on, onClick, color }) => {
  const c = color || T.accent;
  const bg = on ? (c === T.accent ? T.accentDim : `${c}15`) : "transparent";
  return <button onClick={onClick} style={{ padding:"4px 12px",borderRadius:16,border:on?`1.5px solid ${c}`:`1px solid ${T.border}`,background:bg,color:on?c:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s" }}>{label}{on&&" ✕"}</button>;
};
const Tog = ({ label, on, set, desc }) => (
  <div onClick={()=>set(!on)} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:6,border:on?`1px solid rgba(249,115,22,.2)`:`1px solid ${T.border}`,background:on?T.accentDim:"transparent",cursor:"pointer",marginBottom:3 }}>
    <div style={{ width:30,height:16,borderRadius:8,background:on?T.accent:T.muted,position:"relative",flexShrink:0 }}><div style={{ width:12,height:12,borderRadius:6,background:"#eee",position:"absolute",top:2,left:on?16:2,transition:"left .15s" }}/></div>
    <div><div style={{ color:T.text,fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>{label}</div>{desc&&<div style={{ color:T.muted,fontSize:9,marginTop:1 }}>{desc}</div>}</div>
  </div>
);
const Lbl = ({children}) => <label style={{ display:"block",color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:1,marginBottom:5 }}>{children}</label>;
const Inp = ({value,set,placeholder,rows}) => rows
  ? <textarea value={value} onChange={e=>set(e.target.value)} placeholder={placeholder} rows={rows} style={{ width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.4)",color:T.text,fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none",resize:"vertical",boxSizing:"border-box" }}/>
  : <input value={value} onChange={e=>set(e.target.value)} placeholder={placeholder} style={{ width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.4)",color:T.text,fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box" }}/>;
const Sel = ({value,set,opts}) => <select value={value} onChange={e=>set(e.target.value)} style={{ width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none" }}>{opts.map(o=><option key={typeof o==="string"?o:o.v} value={typeof o==="string"?o:o.v}>{typeof o==="string"?o:o.l}</option>)}</select>;

const Badge = ({ text, color }) => <span style={{ padding:"2px 8px",borderRadius:10,background:`${color}18`,color,fontSize:10,fontWeight:600,fontFamily:"'JetBrains Mono',monospace" }}>{text}</span>;
const ScoreBar = ({ label, score, max=100 }) => {
  const pct = Math.round((score/max)*100);
  const color = pct >= 70 ? T.green : pct >= 40 ? T.yellow : T.red;
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
        <span style={{ color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace" }}>{label}</span>
        <span style={{ color,fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace" }}>{pct}%</span>
      </div>
      <div style={{ height:6,borderRadius:3,background:T.border }}>
        <div style={{ width:`${pct}%`,height:"100%",borderRadius:3,background:color,transition:"width .5s ease" }}/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const [mode, setMode] = useState(null); // "forward" | "reverse"
  const [step, setStep] = useState(0);

  // Forward mode state
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState("fullstack");
  const [ide, setIde] = useState("vscode");
  const [model, setModel] = useState("claude-sonnet-4-5-20250929");
  const [os, setOs] = useState("macOS");
  const [globalScope, setGlobalScope] = useState(false);
  const [langs, setLangs] = useState([]);
  const [fws, setFws] = useState([]);
  const [dbs, setDbs] = useState([]);
  const [infra, setInfra] = useState([]);
  const [mcps, setMcps] = useState([]);
  const [agents, setAgents] = useState([]);
  const [skills, setSkills] = useState([]);
  const [selectedRules, setSelectedRules] = useState([]);
  const [selectedContexts, setSelectedContexts] = useState([]);
  const [webTools, setWebTools] = useState(true);
  const [notebooks, setNotebooks] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [defaultMode, setDefaultMode] = useState("default");
  const [outputStyle, setOutputStyle] = useState("");
  const [statusLine, setStatusLine] = useState(false);
  const [allowGhCli, setAllowGhCli] = useState(false);
  const [memoryPersistence, setMemoryPersistence] = useState(true);
  const [generatePlugin, setGeneratePlugin] = useState(false);
  const [projectDocs, setProjectDocs] = useState([]);
  const [exportTargets, setExportTargets] = useState(["claude-code"]);
  const [showTargetCompare, setShowTargetCompare] = useState(false);
  const [enableAllProjectMcpServers, setEnableAllProjectMcpServers] = useState(false);
  const [denyPatterns, setDenyPatterns] = useState(["Read(.env)","Read(.env.*)","Read(secrets/**)"]);
  const [additionalDirs, setAdditionalDirs] = useState("");
  const [gitBranch, setGitBranch] = useState("feature/TICKET-description");
  const [commitConv, setCommitConv] = useState("conventional commits (feat:, fix:, chore:)");
  const [commonCmds, setCommonCmds] = useState("");
  const [directories, setDirectories] = useState("");
  const [env, setEnv] = useState("");

  // Reverse mode state
  const [repoInput, setRepoInput] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [gapReport, setGapReport] = useState(null);
  const [reverseInputMode, setReverseInputMode] = useState("paste"); // "paste" | "github" | "upload"
  const [ghUrl, setGhUrl] = useState("");
  const [ghLoading, setGhLoading] = useState(false);
  const [ghError, setGhError] = useState(null);
  const [ghBranch, setGhBranch] = useState("HEAD");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadFileCount, setUploadFileCount] = useState(0);

  // Preview & animation state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState("tree"); // "tree" | "claude.md" | "settings"
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState([]);
  const [configImportOpen, setConfigImportOpen] = useState(false);
  const [configImportText, setConfigImportText] = useState("");

  // API key state (optional — enhances generation with AI)
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem("cco_api_key") || ""; } catch { return ""; }
  });
  const [apiProvider, setApiProvider] = useState(() => {
    try { return localStorage.getItem("cco_api_provider") || "anthropic"; } catch { return "anthropic"; }
  });
  const [apiModelOverride, setApiModelOverride] = useState(() => {
    try { return localStorage.getItem("cco_api_model") || ""; } catch { return ""; }
  });
  const [apiCustomEndpoint, setApiCustomEndpoint] = useState(() => {
    try { return localStorage.getItem("cco_api_endpoint") || ""; } catch { return ""; }
  });
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Persist API settings to localStorage
  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem("cco_api_key", apiKey);
      else localStorage.removeItem("cco_api_key");
      localStorage.setItem("cco_api_provider", apiProvider);
      if (apiModelOverride) localStorage.setItem("cco_api_model", apiModelOverride);
      else localStorage.removeItem("cco_api_model");
      if (apiCustomEndpoint) localStorage.setItem("cco_api_endpoint", apiCustomEndpoint);
      else localStorage.removeItem("cco_api_endpoint");
    } catch {}
  }, [apiKey, apiProvider, apiModelOverride, apiCustomEndpoint]);

  // ── Universal LLM API Helper ──
  const callLLM = async (prompt, systemPrompt = "", opts = {}) => {
    if (!apiKey && apiProvider !== "ollama") return null;
    setAiLoading(true);
    setAiError(null);
    const provider = LLM_PROVIDERS[apiProvider] || LLM_PROVIDERS.anthropic;
    const endpoint = apiProvider === "custom" ? apiCustomEndpoint : provider.endpoint;
    const chosenModel = apiModelOverride || opts.model || provider.defaultModel;

    try {
      if (!endpoint) throw new Error("No API endpoint configured");

      if (provider.format === "anthropic") {
        // Anthropic native format
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: chosenModel,
            max_tokens: opts.maxTokens || 4096,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: "user", content: prompt }]
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `API error ${res.status}`);
        }
        const data = await res.json();
        return data.content?.[0]?.text || "";
      } else {
        // OpenAI-compatible format (OpenAI, OpenRouter, Ollama, Together, Groq, Google, custom)
        const headers = { "Content-Type": "application/json" };
        if (apiKey && apiProvider !== "ollama") headers["Authorization"] = `Bearer ${apiKey}`;
        if (apiProvider === "openrouter") {
          headers["HTTP-Referer"] = window.location.href;
          headers["X-Title"] = "Veritas Lab";
        }
        if (apiProvider === "google") {
          // Google uses key as query param
        }
        const url = apiProvider === "google"
          ? `${endpoint}?key=${apiKey}`
          : endpoint;
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: chosenModel,
            max_tokens: opts.maxTokens || 4096,
            messages: [
              ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
              { role: "user", content: prompt }
            ]
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || err.message || `API error ${res.status}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      setAiError(e.message);
      return null;
    } finally {
      setAiLoading(false);
    }
  };

  // ── Custom Tools State ──
  // Custom repo MCP servers — user-added via URL
  const [customMcps, setCustomMcps] = useState([]); // {id, name, url, transport, cmd, args, env}
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [repoUrlTransport, setRepoUrlTransport] = useState("stdio");

  // Custom tools — user-created skills, rules, agents, hooks, contexts, files
  const [customItems, setCustomItems] = useState([]); // {type, id, name, path, content}
  const [showCreator, setShowCreator] = useState(false);
  const [creatorType, setCreatorType] = useState("skill");
  const [creatorName, setCreatorName] = useState("");
  const [creatorDesc, setCreatorDesc] = useState("");
  const [creatorBody, setCreatorBody] = useState("");
  const [creatorModel, setCreatorModel] = useState("");
  const [creatorTools, setCreatorTools] = useState("");
  const [creatorContext, setCreatorContext] = useState("fork");
  const [creatorEvent, setCreatorEvent] = useState("PreToolUse");
  const [creatorHookType, setCreatorHookType] = useState("command");
  const [creatorMatcher, setCreatorMatcher] = useState("");
  const [creatorPath, setCreatorPath] = useState("");
  const [creatorEditing, setCreatorEditing] = useState(null); // index for edit mode

  // Repo Import state (full scanner)
  const [repoImportPaste, setRepoImportPaste] = useState("");
  const [repoImportOpen, setRepoImportOpen] = useState(false);
  const [repoImportResults, setRepoImportResults] = useState(null);
  const [repoImportSelected, setRepoImportSelected] = useState({skills:[],rules:[],hooks:[],mcps:[],agents:[],contexts:[],commands:[],files:[]});

  // Output state
  const [files, setFiles] = useState(null);
  const [selFile, setSelFile] = useState(null);
  const [edits, setEdits] = useState({});
  const [copied, setCopied] = useState(null);

  const toggle = (arr, setArr, item) => setArr(prev => prev.includes(item) ? prev.filter(x=>x!==item) : [...prev, item]);

  // ─── Parse GitHub/npm repo URL into MCP server config ─────────────
  const parseRepoUrl = (url) => {
    url = url.trim();
    // GitHub: https://github.com/org/repo or github.com/org/repo
    const ghMatch = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/\s#?]+)/);
    if (ghMatch) {
      const [, org, repo] = ghMatch;
      const cleanRepo = repo.replace(/\.git$/, "");
      const id = `${org}--${cleanRepo}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      return { id, name: `${org}/${cleanRepo}`, url, org, repo: cleanRepo, source: "github" };
    }
    // npm: @org/package or package-name
    const npmMatch = url.match(/^(@[a-z0-9-]+\/[a-z0-9.-]+|[a-z0-9.-]+)$/i);
    if (npmMatch) {
      const pkg = npmMatch[1];
      const id = pkg.replace(/[@/]/g, "-").replace(/^-/, "").toLowerCase();
      return { id, name: pkg, url: `https://www.npmjs.com/package/${pkg}`, source: "npm", pkg };
    }
    // PyPI: package-name (fallback if contains no slashes/dots)
    if (/^[a-z0-9_-]+$/i.test(url)) {
      return { id: url.toLowerCase(), name: url, url: `https://pypi.org/project/${url}`, source: "pypi", pkg: url };
    }
    // SSE URL: https://example.com/mcp or similar
    if (url.startsWith("http")) {
      const hostname = new URL(url).hostname.replace(/\./g, "-");
      return { id: hostname, name: hostname, url, source: "sse" };
    }
    return null;
  };

  const addCustomMcp = () => {
    if (!repoUrlInput.trim()) return;
    const parsed = parseRepoUrl(repoUrlInput);
    if (!parsed) return;
    if (customMcps.find(m => m.id === parsed.id)) return;

    let entry = { ...parsed, transport: repoUrlTransport };
    if (parsed.source === "sse" || repoUrlTransport === "sse") {
      entry.transport = "sse";
    } else if (parsed.source === "npm" || (parsed.source === "github" && repoUrlTransport === "stdio")) {
      entry.cmd = "npx";
      entry.args = parsed.pkg ? ["-y", parsed.pkg] : ["-y", `${parsed.org}/${parsed.repo}`];
    } else if (parsed.source === "pypi") {
      entry.cmd = "uvx";
      entry.args = [parsed.pkg];
    } else if (parsed.source === "github" && repoUrlTransport === "python") {
      entry.cmd = "uvx";
      entry.args = [`git+https://github.com/${parsed.org}/${parsed.repo}`];
    }
    setCustomMcps(prev => [...prev, entry]);
    setRepoUrlInput("");
  };

  const removeCustomMcp = (id) => setCustomMcps(prev => prev.filter(m => m.id !== id));

  // ─── Custom Tool Creator Helpers ──────────────────────────────────
  const CREATOR_TYPES = [
    { id: "skill",   label: "Skill",   icon: "🛠️", desc: "SKILL.md with frontmatter — triggered by /command" },
    { id: "rule",    label: "Rule",    icon: "📏", desc: "Always-loaded .md policy in rules/" },
    { id: "agent",   label: "Agent",   icon: "🤖", desc: "Sub-agent .md with frontmatter" },
    { id: "hook",    label: "Hook",    icon: "🪝", desc: "Event-driven automation in settings.json" },
    { id: "context", label: "Context", icon: "🎯", desc: "Dynamic context .md activated per session" },
    { id: "file",    label: "File",    icon: "📄", desc: "Arbitrary .md or config file" },
  ];

  const resetCreator = () => {
    setCreatorName(""); setCreatorDesc(""); setCreatorBody(""); setCreatorModel("");
    setCreatorTools(""); setCreatorContext("fork"); setCreatorEvent("PreToolUse");
    setCreatorHookType("command"); setCreatorMatcher(""); setCreatorPath("");
    setCreatorEditing(null);
  };

  const openCreator = (type, editIndex) => {
    resetCreator();
    setCreatorType(type || "skill");
    if (editIndex != null && customItems[editIndex]) {
      const item = customItems[editIndex];
      setCreatorType(item.type);
      setCreatorName(item.name || "");
      setCreatorDesc(item.desc || "");
      setCreatorBody(item.body || "");
      setCreatorModel(item.model || "");
      setCreatorTools(item.tools || "");
      setCreatorContext(item.context || "fork");
      setCreatorEvent(item.event || "PreToolUse");
      setCreatorHookType(item.hookType || "command");
      setCreatorMatcher(item.matcher || "");
      setCreatorPath(item.path || "");
      setCreatorEditing(editIndex);
    }
    setShowCreator(true);
  };

  const saveCreatorItem = () => {
    const id = creatorName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id) return;

    let item = { type: creatorType, id, name: creatorName.trim(), desc: creatorDesc.trim(), body: creatorBody };

    if (creatorType === "skill") {
      const fm = [`---`, `name: ${id}`, `description: ${creatorDesc.trim() || id}`];
      if (creatorTools.trim()) fm.push(`allowed-tools: [${creatorTools.trim()}]`);
      fm.push(`context: ${creatorContext}`);
      if (creatorModel.trim()) fm.push(`model: ${creatorModel.trim()}`);
      fm.push(`user-invocable: true`, `---`);
      item.content = fm.join("\n") + "\n\n" + (creatorBody || `## ${creatorName.trim()}\n\nDescribe your skill instructions here.`);
      item.path = `.claude/skills/${id}/SKILL.md`;
    } else if (creatorType === "rule") {
      item.content = `# ${creatorName.trim()} Rules\n\n> Always loaded. ${creatorDesc.trim()}\n\n${creatorBody || "Add your rule content here."}`;
      item.path = `.claude/rules/${id}.md`;
    } else if (creatorType === "agent") {
      const fm = [`---`, `name: ${id}`, `description: ${creatorDesc.trim() || id}`];
      if (creatorTools.trim()) fm.push(`allowed-tools: [${creatorTools.trim()}]`);
      if (creatorModel.trim()) fm.push(`model: ${creatorModel.trim()}`);
      fm.push(`---`);
      item.content = fm.join("\n") + "\n\n" + (creatorBody || `## ${creatorName.trim()} Agent\n\nAgent instructions here.`);
      item.path = `.claude/agents/${id}.md`;
    } else if (creatorType === "hook") {
      item.event = creatorEvent;
      item.hookType = creatorHookType;
      item.matcher = creatorMatcher.trim();
      item.tools = creatorTools.trim();
      item.model = creatorModel.trim();
      item.context = creatorContext;
      // hooks are settings.json entries, not files
      item.path = null;
      item.content = creatorBody;
    } else if (creatorType === "context") {
      item.content = `# ${creatorName.trim()} Context\n\n> Activated with: \`claude --append-system-prompt .claude/contexts/${id}.md\`\n\n${creatorBody || "Context-specific instructions here."}`;
      item.path = `.claude/contexts/${id}.md`;
    } else if (creatorType === "file") {
      const p = creatorPath.trim() || `.claude/${id}.md`;
      item.path = p;
      item.content = creatorBody || `# ${creatorName.trim()}\n\n`;
    }

    if (creatorEditing != null) {
      setCustomItems(prev => prev.map((it, i) => i === creatorEditing ? item : it));
    } else {
      setCustomItems(prev => [...prev, item]);
    }
    setShowCreator(false);
    resetCreator();
  };

  const removeCustomItem = (idx) => setCustomItems(prev => prev.filter((_, i) => i !== idx));

  // ─── Creator Modal Component ──────────────────────────────────────
  const renderCreatorModal = () => {
    if (!showCreator) return null;
    const isHook = creatorType === "hook";
    const isFile = creatorType === "file";
    const needsFm = ["skill", "agent"].includes(creatorType);
    const HOOK_EVENTS = Object.keys(SCHEMA.hookEvents);
    const TOOLS_LIST = Object.keys(SCHEMA.tools);

    const previewPath = creatorType === "skill" ? `.claude/skills/${creatorName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-")||"my-skill"}/SKILL.md`
      : creatorType === "rule" ? `.claude/rules/${creatorName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-")||"my-rule"}.md`
      : creatorType === "agent" ? `.claude/agents/${creatorName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-")||"my-agent"}.md`
      : creatorType === "context" ? `.claude/contexts/${creatorName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-")||"my-context"}.md`
      : creatorType === "file" ? (creatorPath.trim() || `.claude/${creatorName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-")||"my-file"}.md`)
      : isHook ? "settings.json → hooks[]" : "";

    return (
      <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={()=>setShowCreator(false)}>
        <div onClick={e=>e.stopPropagation()} style={{ width:680,maxHeight:"85vh",background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          {/* Header */}
          <div style={{ padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <div>
              <div style={{ color:T.text,fontSize:15,fontWeight:700,fontFamily:"'DM Sans',sans-serif" }}>
                {creatorEditing != null ? "Edit" : "Create"} Custom Tool
              </div>
              <div style={{ color:T.muted,fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginTop:2 }}>{previewPath}</div>
            </div>
            <button onClick={()=>setShowCreator(false)} style={{ background:"none",border:"none",color:T.dim,fontSize:18,cursor:"pointer",padding:"0 4px" }}>✕</button>
          </div>

          <div style={{ overflow:"auto",padding:18,flex:1 }}>
            {/* Type selector */}
            <Lbl>Type</Lbl>
            <div style={{ display:"flex",flexWrap:"wrap",gap:4,marginBottom:14 }}>
              {CREATOR_TYPES.map(ct => (
                <button key={ct.id} onClick={()=>setCreatorType(ct.id)} style={{
                  padding:"6px 14px",borderRadius:8,border:creatorType===ct.id?`1.5px solid ${T.accent}`:`1px solid ${T.border}`,
                  background:creatorType===ct.id?T.accentDim:"transparent",color:creatorType===ct.id?T.accent:T.dim,
                  fontSize:11,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"
                }}>{ct.icon} {ct.label}</button>
              ))}
            </div>
            <div style={{ color:T.muted,fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:14,padding:"6px 10px",background:"rgba(0,0,0,.2)",borderRadius:6 }}>
              {CREATOR_TYPES.find(c=>c.id===creatorType)?.desc}
            </div>

            {/* Common fields: Name + Description */}
            <div style={{ display:"grid",gridTemplateColumns:isFile?"1fr 1fr":"1fr",gap:10,marginBottom:10 }}>
              <div><Lbl>{isHook ? "Hook Name" : "Name"}</Lbl><Inp value={creatorName} set={setCreatorName} placeholder={isHook?"e.g. lint-on-save":"e.g. my-auth-skill"}/></div>
              {isFile && <div><Lbl>File Path</Lbl><Inp value={creatorPath} set={setCreatorPath} placeholder=".claude/my-file.md"/></div>}
            </div>
            {!isFile && <div style={{ marginBottom:10 }}><Lbl>Description</Lbl><Inp value={creatorDesc} set={setCreatorDesc} placeholder="What does this do?"/></div>}

            {/* Hook-specific fields */}
            {isHook && (
              <div style={{ background:"rgba(0,0,0,.2)",borderRadius:8,padding:12,marginBottom:10 }}>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8 }}>
                  <div><Lbl>Event</Lbl><Sel value={creatorEvent} set={setCreatorEvent} opts={HOOK_EVENTS.map(e=>({v:e,l:e}))}/></div>
                  <div><Lbl>Hook Type</Lbl><Sel value={creatorHookType} set={setCreatorHookType} opts={[{v:"command",l:"Command (shell)"},{v:"prompt",l:"Prompt (LLM)"},{v:"agent",l:"Agent"}]}/></div>
                  <div><Lbl>Matcher</Lbl><Inp value={creatorMatcher} set={setCreatorMatcher} placeholder={creatorHookType==="command"?"e.g. Write":"e.g. Bash(npm *)"}/></div>
                </div>
                <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>
                  {creatorHookType === "command" ? "Body = shell command to run (e.g. npm run lint --fix $FILEPATH)" :
                   creatorHookType === "prompt" ? "Body = LLM evaluation prompt. Returns BLOCK/ALLOW + reason." :
                   "Body = agent instructions. Full delegation to sub-agent."}
                </div>
              </div>
            )}

            {/* Skill/Agent specific fields */}
            {needsFm && (
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10 }}>
                <div><Lbl>Allowed Tools</Lbl><Inp value={creatorTools} set={setCreatorTools} placeholder="Read, Write, Bash"/></div>
                <div><Lbl>Context</Lbl><Sel value={creatorContext} set={setCreatorContext} opts={[{v:"fork",l:"Fork (isolated)"},{v:"inline",l:"Inline (shared)"}]}/></div>
                <div><Lbl>Model Override</Lbl><Inp value={creatorModel} set={setCreatorModel} placeholder="(default)"/></div>
              </div>
            )}

            {/* Body / Content */}
            <Lbl>{isHook && creatorHookType==="command" ? "Command" : "Body / Content"}</Lbl>
            <textarea value={creatorBody} onChange={e=>setCreatorBody(e.target.value)}
              placeholder={
                isHook && creatorHookType==="command" ? "npm run lint --fix $FILEPATH" :
                isHook && creatorHookType==="prompt" ? "Check if this code change follows our style guide. Return BLOCK if it doesn't." :
                creatorType==="skill" ? "## Skill Instructions\n\n1. First step\n2. Second step\n3. Present results" :
                creatorType==="rule" ? "## Requirements\n- Rule 1\n- Rule 2" :
                creatorType==="agent" ? "Agent-specific instructions and workflow..." :
                "Content here..."
              }
              rows={isHook && creatorHookType==="command" ? 3 : 10}
              style={{ width:"100%",padding:"10px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.4)",color:T.text,fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none",resize:"vertical",boxSizing:"border-box",lineHeight:1.6 }}
            />

            {/* Quick-insert toolbar for skills/agents */}
            {needsFm && (
              <div style={{ marginTop:6,display:"flex",flexWrap:"wrap",gap:3 }}>
                <span style={{ color:T.muted,fontSize:9,padding:"2px 4px" }}>Insert:</span>
                {["$ARGUMENTS","$FILEPATH","$TOOL_INPUT","$TOOL_OUTPUT"].map(v => (
                  <button key={v} onClick={()=>setCreatorBody(prev=>prev+v)} style={{
                    padding:"2px 8px",borderRadius:4,border:`1px solid ${T.border}`,background:"transparent",
                    color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer"
                  }}>{v}</button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding:"12px 18px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <button onClick={()=>setShowCreator(false)} style={{ padding:"8px 18px",borderRadius:7,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>Cancel</button>
            <button onClick={saveCreatorItem} disabled={!creatorName.trim()} style={{
              padding:"8px 24px",borderRadius:7,border:"none",
              background:creatorName.trim()?`linear-gradient(135deg,${T.accent},#c2410c)`:T.muted,
              color:creatorName.trim()?"#fff":T.border,fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:creatorName.trim()?"pointer":"default"
            }}>{creatorEditing != null ? "💾 Update" : "➕ Add"} {CREATOR_TYPES.find(c=>c.id===creatorType)?.label}</button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Repo Content Scanner — parse pasted .claude/ contents ───────
  const parseRepoContent = (text) => {
    const results = { skills:[], rules:[], agents:[], hooks:[], contexts:[], mcps:[], files:[] };
    if (!text.trim()) return results;
    // Split into file blocks: detect ═══ or --- file separators, or SKILL.md/rules/ paths
    const blocks = [];
    // Pattern 1: explicit file markers like "═══ .claude/skills/auth/SKILL.md ═══" or "📄 .claude/rules/security.md"
    const markerRe = /(?:^|\n)(?:[═─]{3,}|📄|##)\s*([^\n]+?\.(?:md|json|sh))\s*(?:[═─]{3,})?\s*\n/g;
    let m;
    const markers = [];
    while ((m = markerRe.exec(text)) !== null) markers.push({ path: m[1].trim(), idx: m.index + m[0].length });
    if (markers.length > 0) {
      markers.forEach((mk, i) => {
        const end = i < markers.length - 1 ? markers[i+1].idx - (text.substring(markers[i+1].idx-80, markers[i+1].idx).lastIndexOf("\n") > 0 ? 80 : 0) : text.length;
        const content = text.substring(mk.idx, i < markers.length - 1 ? text.lastIndexOf("\n", markers[i+1].idx - 1) : text.length).trim();
        blocks.push({ path: mk.path.replace(/[📄📝📋🔧]/g,"").trim(), content });
      });
    }
    // Pattern 2: detect inline frontmatter blocks (---\nname: xxx\n---)
    if (blocks.length === 0) {
      const fmRe = /---\s*\n([\s\S]*?)---/g;
      let fm;
      while ((fm = fmRe.exec(text)) !== null) {
        const header = fm[1];
        const nameMatch = header.match(/name:\s*(.+)/);
        const descMatch = header.match(/description:\s*(.+)/);
        const toolsMatch = header.match(/allowed-tools:\s*\[([^\]]*)\]/);
        const modelMatch = header.match(/model:\s*(.+)/);
        const contextMatch = header.match(/context:\s*(.+)/);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          const rest = text.substring(fm.index + fm[0].length).split(/\n---\s*\n/)[0].trim();
          const isAgent = header.includes("agent") || !header.includes("user-invocable");
          blocks.push({
            path: isAgent ? `.claude/agents/${name}.md` : `.claude/skills/${name}/SKILL.md`,
            content: fm[0] + "\n\n" + rest.substring(0, 2000),
            meta: { name, desc: descMatch?.[1]?.trim(), tools: toolsMatch?.[1]?.trim(), model: modelMatch?.[1]?.trim(), context: contextMatch?.[1]?.trim(), isAgent }
          });
        }
      }
    }
    // Pattern 3: if still no blocks, try to detect .mcp.json content
    const mcpJsonMatch = text.match(/\{[\s\S]*"servers"\s*:\s*\{([\s\S]*?)\}\s*\}/);
    if (mcpJsonMatch) {
      try {
        const parsed = JSON.parse(mcpJsonMatch[0]);
        if (parsed.servers) {
          Object.entries(parsed.servers).forEach(([id, cfg]) => {
            results.mcps.push({ id, name: id, cmd: cfg.command, args: cfg.args, url: cfg.url, env: cfg.env, transport: cfg.url ? "sse" : "stdio" });
          });
        }
      } catch(e) {}
    }
    // Pattern 4: detect settings.json hooks
    const hooksMatch = text.match(/"hooks"\s*:\s*\{([\s\S]*?)\}\s*[,}]/);
    if (hooksMatch) {
      try {
        const hookObj = JSON.parse(`{${hooksMatch[1]}}`);
        Object.entries(hookObj).forEach(([event, entries]) => {
          (Array.isArray(entries) ? entries : [entries]).forEach((entry, i) => {
            const hook = entry.hooks?.[0] || entry;
            results.hooks.push({
              id: `${event.toLowerCase()}-imported-${i}`,
              name: `${event} hook ${i+1}`,
              event,
              hookType: hook.type || "command",
              matcher: entry.matcher || "",
              body: hook.command || hook.prompt || hook.agent || "",
            });
          });
        });
      } catch(e) {}
    }
    // Classify blocks
    blocks.forEach(b => {
      const p = b.path.toLowerCase();
      if (p.includes("/skills/") || p.includes("skill.md")) {
        results.skills.push({ id: b.meta?.name || p.split("/").filter(Boolean).slice(-2)[0] || "imported-skill", name: b.meta?.name || "Imported Skill", path: b.path, content: b.content, ...b.meta });
      } else if (p.includes("/rules/")) {
        const fname = p.split("/").pop().replace(/\.md$/,"");
        results.rules.push({ id: fname, name: fname, path: b.path, content: b.content });
      } else if (p.includes("/agents/")) {
        const fname = p.split("/").pop().replace(/\.md$/,"");
        results.agents.push({ id: fname, name: b.meta?.name || fname, path: b.path, content: b.content, ...b.meta });
      } else if (p.includes("/contexts/")) {
        const fname = p.split("/").pop().replace(/\.md$/,"");
        results.contexts.push({ id: fname, name: fname, path: b.path, content: b.content });
      } else {
        results.files.push({ id: p.split("/").pop().replace(/\.\w+$/,""), name: b.path, path: b.path, content: b.content });
      }
    });
    // Pattern 5: plain text fallback — treat entire paste as a single file if nothing was detected
    if (blocks.length === 0 && results.mcps.length === 0 && results.hooks.length === 0 && text.trim().length > 20) {
      // Check if it looks like a SKILL.md
      if (text.includes("---") && text.includes("name:")) {
        results.skills.push({ id:"imported-skill", name:"Imported Skill", path:".claude/skills/imported/SKILL.md", content: text.trim() });
      } else if (text.startsWith("#") || text.startsWith(">")) {
        results.files.push({ id:"imported-file", name:"Imported File", path:".claude/imported.md", content: text.trim() });
      }
    }
    return results;
  };

  const importRepoResults = () => {
    if (!repoImportResults) return;
    const sel = repoImportSelected;
    const newItems = [];
    sel.skills.forEach(idx => {
      const s = repoImportResults.skills[idx];
      if (s) newItems.push({ type:"skill", id:s.id, name:s.name, desc:s.desc||"", path:s.path, content:s.content, body:s.content, tools:s.tools||"", model:s.model||"", context:s.context||"fork" });
    });
    sel.rules.forEach(idx => {
      const r = repoImportResults.rules[idx];
      if (r) newItems.push({ type:"rule", id:r.id, name:r.name, desc:"", path:r.path, content:r.content, body:r.content });
    });
    sel.agents.forEach(idx => {
      const a = repoImportResults.agents[idx];
      if (a) newItems.push({ type:"agent", id:a.id, name:a.name, desc:a.desc||"", path:a.path, content:a.content, body:a.content, tools:a.tools||"", model:a.model||"" });
    });
    sel.hooks.forEach(idx => {
      const h = repoImportResults.hooks[idx];
      if (h) newItems.push({ type:"hook", id:h.id, name:h.name, desc:"", event:h.event, hookType:h.hookType, matcher:h.matcher, body:h.body, path:null, content:h.body });
    });
    sel.contexts.forEach(idx => {
      const c = repoImportResults.contexts[idx];
      if (c) newItems.push({ type:"context", id:c.id, name:c.name, desc:"", path:c.path, content:c.content, body:c.content });
    });
    sel.files.forEach(idx => {
      const f = repoImportResults.files[idx];
      if (f) newItems.push({ type:"file", id:f.id, name:f.name, desc:"", path:f.path, content:f.content, body:f.content });
    });
    // Import custom MCPs
    sel.mcps.forEach(idx => {
      const m = repoImportResults.mcps[idx];
      if (m && !customMcps.find(x => x.id === m.id)) {
        setCustomMcps(prev => [...prev, m]);
      }
    });
    if (newItems.length) setCustomItems(prev => [...prev, ...newItems]);
    setRepoImportOpen(false);
    setRepoImportResults(null);
    setRepoImportPaste("");
    setRepoImportSelected({skills:[],rules:[],hooks:[],mcps:[],agents:[],contexts:[],commands:[]});
  };

  const toggleImportSel = (cat, idx) => {
    setRepoImportSelected(prev => {
      const arr = prev[cat] || [];
      return { ...prev, [cat]: arr.includes(idx) ? arr.filter(i=>i!==idx) : [...arr, idx] };
    });
  };

  const totalImportSelected = Object.values(repoImportSelected).reduce((s,a)=>s+a.length,0);

  // ─── Repo Import + External MCP Panel ─────────────────────────────
  const renderRepoInput = () => (
    <div style={{ marginTop:10 }}>
      {/* Quick MCP Add */}
      <div style={{ padding:12,background:"rgba(0,0,0,.2)",borderRadius:8,border:`1px solid ${T.border}`,marginBottom:6 }}>
        <Lbl>🔌 Add External MCP Server (repo URL, npm package, or SSE endpoint)</Lbl>
        <div style={{ display:"flex",gap:6,marginBottom:customMcps.length?6:0 }}>
          <input value={repoUrlInput} onChange={e=>setRepoUrlInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustomMcp()}
            placeholder="github.com/org/mcp-server  ·  @scope/package  ·  https://mcp.example.com/sse"
            style={{ flex:1,padding:"7px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.4)",color:T.text,fontSize:11,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box" }}/>
          <select value={repoUrlTransport} onChange={e=>setRepoUrlTransport(e.target.value)} style={{ padding:"7px 8px",borderRadius:6,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:10,fontFamily:"'JetBrains Mono',monospace",outline:"none",width:90 }}>
            <option value="stdio">stdio (npx)</option>
            <option value="python">stdio (uvx)</option>
            <option value="sse">SSE</option>
          </select>
          <button onClick={addCustomMcp} style={{ padding:"7px 14px",borderRadius:6,border:"none",background:T.accent,color:"#fff",fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",whiteSpace:"nowrap" }}>+ Add</button>
        </div>
        {customMcps.length > 0 && (
          <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
            {customMcps.map(m => (
              <span key={m.id} style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:12,border:`1.5px solid ${T.blue}`,background:`${T.blue}15`,fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:T.blue }}>
                {m.transport === "sse" ? "🌐" : "📦"} {m.name}
                <button onClick={()=>removeCustomMcp(m.id)} style={{ background:"none",border:"none",color:T.blue,cursor:"pointer",fontSize:11,padding:0,marginLeft:2 }}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Import from Repo (full scanner) */}
      <div style={{ padding:12,background:"rgba(59,130,246,.04)",borderRadius:8,border:`1px solid rgba(59,130,246,.15)` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ color:T.blue,fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace" }}>📥 Import from Repo — paste .claude/ configs to import skills, rules, hooks, agents & more</span>
          <button onClick={()=>setRepoImportOpen(!repoImportOpen)} style={{ padding:"3px 10px",borderRadius:5,border:`1px solid ${T.blue}`,background:repoImportOpen?T.blueDim:"transparent",color:T.blue,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>
            {repoImportOpen ? "▾ Close" : "▸ Open Scanner"}
          </button>
        </div>

        {repoImportOpen && (
          <div style={{ marginTop:10 }}>
            <div style={{ marginBottom:8 }}>
              <Lbl>Paste repo contents (SKILL.md files, rules, settings.json hooks, .mcp.json, agents, etc.)</Lbl>
              <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",marginBottom:4 }}>
                Tip: Copy files with headers like "═══ .claude/skills/auth/SKILL.md ═══" between them, or paste a single SKILL.md / settings.json / .mcp.json
              </div>
              <textarea value={repoImportPaste} onChange={e=>setRepoImportPaste(e.target.value)}
                placeholder={"Paste repo file contents here...\n\nExamples:\n═══ .claude/skills/auth/SKILL.md ═══\n---\nname: auth\ndescription: Authentication patterns\nallowed-tools: [Read, Bash]\ncontext: fork\nuser-invocable: true\n---\n## Auth Skill\n...\n\n═══ .claude/rules/api-standards.md ═══\n# API Standards\n...\n\nOr paste a .mcp.json:\n{ \"servers\": { \"my-server\": { \"command\": \"npx\", \"args\": [\"-y\", \"@org/mcp\"] } } }"}
                rows={8}
                style={{ width:"100%",padding:"10px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.4)",color:T.text,fontSize:11,fontFamily:"'JetBrains Mono',monospace",outline:"none",resize:"vertical",boxSizing:"border-box",lineHeight:1.5 }}
              />
              <button onClick={()=>{
                const r = parseRepoContent(repoImportPaste);
                setRepoImportResults(r);
                // Auto-select all
                setRepoImportSelected({
                  skills: r.skills.map((_,i)=>i), rules: r.rules.map((_,i)=>i),
                  hooks: r.hooks.map((_,i)=>i), mcps: r.mcps.map((_,i)=>i),
                  agents: r.agents.map((_,i)=>i), contexts: r.contexts.map((_,i)=>i),
                  commands:[], files: r.files.map((_,i)=>i)
                });
              }} disabled={!repoImportPaste.trim()} style={{
                marginTop:6,padding:"7px 20px",borderRadius:6,border:"none",
                background:repoImportPaste.trim()?`linear-gradient(135deg,${T.blue},#1d4ed8)`:T.muted,
                color:repoImportPaste.trim()?"#fff":T.border,fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:repoImportPaste.trim()?"pointer":"default"
              }}>🔍 Scan & Parse</button>
            </div>

            {/* Scan Results */}
            {repoImportResults && (()=>{
              const r = repoImportResults;
              const totalFound = r.skills.length + r.rules.length + r.agents.length + r.hooks.length + r.contexts.length + r.mcps.length + r.files.length;
              if (totalFound === 0) return (
                <div style={{ padding:12,background:"rgba(239,68,68,.08)",borderRadius:6,border:"1px solid rgba(239,68,68,.2)",color:"#ef4444",fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>
                  ⚠️ No tools detected. Try pasting file contents with path headers (═══ path ═══) or a valid settings.json / .mcp.json / SKILL.md.
                </div>
              );
              const cats = [
                { key:"skills",   icon:"🛠️", label:"Skills",   items:r.skills },
                { key:"rules",    icon:"📏", label:"Rules",    items:r.rules },
                { key:"agents",   icon:"🤖", label:"Agents",   items:r.agents },
                { key:"hooks",    icon:"🪝", label:"Hooks",    items:r.hooks },
                { key:"contexts", icon:"🎯", label:"Contexts", items:r.contexts },
                { key:"mcps",     icon:"🔌", label:"MCP Servers", items:r.mcps },
                { key:"files",    icon:"📄", label:"Files",    items:r.files },
              ].filter(c => c.items.length > 0);
              return (
                <div style={{ background:"rgba(0,0,0,.2)",borderRadius:8,padding:12 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                    <span style={{ color:T.green,fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace" }}>✅ Found {totalFound} items</span>
                    <span style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>{totalImportSelected} selected</span>
                  </div>
                  {cats.map(cat => (
                    <div key={cat.key} style={{ marginBottom:8 }}>
                      <div style={{ color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",marginBottom:3 }}>{cat.icon} {cat.label} ({cat.items.length})</div>
                      <div style={{ display:"flex",flexWrap:"wrap",gap:3 }}>
                        {cat.items.map((item, idx) => {
                          const sel = (repoImportSelected[cat.key]||[]).includes(idx);
                          return (
                            <button key={idx} onClick={()=>toggleImportSel(cat.key, idx)} style={{
                              padding:"4px 10px",borderRadius:8,fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",
                              border:sel?`1.5px solid ${T.blue}`:`1px solid ${T.border}`,
                              background:sel?T.blueDim:"transparent",color:sel?T.blue:T.dim,
                            }} title={item.path||item.name}>
                              {sel?"✓ ":""}{item.name||item.id}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <button onClick={importRepoResults} disabled={totalImportSelected===0} style={{
                    marginTop:6,width:"100%",padding:"8px",borderRadius:6,border:"none",
                    background:totalImportSelected>0?`linear-gradient(135deg,${T.blue},#1d4ed8)`:T.muted,
                    color:totalImportSelected>0?"#fff":T.border,fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:totalImportSelected>0?"pointer":"default"
                  }}>📥 Import {totalImportSelected} Selected Items</button>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Custom Items Summary Bar ─────────────────────────────────────
  const renderCustomItemsBar = () => {
    if (customItems.length === 0) return null;
    const grouped = {};
    customItems.forEach((it, idx) => {
      if (!grouped[it.type]) grouped[it.type] = [];
      grouped[it.type].push({ ...it, _idx: idx });
    });
    return (
      <div style={{ marginTop:10,padding:10,background:"rgba(249,115,22,.05)",borderRadius:8,border:`1px solid rgba(249,115,22,.15)` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
          <span style={{ color:T.accent,fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:1 }}>Custom Tools ({customItems.length})</span>
          <button onClick={()=>openCreator("skill")} style={{ padding:"3px 10px",borderRadius:5,border:`1px solid ${T.accent}`,background:"transparent",color:T.accent,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>+ New</button>
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
          {customItems.map((it, idx) => {
            const ct = CREATOR_TYPES.find(c=>c.id===it.type);
            return (
              <span key={idx} style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:12,border:`1.5px solid ${T.accent}`,background:T.accentDim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:T.accent }}>
                {ct?.icon} {it.name}
                <button onClick={()=>openCreator(it.type, idx)} style={{ background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:9,padding:0 }}>✏️</button>
                <button onClick={()=>removeCustomItem(idx)} style={{ background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:11,padding:0 }}>✕</button>
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // Forward: auto-detect
  const autoDetect = async () => {
    // ── AI-Enhanced Detection ──
    if (apiKey) {
      setAiLoading(true);
      try {
        const aiResult = await callLLM(
          `Project name: ${name}\nProject type: ${type}\nDescription: ${desc}\n\nAnalyze this project and return a JSON object (no markdown, no backticks, just raw JSON) with these exact keys:\n{\n  "languages": ["TypeScript", ...],\n  "frameworks": ["Next.js", ...],\n  "databases": ["PostgreSQL", ...],\n  "infra": ["Docker", ...],\n  "mcpServers": ["filesystem", "memory", "context7", ...],\n  "rules": ["security", "coding-style", ...],\n  "skills": ["lint-fix", "refactor", ...],\n  "agents": ["architect", "reviewer", ...],\n  "contexts": ["dev", "review", "debug"],\n  "sandbox": true/false,\n  "notebooks": true/false,\n  "ghCli": true/false,\n  "directories": "src/ — source\\ntests/ — tests\\n...",\n  "commonCmds": "npm run dev    # development\\nnpm test       # tests\\n..."\n}`,
          `You are a Claude Code configuration expert. Given a project description, recommend the optimal configuration. Available options:\n\nLanguages: JavaScript, TypeScript, Python, Rust, Go, Java, C#, Ruby, PHP, Swift, Kotlin\nFrameworks: Next.js, React, Vue, Angular, Django, FastAPI, Flask, Express, NestJS, Rails, Laravel, Spring Boot, Gin\nDatabases: PostgreSQL, MySQL, MongoDB, SQLite, Redis, Supabase, Prisma, Drizzle ORM\nInfra: Docker, Kubernetes, Terraform, AWS, GCP, Azure, Vercel, Netlify, Railway\nMCP Servers: filesystem, memory, context7, github, postgres, supabase, sentry, docker, slack, linear, notion, brave-search\nRules: security, coding-style, testing, git-workflow, agents, performance, documentation, error-handling, accessibility, api-design, database, monitoring\nSkills: lint-fix, refactor, review, test, deploy-check, fix-issue, doc-gen, security-review, plan, search-codebase, continuous-learning, aha-review, backport, self-learning\nAgents: architect, reviewer, debugger, refactor-agent, test-writer, doc-writer, security-auditor, performance-optimizer\nContexts: dev, review, debug, deploy, onboarding\n\nReturn ONLY valid JSON. Choose what fits the project — don't include everything, be selective and opinionated.`
        );
        if (aiResult) {
          const cleaned = aiResult.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          const rec = JSON.parse(cleaned);
          if (rec.languages?.length) setLangs(rec.languages);
          if (rec.frameworks) setFws(rec.frameworks);
          if (rec.databases) setDbs(rec.databases);
          if (rec.infra) setInfra(rec.infra);
          if (rec.mcpServers) setMcps(rec.mcpServers);
          if (rec.rules) setSelectedRules(rec.rules);
          if (rec.skills) setSkills(rec.skills);
          if (rec.agents) setAgents(rec.agents);
          if (rec.contexts) setSelectedContexts(rec.contexts);
          if (rec.sandbox !== undefined) setSandbox(rec.sandbox);
          if (rec.notebooks !== undefined) setNotebooks(rec.notebooks);
          if (rec.ghCli) setAllowGhCli(true);
          if (rec.directories) setDirectories(rec.directories);
          if (rec.commonCmds) setCommonCmds(rec.commonCmds);
          setStep(1);
          return;
        }
      } catch (e) {
        setAiError("AI detection failed, using pattern matching. " + (e.message || ""));
      } finally {
        setAiLoading(false);
      }
    }

    // ── Regex Fallback Detection ──
    const t = `${name} ${desc} ${type}`.toLowerCase();
    const det = { languages:[], frameworks:[], databases:[], infra:[], mcpServers:["filesystem","memory","context7"] };
    const maps = {
      lang: { typescript:"TypeScript", javascript:"JavaScript", python:"Python", rust:"Rust", go:"Go", golang:"Go", java:"Java", "c#":"C#", csharp:"C#", ruby:"Ruby", php:"PHP", swift:"Swift", kotlin:"Kotlin" },
      fw: { "next.js":"Next.js", nextjs:"Next.js", react:"React", vue:"Vue", angular:"Angular", django:"Django", fastapi:"FastAPI", flask:"Flask", express:"Express", nestjs:"NestJS", rails:"Rails", laravel:"Laravel", "spring boot":"Spring Boot" },
      db: { postgres:"PostgreSQL", postgresql:"PostgreSQL", mysql:"MySQL", mongo:"MongoDB", sqlite:"SQLite", redis:"Redis", supabase:"Supabase", prisma:"Prisma", drizzle:"Drizzle ORM" },
      infra: { docker:"Docker", kubernetes:"Kubernetes", terraform:"Terraform", aws:"AWS", gcp:"GCP", azure:"Azure", vercel:"Vercel", netlify:"Netlify", railway:"Railway" },
    };
    Object.entries(maps.lang).forEach(([k,v])=>{ if(t.includes(k)&&!det.languages.includes(v)) det.languages.push(v); });
    Object.entries(maps.fw).forEach(([k,v])=>{ if(t.includes(k)&&!det.frameworks.includes(v)) det.frameworks.push(v); });
    Object.entries(maps.db).forEach(([k,v])=>{ if(t.includes(k)&&!det.databases.includes(v)) det.databases.push(v); });
    Object.entries(maps.infra).forEach(([k,v])=>{ if(t.includes(k)&&!det.infra.includes(v)) det.infra.push(v); });
    const fwLang = { "Next.js":"TypeScript",React:"JavaScript",Angular:"TypeScript",NestJS:"TypeScript",Django:"Python",FastAPI:"Python",Flask:"Python",Rails:"Ruby",Laravel:"PHP","Spring Boot":"Java" };
    det.frameworks.forEach(fw=>{ if(fwLang[fw]&&!det.languages.includes(fwLang[fw])) det.languages.push(fwLang[fw]); });
    const mcpMap = { PostgreSQL:"postgres", Supabase:"supabase", Docker:"docker" };
    [...det.databases,...det.infra].forEach(i=>{ if(mcpMap[i]&&!det.mcpServers.includes(mcpMap[i])) det.mcpServers.push(mcpMap[i]); });
    if(t.includes("github")) det.mcpServers.push("github");
    if(t.includes("sentry")) det.mcpServers.push("sentry");

    setLangs(det.languages);
    setFws(det.frameworks);
    setDbs(det.databases);
    setInfra(det.infra);
    setMcps(det.mcpServers);
    setAgents(PROJECT_AGENTS[type] || PROJECT_AGENTS.fullstack);
    setSkills(["lint-fix","refactor","review","test","deploy-check","fix-issue","doc-gen","security-review","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"]);
    setSelectedRules(["security","coding-style","testing","git-workflow","agents","performance"]);
    setSelectedContexts(["dev","review","debug"]);
    setSandbox(det.infra.includes("Docker"));
    setNotebooks(t.includes("notebook")||t.includes("jupyter")||t.includes("ai-ml"));
    if(t.includes("github")) setAllowGhCli(true);
    setStep(1);
  };

  // ─── GitHub Repo Fetch ─────────────────────────────────────────────
  const fetchGitHubRepo = async () => {
    const url = ghUrl.trim();
    if (!url) return;
    const m = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/\s#?]+)/);
    if (!m) { setGhError("Invalid GitHub URL. Use: github.com/owner/repo"); return; }
    const [, owner, repoRaw] = m;
    const repo = repoRaw.replace(/\.git$/, "");
    setGhLoading(true); setGhError(null);

    try {
      // 1. Fetch repo tree (recursive)
      const branchRef = ghBranch || "HEAD";
      const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branchRef}?recursive=1`);
      if (!treeRes.ok) {
        if (treeRes.status === 404) throw new Error(`Repository not found: ${owner}/${repo}. Make sure it's public.`);
        if (treeRes.status === 403) throw new Error("GitHub API rate limit reached. Try again in a minute or paste content manually.");
        throw new Error(`GitHub API error: ${treeRes.status}`);
      }
      const treeData = await treeRes.json();
      const allPaths = (treeData.tree || []).filter(n => n.type === "blob").map(n => n.path);

      // Build file tree text
      const treeText = allPaths.join("\n");

      // 2. Identify key files to fetch content for deeper analysis
      const keyFiles = allPaths.filter(p =>
        p === "CLAUDE.md" || p === ".claude/settings.json" || p === ".claude/settings.local.json" ||
        p === ".mcp.json" || p === "package.json" || p === "Cargo.toml" || p === "go.mod" ||
        p === "requirements.txt" || p === "pyproject.toml" || p === "Gemfile" || p === "composer.json" ||
        p === "pom.xml" || p === "build.gradle" || p === "tsconfig.json" || p === "Dockerfile" ||
        p === ".claude-plugin/plugin.json" ||
        p.match(/^\.claude\/(rules|skills|agents|commands|contexts|scripts|memory)\//)
      );

      // 3. Fetch key file contents (parallel, max 15 files)
      const filesToFetch = keyFiles.slice(0, 15);
      const fileContents = await Promise.allSettled(
        filesToFetch.map(async path => {
          const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branchRef}`);
          if (!res.ok) return { path, content: null };
          const data = await res.json();
          if (data.content && data.encoding === "base64") {
            try { return { path, content: atob(data.content) }; } catch { return { path, content: null }; }
          }
          return { path, content: null };
        })
      );

      // 4. Build combined text for analyzeRepo
      let combined = `# Repository: ${owner}/${repo}\n\n## File Tree\n${treeText}\n\n`;
      fileContents.forEach(r => {
        if (r.status === "fulfilled" && r.value.content) {
          combined += `\n${"═".repeat(50)}\n📄 ${r.value.path}\n${"═".repeat(50)}\n${r.value.content}\n`;
        }
      });

      // Auto-fill project info
      if (!name) setName(repo);
      if (!desc) {
        const pkgContent = fileContents.find(r => r.status === "fulfilled" && r.value.path === "package.json")?.value?.content;
        if (pkgContent) { try { const pkg = JSON.parse(pkgContent); if (pkg.description) setDesc(pkg.description); } catch {} }
      }

      setRepoInput(combined);
      setGhLoading(false);
      // Auto-analyze
      const a = analyzeRepo(combined);
      const g = computeGaps(a);
      setAnalysis(a); setGapReport(g);
      setLangs([...a.stack.languages]); setFws([...a.stack.frameworks]);
      setDbs([...a.stack.databases]); setInfra([...a.stack.infra]);
      setMcps(a.features.mcp.servers.length ? a.features.mcp.servers : ["filesystem","memory","context7"]);
      setStep(1);
    } catch (err) {
      setGhError(err.message);
      setGhLoading(false);
    }
  };

  // ─── Local File/Folder Upload ─────────────────────────────────────
  const handleFileUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setUploadLoading(true);
    setUploadFileCount(fileList.length);

    const relevantFiles = [];
    const allPaths = [];

    for (const file of fileList) {
      const path = file.webkitRelativePath || file.name;
      allPaths.push(path);

      // Only read content of relevant config files (skip node_modules, large files, etc.)
      const lower = path.toLowerCase();
      const isRelevant =
        lower.includes("claude.md") || lower.includes(".claude/") || lower.includes(".mcp.json") ||
        lower === "package.json" || lower.endsWith("/package.json") ||
        lower === "cargo.toml" || lower.endsWith("/cargo.toml") ||
        lower === "go.mod" || lower.endsWith("/go.mod") ||
        lower === "requirements.txt" || lower.endsWith("/requirements.txt") ||
        lower === "pyproject.toml" || lower.endsWith("/pyproject.toml") ||
        lower === "tsconfig.json" || lower.endsWith("/tsconfig.json") ||
        lower === "dockerfile" || lower.endsWith("/dockerfile") ||
        lower === "gemfile" || lower.endsWith("/gemfile") ||
        lower === "composer.json" || lower.endsWith("/composer.json");

      const isSmallEnough = file.size < 100000; // 100KB max per file

      if (isRelevant && isSmallEnough) {
        try {
          const text = await file.text();
          relevantFiles.push({ path, content: text });
        } catch {}
      }
    }

    // Build combined text
    let combined = `# Local Repository\n\n## File Tree (${allPaths.length} files)\n${allPaths.join("\n")}\n\n`;
    relevantFiles.forEach(f => {
      combined += `\n${"═".repeat(50)}\n📄 ${f.path}\n${"═".repeat(50)}\n${f.content}\n`;
    });

    // Auto-fill project name from folder name
    if (!name && allPaths.length > 0) {
      const first = allPaths[0];
      const folder = first.split("/")[0];
      if (folder) setName(folder);
    }

    // Auto-fill description from package.json
    if (!desc) {
      const pkgFile = relevantFiles.find(f => f.path.endsWith("package.json") && !f.path.includes("node_modules"));
      if (pkgFile) { try { const pkg = JSON.parse(pkgFile.content); if (pkg.description) setDesc(pkg.description); } catch {} }
    }

    setRepoInput(combined);
    setUploadLoading(false);
    // Auto-analyze
    const a = analyzeRepo(combined);
    const g = computeGaps(a);
    setAnalysis(a); setGapReport(g);
    setLangs([...a.stack.languages]); setFws([...a.stack.frameworks]);
    setDbs([...a.stack.databases]); setInfra([...a.stack.infra]);
    setMcps(a.features.mcp.servers.length ? a.features.mcp.servers : ["filesystem","memory","context7"]);
    setStep(1);
  };

  // Reverse: analyze
  const runAnalysis = () => {
    const a = analyzeRepo(repoInput);
    const g = computeGaps(a);
    setAnalysis(a);
    setGapReport(g);
    // Pre-populate forward fields from detected stack
    setLangs([...a.stack.languages]);
    setFws([...a.stack.frameworks]);
    setDbs([...a.stack.databases]);
    setInfra([...a.stack.infra]);
    setMcps(a.features.mcp.servers.length ? a.features.mcp.servers : ["filesystem","memory","context7"]);
    setStep(1);
  };

  // Reverse: retrofit — generate only missing files
  const generateRetrofit = () => {
    if (!name.trim()) setName("my-project");
    if (!desc.trim()) setDesc("Retrofitted AI coding configuration");
    const cfg = buildCfg();
    let allFiles = generateForTargets(cfg, exportTargets);
    // In reverse mode, only include files that fill gaps
    if (analysis) {
      const filtered = {};
      // Collect custom item paths for bypass
      const customPaths = new Set((cfg.customItems || []).filter(i=>i.path).map(i=>i.path));
      Object.entries(allFiles).forEach(([path, content]) => {
        // Always include custom items regardless of analysis
        if (customPaths.has(path)) { filtered[path] = content; return; }
        // Always include if it's a gap
        const isRule = path.includes("/rules/");
        const isSkill = path.includes("/skills/");
        const isAgent = path.includes("/agents/");
        const isContext = path.includes("/contexts/");
        const isScript = path.includes("/scripts/");
        const isMemory = path.includes("/memory/");
        const isPlugin = path.includes("plugin.json");

        if (isRule && analysis.files.rules.length === 0) filtered[path] = content;
        else if (isSkill && analysis.files.skills.length === 0) filtered[path] = content;
        else if (isAgent && analysis.files.agents.length === 0) filtered[path] = content;
        else if (isContext && analysis.files.contexts.length === 0) filtered[path] = content;
        else if (isScript && !analysis.files.memory) filtered[path] = content;
        else if (isMemory && !analysis.files.memory) filtered[path] = content;
        else if (isPlugin && !analysis.files.pluginJson) filtered[path] = content;
        else if (path === "CLAUDE.md" && !analysis.files.claudeMd) filtered[path] = content;
        else if (path === ".claude/settings.json" && !analysis.files.settingsJson) filtered[path] = content;
        else if (path === ".mcp.json" && !analysis.files.mcpJson) filtered[path] = content;
        else if (path === ".claude/settings.local.json" && !analysis.files.settingsLocal) filtered[path] = content;
        // For files that exist but are incomplete, include enhanced versions
        else if (path === ".claude/settings.json" && analysis.files.settingsJson) filtered[`${path} (ENHANCED)`] = content;
        else if (path === "CLAUDE.md" && analysis.files.claudeMd) filtered[`${path} (ENHANCED)`] = content;
        // Always include global config if requested
        else if (path.startsWith("~/")) filtered[path] = content;
        // Always include IDE config
        else if (path.includes(".vscode/")) filtered[path] = content;
        // Always include .mcp.json and settings.json if custom MCPs/hooks added
        else if (path === ".mcp.json" && (cfg.customMcps||[]).length > 0) filtered[`${path} (ENHANCED)`] = content;
        else if (path === ".claude/settings.json" && (cfg.customItems||[]).some(i=>i.type==="hook")) filtered[`${path} (ENHANCED)`] = content;
      });
      // If filtering removed everything (everything exists), give all files as enhanced
      if (Object.keys(filtered).length === 0) {
        Object.entries(allFiles).forEach(([p,c]) => { filtered[`${p} (FULL)`] = c; });
      }
      allFiles = filtered;
    }
    setFiles(allFiles);
    setSelFile(Object.keys(allFiles)[0]);
    setEdits({});
    setStep(mode === "reverse" ? 2 : 3);
  };

  const buildCfg = () => ({
    name: name || "my-project", description: desc || "", type, ide, model, os, globalScope,
    languages:langs, frameworks:fws, databases:dbs, infra, mcpServers:mcps,
    agents, skills, selectedRules, selectedContexts,
    webTools, notebooks, sandbox, defaultMode, outputStyle, statusLine, allowGhCli,
    memoryPersistence, generatePlugin, enableAllProjectMcpServers,
    denyPatterns, additionalDirs, gitBranch, commitConv, commonCmds, directories, env,
    customMcps, customItems, projectDocs,
  });

  const generateForward = () => {
    setGenerating(true);
    setGenProgress([]);
    const cfg = buildCfg();
    const hasAI = !!apiKey;
    const msgs = [
      "Scaffolding CLAUDE.md...",
      `Generating ${selectedRules.length + customItems.filter(i=>i.type==="rule").length} rules...`,
      `Building ${skills.length + customItems.filter(i=>i.type==="skill").length} skills...`,
      `Configuring ${agents.length + customItems.filter(i=>i.type==="agent").length} agents...`,
      `Wiring ${mcps.length + customMcps.length} MCP servers...`,
      `Setting up ${hookCount + customItems.filter(i=>i.type==="hook").length}+ hooks...`,
      "Generating permissions & settings...",
      ...(exportTargets.length > 1 ? [`🎯 Exporting to ${exportTargets.length} targets: ${exportTargets.map(t => EXPORT_TARGETS[t]?.name || t).join(", ")}...`] : []),
      ...(projectDocs.length > 0 ? [`📄 Generating ${projectDocs.length} project documents...`] : []),
      hasAI ? "🤖 Enhancing configs with AI..." : "Finalizing configuration...",
    ];
    const delays = [300,250,300,200,250,200,200,...(exportTargets.length > 1 ? [350] : []),...(projectDocs.length > 0 ? [250] : []),300];
    let cumulative = 0;
    msgs.forEach((msg, idx) => {
      cumulative += delays[idx];
      setTimeout(() => setGenProgress(p => [...p, msg]), cumulative);
    });
    setTimeout(async () => {
      const f = generateForTargets(cfg, exportTargets);

      // AI Enhancement: rewrite main config for each active target
      if (hasAI) {
        const rewritePrompt = (fileName, content, targetName) =>
          `Here is a template-generated ${fileName} for a project called "${name}" (target: ${targetName}):\n\n---\n${content}\n---\n\nRewrite this to be more specific, actionable, and useful. Keep the same structure but:\n1. Expand the project description with specific conventions for the stack (${langs.join(", ")})\n2. Add concrete directory descriptions based on the project type (${type})\n3. Add common pitfalls and architecture decisions for this stack\n4. Make the commands section specific (not placeholder)\n5. Keep under 150 lines — concise and dense\n\nReturn ONLY the raw markdown, no fences, no preamble.`;
        const systemPrompt = "You are an expert at writing AI coding assistant configuration files. Write clear, actionable, project-specific instructions. Preserve the exact format expected by the target tool.";

        // Map of target -> [file, label] for main config files
        const targetMainFiles = {
          "claude-code": ["CLAUDE.md", "CLAUDE.md (Claude Code)"],
          "cursor": [".cursorrules", ".cursorrules (Cursor)"],
          "windsurf": [".windsurfrules", ".windsurfrules (Windsurf)"],
          "copilot": [".github/copilot-instructions.md", "copilot-instructions.md (GitHub Copilot)"],
          "cline": [".clinerules/01-project.md", "project rules (Cline)"],
          "roo-code": [".roo/rules/01-project.md", "project rules (Roo Code)"],
          "agents-md": ["AGENTS.md", "AGENTS.md"],
          "aider": ["CONVENTIONS.md", "CONVENTIONS.md (Aider)"],
        };

        // Rewrite each active target's main config in parallel
        const rewriteJobs = exportTargets
          .filter(tid => targetMainFiles[tid] && f[targetMainFiles[tid][0]])
          .map(async tid => {
            const [fileName, label] = targetMainFiles[tid];
            try {
              const result = await callLLM(
                rewritePrompt(fileName, f[fileName], label),
                systemPrompt
              );
              if (result && result.length > 200) f[fileName] = result;
            } catch {}
          });
        await Promise.all(rewriteJobs);
      }

      setFiles(f);
      setSelFile(Object.keys(f)[0]);
      setEdits({});
      setGenerating(false);
      setGenProgress([]);
      setStep(3);
    }, cumulative + 400);
  };

  // ── Live Preview Builder ──────────────────────────────────────────
  const buildPreviewTree = () => {
    const tree = { "CLAUDE.md": null, ".claude/": { "settings.json": null } };
    if (mcps.length > 0 || customMcps.length > 0) tree[".mcp.json"] = null;
    const claude = tree[".claude/"];
    if (selectedRules.length > 0 || customItems.some(i=>i.type==="rule")) {
      claude["rules/"] = {};
      selectedRules.forEach(r => claude["rules/"][r+".md"] = null);
      customItems.filter(i=>i.type==="rule").forEach(i => claude["rules/"][i.name.toLowerCase().replace(/\s+/g,"-")+".md"] = null);
    }
    if (skills.length > 0 || customItems.some(i=>i.type==="skill")) {
      claude["skills/"] = {};
      skills.forEach(s => claude["skills/"][s+"/"] = { "SKILL.md": null });
      customItems.filter(i=>i.type==="skill").forEach(i => claude["skills/"][i.name.toLowerCase().replace(/\s+/g,"-")+"/"] = { "SKILL.md": null });
    }
    if (agents.length > 0 || customItems.some(i=>i.type==="agent")) {
      claude["agents/"] = {};
      agents.forEach(a => claude["agents/"][a+".md"] = null);
      customItems.filter(i=>i.type==="agent").forEach(i => claude["agents/"][i.name.toLowerCase().replace(/\s+/g,"-")+".md"] = null);
    }
    if (selectedContexts.length > 0 || customItems.some(i=>i.type==="context")) {
      claude["contexts/"] = {};
      selectedContexts.forEach(c => claude["contexts/"][c+".md"] = null);
      customItems.filter(i=>i.type==="context").forEach(i => claude["contexts/"][i.name.toLowerCase().replace(/\s+/g,"-")+".md"] = null);
    }
    if (memoryPersistence) {
      claude["memory/"] = { "aha-cards.jsonl": null, "recommendations.jsonl": null };
      claude["scripts/"] = { ...(claude["scripts/"]||{}), "memory-review.sh": null, "memory-backport.sh": null };
    }
    const hookEvents = new Set();
    langs.forEach(l => (STACKS[l]?.hooks||[]).forEach(h => hookEvents.add(h.event)));
    fws.forEach(f => (FW_HOOKS[f]||[]).forEach(h => hookEvents.add(h.event)));
    if (hookEvents.size > 0) {
      claude["scripts/"] = claude["scripts/"] || {};
      hookEvents.forEach(e => claude["scripts/"][e.replace(/:/g,"-")+".sh"] = null);
    }
    if (generatePlugin) tree[".claude-plugin/"] = { "plugin.json": null };
    if (globalScope) {
      if (exportTargets.includes("claude-code")) tree["~/.claude/"] = { "CLAUDE.md": null, "settings.json": null };
      if (exportTargets.includes("cursor")) tree["~/.cursor/"] = { "rules/": { "global.mdc": null } };
      if (exportTargets.includes("windsurf")) tree["~/.windsurf/"] = { "rules/": { "global.md": null } };
      if (exportTargets.includes("copilot")) tree["~/.github/"] = { "copilot-instructions.md": null };
      if (exportTargets.includes("cline")) tree["~/.cline/"] = { "rules/": { "global.md": null } };
      if (exportTargets.includes("roo-code")) tree["~/.roo/"] = { "rules/": { "global.md": null } };
    }
    // Project documents
    if (projectDocs.length > 0) {
      const docsDir = {};
      projectDocs.forEach(d => {
        const name = PROJECT_DOCS[d]?.name;
        if (name) {
          if (name.startsWith("docs/")) {
            if (!tree["docs/"]) tree["docs/"] = {};
            tree["docs/"][name.replace("docs/","")] = null;
          } else {
            tree[name] = null;
          }
        }
      });
    }
    return tree;
  };

  const renderTree = (obj, depth=0, parentPath="") => {
    return Object.entries(obj).map(([k, v]) => {
      const isDir = k.endsWith("/");
      const icon = isDir ? (depth===0?"📂":"📁") : k.endsWith(".md")?"📝":k.endsWith(".json")?"📋":k.endsWith(".sh")?"🔧":k.endsWith(".jsonl")?"💾":"📄";
      return (
        <div key={parentPath+k}>
          <div style={{ paddingLeft:depth*16+8, fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:isDir?T.accent:T.dim, lineHeight:2 }}>
            {icon} {k}
          </div>
          {v && typeof v === "object" && renderTree(v, depth+1, parentPath+k)}
        </div>
      );
    });
  };

  const buildPreviewClaudeMd = () => {
    const lines = [`# ${name||"Project"}\n`];
    if (desc) lines.push(desc.split("\n")[0]+"\n");
    lines.push("## Key Directories\n");
    lines.push(directories||"src/ — source code\ntests/ — test suites");
    lines.push("\n## Common Commands\n");
    lines.push(commonCmds||"npm run dev    # development server\nnpm test       # run tests");
    lines.push("\n## Stack\n");
    lines.push(`Languages: ${langs.join(", ")||"—"}`);
    if (fws.length) lines.push(`Frameworks: ${fws.join(", ")}`);
    if (dbs.length) lines.push(`Databases: ${dbs.join(", ")}`);
    lines.push("\n## Rules\n");
    selectedRules.forEach(r => lines.push(`- ${r}`));
    lines.push(`\n## Tools (${skills.length} skills, ${agents.length} agents, ${mcps.length+customMcps.length} MCPs)`);
    return lines.join("\n");
  };

  const buildPreviewSettings = () => {
    const s = {
      model: model,
      permissions: { allow: [], deny: denyPatterns },
      settings: {}
    };
    if (defaultMode !== "default") s.permissions.defaultMode = defaultMode;
    if (webTools) s.permissions.allow.push("WebFetch","WebSearch");
    if (notebooks) s.permissions.allow.push("Notebooks");
    if (allowGhCli) s.permissions.allow.push("Bash(gh:*)");
    if (enableAllProjectMcpServers) s.settings.enableAllProjectMcpServers = true;
    if (sandbox) s.settings.sandbox = true;
    return JSON.stringify(s, null, 2);
  };

  // ── Config Export / Import (shareable) ────────────────────────────
  const exportConfig = () => {
    const cfg = {
      v: 4, name, desc, type, ide, model, os: os,
      langs, fws, dbs, infra, selectedRules, skills, agents,
      selectedContexts, mcps, customMcps,
      webTools, notebooks, memoryPersistence, generatePlugin,
      sandbox, statusLine, allowGhCli, enableAllProjectMcpServers,
      defaultMode, outputStyle, gitBranch, commitConv,
      directories, commonCmds, denyPatterns, customItems,
      exportTargets, projectDocs
    };
    const json = JSON.stringify(cfg);
    const blob = new Blob([json], { type:"application/json" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u;
    a.download = `veritas-lab-${(name||"project").toLowerCase().replace(/[^a-z0-9]+/g,"-")}.json`;
    a.click(); URL.revokeObjectURL(u);
  };

  const importConfig = (json) => {
    try {
      const c = JSON.parse(json);
      if (c.v !== 4) throw new Error("Unsupported version");
      if (c.name) setName(c.name); if (c.desc) setDesc(c.desc);
      if (c.type) setType(c.type); if (c.ide) setIde(c.ide);
      if (c.model) setModel(c.model); if (c.os) setOs(c.os);
      if (c.langs) setLangs(c.langs); if (c.fws) setFws(c.fws);
      if (c.dbs) setDbs(c.dbs); if (c.infra) setInfra(c.infra);
      if (c.selectedRules) setSelectedRules(c.selectedRules);
      if (c.skills) setSkills(c.skills); if (c.agents) setAgents(c.agents);
      if (c.selectedContexts) setSelectedContexts(c.selectedContexts);
      if (c.mcps) setMcps(c.mcps); if (c.customMcps) setCustomMcps(c.customMcps);
      if (c.webTools !== undefined) setWebTools(c.webTools);
      if (c.notebooks !== undefined) setNotebooks(c.notebooks);
      if (c.memoryPersistence !== undefined) setMemoryPersistence(c.memoryPersistence);
      if (c.generatePlugin !== undefined) setGeneratePlugin(c.generatePlugin);
      if (c.sandbox !== undefined) setSandbox(c.sandbox);
      if (c.statusLine !== undefined) setStatusLine(c.statusLine);
      if (c.allowGhCli !== undefined) setAllowGhCli(c.allowGhCli);
      if (c.enableAllProjectMcpServers !== undefined) setEnableAllProjectMcpServers(c.enableAllProjectMcpServers);
      if (c.defaultMode) setDefaultMode(c.defaultMode);
      if (c.outputStyle !== undefined) setOutputStyle(c.outputStyle);
      if (c.gitBranch) setGitBranch(c.gitBranch);
      if (c.commitConv) setCommitConv(c.commitConv);
      if (c.directories !== undefined) setDirectories(c.directories);
      if (c.commonCmds !== undefined) setCommonCmds(c.commonCmds);
      if (c.denyPatterns) setDenyPatterns(c.denyPatterns);
      if (c.customItems) setCustomItems(c.customItems);
      if (c.exportTargets) setExportTargets(c.exportTargets);
      if (c.projectDocs) setProjectDocs(c.projectDocs);
      setConfigImportOpen(false); setConfigImportText("");
      if (mode === "forward") setStep(1);
      return true;
    } catch(e) { return false; }
  };

  const getContent = f => edits[f] ?? files?.[f] ?? "";
  const copy = f => { try { navigator.clipboard.writeText(getContent(f)); } catch(e) {} setCopied(f); setTimeout(()=>setCopied(null),2000); };
  const copyAll = () => {
    const a = Object.entries(files).map(([n,c])=>`${"═".repeat(60)}\n📄 ${n}\n${"═".repeat(60)}\n\n${edits[n]||c}`).join("\n\n");
    try { navigator.clipboard.writeText(a); } catch(e) {} setCopied("__all__"); setTimeout(()=>setCopied(null),2000);
  };
  const exportSh = () => {
    const lines = ["#!/bin/bash",`# AI Coding Environment Setup: ${name||"project"}`,`# Generated by Veritas Lab V4 — ${mode} mode`,`# Targets: ${exportTargets.map(t=>EXPORT_TARGETS[t]?.name||t).join(", ")}`,"","set -e",""];
    Object.entries(files).forEach(([n,c])=>{
      const content = edits[n]||c;
      const clean = n.replace(/ \(ENHANCED\)| \(FULL\)/g,"");
      const p = clean.startsWith("~/")?clean.replace("~/","$HOME/"):clean;
      const d = p.substring(0,p.lastIndexOf("/"));
      if(d)lines.push(`mkdir -p "${d}"`);
      lines.push(`cat > "${p}" << 'ENDOFFILE'`);
      lines.push(content);
      lines.push("ENDOFFILE\n");
    });
    // Make scripts executable
    lines.push("# Make hook scripts executable");
    lines.push("chmod +x .claude/scripts/*.sh 2>/dev/null || true\n");
    lines.push(`echo ""`);
    lines.push(`echo "✅ AI coding environment configured: ${name||"project"}"`);
    lines.push(`echo "   📄 ${Object.keys(files).length} files generated"`);
    lines.push(`echo "   🎯 Targets: ${exportTargets.map(t=>EXPORT_TARGETS[t]?.name||t).join(", ")}"`);
    lines.push(`echo "   Run 'claude' to start."`);
    const blob = new Blob([lines.join("\n")],{type:"text/x-shellscript"});
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=u; a.download=`setup-${(name||"project").toLowerCase().replace(/[^a-z0-9]+/g,"-")}.sh`; a.click(); URL.revokeObjectURL(u);
  };

  const exportTargetSh = (targetId) => {
    const tgt = EXPORT_TARGETS[targetId];
    if (!tgt || !files) return;
    const prefix = targetId === "claude-code" ? [".claude/","CLAUDE.md",".mcp.json","~/.claude/"]
                 : targetId === "cursor" ? [".cursor/",".cursorrules"]
                 : targetId === "windsurf" ? [".windsurf/",".windsurfrules"]
                 : targetId === "copilot" ? [".github/"]
                 : targetId === "cline" ? [".clinerules"]
                 : targetId === "roo-code" ? [".roo/",".roomodes",".roorules"]
                 : targetId === "agents-md" ? ["AGENTS.md"]
                 : targetId === "aider" ? ["CONVENTIONS.md",".aider"]
                 : [];
    const tgtFiles = Object.entries(files).filter(([n]) => prefix.some(p => n.startsWith(p) || n === p));
    if (!tgtFiles.length) return;
    const lines = ["#!/bin/bash",`# ${tgt.name} Setup: ${name||"project"}`,`# Generated by Veritas Lab V4`,"","set -e",""];
    tgtFiles.forEach(([n,c]) => {
      const content = edits[n]||c;
      const clean = n.replace(/ \(ENHANCED\)| \(FULL\)/g,"");
      const p = clean.startsWith("~/")?clean.replace("~/","$HOME/"):clean;
      const d = p.substring(0,p.lastIndexOf("/"));
      if(d) lines.push(`mkdir -p "${d}"`);
      lines.push(`cat > "${p}" << 'ENDOFFILE'`);
      lines.push(content);
      lines.push("ENDOFFILE\n");
    });
    lines.push(`echo "✅ ${tgt.name} configured (${tgtFiles.length} files)"`);
    const blob = new Blob([lines.join("\n")],{type:"text/x-shellscript"});
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=u; a.download=`setup-${targetId}-${(name||"project").toLowerCase().replace(/[^a-z0-9]+/g,"-")}.sh`; a.click(); URL.revokeObjectURL(u);
  };

  const allLangs = Object.keys(STACKS);
  const allFw = ["React","Next.js","Vue","Nuxt","Angular","Svelte","SvelteKit","Express","Fastify","Hono","NestJS","Astro","Remix","Django","FastAPI","Flask","Rails","Laravel","Spring Boot",".NET Core","Actix Web","Axum","Gin","Echo"];
  const allDb = ["PostgreSQL","MySQL","MongoDB","SQLite","Redis","DynamoDB","Supabase","PlanetScale","Turso","Drizzle ORM","Prisma","TypeORM"];
  const allInfra = ["Docker","Kubernetes","Terraform","AWS","GCP","Azure","Vercel","Netlify","Cloudflare","Railway","Fly.io"];
  const allAgents = [...new Set(Object.values(PROJECT_AGENTS).flat())];
  const allSkills = ["lint-fix","refactor","review","test","deploy-check","fix-issue","doc-gen","security-review","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"];
  const allRules = Object.keys(RULES_CATALOG);
  const allContexts = Object.keys(CONTEXT_CATALOG);
  const allMcp = Object.keys(MCP_CATALOG);

  // ─────────────────────────────────────────────────────────────────────
  //  RECIPE / STARTER PACKS
  // ─────────────────────────────────────────────────────────────────────
  const RECIPES = [
    { id:"nextjs-saas", icon:"🚀", name:"Next.js SaaS", desc:"Full-stack SaaS with auth, DB, payments",
      config:{ type:"fullstack", langs:["TypeScript"], fws:["Next.js","React"], dbs:["PostgreSQL","Prisma"], infra:["Vercel","Docker"],
        rules:["security","coding-style","testing","git-workflow","agents","performance"],
        skills:["lint-fix","refactor","review","test","deploy-check","fix-issue","doc-gen","security-review","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"],
        agents:["architect","reviewer","debugger","refactor-agent","test-writer","doc-writer"],
        contexts:["dev","review","debug"], mcps:["filesystem","memory","context7","github","postgres","sentry"],
        features:{ webTools:true, memoryPersistence:true, sandbox:true, statusLine:true, allowGhCli:true, notebooks:false }
      }},
    { id:"python-ml", icon:"🧠", name:"Python ML Pipeline", desc:"ML/AI with notebooks, data, and experiments",
      config:{ type:"ai-ml", langs:["Python"], fws:["FastAPI"], dbs:["PostgreSQL","Redis"], infra:["Docker","AWS"],
        rules:["security","coding-style","testing","performance","documentation"],
        skills:["lint-fix","refactor","review","test","fix-issue","doc-gen","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"],
        agents:["architect","reviewer","debugger","test-writer","doc-writer","research"],
        contexts:["dev","review","debug"], mcps:["filesystem","memory","context7","puppeteer"],
        features:{ webTools:true, memoryPersistence:true, sandbox:true, statusLine:false, allowGhCli:true, notebooks:true }
      }},
    { id:"react-component", icon:"⚛️", name:"React Component Lib", desc:"Reusable UI library with Storybook and tests",
      config:{ type:"frontend", langs:["TypeScript"], fws:["React"], dbs:[], infra:["Vercel"],
        rules:["coding-style","testing","git-workflow","performance","documentation"],
        skills:["lint-fix","refactor","review","test","deploy-check","doc-gen","security-review","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"],
        agents:["architect","reviewer","refactor-agent","test-writer","doc-writer"],
        contexts:["dev","review"], mcps:["filesystem","memory","context7"],
        features:{ webTools:false, memoryPersistence:true, sandbox:false, statusLine:true, allowGhCli:true, notebooks:false }
      }},
    { id:"django-api", icon:"🐍", name:"Django REST API", desc:"Backend API with DRF, Celery, and PostgreSQL",
      config:{ type:"backend", langs:["Python"], fws:["Django"], dbs:["PostgreSQL","Redis"], infra:["Docker","AWS"],
        rules:["security","coding-style","testing","git-workflow","performance"],
        skills:["lint-fix","refactor","review","test","deploy-check","fix-issue","doc-gen","security-review","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"],
        agents:["architect","reviewer","debugger","test-writer","security-auditor"],
        contexts:["dev","review","debug"], mcps:["filesystem","memory","context7","postgres","docker"],
        features:{ webTools:true, memoryPersistence:true, sandbox:true, statusLine:false, allowGhCli:true, notebooks:false }
      }},
    { id:"monorepo-turbo", icon:"📦", name:"Turborepo Monorepo", desc:"Multi-package workspace with shared configs",
      config:{ type:"fullstack", langs:["TypeScript"], fws:["Next.js","React","Express"], dbs:["PostgreSQL","Redis","Prisma"], infra:["Docker","Vercel"],
        rules:["security","coding-style","testing","git-workflow","agents","performance","documentation"],
        skills:["lint-fix","refactor","review","test","deploy-check","fix-issue","doc-gen","security-review","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"],
        agents:["architect","reviewer","debugger","refactor-agent","test-writer","doc-writer"],
        contexts:["dev","review","debug"], mcps:["filesystem","memory","context7","github","docker"],
        features:{ webTools:true, memoryPersistence:true, sandbox:true, statusLine:true, allowGhCli:true, notebooks:false }
      }},
    { id:"rust-cli", icon:"🦀", name:"Rust CLI Tool", desc:"CLI application with async runtime and tests",
      config:{ type:"cli-tool", langs:["Rust"], fws:[], dbs:[], infra:[],
        rules:["security","coding-style","testing","git-workflow","performance"],
        skills:["lint-fix","refactor","review","test","deploy-check","fix-issue","doc-gen","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"],
        agents:["architect","reviewer","debugger","test-writer"],
        contexts:["dev","review","debug"], mcps:["filesystem","memory","context7"],
        features:{ webTools:false, memoryPersistence:true, sandbox:false, statusLine:false, allowGhCli:true, notebooks:false }
      }},
    { id:"go-microservice", icon:"🐹", name:"Go Microservice", desc:"gRPC/REST service with Docker and K8s",
      config:{ type:"backend", langs:["Go"], fws:["Gin"], dbs:["PostgreSQL","Redis"], infra:["Docker","Kubernetes"],
        rules:["security","coding-style","testing","git-workflow","performance"],
        skills:["lint-fix","refactor","review","test","deploy-check","fix-issue","doc-gen","security-review","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"],
        agents:["architect","reviewer","debugger","test-writer","security-auditor"],
        contexts:["dev","review","debug"], mcps:["filesystem","memory","context7","docker"],
        features:{ webTools:false, memoryPersistence:true, sandbox:true, statusLine:false, allowGhCli:true, notebooks:false }
      }},
    { id:"laravel-app", icon:"🔴", name:"Laravel Full-Stack", desc:"PHP app with Blade, Livewire, and MySQL",
      config:{ type:"fullstack", langs:["PHP"], fws:["Laravel"], dbs:["MySQL","Redis"], infra:["Docker"],
        rules:["security","coding-style","testing","git-workflow","performance"],
        skills:["lint-fix","refactor","review","test","deploy-check","fix-issue","doc-gen","security-review","plan","search-codebase","continuous-learning","aha-review","backport","self-learning"],
        agents:["architect","reviewer","debugger","test-writer","doc-writer"],
        contexts:["dev","review","debug"], mcps:["filesystem","memory","context7"],
        features:{ webTools:true, memoryPersistence:true, sandbox:false, statusLine:false, allowGhCli:true, notebooks:false }
      }},
  ];

  const applyRecipe = (recipe) => {
    const c = recipe.config;
    setType(c.type); setLangs(c.langs); setFws(c.fws); setDbs(c.dbs); setInfra(c.infra);
    setSelectedRules(c.rules); setSkills(c.skills); setAgents(c.agents); setSelectedContexts(c.contexts); setMcps(c.mcps);
    setWebTools(c.features.webTools); setMemoryPersistence(c.features.memoryPersistence);
    setSandbox(c.features.sandbox); setStatusLine(c.features.statusLine);
    setAllowGhCli(c.features.allowGhCli); setNotebooks(c.features.notebooks);
    setStep(1);
  };

  const hookCount = langs.reduce((n,l)=>n+(STACKS[l]?.hooks?.length||0),0) + fws.reduce((n,f)=>n+(FW_HOOKS[f]?.length||0),0) + (memoryPersistence?3:0);

  // ─────────────────────────────────────────────────────────────────────
  //  MODE SELECTION SCREEN
  // ─────────────────────────────────────────────────────────────────────
  const renderModeSelect = () => (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:32 }}>
      <div style={{ textAlign:"center" }}>
        <svg width="140" height="140" viewBox="0 0 140 140" fill="none" style={{ display:"block",margin:"0 auto 16px" }}>
          <defs>
            <linearGradient id="sealGrad" x1="20" y1="20" x2="120" y2="120"><stop offset="0%" stopColor="#f97316"/><stop offset="100%" stopColor="#c2410c"/></linearGradient>
          </defs>
          {/* Outer ring */}
          <circle cx="70" cy="70" r="60" stroke="url(#sealGrad)" strokeWidth="2" fill="none"/>
          {/* Inner ring */}
          <circle cx="70" cy="70" r="52" stroke="#f97316" strokeWidth="0.5" fill="none" opacity=".4"/>
          {/* Top arc text: VERITAS */}
          <path id="topArc" d="M25,70 a45,45 0 0,1 90,0" fill="none"/>
          <text fill="#f97316" fontFamily="system-ui,sans-serif" fontSize="10" fontWeight="700" letterSpacing="5">
            <textPath href="#topArc" startOffset="50%" textAnchor="middle">VERITAS</textPath>
          </text>
          {/* Bottom arc text: LAB */}
          <path id="botArc" d="M25,70 a45,45 0 0,0 90,0" fill="none"/>
          <text fill="#f97316" fontFamily="system-ui,sans-serif" fontSize="10" fontWeight="700" letterSpacing="5">
            <textPath href="#botArc" startOffset="50%" textAnchor="middle">LAB</textPath>
          </text>
          {/* Separator dots */}
          <circle cx="24" cy="70" r="2" fill="#f97316" opacity=".7"/>
          <circle cx="116" cy="70" r="2" fill="#f97316" opacity=".7"/>
          {/* Central flask */}
          <path d="M62 45 L62 60 L52 80 Q49 86 54 90 L86 90 Q91 86 88 80 L78 60 L78 45" stroke="#f97316" strokeWidth="2" fill="none" strokeLinejoin="round"/>
          <line x1="58" y1="45" x2="82" y2="45" stroke="#f97316" strokeWidth="2" strokeLinecap="round"/>
          {/* Terminal prompt inside flask */}
          <path d="M60 74 L65 78 L60 82" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <line x1="68" y1="82" x2="76" y2="82" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round"/>
          {/* Crosshair ticks */}
          <line x1="70" y1="12" x2="70" y2="18" stroke="#f97316" strokeWidth="1" opacity=".3" strokeLinecap="round"/>
          <line x1="70" y1="122" x2="70" y2="128" stroke="#f97316" strokeWidth="1" opacity=".3" strokeLinecap="round"/>
          <line x1="12" y1="70" x2="18" y2="70" stroke="#f97316" strokeWidth="1" opacity=".3" strokeLinecap="round"/>
          <line x1="122" y1="70" x2="128" y2="70" stroke="#f97316" strokeWidth="1" opacity=".3" strokeLinecap="round"/>
        </svg>
        <h1 style={{ color:T.text,fontSize:26,fontWeight:700,fontFamily:"'DM Sans',sans-serif",marginBottom:6 }}>Veritas Lab</h1>
        <p style={{ color:T.dim,fontSize:12,fontFamily:"'JetBrains Mono',monospace",maxWidth:540 }}>Universal AI coding environment generator — configure once, export to Claude Code, Cursor, Windsurf, Copilot, Cline, Roo Code, AGENTS.md, and Aider.</p>
        <div style={{ display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap",marginTop:16 }}>
          {["8 Export Targets","10 LLM Providers","CI/CD Workflow","Linter Configs","Makefile","Project Docs","18 Tools","12 Hook Events","Rules Directory","SKILL.md Format","Agent Frontmatter","Dynamic Contexts","Memory Persistence","Plugin System","MCP Servers","25+ Settings","Custom Tools","Global Config",".editorconfig","VS Code Config"].map(f=>(
            <span key={f} style={{ padding:"3px 9px",borderRadius:12,border:`1px solid ${T.border}`,color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>{f}</span>
          ))}
        </div>
      </div>
      <div style={{ display:"flex",gap:16 }}>
        <button onClick={()=>{setMode("forward");setStep(0);}} style={{ width:280,padding:"24px 20px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card,cursor:"pointer",textAlign:"left",transition:"border-color .2s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
          <div style={{ fontSize:28,marginBottom:8 }}>🚀</div>
          <div style={{ color:T.accent,fontSize:14,fontWeight:700,fontFamily:"'DM Sans',sans-serif",marginBottom:4 }}>Forward — New Project</div>
          <div style={{ color:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.5 }}>Describe your project and auto-generate AI coding configs for every tool you use.</div>
        </button>
        <button onClick={()=>{setMode("reverse");setStep(0);}} style={{ width:280,padding:"24px 20px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card,cursor:"pointer",textAlign:"left",transition:"border-color .2s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=T.blue} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
          <div style={{ fontSize:28,marginBottom:8 }}>🔍</div>
          <div style={{ color:T.blue,fontSize:14,fontWeight:700,fontFamily:"'DM Sans',sans-serif",marginBottom:4 }}>Reverse — Retrofit Repo</div>
          <div style={{ color:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.5 }}>Connect via GitHub URL, upload your local project folder, or paste repo content for gap analysis.</div>
        </button>
      </div>
      {/* API Key (optional) */}
      {/* LLM Provider + API Key */}
      <div style={{ maxWidth:576,width:"100%",padding:"16px 20px",borderRadius:10,border:`1px solid ${apiKey||apiProvider==="ollama"?T.green+"55":T.border}`,background:apiKey||apiProvider==="ollama"?"rgba(74,222,128,.04)":T.card }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <span style={{ fontSize:14 }}>{apiKey||apiProvider==="ollama"?"🟢":"🔑"}</span>
            <span style={{ color:apiKey||apiProvider==="ollama"?T.green:T.dim,fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace" }}>
              {apiKey||apiProvider==="ollama"?`AI Enhanced — ${LLM_PROVIDERS[apiProvider]?.name||apiProvider}`:"LLM API Key (optional)"}
            </span>
          </div>
          {(apiKey||apiProvider==="ollama") ? (
            <button onClick={()=>{setApiKey("");setApiKeyVisible(false);setApiModelOverride("");setApiCustomEndpoint("");}} style={{ padding:"3px 10px",borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>Clear</button>
          ) : (
            <span style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>Stored in your browser only</span>
          )}
        </div>
        {/* Provider selector */}
        <div style={{ display:"flex",flexWrap:"wrap",gap:4,marginBottom:10 }}>
          {Object.values(LLM_PROVIDERS).map(p => {
            const on = apiProvider === p.id;
            return <button key={p.id} onClick={()=>{setApiProvider(p.id);setApiModelOverride("");}} style={{ padding:"4px 10px",borderRadius:6,border:`1px solid ${on?p.color+"66":T.border}`,background:on?p.color+"12":"transparent",color:on?p.color:T.muted,fontSize:9,fontWeight:on?600:400,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",transition:"all .15s" }}>{p.icon} {p.name}</button>;
          })}
        </div>
        {!(apiKey && apiProvider !== "ollama") && apiProvider !== "ollama" && (
          <div>
            <div style={{ color:T.muted,fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:8,lineHeight:1.6 }}>
              Without a key: template-based generation (pre-written rules, skills, hooks).<br/>
              With a key: AI analyzes your project and writes tailored configs and instructions.
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <input type={apiKeyVisible?"text":"password"} value={apiKey} onChange={e=>setApiKey(e.target.value.trim())} placeholder={LLM_PROVIDERS[apiProvider]?.placeholder||"API key"} style={{ flex:1,padding:"8px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.3)",color:T.text,fontSize:11,fontFamily:"'JetBrains Mono',monospace",outline:"none" }}/>
              <button onClick={()=>setApiKeyVisible(!apiKeyVisible)} style={{ padding:"8px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",whiteSpace:"nowrap" }}>{apiKeyVisible?"Hide":"Show"}</button>
            </div>
          </div>
        )}
        {/* Custom endpoint for custom provider */}
        {apiProvider === "custom" && (
          <div style={{ marginTop:8 }}>
            <input value={apiCustomEndpoint} onChange={e=>setApiCustomEndpoint(e.target.value.trim())} placeholder="https://your-api.com/v1/chat/completions" style={{ width:"100%",padding:"8px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.3)",color:T.text,fontSize:11,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box" }}/>
          </div>
        )}
        {/* Model selector */}
        {(apiKey || apiProvider === "ollama") && (
          <div style={{ marginTop:8,display:"flex",alignItems:"center",gap:8 }}>
            <span style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap" }}>Model:</span>
            {LLM_PROVIDERS[apiProvider]?.models?.length ? (
              <select value={apiModelOverride||LLM_PROVIDERS[apiProvider]?.defaultModel||""} onChange={e=>setApiModelOverride(e.target.value)} style={{ flex:1,padding:"5px 8px",borderRadius:5,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.3)",color:T.text,fontSize:10,fontFamily:"'JetBrains Mono',monospace",outline:"none" }}>
                {LLM_PROVIDERS[apiProvider].models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input value={apiModelOverride} onChange={e=>setApiModelOverride(e.target.value)} placeholder="model-name" style={{ flex:1,padding:"5px 8px",borderRadius:5,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.3)",color:T.text,fontSize:10,fontFamily:"'JetBrains Mono',monospace",outline:"none" }}/>
            )}
          </div>
        )}
        {/* Provider note */}
        <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",marginTop:6 }}>
          {LLM_PROVIDERS[apiProvider]?.note || "Configure your LLM provider"}
          {apiProvider === "ollama" && " • No API key required"}
        </div>
      </div>
      {/* Export Targets */}
      <div style={{ maxWidth:576,width:"100%",padding:"16px 20px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
          <span style={{ fontSize:14 }}>🎯</span>
          <span style={{ color:T.text,fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace" }}>Export Targets</span>
          <span style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>— generate configs for multiple tools at once</span>
          <span style={{ flex:1 }}/>
          <button onClick={()=>setExportTargets(Object.keys(EXPORT_TARGETS))} style={{ padding:"2px 8px",borderRadius:4,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>All</button>
          <button onClick={()=>setExportTargets(["claude-code"])} style={{ padding:"2px 8px",borderRadius:4,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>Reset</button>
        </div>
        {/* Recommended combos */}
        <div style={{ display:"flex",flexWrap:"wrap",gap:4,marginBottom:8 }}>
          {[
            { label:"VS Code Stack", targets:["claude-code","copilot","cursor"], color:"#22c55e" },
            { label:"Open Source", targets:["claude-code","agents-md","copilot"], color:"#3b82f6" },
            { label:"Full Coverage", targets:Object.keys(EXPORT_TARGETS), color:"#f97316" },
            { label:"Terminal First", targets:["claude-code","aider","agents-md"], color:"#a855f7" },
          ].map(c => {
            const active = c.targets.every(t => exportTargets.includes(t)) && exportTargets.length === c.targets.length;
            return <button key={c.label} onClick={()=>setExportTargets(c.targets)} style={{ padding:"3px 10px",borderRadius:12,border:`1px solid ${active?c.color+"66":T.border}`,background:active?c.color+"12":"transparent",color:active?c.color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",transition:"all .15s" }}>{c.label}</button>;
          })}
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
          {Object.values(EXPORT_TARGETS).map(t => {
            const on = exportTargets.includes(t.id);
            return <button key={t.id} onClick={()=>{
              if (on && exportTargets.length === 1) return; // keep at least one target
              setExportTargets(prev => on ? prev.filter(x=>x!==t.id) : [...prev, t.id]);
            }} title={t.desc} style={{ padding:"5px 12px",borderRadius:8,border:`1.5px solid ${on?t.color+"88":T.border}`,background:on?t.color+"12":"transparent",color:on?t.color:T.dim,fontSize:10,fontWeight:on?600:400,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all .15s" }}>{t.icon} {t.name}{on?" ✓":""}</button>;
          })}
        </div>
        {exportTargets.length > 1 && (
          <div style={{ color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",marginTop:8 }}>
            {exportTargets.length} targets selected — same wizard, {exportTargets.length}× the output files{projectDocs.length ? ` • ${projectDocs.length} project docs` : ""} • .editorconfig included for all targets
          </div>
        )}
        {exportTargets.length > 1 && (
          <div style={{ marginTop:10,borderTop:`1px solid ${T.border}`,paddingTop:10 }}>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:6 }}>
              {exportTargets.map(tid => {
                const tgt = EXPORT_TARGETS[tid];
                if (!tgt) return null;
                return (
                  <div key={tid} style={{ padding:"8px 10px",borderRadius:6,border:`1px solid ${tgt.color}22`,background:`${tgt.color}06`,display:"flex",alignItems:"flex-start",gap:8 }}>
                    <span style={{ fontSize:16,flexShrink:0 }}>{tgt.icon}</span>
                    <div>
                      <div style={{ color:tgt.color,fontSize:10,fontWeight:600,fontFamily:"'JetBrains Mono',monospace" }}>{tgt.name}</div>
                      <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.5,marginTop:2 }}>{tgt.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Compare targets toggle */}
        <div style={{ marginTop:8,textAlign:"center" }}>
          <button onClick={()=>setShowTargetCompare(!showTargetCompare)} style={{ padding:"4px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>{showTargetCompare?"▼ Hide":"▶ Compare"} Target Features</button>
        </div>
        {showTargetCompare && (
          <div style={{ marginTop:10,overflowX:"auto",borderTop:`1px solid ${T.border}`,paddingTop:10 }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>
              <thead>
                <tr>
                  <th style={{ textAlign:"left",padding:"4px 6px",color:T.dim,borderBottom:`1px solid ${T.border}` }}>Feature</th>
                  {Object.values(EXPORT_TARGETS).map(t => (
                    <th key={t.id} style={{ textAlign:"center",padding:"4px 3px",color:t.color,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap" }}>{t.icon}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { feat:"Main config file", vals:["✅","✅","✅","✅","✅","✅","✅","✅"] },
                  { feat:"Rules directory", vals:["✅","✅","✅","✅","✅","✅","—","—"] },
                  { feat:"Scoped rules (globs)", vals:["—","✅","—","✅","—","✅","—","—"] },
                  { feat:"Agent profiles", vals:["✅","—","—","✅","—","✅","✅","—"] },
                  { feat:"MCP servers", vals:["✅","—","—","—","—","—","—","—"] },
                  { feat:"Permissions/settings", vals:["✅","—","—","—","—","—","—","—"] },
                  { feat:"Hook scripts", vals:["✅","—","—","—","—","—","—","—"] },
                  { feat:"Skills/tools", vals:["✅","—","—","—","—","—","—","—"] },
                  { feat:"Memory system", vals:["✅","—","—","—","—","—","—","—"] },
                  { feat:"Lint config", vals:["—","—","—","—","—","—","—","✅"] },
                  { feat:"Mode-specific rules", vals:["—","—","—","—","—","✅","—","—"] },
                ].map(row => (
                  <tr key={row.feat}>
                    <td style={{ padding:"3px 6px",color:T.dim,borderBottom:`1px solid ${T.border}20` }}>{row.feat}</td>
                    {row.vals.map((v,i) => (
                      <td key={i} style={{ textAlign:"center",padding:"3px",borderBottom:`1px solid ${T.border}20`,color:v==="✅"?T.green:T.muted }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  //  REVERSE MODE — STEP 0: INPUT
  // ─────────────────────────────────────────────────────────────────────
  const renderReverseInput = () => {
    const inputModes = [
      { id:"github", icon:"🔗", label:"GitHub URL", desc:"Fetch public repo tree + configs automatically" },
      { id:"upload", icon:"📂", label:"Local Folder", desc:"Select your project folder from your computer" },
      { id:"paste",  icon:"📋", label:"Paste",       desc:"Paste file tree, configs, or describe your setup" },
    ];
    return (
    <div>
      <div style={{ textAlign:"center",marginBottom:24 }}>
        <div style={{ fontSize:40,marginBottom:8 }}>🔍</div>
        <h2 style={{ color:T.text,fontSize:20,fontWeight:700,fontFamily:"'DM Sans',sans-serif",marginBottom:4 }}>Analyze Existing Repo</h2>
        <p style={{ color:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>Connect your repo via GitHub URL, upload from your PC, or paste content manually</p>
      </div>

      {/* Project info */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
        <div><Lbl>Project Name</Lbl><Inp value={name} set={setName} placeholder="e.g. my-saas-app"/></div>
        <div><Lbl>Project Description</Lbl><Inp value={desc} set={setDesc} placeholder="Brief description of your project"/></div>
      </div>

      {/* Input mode tabs */}
      <div style={{ display:"flex",gap:0,marginBottom:0 }}>
        {inputModes.map(m => (
          <button key={m.id} onClick={()=>setReverseInputMode(m.id)} style={{
            flex:1,padding:"10px 12px",border:`1px solid ${T.border}`,borderBottom:reverseInputMode===m.id?"none":`1px solid ${T.border}`,
            background:reverseInputMode===m.id?T.card:"transparent",
            borderRadius:reverseInputMode===m.id?"8px 8px 0 0":"8px 8px 0 0",
            color:reverseInputMode===m.id?T.blue:T.dim,fontSize:11,fontWeight:reverseInputMode===m.id?700:400,
            fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",
            borderBottomColor:reverseInputMode===m.id?T.card:T.border,
            marginBottom:reverseInputMode===m.id?-1:0,zIndex:reverseInputMode===m.id?1:0,position:"relative"
          }}>{m.icon} {m.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ border:`1px solid ${T.border}`,borderRadius:"0 0 10px 10px",padding:16,background:T.card,marginBottom:14 }}>
        <div style={{ color:T.muted,fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:12 }}>
          {inputModes.find(m=>m.id===reverseInputMode)?.desc}
        </div>

        {/* ─── GitHub URL Tab ─── */}
        {reverseInputMode === "github" && (
          <div>
            <div style={{ display:"flex",gap:8,marginBottom:8 }}>
              <input value={ghUrl} onChange={e=>setGhUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!ghLoading&&fetchGitHubRepo()}
                placeholder="https://github.com/owner/repo"
                style={{ flex:1,padding:"10px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.3)",color:T.text,fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box" }}/>
              <input value={ghBranch} onChange={e=>setGhBranch(e.target.value)}
                placeholder="Branch"
                style={{ width:100,padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:"rgba(0,0,0,.3)",color:T.text,fontSize:11,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box" }}/>
            </div>
            <button onClick={fetchGitHubRepo} disabled={!ghUrl.trim()||ghLoading} style={{
              width:"100%",padding:"11px",borderRadius:8,border:"none",
              background:ghUrl.trim()&&!ghLoading?`linear-gradient(135deg,${T.blue},#1d4ed8)`:T.muted,
              color:ghUrl.trim()&&!ghLoading?"#fff":T.border,fontSize:12,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",
              cursor:ghUrl.trim()&&!ghLoading?"pointer":"default",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8
            }}>
              {ghLoading ? (
                <><span style={{ display:"inline-block",width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 1s linear infinite" }}/>Fetching repository...</>
              ) : "🔗 Fetch & Analyze Repository"}
            </button>
            {ghError && (
              <div style={{ marginTop:8,padding:10,background:"rgba(239,68,68,.08)",borderRadius:6,border:"1px solid rgba(239,68,68,.2)",color:"#ef4444",fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>
                ⚠️ {ghError}
              </div>
            )}
            <div style={{ marginTop:10,padding:10,background:"rgba(0,0,0,.15)",borderRadius:6 }}>
              <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.6 }}>
                <div>✓ Works with public repos — fetches full file tree + key config files</div>
                <div>✓ Auto-reads: CLAUDE.md, settings.json, .mcp.json, package.json, Cargo.toml, etc.</div>
                <div>✓ Auto-detects stack, frameworks, databases, and existing Claude Code setup</div>
                <div>✓ Branch defaults to HEAD (main/master) — specify a branch name to override</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Local Folder Upload Tab ─── */}
        {reverseInputMode === "upload" && (
          <div>
            <div style={{ position:"relative",border:`2px dashed ${T.border}`,borderRadius:10,padding:"32px 20px",textAlign:"center",cursor:"pointer",transition:"border-color .2s" }}
              onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=T.blue;}}
              onDragLeave={e=>{e.currentTarget.style.borderColor=T.border;}}
              onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=T.border;handleFileUpload(e.dataTransfer.files);}}>
              <input type="file" webkitdirectory="" directory="" multiple
                onChange={e=>handleFileUpload(e.target.files)}
                style={{ position:"absolute",inset:0,opacity:0,cursor:"pointer" }}/>
              {uploadLoading ? (
                <div>
                  <div style={{ fontSize:32,marginBottom:8 }}>⏳</div>
                  <div style={{ color:T.blue,fontSize:13,fontWeight:700,fontFamily:"'JetBrains Mono',monospace" }}>Reading {uploadFileCount} files...</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize:32,marginBottom:8 }}>📂</div>
                  <div style={{ color:T.text,fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",marginBottom:4 }}>Select Project Folder</div>
                  <div style={{ color:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>Click to browse or drag & drop your project folder</div>
                </div>
              )}
            </div>
            <div style={{ marginTop:10,padding:10,background:"rgba(0,0,0,.15)",borderRadius:6 }}>
              <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.6 }}>
                <div>✓ Select your project root folder — all files are read locally in your browser</div>
                <div>✓ Nothing is uploaded to any server — analysis happens entirely client-side</div>
                <div>✓ Auto-reads: .claude/, CLAUDE.md, .mcp.json, package.json, and other configs</div>
                <div>✓ Large files (100KB+) and node_modules are automatically skipped</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Paste Tab ─── */}
        {reverseInputMode === "paste" && (
          <div>
            <Inp value={repoInput} set={setRepoInput} placeholder={`Paste any combination of:\n\n• File tree output (find .claude -type f, tree .claude/, ls -la)\n• Contents of CLAUDE.md\n• Contents of .claude/settings.json\n• Contents of .mcp.json\n• Description of your current setup\n\nExample:\n.claude/\n  settings.json\n  rules/\n    security.md\n    coding-style.md\n  skills/\n    lint-fix/SKILL.md\nCLAUDE.md\n.mcp.json\npackage.json (Next.js, TypeScript, Prisma, PostgreSQL)`} rows={14}/>
            <button onClick={runAnalysis} disabled={!repoInput.trim()} style={{ marginTop:8,width:"100%",padding:"11px",borderRadius:8,border:"none",background:repoInput.trim()?`linear-gradient(135deg,${T.blue},#1d4ed8)`:T.muted,color:repoInput.trim()?"#fff":T.border,fontSize:12,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:repoInput.trim()?"pointer":"default" }}>🔍 Analyze & Find Gaps</button>
          </div>
        )}
      </div>
    </div>
  );};

  // ─────────────────────────────────────────────────────────────────────
  //  REVERSE MODE — STEP 1: GAP REPORT
  // ─────────────────────────────────────────────────────────────────────
  const renderGapReport = () => {
    if (!gapReport || !analysis) return null;
    const { gaps, scores } = gapReport;
    const sevOrder = { critical:0, high:1, medium:2, low:3 };
    const sorted = [...gaps].sort((a,b) => sevOrder[a.sev] - sevOrder[b.sev]);
    const sevColors = { critical:T.red, high:"#f97316", medium:T.yellow, low:T.dim };
    const sevLabels = { critical:"CRITICAL", high:"HIGH", medium:"MEDIUM", low:"LOW" };

    return (
      <div>
        <div style={{ textAlign:"center",marginBottom:20 }}>
          <h2 style={{ color:T.text,fontSize:20,fontWeight:700,fontFamily:"'DM Sans',sans-serif",marginBottom:4 }}>Gap Analysis Report</h2>
          <p style={{ color:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>
            Current coverage: <span style={{ color:scores.overall>=70?T.green:scores.overall>=40?T.yellow:T.red,fontWeight:700 }}>{scores.overall}%</span> — {gaps.length} gaps found
          </p>
        </div>

        {/* Score bars */}
        <div style={{ background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:16,marginBottom:16 }}>
          <div style={{ color:T.text,fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",marginBottom:10 }}>Coverage by Category</div>
          <ScoreBar label="File Structure" score={scores.files}/>
          <ScoreBar label="Hook Events" score={scores.hooks}/>
          <ScoreBar label="Permissions" score={scores.permissions}/>
          <ScoreBar label="Rules" score={scores.rules}/>
          <ScoreBar label="MCP Servers" score={scores.mcp}/>
          <ScoreBar label="Sandbox" score={scores.sandbox}/>
        </div>

        {/* Gap list */}
        <div style={{ background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:16,marginBottom:16 }}>
          <div style={{ color:T.text,fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",marginBottom:10 }}>{gaps.length} Gaps Identified</div>
          {sorted.map((g,i) => (
            <div key={i} style={{ display:"flex",gap:10,padding:"8px 0",borderBottom:i<sorted.length-1?`1px solid ${T.border}`:"none" }}>
              <Badge text={sevLabels[g.sev]} color={sevColors[g.sev]}/>
              <div style={{ flex:1 }}>
                <div style={{ color:T.text,fontSize:11,fontFamily:"'JetBrains Mono',monospace",fontWeight:600 }}>{g.item}</div>
                <div style={{ color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginTop:2 }}>{g.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* What exists */}
        {analysis && (
          <div style={{ background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:16,marginBottom:16 }}>
            <div style={{ color:T.green,fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",marginBottom:10 }}>✅ Detected in Repo</div>
            <div style={{ fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:T.dim,lineHeight:1.8 }}>
              {analysis.files.claudeMd && <div>📝 CLAUDE.md</div>}
              {analysis.files.settingsJson && <div>⚙️ .claude/settings.json</div>}
              {analysis.files.mcpJson && <div>🔌 .mcp.json</div>}
              {analysis.files.rules.length > 0 && <div>📏 Rules: {analysis.files.rules.join(", ")}</div>}
              {analysis.files.skills.length > 0 && <div>🛠️ Skills (new): {analysis.files.skills.join(", ")}</div>}
              {analysis.files.commands.length > 0 && <div>⌨️ Commands (legacy): {analysis.files.commands.join(", ")}</div>}
              {analysis.files.agents.length > 0 && <div>🤖 Agents: {analysis.files.agents.join(", ")}</div>}
              {analysis.files.contexts.length > 0 && <div>🎯 Contexts: {analysis.files.contexts.join(", ")}</div>}
              {analysis.features.hooks.events.size > 0 && <div>🪝 Hooks: {[...analysis.features.hooks.events].join(", ")}</div>}
              {analysis.features.mcp.servers.length > 0 && <div>🔌 MCP: {analysis.features.mcp.servers.join(", ")}</div>}
              {analysis.stack.languages.size > 0 && <div>💻 Stack: {[...analysis.stack.languages].join(", ")}</div>}
            </div>
          </div>
        )}

        {/* ── Side-by-Side Diff View ─────────────────────────────── */}
        {analysis && (
          <div style={{ background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:16,marginBottom:16 }}>
            <div style={{ color:T.blue,fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",marginBottom:12 }}>🔀 Current vs. Recommended</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,borderRadius:8,overflow:"hidden",border:`1px solid ${T.border}` }}>
              {/* Left: Current */}
              <div style={{ borderRight:`1px solid ${T.border}` }}>
                <div style={{ padding:"6px 10px",background:"rgba(239,68,68,.1)",borderBottom:`1px solid ${T.border}`,fontSize:9,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:T.red,textTransform:"uppercase" }}>Current State</div>
                <div style={{ padding:10,fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:T.dim,lineHeight:2 }}>
                  {[
                    { label:"CLAUDE.md", have:analysis.files.claudeMd },
                    { label:"settings.json", have:analysis.files.settingsJson },
                    { label:".mcp.json", have:analysis.files.mcpJson },
                  ].map(({label,have})=>(
                    <div key={label} style={{ color:have?T.green:T.red }}>
                      {have?"✅":"❌"} {label}
                    </div>
                  ))}
                  <div style={{ color:analysis.files.rules.length>0?T.green:T.red }}>
                    {analysis.files.rules.length>0?`✅ ${analysis.files.rules.length} rules`:"❌ No rules"}
                  </div>
                  <div style={{ color:analysis.files.skills.length>0?T.green:T.red }}>
                    {analysis.files.skills.length>0?`✅ ${analysis.files.skills.length} skills`:"❌ No skills"}
                  </div>
                  <div style={{ color:analysis.files.agents.length>0?T.green:T.red }}>
                    {analysis.files.agents.length>0?`✅ ${analysis.files.agents.length} agents`:"❌ No agents"}
                  </div>
                  <div style={{ color:analysis.files.contexts.length>0?T.green:T.red }}>
                    {analysis.files.contexts.length>0?`✅ ${analysis.files.contexts.length} contexts`:"❌ No contexts"}
                  </div>
                  <div style={{ color:analysis.features.hooks.events.size>0?T.green:T.red }}>
                    {analysis.features.hooks.events.size>0?`✅ ${analysis.features.hooks.events.size} hooks`:"❌ No hooks"}
                  </div>
                  <div style={{ color:analysis.features.mcp.servers.length>0?T.green:T.red }}>
                    {analysis.features.mcp.servers.length>0?`✅ ${analysis.features.mcp.servers.length} MCPs`:"❌ No MCPs"}
                  </div>
                  <div style={{ color:analysis.features.permissions.hasDeny?T.green:T.red }}>
                    {analysis.features.permissions.hasDeny?"✅ Deny patterns":"❌ No deny patterns"}
                  </div>
                </div>
              </div>
              {/* Right: Recommended */}
              <div>
                <div style={{ padding:"6px 10px",background:"rgba(34,197,94,.1)",borderBottom:`1px solid ${T.border}`,fontSize:9,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:T.green,textTransform:"uppercase" }}>Recommended</div>
                <div style={{ padding:10,fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:T.dim,lineHeight:2 }}>
                  <div style={{ color:T.green }}>✅ CLAUDE.md{!analysis.files.claudeMd&&<span style={{ color:"#4ade80",fontWeight:700 }}> ← NEW</span>}</div>
                  <div style={{ color:T.green }}>✅ settings.json{!analysis.files.settingsJson&&<span style={{ color:"#4ade80",fontWeight:700 }}> ← NEW</span>}</div>
                  <div style={{ color:T.green }}>✅ .mcp.json{!analysis.files.mcpJson&&<span style={{ color:"#4ade80",fontWeight:700 }}> ← NEW</span>}</div>
                  <div style={{ color:T.green }}>✅ {selectedRules.length} rules
                    {selectedRules.length>analysis.files.rules.length&&<span style={{ color:"#4ade80",fontWeight:700 }}> +{selectedRules.length-analysis.files.rules.length}</span>}
                  </div>
                  <div style={{ color:T.green }}>✅ {skills.length} skills
                    {skills.length>analysis.files.skills.length&&<span style={{ color:"#4ade80",fontWeight:700 }}> +{skills.length-analysis.files.skills.length}</span>}
                  </div>
                  <div style={{ color:T.green }}>✅ {agents.length} agents
                    {agents.length>analysis.files.agents.length&&<span style={{ color:"#4ade80",fontWeight:700 }}> +{agents.length-analysis.files.agents.length}</span>}
                  </div>
                  <div style={{ color:T.green }}>✅ {selectedContexts.length} contexts
                    {selectedContexts.length>analysis.files.contexts.length&&<span style={{ color:"#4ade80",fontWeight:700 }}> +{selectedContexts.length-analysis.files.contexts.length}</span>}
                  </div>
                  <div style={{ color:T.green }}>✅ 12 hook events<span style={{ color:"#4ade80",fontWeight:700 }}> ← FULL</span></div>
                  <div style={{ color:T.green }}>✅ {mcps.length} MCPs
                    {mcps.length>analysis.features.mcp.servers.length&&<span style={{ color:"#4ade80",fontWeight:700 }}> +{mcps.length-analysis.features.mcp.servers.length}</span>}
                  </div>
                  <div style={{ color:T.green }}>✅ Deny patterns configured</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Configure what to generate */}
        <div style={{ background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:16,marginBottom:16 }}>
          <div style={{ color:T.accent,fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",marginBottom:10 }}>Configure Retrofit</div>
          <div style={{ marginBottom:10 }}>
            <Lbl>Project Type</Lbl>
            <Sel value={type} set={v=>{setType(v);setAgents(PROJECT_AGENTS[v]||PROJECT_AGENTS.fullstack);}} opts={Object.keys(PROJECT_AGENTS).map(v=>({v,l:v}))}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10 }}>
            <div><Lbl>IDE</Lbl><Sel value={ide} set={setIde} opts={[{v:"vscode",l:"VS Code"},{v:"cursor",l:"Cursor"},{v:"neovim",l:"Neovim"},{v:"terminal",l:"Terminal"}]}/></div>
            <div><Lbl>Model</Lbl><Sel value={model} set={setModel} opts={[{v:"claude-opus-4-6",l:"Opus 4.6"},{v:"claude-sonnet-4-5-20250929",l:"Sonnet 4.5"},{v:"claude-haiku-4-5-20251001",l:"Haiku 4.5"}]}/></div>
          </div>

          {[
            { label:"Languages",items:allLangs,sel:langs,fn:i=>toggle(langs,setLangs,i) },
            { label:"Rules to Generate",items:allRules,sel:selectedRules,fn:i=>toggle(selectedRules,setSelectedRules,i) },
            { label:"Skills to Generate",items:allSkills,sel:skills,fn:i=>toggle(skills,setSkills,i),format:id=>"/"+id },
            { label:"Agents to Generate",items:allAgents,sel:agents,fn:i=>toggle(agents,setAgents,i),format:id=>id.replace(/-/g," ") },
            { label:"Contexts to Generate",items:allContexts,sel:selectedContexts,fn:i=>toggle(selectedContexts,setSelectedContexts,i) },
            { label:"MCP Servers",items:allMcp,sel:mcps,fn:i=>toggle(mcps,setMcps,i),format:id=>MCP_CATALOG[id]?.name||id },
          ].map(({label,items,sel,fn,format})=>(
            <div key={label} style={{ marginBottom:10 }}>
              <Lbl>{label} ({sel.length})</Lbl>
              <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                {items.map(i=><Chip key={i} label={format?format(i):i} on={sel.includes(i)} onClick={()=>fn(i)}/>)}
              </div>
            </div>
          ))}

          {/* External MCP repo input */}
          {renderRepoInput()}

          {/* Custom tools section */}
          <div style={{ marginTop:10,padding:10,background:"rgba(0,0,0,.15)",borderRadius:8,border:`1px dashed ${T.border}` }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:customItems.length?8:0 }}>
              <span style={{ color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace" }}>🔧 Create custom tools</span>
              <button onClick={()=>openCreator("skill")} style={{ padding:"4px 12px",borderRadius:6,border:`1px solid ${T.accent}`,background:T.accentDim,color:T.accent,fontSize:10,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>+ Create Custom</button>
            </div>
            {renderCustomItemsBar()}
          </div>

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,marginTop:10 }}>
            <Tog label="Memory Persistence" desc="Aha Cards, recommendations, session lifecycle + management CLI" on={memoryPersistence} set={setMemoryPersistence}/>
            <Tog label="Plugin Manifest" desc=".claude-plugin/plugin.json" on={generatePlugin} set={setGeneratePlugin}/>
            <Tog label="Sandbox" desc="Isolate bash execution" on={sandbox} set={setSandbox}/>
            <Tog label="Global Config" desc="Global config for all active targets" on={globalScope} set={setGlobalScope}/>
          </div>

          {/* Project Docs in reverse mode */}
          <div style={{ marginTop:10 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
              <span style={{ color:T.dim,fontSize:9,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:1 }}>📄 Project Documents</span>
              <button onClick={()=>setProjectDocs(projectDocs.length===Object.keys(PROJECT_DOCS).length?[]:Object.keys(PROJECT_DOCS))} style={{ padding:"2px 8px",borderRadius:4,border:`1px solid ${T.border}`,background:"transparent",color:T.muted,fontSize:8,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>{projectDocs.length===Object.keys(PROJECT_DOCS).length?"Clear":"All"}</button>
            </div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:3 }}>
              {Object.values(PROJECT_DOCS).map(d => {
                const on = projectDocs.includes(d.id);
                return <button key={d.id} onClick={()=>setProjectDocs(on?projectDocs.filter(x=>x!==d.id):[...projectDocs,d.id])} style={{ padding:"3px 8px",borderRadius:5,border:`1px solid ${on?"rgba(249,115,22,.3)":T.border}`,background:on?"rgba(249,115,22,.06)":"transparent",color:on?T.accent:T.muted,fontSize:8,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>{d.icon} {d.name}</button>;
              })}
            </div>
          </div>
        </div>

        <button onClick={generateRetrofit} style={{ width:"100%",padding:"12px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${T.blue},#1d4ed8)`,color:"#fff",fontSize:13,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>⚡ Generate Missing Configuration</button>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────
  //  FORWARD MODE — STEP 0: INTAKE
  // ─────────────────────────────────────────────────────────────────────
  const renderForwardIntake = () => (
    <div>
      <div style={{ textAlign:"center",marginBottom:24 }}>
        <div style={{ fontSize:40,marginBottom:8 }}>🚀</div>
        <h2 style={{ color:T.text,fontSize:20,fontWeight:700,fontFamily:"'DM Sans',sans-serif",marginBottom:4 }}>New Project Setup</h2>
        <p style={{ color:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>Describe your project — or grab a battle-tested recipe</p>
        {apiKey && <div style={{ marginTop:8,padding:"4px 10px",borderRadius:6,background:"rgba(74,222,128,.08)",display:"inline-block" }}><span style={{ color:T.green,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>🟢 AI-enhanced detection active</span></div>}
      </div>

      {/* AI Error */}
      {aiError && <div style={{ padding:"10px 14px",borderRadius:8,border:`1px solid ${T.red}44`,background:"rgba(239,68,68,.06)",marginBottom:14 }}><span style={{ color:T.red,fontSize:10,fontFamily:"'JetBrains Mono',monospace" }}>⚠️ {aiError}</span></div>}

      {/* AI Loading */}
      {aiLoading && <div style={{ padding:"14px",borderRadius:8,border:`1px solid ${T.accent}44`,background:"rgba(234,88,12,.06)",marginBottom:14,textAlign:"center" }}><span style={{ color:T.accent,fontSize:11,fontFamily:"'JetBrains Mono',monospace",animation:"pulse 1.5s ease-in-out infinite" }}>🤖 Claude is analyzing your project...</span></div>}

      {/* Recipe Starter Packs */}
      <div style={{ marginBottom:18 }}>
        <Lbl>⚡ Quick Start — Starter Recipes</Lbl>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:4 }}>
          {RECIPES.map(r=>(
            <button key={r.id} onClick={()=>{setName(name||r.name);setDesc(desc||r.desc);applyRecipe(r);}} style={{ padding:"10px 8px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card,cursor:"pointer",textAlign:"left",transition:"all .2s" }} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.background=T.accentDim;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.card;}}>
              <div style={{ fontSize:20,marginBottom:4 }}>{r.icon}</div>
              <div style={{ color:T.text,fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",marginBottom:2 }}>{r.name}</div>
              <div style={{ color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.3 }}>{r.desc}</div>
              <div style={{ marginTop:4,display:"flex",gap:3,flexWrap:"wrap" }}>
                {r.config.langs.map(l=><span key={l} style={{ padding:"1px 5px",borderRadius:4,background:"rgba(255,255,255,.06)",color:T.muted,fontSize:8,fontFamily:"'JetBrains Mono',monospace" }}>{l}</span>)}
                {r.config.fws.slice(0,2).map(f=><span key={f} style={{ padding:"1px 5px",borderRadius:4,background:"rgba(255,255,255,.06)",color:T.muted,fontSize:8,fontFamily:"'JetBrains Mono',monospace" }}>{f}</span>)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ textAlign:"center",color:T.muted,fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:14,position:"relative" }}>
        <span style={{ background:T.bg,padding:"0 12px",position:"relative",zIndex:1 }}>or describe your project</span>
        <div style={{ position:"absolute",top:"50%",left:0,right:0,height:1,background:T.border }}/>
      </div>

      <div style={{ marginBottom:14 }}><Lbl>Project Name</Lbl><Inp value={name} set={setName} placeholder="e.g. UnityERP"/></div>
      <div style={{ marginBottom:14 }}><Lbl>Describe Your Project</Lbl><Inp value={desc} set={setDesc} placeholder={"e.g. AI-native financial OS with Next.js 14, TypeScript, FastAPI, PostgreSQL, Prisma, deployed on Vercel. Uses GitHub, Sentry, Docker for local dev."} rows={5}/></div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
        <div><Lbl>Type</Lbl><Sel value={type} set={setType} opts={Object.keys(PROJECT_AGENTS).map(v=>({v,l:v}))}/></div>
        <div><Lbl>IDE</Lbl><Sel value={ide} set={setIde} opts={[{v:"vscode",l:"VS Code"},{v:"cursor",l:"Cursor"},{v:"neovim",l:"Neovim"},{v:"jetbrains",l:"JetBrains"},{v:"terminal",l:"Terminal"}]}/></div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
        <div><Lbl>Model</Lbl><Sel value={model} set={setModel} opts={[{v:"claude-opus-4-6",l:"Opus 4.6"},{v:"claude-sonnet-4-5-20250929",l:"Sonnet 4.5"},{v:"claude-haiku-4-5-20251001",l:"Haiku 4.5"}]}/></div>
        <div><Lbl>OS</Lbl><Sel value={os} set={setOs} opts={["macOS","Linux","Windows (WSL2)"]}/></div>
      </div>
      <Tog label="Include Global Config" desc="Global config for all active targets" on={globalScope} set={setGlobalScope}/>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  //  FORWARD MODE — STEP 1: CONFIGURE
  // ─────────────────────────────────────────────────────────────────────
  const renderForwardConfigure = () => (
    <div>
      <div style={{ marginBottom:14 }}>
        <h3 style={{ color:T.text,fontFamily:"'DM Sans',sans-serif",margin:"0 0 4px" }}>Auto-Detected Configuration</h3>
        <p style={{ color:T.muted,fontSize:10,fontFamily:"'JetBrains Mono',monospace" }}>Everything inferred from your description. Review and adjust.</p>
      </div>

      {[
        { label:"Languages",items:allLangs,sel:langs,fn:i=>toggle(langs,setLangs,i) },
        { label:"Frameworks",items:allFw,sel:fws,fn:i=>toggle(fws,setFws,i) },
        { label:"Databases",items:allDb,sel:dbs,fn:i=>toggle(dbs,setDbs,i) },
        { label:"Infrastructure",items:allInfra,sel:infra,fn:i=>toggle(infra,setInfra,i) },
        { label:"Rules (always-loaded)",items:allRules,sel:selectedRules,fn:i=>toggle(selectedRules,setSelectedRules,i),format:id=>`📏 ${id}`},
        { label:"Skills (SKILL.md format)",items:allSkills,sel:skills,fn:i=>toggle(skills,setSkills,i),format:id=>`/${id}` },
        { label:"Agents (with frontmatter)",items:allAgents,sel:agents,fn:i=>toggle(agents,setAgents,i),format:id=>id.replace(/-/g," ") },
        { label:"Dynamic Contexts",items:allContexts,sel:selectedContexts,fn:i=>toggle(selectedContexts,setSelectedContexts,i),format:id=>`🎯 ${id}` },
        { label:"MCP Servers",items:allMcp,sel:mcps,fn:i=>toggle(mcps,setMcps,i),format:id=>MCP_CATALOG[id]?.name||id },
      ].map(({label,items,sel,fn,format})=>(
        <div key={label} style={{ marginBottom:10 }}>
          <Lbl>{label} ({sel.length})</Lbl>
          <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
            {items.map(i=><Chip key={i} label={format?format(i):i} on={sel.includes(i)} onClick={()=>fn(i)}/>)}
          </div>
        </div>
      ))}

      {/* External MCP repo input */}
      {renderRepoInput()}

      {/* Custom tools section */}
      <div style={{ marginTop:12,padding:12,background:"rgba(0,0,0,.15)",borderRadius:8,border:`1px dashed ${T.border}` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:customItems.length?8:0 }}>
          <span style={{ color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace" }}>🔧 Create custom skills, rules, agents, hooks, contexts, or files</span>
          <button onClick={()=>openCreator("skill")} style={{ padding:"5px 14px",borderRadius:6,border:`1px solid ${T.accent}`,background:T.accentDim,color:T.accent,fontSize:10,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>+ Create Custom Tool</button>
        </div>
        {renderCustomItemsBar()}
      </div>

      <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:12 }}>
        <Lbl>Features & Settings</Lbl>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:3 }}>
          <Tog label="WebFetch + WebSearch" desc="Web access tools" on={webTools} set={setWebTools}/>
          <Tog label="Notebooks" desc="Jupyter notebook tools" on={notebooks} set={setNotebooks}/>
          <Tog label="Memory Persistence" desc="Aha Cards, JSONL storage, review/backport lifecycle" on={memoryPersistence} set={setMemoryPersistence}/>
          <Tog label="Plugin Manifest" desc=".claude-plugin/plugin.json" on={generatePlugin} set={setGeneratePlugin}/>
          <Tog label="Sandbox" desc="Isolate bash execution" on={sandbox} set={setSandbox}/>
          <Tog label="Status Line" desc="Custom status bar" on={statusLine} set={setStatusLine}/>
          <Tog label="GitHub CLI" desc="Allow gh commands" on={allowGhCli} set={setAllowGhCli}/>
          <Tog label="Auto-approve MCPs" desc="enableAllProjectMcpServers" on={enableAllProjectMcpServers} set={setEnableAllProjectMcpServers}/>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8 }}>
          <div><Lbl>Permission Mode</Lbl><Sel value={defaultMode} set={setDefaultMode} opts={[{v:"default",l:"Default"},{v:"acceptEdits",l:"Accept Edits"},{v:"bypassPermissions",l:"Bypass (CI only)"}]}/></div>
          <div><Lbl>Output Style</Lbl><Sel value={outputStyle} set={setOutputStyle} opts={[{v:"",l:"Default"},{v:"concise",l:"Concise"},{v:"verbose",l:"Verbose"},{v:"minimal",l:"Minimal"}]}/></div>
        </div>
      </div>

      <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:8 }}>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8 }}>
          <div><Lbl>Branch Convention</Lbl><Inp value={gitBranch} set={setGitBranch}/></div>
          <div><Lbl>Commit Convention</Lbl><Inp value={commitConv} set={setCommitConv}/></div>
        </div>
        <div style={{ marginBottom:8 }}><Lbl>Key Directories</Lbl><Inp value={directories} set={setDirectories} placeholder={"src/ — source code\ntests/ — test suites\ndocs/ — documentation"} rows={3}/></div>
        <div style={{ marginBottom:8 }}><Lbl>Common Commands</Lbl><Inp value={commonCmds} set={setCommonCmds} placeholder={"npm run dev    # development server\nnpm test       # run tests"} rows={3}/></div>
        <div><Lbl>Deny Patterns</Lbl><Inp value={denyPatterns.join("\n")} set={v=>setDenyPatterns(v.split("\n").filter(Boolean))} rows={2}/></div>
      </div>

      {/* ── Project Documents ─────────────────────────────────── */}
      <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:8 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
          <span style={{ color:T.text,fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace" }}>📄 Project Documents</span>
          <span style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>{projectDocs.length} selected</span>
        </div>
        <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",marginBottom:8,lineHeight:1.5 }}>
          Generate scaffolded project files — README, PRD, architecture docs, docker-compose, and more.
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:4,marginBottom:8 }}>
          <button onClick={()=>setProjectDocs(projectDocs.length===Object.keys(PROJECT_DOCS).length?[]:Object.keys(PROJECT_DOCS))} style={{ padding:"4px 10px",borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",color:projectDocs.length===Object.keys(PROJECT_DOCS).length?T.accent:T.muted,fontSize:9,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>{projectDocs.length===Object.keys(PROJECT_DOCS).length?"Deselect All":"Select All"}</button>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:4 }}>
          {Object.values(PROJECT_DOCS).map(d => {
            const on = projectDocs.includes(d.id);
            return <div key={d.id} onClick={()=>setProjectDocs(on?projectDocs.filter(x=>x!==d.id):[...projectDocs,d.id])} style={{ display:"flex",alignItems:"flex-start",gap:8,padding:"6px 8px",borderRadius:6,border:`1px solid ${on?"rgba(249,115,22,.25)":T.border}`,background:on?"rgba(249,115,22,.04)":"transparent",cursor:"pointer" }}>
              <span style={{ fontSize:12,lineHeight:"16px" }}>{d.icon}</span>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ color:on?T.accent:T.text,fontSize:10,fontWeight:600,fontFamily:"'JetBrains Mono',monospace" }}>{d.name}</div>
                <div style={{ color:T.muted,fontSize:8,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.3 }}>{d.desc}</div>
              </div>
              <span style={{ color:on?T.accent:T.muted,fontSize:10 }}>{on?"✓":"+"}</span>
            </div>;
          })}
        </div>
      </div>

      {/* ── Live Preview Panel ─────────────────────────────────── */}
      <div style={{ borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:12 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:previewOpen?10:0 }}>
          <button onClick={()=>setPreviewOpen(!previewOpen)} style={{ background:"none",border:"none",color:T.accent,fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
            <span style={{ transform:previewOpen?"rotate(90deg)":"rotate(0)",display:"inline-block",transition:"transform .2s" }}>▶</span>
            👁️ Live Preview
          </button>
          <div style={{ display:"flex",gap:4 }}>
            <button onClick={exportConfig} style={{ padding:"4px 10px",borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>📤 Export Config</button>
            <button onClick={()=>setConfigImportOpen(!configImportOpen)} style={{ padding:"4px 10px",borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>📥 Import Config</button>
          </div>
        </div>

        {configImportOpen && (
          <div style={{ background:T.card,borderRadius:8,border:`1px solid ${T.border}`,padding:12,marginBottom:10 }}>
            <Lbl>Paste exported config JSON</Lbl>
            <textarea value={configImportText} onChange={e=>setConfigImportText(e.target.value)} placeholder='Paste .json contents here...' style={{ width:"100%",padding:8,background:"rgba(0,0,0,.4)",color:T.dim,border:`1px solid ${T.border}`,borderRadius:6,fontSize:10,fontFamily:"'JetBrains Mono',monospace",resize:"vertical",height:60 }}/>
            <div style={{ display:"flex",gap:6,marginTop:6 }}>
              <button onClick={()=>{const ok=importConfig(configImportText);if(!ok)alert("Invalid config file");}} style={{ padding:"5px 14px",borderRadius:6,border:"none",background:T.accent,color:"#fff",fontSize:10,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>Apply</button>
              <button onClick={()=>{setConfigImportOpen(false);setConfigImportText("");}} style={{ padding:"5px 14px",borderRadius:6,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {previewOpen && (
          <div style={{ background:"rgba(0,0,0,.4)",borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden" }}>
            <div style={{ display:"flex",borderBottom:`1px solid ${T.border}` }}>
              {[{id:"tree",label:"📂 File Tree"},{id:"claude.md",label:"📝 CLAUDE.md"},{id:"settings",label:"⚙️ settings.json"}].map(t=>(
                <button key={t.id} onClick={()=>setPreviewTab(t.id)} style={{ flex:1,padding:"8px",border:"none",borderBottom:previewTab===t.id?`2px solid ${T.accent}`:"2px solid transparent",background:previewTab===t.id?"rgba(234,88,12,.08)":"transparent",color:previewTab===t.id?T.accent:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",fontWeight:previewTab===t.id?700:400 }}>{t.label}</button>
              ))}
            </div>
            <div style={{ maxHeight:260,overflowY:"auto",padding:previewTab==="tree"?"8px 4px":"0" }}>
              {previewTab === "tree" && renderTree(buildPreviewTree())}
              {previewTab === "claude.md" && (
                <pre style={{ padding:12,margin:0,fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:T.dim,lineHeight:1.6,whiteSpace:"pre-wrap" }}>{buildPreviewClaudeMd()}</pre>
              )}
              {previewTab === "settings" && (
                <pre style={{ padding:12,margin:0,fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:T.dim,lineHeight:1.6 }}>{buildPreviewSettings()}</pre>
              )}
            </div>
            <div style={{ padding:"6px 12px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <span style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>
                Preview updates live as you toggle options
              </span>
              <span style={{ color:T.accent,fontSize:9,fontFamily:"'JetBrains Mono',monospace",fontWeight:700 }}>
                {(() => {
                  const t = buildPreviewTree();
                  const count = (obj) => Object.entries(obj).reduce((n,[k,v]) => n + (k.endsWith("/")?count(v||{}):1), 0);
                  return count(t) + " files";
                })()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  //  FORWARD MODE — STEP 2: REVIEW SUMMARY
  // ─────────────────────────────────────────────────────────────────────
  const renderForwardReview = () => (
    <div style={{ textAlign:"center",padding:"40px 0" }}>
      {generating ? (
        <>
          <div style={{ fontSize:48,marginBottom:16,animation:"spin 2s linear infinite" }}>⚙️</div>
          <h3 style={{ color:T.text,fontFamily:"'DM Sans',sans-serif",marginBottom:20 }}>Generating Configuration...</h3>
          <div style={{ maxWidth:420,margin:"0 auto",textAlign:"left" }}>
            {genProgress.map((msg,i) => (
              <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"6px 0",opacity:i===genProgress.length-1?1:0.5 }}>
                <span style={{ color:i===genProgress.length-1?T.accent:T.green,fontSize:12 }}>{i===genProgress.length-1?"⏳":"✅"}</span>
                <span style={{ color:i===genProgress.length-1?T.text:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>{msg}</span>
              </div>
            ))}
          </div>
          <div style={{ maxWidth:420,margin:"16px auto 0",height:4,borderRadius:2,background:"rgba(255,255,255,.08)",overflow:"hidden" }}>
            <div style={{ height:"100%",borderRadius:2,background:`linear-gradient(90deg,${T.accent},#f59e0b)`,width:`${Math.min(100,(genProgress.length/(8+(exportTargets.length>1?1:0)))*100)}%`,transition:"width .3s ease" }}/>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize:48,marginBottom:12 }}>✨</div>
          <h3 style={{ color:T.text,fontFamily:"'DM Sans',sans-serif",marginBottom:16 }}>Generate Complete Configuration</h3>
          <div style={{ textAlign:"left",maxWidth:540,margin:"0 auto",background:"rgba(0,0,0,.3)",borderRadius:10,padding:18,border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:11,color:T.text,fontFamily:"'JetBrains Mono',monospace",lineHeight:2 }}>
              <div>📦 <strong>{name}</strong> ({type})</div>
              <div>🛠️ {langs.join(", ")}{fws.length?" → "+fws.join(", "):""}</div>
              {dbs.length>0&&<div>💾 {dbs.join(", ")}</div>}
              {infra.length>0&&<div>☁️ {infra.join(", ")}</div>}
              <div>📏 {selectedRules.length + customItems.filter(i=>i.type==="rule").length} rules (always-loaded){customItems.filter(i=>i.type==="rule").length>0&&` (${customItems.filter(i=>i.type==="rule").length} custom)`}</div>
              <div>🛠️ {skills.length + customItems.filter(i=>i.type==="skill").length} skills (SKILL.md format){customItems.filter(i=>i.type==="skill").length>0&&` (${customItems.filter(i=>i.type==="skill").length} custom)`}</div>
              <div>🤖 {agents.length + customItems.filter(i=>i.type==="agent").length} agents (with frontmatter){customItems.filter(i=>i.type==="agent").length>0&&` (${customItems.filter(i=>i.type==="agent").length} custom)`}</div>
              <div>🎯 {selectedContexts.length + customItems.filter(i=>i.type==="context").length} dynamic contexts{customItems.filter(i=>i.type==="context").length>0&&` (${customItems.filter(i=>i.type==="context").length} custom)`}</div>
              <div>🔌 {mcps.length + customMcps.length} MCP servers{customMcps.length>0&&` (${customMcps.length} external)`}</div>
              <div>🪝 {hookCount + customItems.filter(i=>i.type==="hook").length}+ hooks ({memoryPersistence?"incl. lifecycle":"tool hooks only"}){customItems.filter(i=>i.type==="hook").length>0&&` (${customItems.filter(i=>i.type==="hook").length} custom)`}</div>
              <div>🔧 18 built-in tools configured</div>
              <div>🔒 3-tier permissions (allow / ask / deny)</div>
              {customItems.filter(i=>i.type==="file").length>0&&<div>📄 {customItems.filter(i=>i.type==="file").length} custom files</div>}
              {sandbox&&<div>🏖️ Sandbox enabled</div>}
              {memoryPersistence&&<div>🧠 Self-learning memory (Aha Cards + recommendations + backporting)</div>}
              {generatePlugin&&<div>📦 Plugin manifest included</div>}
              {projectDocs.length>0&&<div>📄 {projectDocs.length} project docs ({projectDocs.map(d=>PROJECT_DOCS[d]?.name||d).join(", ")})</div>}
              {exportTargets.length > 1 && <div>🎯 Targets: {exportTargets.map(t => EXPORT_TARGETS[t]?.name || t).join(", ")}</div>}
            </div>
          </div>
          {exportTargets.length > 1 && (
            <div style={{ maxWidth:540,margin:"16px auto 0",textAlign:"left" }}>
              <div style={{ color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:1,marginBottom:8,textAlign:"center" }}>Target Breakdown</div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8 }}>
                {exportTargets.map(tid => {
                  const tgt = EXPORT_TARGETS[tid];
                  const fileMap = {
                    "claude-code": ["CLAUDE.md",".claude/settings.json",".claude/rules/*",".claude/skills/*",".claude/agents/*",".mcp.json","hooks"],
                    "cursor": [".cursorrules",".cursor/rules/*.mdc","project-info.mdc"],
                    "windsurf": [".windsurfrules",".windsurf/rules/*.md"],
                    "copilot": [".github/copilot-instructions.md",".github/instructions/*",".github/agents/*"],
                    "cline": [".clinerules/*.md","workflow rules"],
                    "roo-code": [".roo/rules/*",".roo/rules-code/*",".roo/rules-architect/*",".roo/rules-ask/*",".roomodes"],
                    "agents-md": ["AGENTS.md"],
                    "aider": ["CONVENTIONS.md",".aider.conf.yml"],
                  };
                  return (
                    <div key={tid} style={{ padding:"10px 12px",borderRadius:8,border:`1px solid ${tgt?.color||T.border}22`,background:`${tgt?.color||T.border}06` }}>
                      <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:6 }}>
                        <span style={{ fontSize:13 }}>{tgt?.icon}</span>
                        <span style={{ color:tgt?.color||T.text,fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace" }}>{tgt?.name}</span>
                      </div>
                      <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.7 }}>
                        {(fileMap[tid]||[]).map(f => <div key={f}>📄 {f}</div>)}
                      </div>
                    </div>
                  );
                })}
                <div style={{ padding:"10px 12px",borderRadius:8,border:`1px solid #94a3b822`,background:"#94a3b806" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:6 }}>
                    <span style={{ fontSize:13 }}>🌐</span>
                    <span style={{ color:"#94a3b8",fontSize:11,fontWeight:600,fontFamily:"'JetBrains Mono',monospace" }}>Universal</span>
                  </div>
                  <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.7 }}>
                    <div>📄 .editorconfig</div>
                    <div>📄 .gitattributes</div>
                    <div>📄 .vscode/settings.json</div>
                    <div>📄 .vscode/extensions.json</div>
                    <div>📄 .github/workflows/ci.yml</div>
                    <div>📄 Makefile</div>
                    {langs.includes("TypeScript")||langs.includes("JavaScript")?<><div>📄 .eslintrc.json</div><div>📄 .prettierrc</div></>:null}
                    {langs.includes("Python")?<><div>📄 ruff.toml</div><div>📄 pyproject.toml</div></>:null}
                    {langs.includes("Rust")?<><div>📄 rustfmt.toml</div><div>📄 clippy.toml</div></>:null}
                    {langs.includes("Go")?<div>📄 .golangci.yml</div>:null}
                  </div>
                </div>
              </div>
            </div>
          )}
          <button onClick={generateForward} style={{ marginTop:20,padding:"12px 40px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${T.accent},#c2410c)`,color:"#fff",fontSize:13,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>{apiKey?"🤖 AI Generate":"⚡ Generate"} {exportTargets.length > 1 ? `for ${exportTargets.length} Targets` : "All Files"}</button>
          {apiKey && <div style={{ marginTop:8,color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>Claude will rewrite your CLAUDE.md with project-specific instructions</div>}
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  //  FILE BROWSER (shared between Forward step 3 / Reverse step 2)
  // ─────────────────────────────────────────────────────────────────────
  const renderFileBrowser = () => {
    if (!files) return null;
    const fnames = Object.keys(files);

    // Group files by target tool
    const targetGroups = {};
    fnames.forEach(f => {
      let tgt = "other";
      if (f.startsWith(".claude/") || f === "CLAUDE.md" || f === ".mcp.json" || f.startsWith("~/.claude/")) tgt = "claude-code";
      else if (f.startsWith(".cursor/") || f === ".cursorrules" || f.startsWith("~/.cursor/")) tgt = "cursor";
      else if (f.startsWith(".windsurf/") || f === ".windsurfrules" || f.startsWith("~/.windsurf/")) tgt = "windsurf";
      else if (f.startsWith(".github/workflows/")) tgt = "universal";
      else if (f.startsWith(".github/") || f.startsWith("~/.github/")) tgt = "copilot";
      else if (f.startsWith(".clinerules/") || f === ".clinerules" || f.startsWith("~/.cline/")) tgt = "cline";
      else if (f.startsWith(".roo/") || f === ".roorules" || f.startsWith("~/.roo/")) tgt = "roo-code";
      else if (f === "AGENTS.md") tgt = "agents-md";
      else if (f === "CONVENTIONS.md" || f === ".aider.conf.yml" || f === "~/.aider.conf.yml") tgt = "aider";
      else if (f.startsWith(".vscode/")) tgt = "universal";
      else if (f === ".editorconfig") tgt = "universal";
      else if (f === ".gitattributes") tgt = "universal";
      else if (f === ".eslintrc.json" || f === ".prettierrc" || f === ".prettierignore") tgt = "universal";
      else if (f === "ruff.toml" || f === "pyproject.toml") tgt = "universal";
      else if (f === "rustfmt.toml" || f === "clippy.toml") tgt = "universal";
      else if (f === ".golangci.yml") tgt = "universal";
      else if (f === "Makefile") tgt = "universal";
      else if (f === "README.md" || f === "CONTRIBUTING.md" || f === "SECURITY.md" || f === "CHANGELOG.md" || f === "INSTRUCTIONS.md" || f === ".env.example" || f === "docker-compose.yml" || f === "Taskfile.yml" || f.startsWith("docs/")) tgt = "project-docs";
      if (!targetGroups[tgt]) targetGroups[tgt] = [];
      targetGroups[tgt].push(f);
    });

    const showTargetHeaders = exportTargets.length > 1;
    const UNIVERSAL_META = { icon: "🌐", color: "#94a3b8", name: "Universal" };
    const PROJECT_DOCS_META = { icon: "📄", color: "#a78bfa", name: "Project Docs" };

    // Build display list
    const displayGroups = [];
    const orderedTargets = [...exportTargets, "universal", "project-docs", "other"].filter(t => targetGroups[t]?.length);
    orderedTargets.forEach(tgt => {
      const tgtFiles = targetGroups[tgt] || [];
      const dirGroups = {};
      tgtFiles.forEach(f => {
        const d = f.includes("/") ? f.substring(0, f.lastIndexOf("/")) : "root";
        if (!dirGroups[d]) dirGroups[d] = [];
        dirGroups[d].push(f);
      });
      displayGroups.push({ target: tgt, dirGroups, count: tgtFiles.length });
    });

    return (
      <div style={{ display:"flex",gap:0,height:"calc(100vh - 130px)",minHeight:500 }}>
        <div style={{ width:265,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0 }}>
          <div style={{ color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:1,padding:"6px 10px",borderBottom:`1px solid ${T.border}` }}>
            {fnames.length} files {showTargetHeaders?`across ${orderedTargets.length} targets`:""} {mode==="reverse"&&"(retrofit)"}
          </div>
          <div style={{ flex:1,overflowY:"auto" }}>
            {displayGroups.map(({target, dirGroups, count})=>(
              <div key={target}>
                {showTargetHeaders && (
                  <div style={{ padding:"6px 10px 3px",borderBottom:`1px solid ${T.border}`,marginTop:4,display:"flex",alignItems:"center",gap:6 }}>
                    <span style={{ fontSize:11 }}>{EXPORT_TARGETS[target]?.icon||(target==="universal"?UNIVERSAL_META.icon:target==="project-docs"?PROJECT_DOCS_META.icon:"📦")}</span>
                    <span style={{ color:EXPORT_TARGETS[target]?.color||(target==="universal"?UNIVERSAL_META.color:target==="project-docs"?PROJECT_DOCS_META.color:T.dim),fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace" }}>{EXPORT_TARGETS[target]?.name||(target==="universal"?UNIVERSAL_META.name:target==="project-docs"?PROJECT_DOCS_META.name:target)}</span>
                    <span style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>{count}</span>
                  </div>
                )}
                {Object.entries(dirGroups).map(([d,fs])=>(
                  <div key={target+d} style={{ marginBottom:4 }}>
                    <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",padding:"3px 10px",textTransform:"uppercase" }}>{d==="root"?"📂 /":"📁 "+d}</div>
                    {fs.map(f=>{
                      const n = f.includes("/") ? f.substring(f.lastIndexOf("/")+1) : f;
                      const ic = n.endsWith(".md")?"📝":n.endsWith(".mdc")?"📝":n.endsWith(".json")?"📋":n.endsWith(".sh")?"🔧":n.endsWith(".yml")?"⚙️":"📄";
                      const enhanced = f.includes("(ENHANCED)") || f.includes("(FULL)");
                      const sel = selFile===f;
                      return <button key={f} onClick={()=>setSelFile(f)} style={{ display:"block",width:"100%",textAlign:"left",padding:"4px 10px 4px 20px",background:sel?T.accentDim:"transparent",border:"none",borderLeft:sel?`2px solid ${T.accent}`:"2px solid transparent",color:sel?T.accent:enhanced?T.blue:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",borderRadius:"0 4px 4px 0" }}>{ic} {n}</button>;
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ padding:"8px 6px",borderTop:`1px solid ${T.border}` }}>
            <button onClick={copyAll} style={{ width:"100%",padding:"7px",borderRadius:5,border:`1px solid ${T.border}`,background:copied==="__all__"?T.greenDim:"transparent",color:copied==="__all__"?T.green:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",marginBottom:4 }}>{copied==="__all__"?"✅ Copied All":"📋 Copy All"}</button>
            <button onClick={exportSh} style={{ width:"100%",padding:"7px",borderRadius:5,border:"none",background:`linear-gradient(135deg,${T.accent},#c2410c)`,color:"#fff",fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",marginBottom:4 }}>⬇ Download setup.sh</button>
            <button onClick={exportConfig} style={{ width:"100%",padding:"7px",borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>📤 Share Config (.json)</button>
            {exportTargets.length > 1 && (
              <div style={{ marginTop:8,borderTop:`1px solid ${T.border}`,paddingTop:8 }}>
                <div style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace",marginBottom:4,textTransform:"uppercase",letterSpacing:1 }}>Per-target download</div>
                {exportTargets.map(tid => (
                  <button key={tid} onClick={()=>exportTargetSh(tid)} style={{ width:"100%",padding:"5px",borderRadius:4,border:`1px solid ${EXPORT_TARGETS[tid]?.color||T.border}22`,background:`${EXPORT_TARGETS[tid]?.color||T.border}08`,color:EXPORT_TARGETS[tid]?.color||T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",marginBottom:3,textAlign:"left" }}>{EXPORT_TARGETS[tid]?.icon} {EXPORT_TARGETS[tid]?.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ flex:1,display:"flex",flexDirection:"column",minWidth:0 }}>
          {selFile&&<>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 14px",borderBottom:`1px solid ${T.border}`,flexShrink:0 }}>
              <span style={{ color:T.accent,fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>{selFile}</span>
              <button onClick={()=>copy(selFile)} style={{ padding:"3px 10px",borderRadius:4,border:`1px solid ${T.border}`,background:copied===selFile?T.greenDim:"transparent",color:copied===selFile?T.green:T.dim,fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer" }}>{copied===selFile?"✅":"Copy"}</button>
            </div>
            <textarea value={getContent(selFile)} onChange={e=>setEdits(p=>({...p,[selFile]:e.target.value}))} spellCheck={false} style={{ flex:1,padding:14,background:"rgba(0,0,0,.5)",color:"#ccc",fontSize:11,fontFamily:"'JetBrains Mono',monospace",border:"none",outline:"none",resize:"none",lineHeight:1.6,whiteSpace:"pre",overflowX:"auto" }}/>
          </>}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────
  //  MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <div style={{ minHeight:"100vh",background:T.bg,color:T.text }}>
        <style>{`@import url('${FONTS}');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.muted};border-radius:3px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        {renderModeSelect()}
      </div>
    );
  }

  const isFileBrowser = (mode==="forward"&&step===3) || (mode==="reverse"&&step===2);
  const FORWARD_STEPS = [{l:"Intake",i:"📋"},{l:"Configure",i:"⚙️"},{l:"Review",i:"✨"},{l:"Export",i:"📄"}];
  const REVERSE_STEPS = [{l:"Analyze",i:"🔍"},{l:"Gaps & Config",i:"📊"},{l:"Export",i:"📄"}];
  const steps = mode === "forward" ? FORWARD_STEPS : REVERSE_STEPS;

  const renderCurrentStep = () => {
    if (mode === "forward") {
      switch(step) {
        case 0: return renderForwardIntake();
        case 1: return renderForwardConfigure();
        case 2: return renderForwardReview();
        case 3: return renderFileBrowser();
      }
    } else {
      switch(step) {
        case 0: return renderReverseInput();
        case 1: return renderGapReport();
        case 2: return renderFileBrowser();
      }
    }
  };

  return (
    <div style={{ minHeight:"100vh",background:T.bg,color:T.text }}>
      <style>{`@import url('${FONTS}');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.muted};border-radius:3px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      {/* Header */}
      <div style={{ borderBottom:`1px solid ${T.border}`,padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <button onClick={()=>{setMode(null);setStep(0);setFiles(null);setAnalysis(null);setGapReport(null);setCustomMcps([]);setCustomItems([]);setGhUrl("");setGhError(null);setRepoInput("");setReverseInputMode("github");setGenerating(false);setGenProgress([]);setPreviewOpen(false);setConfigImportOpen(false);setConfigImportText("");setAiLoading(false);setAiError(null);setExportTargets(["claude-code"]);setShowTargetCompare(false);}} style={{ background:"none",border:"none",color:T.dim,cursor:"pointer",fontSize:14,padding:"2px 6px" }}>←</button>
          <span style={{ fontSize:14 }}>⚡</span>
          <span style={{ fontSize:11,fontWeight:700,color:T.accent,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1 }}>VERITAS LAB</span>
          <span style={{ color:T.muted,fontSize:9,fontFamily:"'JetBrains Mono',monospace" }}>v4 — {mode}</span>
        </div>
        <div style={{ display:"flex",gap:2 }}>
          {steps.map((s,i)=><button key={i} onClick={()=>{if(i<=step||(isFileBrowser))setStep(i);}} style={{ padding:"4px 10px",borderRadius:5,border:"none",background:i===step?(mode==="reverse"?T.blueDim:T.accentDim):i<step?T.greenDim:"transparent",color:i===step?(mode==="reverse"?T.blue:T.accent):i<step?T.green:T.muted,fontSize:10,fontFamily:"'JetBrains Mono',monospace",cursor:i<=step?"pointer":"default" }}>{i<step?"✅":s.i} {s.l}</button>)}
        </div>
      </div>
      {/* Content */}
      <div style={{ maxWidth:isFileBrowser?"100%":720,margin:"0 auto",padding:isFileBrowser?"4px":"20px 18px 100px" }}>
        {renderCurrentStep()}
      </div>
      {/* Footer nav */}
      {!isFileBrowser && (
        <div style={{ position:"fixed",bottom:0,left:0,right:0,padding:"14px 18px",background:`linear-gradient(transparent,${T.bg} 40%)`,display:"flex",justifyContent:"space-between" }}>
          <button onClick={()=>setStep(Math.max(0,step-1))} disabled={step===0} style={{ padding:"9px 20px",borderRadius:7,border:`1px solid ${T.border}`,background:"transparent",color:step===0?T.border:T.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace",cursor:step===0?"default":"pointer" }}>← Back</button>
          {mode==="forward" && step===0 && <button onClick={autoDetect} disabled={!name.trim()||!desc.trim()||aiLoading} style={{ padding:"9px 28px",borderRadius:7,border:"none",background:name.trim()&&desc.trim()&&!aiLoading?`linear-gradient(135deg,${T.accent},#c2410c)`:T.muted,color:name.trim()&&desc.trim()&&!aiLoading?"#fff":T.border,fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:name.trim()&&desc.trim()&&!aiLoading?"pointer":"default" }}>{aiLoading?"⏳ Analyzing...":apiKey?"🤖 AI Detect →":"Auto-Detect →"}</button>}
          {mode==="forward" && step===1 && <button onClick={()=>setStep(2)} disabled={!langs.length} style={{ padding:"9px 28px",borderRadius:7,border:"none",background:langs.length?`linear-gradient(135deg,${T.accent},#c2410c)`:T.muted,color:langs.length?"#fff":T.border,fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:langs.length?"pointer":"default" }}>Review →</button>}
          {mode==="forward" && step===2 && <button onClick={generateForward} disabled={generating} style={{ padding:"9px 28px",borderRadius:7,border:"none",background:generating?T.muted:`linear-gradient(135deg,${T.accent},#c2410c)`,color:generating?T.border:"#fff",fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",cursor:generating?"default":"pointer" }}>{generating?"Generating...":(apiKey?"🤖 Generate":"⚡ Generate")+(exportTargets.length>1?` (${exportTargets.length})`:"")}</button>}
        </div>
      )}
      {/* Custom Tool Creator Modal */}
      {renderCreatorModal()}
    </div>
  );
}
