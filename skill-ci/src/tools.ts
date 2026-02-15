import { tool } from 'ai';
import { z } from 'zod';

export const httpRequestTool = tool({
  description: 'Make an HTTP request to an API endpoint',
  inputSchema: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    url: z.string().describe('Full URL to request'),
    headers: z.record(z.string()).optional().describe('HTTP headers'),
    body: z.any().optional().describe('Request body as a JSON object'),
  }),
  execute: async ({ method, url, headers, body }) => {
    // Handle body: if the model passed a string, use it directly; otherwise stringify
    let serializedBody: string | undefined;
    if (body !== undefined && body !== null) {
      serializedBody = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: serializedBody,
    });

    const responseBody = await response.text();

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: responseBody,
    };
  },
});
