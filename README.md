# OSAP

**Open Stateful AI Platform** — A browser-based AI agent development environment with persistent memory, external knowledge ingestion, autonomous execution, and built-in developer tools.

## What can OSAP agents do?

### Example 1: Your agent learns your coding style

You spend an hour explaining your preferred coding patterns to your OSAP agent — naming conventions, how you structure components, your testing preferences. The next day, when you ask the agent to generate a new React component, it already knows you use TypeScript strict mode, prefer compound components, and always write tests alongside features. You don't repeat yourself. It just works.

### Example 2: Your agent reads the documentation so you don't have to

You're building integration with a new API. Instead of reading 50 pages of docs, you paste the URL into OSAP. Your agent scrapes the documentation, stores it in its memory, and now answers your questions about the API from actual documentation — not guesswork. "How do I handle pagination?" It recalls the exact section. You save hours of reading.

### Example 3: Your agent handles repetitive tasks while you sleep

Every Monday morning, you used to spend 20 minutes checking which GitHub issues moved, which PRs need review, and what tickets are blocking the team. Now your OSAP agent runs on a schedule — automatically gathers updates, summarizes the status, and posts a report to your Slack. You start Monday knowing what's important, not spending time hunting for it.

## Features

- **Persistent Memory** — Agents remember your preferences, patterns, and context across sessions
- **Knowledge Ingestion** — Feed documentation, articles, or any URL into your agent's memory
- **Autonomous Execution** — Agents that complete multi-step tasks on their own
- **Self-Correction** — Agents learn from failures and improve over time
- **Developer Tools** — Built-in code editor, terminal, API client, and Git panel
- **Trigger Automation** — Schedule tasks or set up event-driven workflows

## Visual Showcase

<div align="center">
  <table style="width: 100%; border-collapse: collapse; border: none;">
    <tr>
      <td width="33%"><img src="public/screenshots/1.png" alt="Personal Agent OS" style="border-radius: 8px; border: 1px solid #333;" /></td>
      <td width="33%"><img src="public/screenshots/2.png" alt="Mobile View" style="border-radius: 8px; border: 1px solid #333;" /></td>
      <td width="33%"><img src="public/screenshots/3.png" alt="Tasks View" style="border-radius: 8px; border: 1px solid #333;" /></td>
    </tr>
    <tr>
      <td align="center"><b>The command center for your digital workforce</b></td>
      <td align="center"><b>Your AI agent, now fitting in your pocket</b></td>
      <td align="center"><b>Real-time autonomous task tracking</b></td>
    </tr>
    <tr>
      <td colspan="2"><img src="public/screenshots/4.png" alt="Profile Logic" style="border-radius: 8px; border: 1px solid #333; margin-top: 20px;" /></td>
      <td width="33%"><img src="public/screenshots/5.png" alt="Detailed Insight" style="border-radius: 8px; border: 1px solid #333; margin-top: 20px;" /></td>
    </tr>
    <tr>
      <td colspan="2" align="center"><b>Tailor your agent's soul with precision memory</b></td>
      <td align="center"><b>Deep-dive into the agent's reasoning</b></td>
    </tr>
    <tr>
      <td colspan="3" align="center">
        <img src="public/screenshots/9.png" alt="Developer Environment" style="border-radius: 12px; border: 1px solid #333; margin-top: 20px; width: 100%;" />
        <br/><b>A full-throttle IDE built directly into your agent's brain</b>
      </td>
    </tr>
  </table>
</div>

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

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/home` | Dashboard with quick actions |
| `/tasks` | Task management |
| `/memory` | Memory timeline |
| `/dev` | Developer tools |
| `/agent` | Autonomous agent control panel |
| `/profile` | User settings |

## License

MIT © OSAP Team
