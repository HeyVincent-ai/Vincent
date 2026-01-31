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
    logEntry.duration = Date.now() - startTime;
    logEntry.statusCode = res.statusCode;

    // Use structured JSON logging
    console.log(JSON.stringify(logEntry));
  });

  next();
}
