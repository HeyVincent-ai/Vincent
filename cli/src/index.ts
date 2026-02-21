#!/usr/bin/env node

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

type CommandFn = (args: string[]) => Promise<void>;

const COMMANDS: Record<string, Record<string, () => Promise<{ run: CommandFn }>>> = {
  secret: {
    create: () => import('./commands/secret/create.js'),
    relink: () => import('./commands/secret/relink.js'),
    list: () => import('./commands/secret/list.js'),
  },
  wallet: {
    address: () => import('./commands/wallet/address.js'),
    balances: () => import('./commands/wallet/balances.js'),
    transfer: () => import('./commands/wallet/transfer.js'),
    swap: () => import('./commands/wallet/swap.js'),
    'send-tx': () => import('./commands/wallet/send-tx.js'),
    'transfer-between': () => import('./commands/wallet/transfer-between.js'),
  },
  'raw-signer': {
    addresses: () => import('./commands/raw-signer/addresses.js'),
    sign: () => import('./commands/raw-signer/sign.js'),
  },
  polymarket: {
    balance: () => import('./commands/polymarket/balance.js'),
    markets: () => import('./commands/polymarket/markets.js'),
    market: () => import('./commands/polymarket/market.js'),
    orderbook: () => import('./commands/polymarket/orderbook.js'),
    bet: () => import('./commands/polymarket/bet.js'),
    holdings: () => import('./commands/polymarket/holdings.js'),
    'open-orders': () => import('./commands/polymarket/open-orders.js'),
    trades: () => import('./commands/polymarket/trades.js'),
    'cancel-order': () => import('./commands/polymarket/cancel-order.js'),
    'cancel-all': () => import('./commands/polymarket/cancel-all.js'),
    redeem: () => import('./commands/polymarket/redeem.js'),
    withdraw: () => import('./commands/polymarket/withdraw.js'),
  },
  twitter: {
    search: () => import('./commands/twitter/search.js'),
    tweet: () => import('./commands/twitter/tweet.js'),
    user: () => import('./commands/twitter/user.js'),
    'user-tweets': () => import('./commands/twitter/user-tweets.js'),
  },
  brave: {
    web: () => import('./commands/brave/web.js'),
    news: () => import('./commands/brave/news.js'),
  },
  'trade-manager': {
    health: () => import('./commands/trade-manager/health.js'),
    status: () => import('./commands/trade-manager/status.js'),
    'create-rule': () => import('./commands/trade-manager/create-rule.js'),
    'list-rules': () => import('./commands/trade-manager/list-rules.js'),
    'update-rule': () => import('./commands/trade-manager/update-rule.js'),
    'delete-rule': () => import('./commands/trade-manager/delete-rule.js'),
    positions: () => import('./commands/trade-manager/positions.js'),
    events: () => import('./commands/trade-manager/events.js'),
  },
};

function printHelp(): void {
  console.log(`Usage: vincent <group> <command> [options]

Groups and commands:
`);
  for (const [group, commands] of Object.entries(COMMANDS)) {
    console.log(`  ${group}`);
    for (const cmd of Object.keys(commands)) {
      console.log(`    ${cmd}`);
    }
    console.log();
  }
  console.log('Options:');
  console.log('  --help     Show help for a command');
  console.log('  --version  Show version');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(pkg.version);
    process.exit(0);
  }

  const group = argv[0];
  const command = argv[1];
  const rest = argv.slice(2);

  const groupCommands = COMMANDS[group];
  if (!groupCommands) {
    console.error(`Unknown group: ${group}`);
    console.error(`Run "vincent --help" for available groups.`);
    process.exit(1);
  }

  if (!command || command === '--help' || command === '-h') {
    console.log(`Available commands for "${group}":\n`);
    for (const cmd of Object.keys(groupCommands)) {
      console.log(`  vincent ${group} ${cmd}`);
    }
    console.log(`\nRun "vincent ${group} <command> --help" for command-specific help.`);
    process.exit(0);
  }

  const loader = groupCommands[command];
  if (!loader) {
    console.error(`Unknown command: ${group} ${command}`);
    console.error(`Run "vincent ${group} --help" for available commands.`);
    process.exit(1);
  }

  const mod = await loader();
  await mod.run(rest);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
