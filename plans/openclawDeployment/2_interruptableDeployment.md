# OpenClaw Provisioning Resilience (Railway-Safe)

## Goal

Make OpenClaw provisioning resilient to Railway restarts by:

- Tracking granular provisioning stages in the database
- Running the VPS setup script in a detached process (so it survives SSH disconnects)
- Resuming interrupted deployments automatically on startup

---

## Overview

This change introduces **stage-based provisioning** with persistent progress tracking, replaces long-running SSH sessions with a **detached setup script on the VPS**, and adds **startup resume logic** so deployments continue cleanly after Railway restarts or deploys.

The database becomes the source of truth for provisioning state.

---

## 1. Database: Add `provisionStage`

**File:** `prisma/schema.prisma`

Add a new field to `OpenClawDeployment`:

```prisma
provisionStage String? // Tracks granular provisioning progress for resume
```
