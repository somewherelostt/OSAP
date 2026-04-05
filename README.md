# OSAP

**Open Stateful AI Platform** — A browser-based AI agent development environment with persistent memory, external knowledge ingestion, autonomous execution, and built-in developer tools.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why OSAP?

Unlike traditional AI assistants that forget everything after each conversation, OSAP agents maintain persistent memory across sessions. They learn from your patterns, remember your preferences, and can ingest external knowledge to become truly intelligent assistants.

## Quick Examples

### 1. Memory That Persists

```typescript
// Store a preference
await storeMemory({
  type: "preference",
  content: "Always use TypeScript with strict mode",
  userId: "user_123"
});

// Agent recalls this in future sessions
const context = await recallMemories("TypeScript project setup");
// → "User prefers TypeScript with strict mode..."
```

### 2. Knowledge Ingestion

```typescript
// Scrape documentation and make it searchable
const knowledge = await scrapeAndPrepareForIngestion("https://docs.example.com/api");
await storeKnowledge({ ...knowledge, userId: "user_123" });

// Later, agent searches this knowledge
const results = await recallKnowledge("authentication flow");
// → Finds relevant sections from the scraped docs
```

### 3. Autonomous Agent Execution

```typescript
// Create an agent with self-correction
const agent = orchestrator.createAgent({
  name: "Code Review Agent",
  capabilities: ["reasoning", "planning", "execution"],
  selfCorrect: true
});

// Execute complex tasks with memory context
const plan = await orchestrator.plan(agent.id, {
  userId: "user_123",
  input: "Review all open PRs and summarize the changes"
});

// Agent thinks, plans, executes, and learns from outcomes
```

## Features

- **Persistent Memory** — Semantic memory storage with HydraDB, recall past interactions instantly
- **Knowledge Ingestion** — Scrape websites and documents, search through them with natural language
- **Autonomous Execution** — Agents that plan, execute, and self-correct without constant guidance
- **Developer Environment** — Built-in Monaco editor, terminal, API client, and Git panel
- **Trigger Automation** — Time-based and event-based automations for repetitive tasks

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (Turbopack) |
| AI | GLM 5.1 via REST API |
| Auth | Clerk |
| Memory | HydraDB + Supabase |
| Knowledge | Firecrawl |
| UI | TailwindCSS + shadcn/ui |
| State | Zustand |

## Getting Started

```bash
# Clone the repository
git clone https://github.com/somewherelostt/OSAP.git
cd OSAP

# Install dependencies
bun install

# Start development server
bun run dev
```

## Environment Variables

```env
# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# GLM AI
GLM_API_KEY=
GLM_API_URL=https://api.z.ai/api/coding/paas/v4

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# HydraDB
NEXT_PUBLIC_HYDRA_DB_API_KEY=
NEXT_PUBLIC_HYDRA_DB_TENANT_ID=

# Firecrawl
NEXT_PUBLIC_FIRECRAWL_API_KEY=
```

## Architecture

```
User Input
    ↓
AgentOrchestrator
    ├── think() — Reasoning with context
    ├── plan() — Generate execution steps
    ├── execute() — Run steps
    └── self-correct() — Handle failures
    ↓
SelfCorrectionEngine — Retry strategies, learned rules
BackgroundTaskManager — Async workflows, progress tracking
TriggerSystem — Time-based & event-based automation
MemoryFeedbackLoop — Learn from outcomes, pattern recognition
    ↓
HydraDB — Semantic memory & knowledge storage
```

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/home` | Dashboard with quick actions |
| `/tasks` | Task management |
| `/memory` | Memory timeline |
| `/dev` | Developer tools (editor, terminal, API client, Git) |
| `/agent` | Autonomous agent control panel |
| `/profile` | User settings |

## License

MIT © OSAP Team
