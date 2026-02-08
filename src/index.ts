// Initialize Sentry first before any other imports
import { initSentry, Sentry } from './sentry.js';
initSentry();

import { createApp } from './app.js';
import { env } from './utils/env.js';
import prisma from './db/client.js';
import { startBot, stopBot, startTimeoutChecker, stopTimeoutChecker } from './telegram/index.js';
import { startUsagePoller, stopUsagePoller, startHardeningWorker, stopHardeningWorker } from './services/openclaw.service.js';

// Prevent unhandled rejections from crashing the process (e.g. Telegram polling conflicts during deploys)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  Sentry.captureException(reason);
});

async function main() {
  const app = createApp();

  // Test database connection
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }

  // Start Telegram bot
  await startBot();
  startTimeoutChecker();

  // Start OpenClaw background workers
  startUsagePoller();
  startHardeningWorker();

  // Start server
  const server = app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`Health check: http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down gracefully...`);

    stopTimeoutChecker();
    stopUsagePoller();
    stopHardeningWorker();
    await stopBot();

    server.close(async () => {
      console.log('HTTP server closed');

      await prisma.$disconnect();
      console.log('Database connection closed');

      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
