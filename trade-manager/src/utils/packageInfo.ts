import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Compiled layout: dist/utils/packageInfo.js → package root is two levels up
export const PACKAGE_ROOT = path.resolve(__dirname, '../..');

export const PRISMA_SCHEMA_PATH = path.join(PACKAGE_ROOT, 'prisma', 'schema.prisma');

// Ensures we use the prisma CLI bundled with this package rather than whatever
// version `npx` or a global install might resolve to (e.g. Prisma 7 which has
// breaking schema changes).
export const LOCAL_BIN_DIR = path.join(PACKAGE_ROOT, 'node_modules', '.bin');

const pkgPath = path.join(PACKAGE_ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string };
export const PACKAGE_VERSION: string = pkg.version;
