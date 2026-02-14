import prisma from '../db/client.js';
import { sshExec, waitForSsh } from './openclaw.service.js';

// ============================================================
// Update Definitions (hardcoded — define new updates here)
// ============================================================

export interface UpdateDefinition {
  version: number;
  name: string;
  description: string;
  commands: string[];
}

// All updates are defined in code and seeded to DB on first rollout.
// Add new updates here — they'll be auto-applied to the fleet.
const UPDATE_DEFINITIONS: UpdateDefinition[] = [
  // ── v1: Memory file architecture ──────────────────────────
  {
    version: 1,
    name: 'add-memory-files',
    description: 'Create structured memory files for crash recovery, learning, and self-review',
    commands: [
      // Create directory structure
      'sudo mkdir -p /root/.openclaw/memory/daily-logs',

      // active-tasks.md — crash recovery source
      `sudo tee /root/.openclaw/memory/active-tasks.md > /dev/null << 'MEMEOF'
# Active Tasks

_This file is read on startup for crash recovery. Keep it updated with current work._

## In Progress
- (none)

## Queued
- (none)

## Completed Recently
- (none)
MEMEOF`,

      // lessons.md — accumulated learnings
      `sudo tee /root/.openclaw/memory/lessons.md > /dev/null << 'MEMEOF'
# Lessons Learned

_Accumulated learnings and past mistakes. Review before starting new tasks._

## General
- (none yet)
MEMEOF`,

      // self-review.md — periodic self-critique log
      `sudo tee /root/.openclaw/memory/self-review.md > /dev/null << 'MEMEOF'
# Self-Review Log

_Periodic self-critique results. Updated every 4 hours by scheduled review._
MEMEOF`,

      // projects.md — project registry
      `sudo tee /root/.openclaw/memory/projects.md > /dev/null << 'MEMEOF'
# Project Registry

_Active and completed projects._

## Active
- (none)

## Completed
- (none)
MEMEOF`,

      // Initial daily log
      "sudo tee /root/.openclaw/memory/daily-logs/$(date +%Y-%m-%d).md > /dev/null << 'MEMEOF'\n# Daily Log\n\n## Activity\n- Agent deployed and memory system initialized.\nMEMEOF",

      // CLAUDE.md — instructs agent to use memory system
      `sudo tee /root/CLAUDE.md > /dev/null << 'MEMEOF'
# Agent Memory System

You have a structured memory system at /root/.openclaw/memory/

## Memory Files
- \`active-tasks.md\` — Your current tasks. READ THIS ON EVERY STARTUP to resume work.
- \`lessons.md\` — Things you've learned. Update after mistakes or discoveries.
- \`self-review.md\` — Self-critique log. Updated by scheduled review.
- \`projects.md\` — Project registry. Track ongoing and completed projects.
- \`daily-logs/YYYY-MM-DD.md\` — Daily activity logs. Create a new one each day.

## Rules
1. On startup, ALWAYS read active-tasks.md and resume any in-progress work.
2. Before starting a new task, update active-tasks.md with the task details.
3. After completing a task, move it from "In Progress" to "Completed Recently".
4. Log significant actions to today's daily log.
5. When you make a mistake, add it to lessons.md so you don't repeat it.
6. Read lessons.md before starting unfamiliar work.

## Personality
If a file exists at /root/.openclaw/SOUL.md, read it for your personality and behavioral guidelines.
MEMEOF`,

      // Set ownership
      'sudo chown -R root:root /root/.openclaw/memory /root/CLAUDE.md',
    ],
  },

  // ── v2: Install scripts + session cleanup (no LLM cost) ───
  // Installs self-review and daily-recap SCRIPTS on disk but does NOT
  // enable their crons. Users opt-in via the frontend toggle (which
  // burns LLM credits). Session cleanup is auto-enabled (no LLM cost).
  {
    version: 2,
    name: 'add-agent-scripts',
    description:
      'Install self-review, daily-recap, and session-cleanup scripts. Session cleanup auto-enabled; LLM-calling scripts are opt-in.',
    commands: [
      'sudo mkdir -p /root/.openclaw/scripts',

      // Self-review script (NOT cron-enabled by default)
      `sudo tee /root/.openclaw/scripts/self-review.sh > /dev/null << 'SCRIPTEOF'
#!/bin/bash
ACCESS_TOKEN=$(sudo grep -o '"token":"[^"]*"' /root/.openclaw/openclaw.json 2>/dev/null | head -1 | cut -d'"' -f4)
if [ -z "$ACCESS_TOKEN" ]; then
  ACCESS_TOKEN=$(sudo cat /root/.openclaw-setup-token 2>/dev/null)
fi
[ -z "$ACCESS_TOKEN" ] && exit 0

curl -s -X POST http://localhost:18789/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -d '{
    "messages": [{"role":"user","content":"[SCHEDULED: SELF-REVIEW]\\n\\nPerform a self-review. Read your memory files at /root/.openclaw/memory/, especially active-tasks.md and daily-logs/. Critique your recent work:\\n1. What mistakes did you make?\\n2. What could you have done more efficiently?\\n3. Are there tasks stuck or forgotten?\\n4. What patterns should you change?\\n\\nAppend your findings to /root/.openclaw/memory/self-review.md with a timestamp. Also update lessons.md if you discover new learnings."}]
  }' > /dev/null 2>&1
SCRIPTEOF`,

      'sudo chmod +x /root/.openclaw/scripts/self-review.sh',

      // Daily recap script (NOT cron-enabled by default)
      'sudo tee /root/.openclaw/scripts/daily-recap.sh > /dev/null << \'SCRIPTEOF\'\n#!/bin/bash\nACCESS_TOKEN=$(sudo grep -o \'"token":"[^"]*"\' /root/.openclaw/openclaw.json 2>/dev/null | head -1 | cut -d\'"\' -f4)\nif [ -z "$ACCESS_TOKEN" ]; then\n  ACCESS_TOKEN=$(sudo cat /root/.openclaw-setup-token 2>/dev/null)\nfi\n[ -z "$ACCESS_TOKEN" ] && exit 0\n\nTODAY=$(date +%Y-%m-%d)\ncurl -s -X POST http://localhost:18789/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $ACCESS_TOKEN" \\\n  -d "{\\"messages\\": [{\\"role\\":\\"user\\",\\"content\\":\\"[SCHEDULED: DAILY RECAP]\\\\n\\\\nCreate today\'s daily log at /root/.openclaw/memory/daily-logs/$TODAY.md. Summarize:\\\\n1. What you accomplished today\\\\n2. What\'s still pending\\\\n3. Any errors or issues encountered\\\\n4. Priorities for tomorrow\\\\n\\\\nAlso review and update active-tasks.md to reflect current state.\\"}]}" > /dev/null 2>&1\nSCRIPTEOF',

      'sudo chmod +x /root/.openclaw/scripts/daily-recap.sh',

      // Session cleanup script — AUTO-ENABLED (no LLM cost)
      `sudo tee /root/.openclaw/scripts/session-cleanup.sh > /dev/null << 'SCRIPTEOF'
#!/bin/bash
ARCHIVE_DIR="/root/.openclaw/memory/archived-sessions"
mkdir -p "$ARCHIVE_DIR"

# Archive session files over 2MB
find /root/.openclaw -name "*.jsonl" -size +2M -exec mv {} "$ARCHIVE_DIR/" \\; 2>/dev/null

# Compress daily logs older than 30 days
find /root/.openclaw/memory/daily-logs -name "*.md" -mtime +30 -exec gzip {} \\; 2>/dev/null

# Remove archived sessions older than 90 days
find "$ARCHIVE_DIR" -mtime +90 -delete 2>/dev/null
SCRIPTEOF`,

      'sudo chmod +x /root/.openclaw/scripts/session-cleanup.sh',

      // Only auto-enable session cleanup (free) — NOT the LLM-calling scripts
      '(sudo crontab -l 2>/dev/null | grep -v session-cleanup; echo "0 3 * * * /root/.openclaw/scripts/session-cleanup.sh") | sudo crontab -',
    ],
  },
];

