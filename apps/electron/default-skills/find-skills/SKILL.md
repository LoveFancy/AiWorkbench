---
name: find-skills
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
version: "1.0.1"
---
# Find Skills

This skill helps you discover and install skills with the standard Skills CLI. In WorkMate, prefer the Huatai SkillHub source first, then fall back to the open agent skills ecosystem.

## When to Use This Skill

Use this skill when the user:

- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Asks "can you do X" where X is a specialized capability
- Expresses interest in extending agent capabilities
- Wants to search for tools, templates, or workflows
- Mentions they wish they had help with a specific domain

## Skill Sources

### Huatai SkillHub

Huatai SkillHub is the preferred source for internal WorkMate skills:

```text
http://skillhub.uat.saas.htsc
```

Use the standard Skills CLI install command:

```bash
npx skills add http://skillhub.uat.saas.htsc --skill <skill-name>
```

Example:

```bash
npx skills add http://skillhub.uat.saas.htsc --skill frontend-design
```

### Open Skills Ecosystem

Use the public skills ecosystem when Huatai SkillHub has no suitable match:

```bash
npx skills find [query]
npx skills add <owner/repo@skill> -g -y
```

Browse skills at https://skills.sh/.

## How to Help Users Find Skills

### Step 1: Understand What They Need

Identify:

1. The domain, such as React, testing, design, deployment, document processing, or workflow automation
2. The specific task, such as writing tests, creating animations, reviewing PRs, or generating reports
3. Whether the task is internal to Huatai WorkMate or a general-purpose skill need

### Step 2: Prefer Huatai SkillHub

If the user asks for an internal capability or gives a likely skill name, suggest the Huatai SkillHub install command first.

Examples:

- User asks for frontend design help -> `npx skills add http://skillhub.uat.saas.htsc --skill frontend-design`
- User names a known internal skill -> `npx skills add http://skillhub.uat.saas.htsc --skill <skill-name>`

If the exact skill name is unclear, ask for the intended domain or search the public ecosystem as a fallback.

### Step 3: Fall Back to Public Search

Run the find command with a relevant query:

```bash
npx skills find [query]
```

For example:

- User asks "how do I make my React app faster?" -> `npx skills find react performance`
- User asks "can you help me with PR reviews?" -> `npx skills find pr review`
- User asks "I need to create a changelog" -> `npx skills find changelog`

The command returns installable packages like:

```text
Install with npx skills add <owner/repo@skill>

vercel-labs/agent-skills@vercel-react-best-practices
└ https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### Step 4: Present Options to the User

Present:

1. The skill name and what it does
2. The install command
3. The source, either Huatai SkillHub or skills.sh

Example:

```text
I found a skill that might help: frontend-design.

To install it from Huatai SkillHub:
npx skills add http://skillhub.uat.saas.htsc --skill frontend-design
```

### Step 5: Install After Confirmation

If the user wants to proceed, run the standard install command.

For Huatai SkillHub:

```bash
npx skills add http://skillhub.uat.saas.htsc --skill <skill-name>
```

For the public ecosystem:

```bash
npx skills add <owner/repo@skill> -g -y
```

## WorkMate Loading Note

WorkMate loads skills from the current workspace skills directory. If the Skills CLI installs a skill into a global or external directory, move or copy the installed skill into the WorkMate workspace skills directory before expecting it to be available in that workspace.

## Common Skill Categories

| Category        | Example Queries                          |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | workflow, automation, git                |

## When No Skills Are Found

If no relevant skills exist:

1. Acknowledge that no existing skill was found
2. Offer to help with the task directly using general capabilities
3. Suggest creating a custom skill with `npx skills init`
