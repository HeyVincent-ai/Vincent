import { execSync } from 'node:child_process';
import { loadConfig } from './config/config.js';
import { disconnectPrisma } from './db/client.js';
import { createApp } from './api/app.js';
import { trySetupHttps } from './caddy/setup.js';
import { EventLoggerService } from './services/eventLogger.service.js';
import { PositionMonitorService } from './services/positionMonitor.service.js';
import { RuleManagerService } from './services/ruleManager.service.js';
import { VincentClientService } from './services/vincentClient.service.js';
import { createWorkerDependencies } from './worker/monitoringWorker.js';
import { logger } from './utils/logger.js';

const run = async (): Promise<void> => {
  const config = loadConfig();

  if (process.env.SKIP_MIGRATIONS !== 'true') {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  }

  const vincentClient = new VincentClientService(config);
  const worker = createWorkerDependencies(
    vincentClient,
    config.pollIntervalSeconds,
    config.circuitBreakerThreshold,
    config.circuitBreakerCooldownSeconds,
    {
      enabled: config.enableWebSocket,
      url: config.webSocketUrl,
      reconnectInitialDelay: config.webSocketReconnectInitialDelay,
      reconnectMaxDelay: config.webSocketReconnectMaxDelay,
    }
  );

  const eventLogger = new EventLoggerService();
  const ruleManager = new RuleManagerService(eventLogger);
  const positionMonitor = new PositionMonitorService(vincentClient);

  const app = createApp(worker, ruleManager, positionMonitor, eventLogger);
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Trade manager listening (HTTP)');
  });

  worker.startWorker();

  // Try to front the HTTP server with Caddy for HTTPS access.
  // Falls back to HTTP-only when Caddy isn't available, no Caddyfile exists,
  // or the HTTPS port is unreachable (e.g. behind NAT).
  if (config.httpsEnabled) {
    const httpsResult = await trySetupHttps(config.port, config.httpsPort, config.caddyfilePath);
    if (httpsResult.success) {
      logger.info({ url: httpsResult.dashboardUrl }, 'Dashboard (HTTPS)');
    } else {
      logger.info(
        { url: `http://localhost:${config.port}` },
        'HTTPS unavailable — dashboard accessible via HTTP'
      );
    }
  } else {
    logger.info(
      { url: `http://localhost:${config.port}` },
      'HTTPS disabled — dashboard accessible via HTTP'
    );
  }

  const shutdown = async (): Promise<void> => {
    worker.stopWorker();
    server.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

void run();