// ============================================================
// Seed Updates to DB
// ============================================================

async function seedUpdates(): Promise<void> {
  for (const def of UPDATE_DEFINITIONS) {
    await prisma.deploymentUpdate.upsert({
      where: { version: def.version },
      update: {},
      create: {
        version: def.version,
        name: def.name,
        description: def.description,
        commands: def.commands,
      },
    });
  }
}

// ============================================================
// Apply a Single Update to a Deployment
// ============================================================

async function applyUpdate(
  deploymentId: string,
  ipAddress: string,
  sshPrivateKey: string,
  update: { version: number; name: string; commands: unknown }
): Promise<{ success: boolean; error?: string }> {
  const commands = update.commands as string[];
  const outputs: string[] = [];

  try {
    // Determine SSH user (debian on OVH, with sudo for root commands)
    const sshUser = await waitForSsh(ipAddress, sshPrivateKey, 60_000);

    for (const cmd of commands) {
      const result = await sshExec(ipAddress, sshUser, sshPrivateKey, cmd, 60_000);
      outputs.push(`$ ${cmd}\n${result.stdout}${result.stderr}`);

      if (result.code !== 0) {
        const errMsg = `Command failed (exit ${result.code}): ${cmd}\n${result.stderr}`;
        await prisma.deploymentUpdateLog.create({
          data: {
            deploymentId,
            updateVersion: update.version,
            status: 'FAILED',
            output: outputs.join('\n---\n'),
            errorMessage: errMsg,
          },
        });
        return { success: false, error: errMsg };
      }
    }

    // All commands succeeded — log and bump configVersion
    await prisma.deploymentUpdateLog.create({
      data: {
        deploymentId,
        updateVersion: update.version,
        status: 'SUCCESS',
        output: outputs.join('\n---\n'),
      },
    });

    await prisma.openClawDeployment.update({
      where: { id: deploymentId },
      data: {
        configVersion: update.version,
        lastUpdateAt: new Date(),
        lastUpdateError: null,
      },
    });

    return { success: true };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    // Log the failure
    try {
      await prisma.deploymentUpdateLog.create({
        data: {
          deploymentId,
          updateVersion: update.version,
          status: 'FAILED',
          output: outputs.join('\n---\n'),
          errorMessage: errMsg,
        },
      });
      await prisma.openClawDeployment.update({
        where: { id: deploymentId },
        data: { lastUpdateError: `v${update.version}: ${errMsg}` },
      });
    } catch {
      // Don't mask the original error
    }
    return { success: false, error: errMsg };
  }
}

