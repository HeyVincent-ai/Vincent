import { Request } from 'express';
import { User, ApiKey, Secret } from '@prisma/client';

// Extend Express Request to include authenticated user/apiKey
export interface AuthenticatedRequest extends Request {
  user?: User;
  apiKey?: ApiKey;
  secret?: Secret;
}

// Standard API response format
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Pagination parameters
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

// Pagination response metadata
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
