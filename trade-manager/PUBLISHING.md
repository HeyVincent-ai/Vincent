# Publishing @openclaw/trade-manager to npm

## Prerequisites

1. You need an npm account with access to the `@openclaw` org (or create the org)
2. Login to npm: `npm login`

## Publishing a New Version

1. **Update version** in `package.json`:
   ```bash
   npm version patch  # or minor, or major
   ```

2. **Build and publish**:
   ```bash
   npm publish
   ```

   The `prepublishOnly` script will automatically run the build before publishing.

   Note: The `publishConfig.access: "public"` in package.json ensures the scoped package is published publicly.

## What Gets Published

The package includes:
- ✅ `dist/` - Compiled JavaScript (from TypeScript source)
- ✅ `prisma/` - Schema and migrations
- ✅ `package.json` - Package metadata
- ✅ `README.md` - Documentation

The package does NOT include:
- ❌ `src/` - TypeScript source (excluded by `files` field)
- ❌ `node_modules/` - Dependencies
- ❌ `.env*` - Environment files

## Installation on VPS

Once published, the OpenClaw provisioning script will automatically install it:

```bash
npm install -g @openclaw/trade-manager
```

This will:
1. Install the package globally
2. Make `trade-manager` CLI available in PATH
3. Install dependencies

Then the provisioning script:
1. Creates config file at `~/.openclaw/trade-manager.json`
2. Creates systemd service
3. Starts the service

The service will:
1. Auto-run Prisma migrations on startup (`prisma migrate deploy`)
2. Start the HTTP API on port 19000
3. Start the background worker

## Testing Locally Before Publishing

```bash
# Build
npm run build

# Test CLI
./dist/cli.js version
./dist/cli.js config

# Pack without publishing (shows what would be published)
npm pack --dry-run

# Or test with npm link
npm link
trade-manager version
npm unlink -g @openclaw/trade-manager
```

## Updating Existing Deployments

After publishing a new version:

1. SSH into the VPS
2. Update the package:
   ```bash
   npm install -g @openclaw/trade-manager@latest
   ```
3. Restart the service:
   ```bash
   sudo systemctl restart openclaw-trade-manager
   ```

The auto-migration on startup will apply any new database migrations.