// ============================================================
// Apply All Pending Updates to a Single Deployment
// ============================================================

export async function applyPendingUpdates(
  deploymentId: string
): Promise<{ applied: number; failed: number }> {
  const deployment = await prisma.openClawDeployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      status: true,
      ipAddress: true,
      sshPrivateKey: true,
      configVersion: true,
    },
  });

  if (!deployment || deployment.status !== 'READY') {
    return { applied: 0, failed: 0 };
  }
  if (!deployment.ipAddress || !deployment.sshPrivateKey) {
    return { applied: 0, failed: 0 };
  }

  // Get all updates newer than the deployment's current version
  const pendingUpdates = await prisma.deploymentUpdate.findMany({
    where: { version: { gt: deployment.configVersion } },
    orderBy: { version: 'asc' },
  });

  if (pendingUpdates.length === 0) {
    return { applied: 0, failed: 0 };
  }

  let applied = 0;
  let failed = 0;

  for (const update of pendingUpdates) {
    // Check if already applied (e.g. from a previous partial run)
    const existing = await prisma.deploymentUpdateLog.findUnique({
      where: {
        deploymentId_updateVersion: {
          deploymentId,
          updateVersion: update.version,
        },
      },
    });

    if (existing?.status === 'SUCCESS') {
      // Already applied, just ensure configVersion is correct
      if (deployment.configVersion < update.version) {
        await prisma.openClawDeployment.update({
          where: { id: deploymentId },
          data: { configVersion: update.version },
        });
      }
      applied++;
      continue;
    }

    // If it previously failed, delete the old log so we can retry
    if (existing?.status === 'FAILED') {
      await prisma.deploymentUpdateLog.delete({
        where: { id: existing.id },
      });
    }

    console.log(
      `[update-engine] Applying v${update.version} (${update.name}) to deployment ${deploymentId}`
    );

    const result = await applyUpdate(
      deploymentId,
      deployment.ipAddress,
      deployment.sshPrivateKey,
      update
    );

    if (result.success) {
      applied++;
    } else {
      console.warn(`[update-engine] v${update.version} failed on ${deploymentId}: ${result.error}`);
      failed++;
      // Stop applying further updates on failure (sequential dependency)
      break;
    }
  }

  return { applied, failed };
}

