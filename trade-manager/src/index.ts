import { execSync } from 'node:child_process';
import { loadConfig } from './config/config.js';
import { disconnectPrisma } from './db/client.js';
import { createApp } from './api/app.js';
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
    logger.info({ port: config.port }, 'Trade manager listening');
  });

  worker.startWorker();

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
