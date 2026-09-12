/**
 * 公网 IP 探测（IPv4 优先，其次 IPv6）
 */

import { execSync } from 'child_process';

let cachedV4: string | null | undefined;
let cachedV6: string | null | undefined;

function fetchIp(urls: string[]): string | null {
  for (const url of urls) {
    try {
      const ip = execSync(
        `curl -fsSL --max-time 3 "${url}" 2>/dev/null || wget -qO- --timeout=3 "${url}" 2>/dev/null`,
        { timeout: 5000, encoding: 'utf-8' }
      ).trim();
      if (ip) return ip;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function getPublicIPv4(): string | null {
  if (cachedV4 !== undefined) return cachedV4;
  const ip = fetchIp([
    'https://api4.ipify.org',
    'https://ipv4.icanhazip.com',
    'https://v4.ident.me',
  ]);
  cachedV4 = ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
  return cachedV4;
}

export function getPublicIPv6(): string | null {
  if (cachedV6 !== undefined) return cachedV6;
  const ip = fetchIp([
    'https://api6.ipify.org',
    'https://ipv6.icanhazip.com',
    'https://v6.ident.me',
  ]);
  cachedV6 = ip && ip.includes(':') ? ip : null;
  return cachedV6;
}

export function formatHost(host: string): string {
  if (!host) return host;
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}