// ============================================================
// Roll Out Updates to All READY Deployments
// ============================================================

export async function rollOutUpdates(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  // Seed any new update definitions to DB
  await seedUpdates();

  // Find the latest update version
  const latestUpdate = await prisma.deploymentUpdate.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  if (!latestUpdate) {
    return { total: 0, succeeded: 0, failed: 0 };
  }

  // Find deployments that are behind
  const behindDeployments = await prisma.openClawDeployment.findMany({
    where: {
      status: 'READY',
      configVersion: { lt: latestUpdate.version },
      ipAddress: { not: null },
      sshPrivateKey: { not: null },
    },
    select: { id: true },
  });

  if (behindDeployments.length === 0) {
    return { total: 0, succeeded: 0, failed: 0 };
  }

  console.log(`[update-engine] Rolling out updates to ${behindDeployments.length} deployment(s)`);

  let succeeded = 0;
  let failed = 0;

  // Apply updates sequentially (don't overwhelm SSH connections)
  for (const dep of behindDeployments) {
    try {
      const result = await applyPendingUpdates(dep.id);
      if (result.failed === 0) {
        succeeded++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[update-engine] Error updating ${dep.id}:`, err);
      failed++;
    }
  }

  if (succeeded > 0 || failed > 0) {
    console.log(`[update-engine] Rollout complete: ${succeeded} succeeded, ${failed} failed`);
  }

  return { total: behindDeployments.length, succeeded, failed };
}

// ============================================================
// Status Query
// ============================================================

export async function getUpdateStatus(deploymentId: string): Promise<{
  configVersion: number;
  latestVersion: number;
  pending: number;
  logs: Array<{
    updateVersion: number;
    name: string;
    status: string;
    errorMessage: string | null;
    appliedAt: Date;
  }>;
}> {
  const [deployment, latestUpdate, logs, allUpdates] = await Promise.all([
    prisma.openClawDeployment.findUnique({
      where: { id: deploymentId },
      select: { configVersion: true },
    }),
    prisma.deploymentUpdate.findFirst({
      orderBy: { version: 'desc' },
      select: { version: true },
    }),
    prisma.deploymentUpdateLog.findMany({
      where: { deploymentId },
      orderBy: { updateVersion: 'desc' },
    }),
    prisma.deploymentUpdate.findMany({
      orderBy: { version: 'asc' },
      select: { version: true, name: true },
    }),
  ]);

  const configVersion = deployment?.configVersion ?? 0;
  const latestVersion = latestUpdate?.version ?? 0;
  const updateNameMap = new Map(allUpdates.map((u) => [u.version, u.name]));

  return {
    configVersion,
    latestVersion,
    pending: Math.max(0, latestVersion - configVersion),
    logs: logs.map((l) => ({
      updateVersion: l.updateVersion,
      name: updateNameMap.get(l.updateVersion) ?? `v${l.updateVersion}`,
      status: l.status,
      errorMessage: l.errorMessage,
      appliedAt: l.appliedAt,
    })),
  };
}
