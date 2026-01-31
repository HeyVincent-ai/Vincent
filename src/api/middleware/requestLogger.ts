import { Request, Response, NextFunction } from 'express';

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  ip: string | undefined;
  userAgent: string | undefined;
  duration?: number;
  statusCode?: number;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query as Record<string, unknown>,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
  };

  // Log response after it's sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    logEntry.duration = duration;
    logEntry.statusCode = status;

    const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';
    console.log(`${color}${req.method} ${req.originalUrl} ${status}${reset} ${duration}ms`);
  });

  next();
}
