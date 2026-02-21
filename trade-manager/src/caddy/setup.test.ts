import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCaddyfileHostname } from './setup.js';

describe('parseCaddyfileHostname', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caddy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const write = (content: string): string => {
    const p = path.join(tmpDir, 'Caddyfile');
    fs.writeFileSync(p, content);
    return p;
  };

  it('extracts hostname from a standard OVH Caddyfile', () => {
    const p = write(`vps-7843cb88.vps.ovh.us {
    reverse_proxy localhost:18789 {
        header_down -Content-Security-Policy
        header_down -X-Frame-Options
    }
    header Content-Security-Policy "frame-ancestors 'self' https://*.heyvincent.ai https://heyvincent.ai"
}
`);
    expect(parseCaddyfileHostname(p)).toBe('vps-7843cb88.vps.ovh.us');
  });

  it('extracts hostname when there is a global options block first', () => {
    const p = write(`{
    admin off
}

example.com {
    reverse_proxy localhost:3000
}
`);
    expect(parseCaddyfileHostname(p)).toBe('example.com');
  });

  it('extracts hostname with import directives at the top', () => {
    const p = write(`import /etc/caddy/conf.d/*

my-host.example.org {
    reverse_proxy localhost:8080
}
`);
    expect(parseCaddyfileHostname(p)).toBe('my-host.example.org');
  });

  it('returns null for bare-port site addresses', () => {
    const p = write(`:8080 {
    respond "Hello"
}
`);
    expect(parseCaddyfileHostname(p)).toBeNull();
  });

  it('returns null for nonexistent file', () => {
    expect(parseCaddyfileHostname('/nonexistent/path/Caddyfile')).toBeNull();
  });

  it('returns null for empty file', () => {
    const p = write('');
    expect(parseCaddyfileHostname(p)).toBeNull();
  });

  it('handles hostname:port site addresses', () => {
    const p = write(`example.com:8443 {
    reverse_proxy localhost:3000
}
`);
    expect(parseCaddyfileHostname(p)).toBe('example.com:8443');
  });
});
