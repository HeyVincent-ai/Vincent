# Testing Trade Manager Locally

> **Note**: The Trade Manager now includes **WebSocket support** for real-time price updates. See [WEBSOCKET.md](./WEBSOCKET.md) for details on configuration and monitoring.

## Option 1: npm link (Test as global package)

This simulates the actual `npm install -g` experience:

```bash
cd trade-manager

# Build the package
npm run build

# Create global symlink
npm link

# Now you can use it like it's installed globally
trade-manager version
trade-manager config
trade-manager start

# Test it from another directory
cd ~
mkdir -p .openclaw
cat > .openclaw/trade-manager.json << 'EOF'
{
  "port": 19000,
  "pollIntervalSeconds": 60,
  "vincentApiUrl": "https://heyvincent.ai",
  "databaseUrl": "file:/tmp/trade-manager-test.db",
  "enableWebSocket": true,
  "webSocketUrl": "wss://ws-subscriptions-clob.polymarket.com/ws/market"
}
EOF

# Start it (will auto-run migrations)
trade-manager start

# In another terminal, test the API
curl http://localhost:19000/health
curl http://localhost:19000/status

# When done testing, unlink
npm unlink -g @openclaw/trade-manager
```

## Option 2: npm pack (Test the actual tarball)

This tests exactly what will be published to npm:

```bash
cd trade-manager

# Create a tarball (same as npm publish would create)
npm pack

# This creates: openclaw-trade-manager-0.1.0.tgz

# Install it globally from the tarball
npm install -g ./openclaw-trade-manager-0.1.0.tgz

# Test it
trade-manager version
trade-manager start

# Uninstall when done
npm uninstall -g @openclaw/trade-manager

# Clean up tarball
rm openclaw-trade-manager-0.1.0.tgz
```

## Option 3: Run directly from source (Quick testing)

For quick iteration during development:

```bash
cd trade-manager

# Install deps
npm install

# Run migrations
npm run db:deploy

# Start in dev mode (auto-reload)
npm run dev

# Or build and run production mode
npm run build
npm start
```

## Testing the Full Provisioning Flow

To test exactly what happens on a VPS:

```bash
# 1. Build and link
cd trade-manager
npm run build
npm link

# 2. Simulate VPS setup
mkdir -p ~/.openclaw
cat > ~/.openclaw/trade-manager.json << 'EOF'
{
  "port": 19000,
  "pollIntervalSeconds": 60,
  "vincentApiUrl": "https://heyvincent.ai",
  "databaseUrl": "file:/tmp/trade-manager.db",
  "enableWebSocket": true
}
EOF

# 3. Start it (this is what systemd would do)
trade-manager start

# 4. Test the API
curl http://localhost:19000/health
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "test-market",
    "tokenId": "123",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.40,
    "action": {"type": "SELL_ALL"}
  }'

curl http://localhost:19000/api/rules
```

## Verifying Auto-Migrations

Test that migrations run automatically on startup:

```bash
# Delete the database to simulate fresh install
rm /tmp/trade-manager.db

# Start the service - should auto-create DB
trade-manager start

# Check logs to see migration output
# Should see: "Applying migration..." from Prisma
```

## Testing Updates

Simulate updating an existing installation:

```bash
# Initial install
npm link

# Make some changes to code
# ... edit files ...

# Rebuild
npm run build

# The linked version is already updated!
trade-manager version  # Will reflect new code

# Restart to test migrations on update
trade-manager start
```

## Cleanup

```bash
# Unlink global package
npm unlink -g @openclaw/trade-manager

# Remove test database
rm /tmp/trade-manager.db
rm /tmp/trade-manager-test.db

# Remove test config
rm ~/.openclaw/trade-manager.json
```
