import { createApp } from './app';
import { env } from './utils/env';
import prisma from './db/client';
import { startBot, stopBot, startTimeoutChecker, stopTimeoutChecker } from './telegram';

// Prevent unhandled rejections from crashing the process (e.g. Telegram polling conflicts during deploys)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
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
