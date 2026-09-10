import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'site-config.json');

export function getSiteConfig(): { title: string } {
  if (!existsSync(CONFIG_FILE)) {
    const config = { title: 'SocksToAll' };
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return config;
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

export function updateSiteConfig(config: { title: string }): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
