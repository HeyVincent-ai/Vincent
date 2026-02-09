# OpenClaw Restart-Resilient Provisioning

**Goal:** Make OpenClaw provisioning survive Railway restarts by tracking granular stages, running the VPS setup script detached (so it survives SSH disconnection), and resuming interrupted deployments on startup.

---

## Changes

### 1. Add `provisionStage` DB field

**File:** `prisma/schema.prisma`

Add to `OpenClawDeployment`:

```prisma
provisionStage  String?   // Tracks granular provisioning progress for resume
```

Run `npx prisma migrate dev` to create migration.

**Stages** (string values stored in the field):

- `ssh_key_generated`
- `openrouter_key_created`
- `plan_found`
- `vps_ordered`
- `vps_delivered`
- `vps_ip_acquired`
- `vps_rebuilt`
- `ssh_ready`
- `setup_script_launched`
- `setup_complete`

---

### 2. Refactor setup script to run detached on VPS

**File:** `src/services/openclaw.service.ts`

#### a) Modify `buildSetupScript()`

Remove the `sudo -H bash <<'SETUPSCRIPT'` heredoc wrapper. The script will be saved as a file and run directly. Add:

- **Error trap:**
  ```bash
  trap 'echo "FAILED: line $LINENO: $BASH_COMMAND" > /root/.openclaw-setup-error' ERR
  ```
- **Start marker:**
  ```bash
  echo "STARTED" > /root/.openclaw-setup-started
  ```
- **Completion marker + token file** at the end:
  ```bash
  echo "$ACCESS_TOKEN" > /root/.openclaw-setup-token
  echo "COMPLETE" > /root/.openclaw-setup-complete
  ```
- **Make `openclaw onboard` conditional:** skip if `~/.openclaw/openclaw.json` already exists (for idempotent re-runs)

#### b) New function: `launchSetupScript()`

Replaces the synchronous `sshExec(... setupScript, 15min)`:

1. Base64-encode the script
2. SSH: decode + write to `/root/openclaw-setup.sh` (< 30s)
3. SSH: `sudo nohup bash /root/openclaw-setup.sh > /root/openclaw-setup.log 2>&1 &` (< 5s)
4. Update `provisionStage` to `setup_script_launched`

#### c) New function: `pollSetupCompletion()`

Quick SSH checks every 30s:

1. `sudo cat /root/.openclaw-setup-complete 2>/dev/null` → done, read token from `/root/.openclaw-setup-token`
2. `sudo cat /root/.openclaw-setup-error 2>/dev/null` → failed, throw error
3. Neither → still running, sleep 30s and retry
4. Timeout after 20 min

Each SSH poll is < 15s, fits easily within the 30s Railway drain window.

---

### 3. Refactor `provisionAsync()` to be stage-aware and resumable

**File:** `src/services/openclaw.service.ts`

Replace the monolithic `provisionAsync()` with a stage-based runner:

```typescript
const PROVISION_STAGES = [
  'ssh_key_generated',
  'openrouter_key_created',
  'plan_found',
  'vps_ordered',
  'vps_delivered',
  'vps_ip_acquired',
  'vps_rebuilt',
  'ssh_ready',
  'setup_script_launched',
  'setup_complete',
] as const;

async function provisionAsync(deploymentId: string, options: DeployOptions): Promise<void> {
  const deployment = await prisma.openClawDeployment.findUnique({ where: { id: deploymentId } });
  const completedStage = deployment.provisionStage;
  const startIndex = completedStage ? PROVISION_STAGES.indexOf(completedStage) + 1 : 0;

  for (let i = startIndex; i < PROVISION_STAGES.length; i++) {
    await executeStage(PROVISION_STAGES[i], deploymentId, options, addLog);
    await updateDeployment(deploymentId, { provisionStage: PROVISION_STAGES[i] });
  }

  // All stages complete → mark READY
}
```

Each stage function reads what it needs from the DB (SSH keys, VPS name, IP, etc.) and:

- Skips if the work is already done (idempotent)
- Resumes polling if it was mid-poll (delivery, rebuild, etc.)

**Key detail for `vps_ordered` stage:** Currently `pollForDelivery` snapshots "VPS before" in memory. On resume, this snapshot is lost. Fix: primarily rely on `getOrderAssociatedService(orderId)` which is stored in DB, and fall back to VPS list comparison as a secondary check.

---

### 4. Add startup resume logic

**Files:** `src/services/openclaw.service.ts` (new export) + `src/index.ts`

New function `resumeInterruptedDeployments()`:

1. Wait 45s after startup (ensures old Railway instance is fully dead after 30s drain)
2. Query for deployments in `PENDING`, `ORDERING`, `PROVISIONING`, or `INSTALLING` status
3. For each, call `provisionAsync(id)` which resumes from `provisionStage`
4. Log each resumed deployment

Wire into `src/index.ts` after server starts listening (alongside `startUsagePoller()` and `startHardeningWorker()`).

---

### 5. SIGTERM awareness

**File:** `src/index.ts`

The existing SIGTERM handler already stops workers and closes the server. Add:

- Log that deployments in progress will be resumed by the next instance
- No need to mark deployments specially — the DB state + `provisionStage` is sufficient for resume

---

### 6. Adjust stale deployment timeouts

**File:** `src/services/openclaw.service.ts` — `checkStaleDeployments()`

Currently marks `INSTALLING` deployments as `ERROR` after 30 min. Since the setup script now runs detached on the VPS and can take 10+ min, and a Railway restart adds delay, increase the `INSTALLING` timeout to **45 min**. Also, the stale check should not interfere with a deployment that's being actively resumed — check `updatedAt` is stale (it gets refreshed by each stage update).

---

### 7. Reset `provisionStage` in `retryDeploy()`

**File:** `src/services/openclaw.service.ts`

Add `provisionStage: null` to the reset in `retryDeploy()` so a retry starts clean.

---

## Files Modified

1. `prisma/schema.prisma` — add `provisionStage` field
2. `src/services/openclaw.service.ts` — bulk of changes (stages, async script, resume)
3. `src/index.ts` — wire up resume on startup

---

## Verification

1. **Unit/manual test of stage tracking:** Deploy a new instance, verify `provisionStage` advances through each stage in the DB
2. **Detached script test:** During `INSTALLING` stage, kill the SSH connection — verify the setup script continues on the VPS by checking marker files
3. **Resume test:** Start a deployment, simulate Railway restart by restarting the server process — verify the new process picks up and completes the deployment
4. **Concurrent safety:** Push a Railway update during an active deployment — verify the deployment completes successfully after the new instance starts
5. **Retry still works:** Verify `retryDeploy()` resets `provisionStage` and re-provisions from scratch
