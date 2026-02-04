import { Bot, InlineKeyboard, type Context } from 'grammy';
import { type Address } from 'viem';
import { env } from '../utils/env';
import prisma from '../db/client';
import crypto from 'crypto';
import { executeApprovedTransaction } from './approvalExecutor';
import * as zerodev from '../skills/zerodev.service';
import * as abiDecoder from '../skills/abiDecoder.service';
import { isNativeToken } from '../skills/zeroEx.service';

let bot: Bot | null = null;

// In-memory store for linking codes: code -> userId
const linkingCodes = new Map<string, { userId: string; expiresAt: number }>();

export function getBot(): Bot | null {
  return bot;
}

/**
 * Initialize and start the Telegram bot (long polling mode)
 */
export async function startBot(): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log('TELEGRAM_BOT_TOKEN not configured, skipping Telegram bot startup');
    return;
  }

  bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // /start command - handles linking
  bot.command('start', async (ctx) => {
    const payload = ctx.match; // text after /start
    if (payload) {
      await handleLinkCommand(ctx, payload);
    } else {
      await ctx.reply(
        'Welcome to SafeSkills! To link your Telegram account, use the linking code from the SafeSkills dashboard.\n\n' +
          'Send /start <linking_code> to link your account.'
      );
    }
  });

  // /status command
  bot.command('status', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const user = await prisma.user.findFirst({
      where: { telegramChatId: chatId },
    });
    if (user) {
      await ctx.reply(`Linked to account: ${user.email}`);
    } else {
      await ctx.reply('Your Telegram is not linked to any SafeSkills account.');
    }
  });

  // /unlink command
  bot.command('unlink', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const user = await prisma.user.findFirst({
      where: { telegramChatId: chatId },
    });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: null },
      });
      await ctx.reply('Your Telegram account has been unlinked from SafeSkills.');
    } else {
      await ctx.reply('Your Telegram is not linked to any SafeSkills account.');
    }
  });

  // Handle inline keyboard callbacks (approval buttons)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat?.id.toString();

    if (!chatId) {
      await ctx.answerCallbackQuery({ text: 'Error: no chat context' });
      return;
    }

    // Format: approve:<approvalId> or deny:<approvalId>
    const [action, approvalId] = data.split(':');
    if (!approvalId || (action !== 'approve' && action !== 'deny')) {
      await ctx.answerCallbackQuery({ text: 'Invalid action' });
      return;
    }

    // Verify the user owns this approval
    const approval = await prisma.pendingApproval.findUnique({
      where: { id: approvalId },
      include: {
        transactionLog: {
          include: {
            secret: { include: { user: true } },
          },
        },
      },
    });

    if (!approval) {
      await ctx.answerCallbackQuery({ text: 'Approval not found' });
      return;
    }

    if (approval.approved !== null) {
      await ctx.answerCallbackQuery({ text: 'Already responded' });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      return;
    }

    if (new Date() > approval.expiresAt) {
      await ctx.answerCallbackQuery({ text: 'Approval has expired' });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      return;
    }

    const ownerChatId = approval.transactionLog.secret.user?.telegramChatId;
    if (ownerChatId !== chatId) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized' });
      return;
    }

    const isApproved = action === 'approve';

    // Update approval record
    await prisma.pendingApproval.update({
      where: { id: approvalId },
      data: {
        approved: isApproved,
        respondedAt: new Date(),
      },
    });

    // Update transaction log
    await prisma.transactionLog.update({
      where: { id: approval.transactionLogId },
      data: {
        status: isApproved ? 'APPROVED' : 'DENIED',
        approvedBy: isApproved ? `telegram:${chatId}` : undefined,
      },
    });

    // Remove inline keyboard
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });

    if (isApproved) {
      await ctx.answerCallbackQuery({ text: 'Approved!' });
      await ctx.reply(`Transaction approved. Executing...`);

      // Execute the transaction
      try {
        const result = await executeApprovedTransaction(approval.transactionLog);
        await ctx.reply(`Transaction executed successfully!\nTx hash: ${result.txHash}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        await ctx.reply(`Transaction execution failed: ${msg}`);
      }
    } else {
      await ctx.answerCallbackQuery({ text: 'Denied' });
      await ctx.reply('Transaction denied.');
    }
  });

  // Handle middleware errors without crashing
  bot.catch((err) => {
    console.error('Telegram bot error:', err.message);
  });

  // Drop pending updates so we claim the polling slot from any prior instance
  await bot.api.deleteWebhook({ drop_pending_updates: true });

  // Start bot with long polling
  bot.start({
    drop_pending_updates: true,
    onStart: () => console.log('Telegram bot started'),
  });
}

/**
 * Stop the Telegram bot gracefully
 */
export async function stopBot(): Promise<void> {
  if (bot) {
    bot.stop();
    bot = null;
  }
}

/**
 * Handle /start <linking_code> to link Telegram to a user account
 */
async function handleLinkCommand(ctx: Context, code: string): Promise<void> {
  const entry = linkingCodes.get(code);

  if (!entry) {
    await ctx.reply(
      'Invalid or expired linking code. Please generate a new one from the SafeSkills dashboard.'
    );
    return;
  }

  if (Date.now() > entry.expiresAt) {
    linkingCodes.delete(code);
    await ctx.reply('This linking code has expired. Please generate a new one.');
    return;
  }

  const chatId = ctx.chat!.id.toString();
  const username = ctx.from?.username ?? null;

  // Link the user
  await prisma.user.update({
    where: { id: entry.userId },
    data: {
      telegramChatId: chatId,
      telegramUsername: username,
    },
  });

  linkingCodes.delete(code);

  await ctx.reply(
    'Your Telegram account has been linked to SafeSkills! You will now receive approval requests here.'
  );
}

/**
 * Generate a linking code for a user (called from API)
 */
export function generateLinkingCode(userId: string): string {
  const code = crypto.randomBytes(16).toString('hex');
  linkingCodes.set(code, {
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minute expiry
  });
  return code;
}

/**
 * Resolve a token address to a human-readable label like "USDC" or "ETH".
 * Falls back to a truncated address if the on-chain lookup fails.
 */
async function resolveTokenLabel(
  token: string | undefined,
  chainId: number | undefined
): Promise<string> {
  if (!token || token.toUpperCase() === 'ETH') return 'ETH';
  if (isNativeToken(token)) return 'ETH';
  if (!chainId) return truncateAddress(token);
  try {
    return await zerodev.getTokenSymbol(token as Address, chainId);
  } catch {
    return truncateAddress(token);
  }
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function chainLabel(chainId: number | undefined): string {
  const names: Record<number, string> = {
    1: 'Ethereum',
    11155111: 'Sepolia',
    8453: 'Base',
    84532: 'Base Sepolia',
    137: 'Polygon',
    42161: 'Arbitrum',
    10: 'Optimism',
    80001: 'Mumbai',
  };
  if (!chainId) return '';
  return names[chainId] ?? `Chain ${chainId}`;
}

function formatExpiry(expiresAt: Date): string {
  const mins = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  return mins > 0 ? `${mins} min` : 'expiring now';
}

async function formatApprovalMessage(
  actionType: string,
  data: Record<string, unknown>,
  walletAddr: string,
  chainId: number | undefined,
  expiresAt: Date
): Promise<string> {
  const chain = chainLabel(chainId);
  const lines: string[] = ['🔐 *Approval Required*', ''];

  if (actionType === 'transfer') {
    const tokenLabel = await resolveTokenLabel(data.token as string | undefined, chainId);
    lines.push(`*Transfer ${data.amount} ${tokenLabel}*`);
    if (data.usdValue) lines.push(`≈ $${Number(data.usdValue).toFixed(2)}`);
    lines.push(`To: \`${data.to}\``);
  } else if (actionType === 'swap') {
    const sellLabel = await resolveTokenLabel(data.sellToken as string | undefined, chainId);
    const buyLabel = await resolveTokenLabel(data.buyToken as string | undefined, chainId);
    lines.push(`*Swap ${data.sellAmount} ${sellLabel} → ${buyLabel}*`);
    if (data.usdValue) lines.push(`≈ $${Number(data.usdValue).toFixed(2)}`);
  } else if (actionType === 'send_transaction') {
    // Try to decode the transaction using ABI
    const contractAddr = data.to as string;
    const calldata = data.data as string | undefined;

    let decoded: abiDecoder.DecodedTransaction | null = null;
    if (calldata && chainId) {
      try {
        decoded = await abiDecoder.decodeTransaction(contractAddr as Address, calldata, chainId);
      } catch {
        // Decoding failed, fall back to basic display
      }
    }

    if (decoded) {
      // Show decoded function call
      lines.push(`*Contract Call: ${decoded.functionName}*`);
      lines.push(`Contract: \`${truncateAddress(contractAddr)}\``);
      if (data.value && data.value !== '0') lines.push(`Value: ${data.value} ETH`);

      // Show decoded parameters (limit to first 5 for readability)
      if (decoded.args.length > 0) {
        lines.push('');
        lines.push('*Parameters:*');
        const displayArgs = decoded.args.slice(0, 5);
        for (const arg of displayArgs) {
          const argName = arg.name || 'unnamed';
          let argValue = arg.value;
          // Truncate long values
          if (argValue.length > 40) {
            argValue = argValue.slice(0, 37) + '...';
          }
          lines.push(`  ${argName}: \`${argValue}\``);
        }
        if (decoded.args.length > 5) {
          lines.push(`  ... and ${decoded.args.length - 5} more`);
        }
      }
    } else {
      // Fallback to basic display if ABI not available
      lines.push(`*Contract Call*`);
      lines.push(`To: \`${truncateAddress(contractAddr)}\``);
      if (data.value && data.value !== '0') lines.push(`Value: ${data.value} ETH`);
      if (data.functionSelector) {
        lines.push(`Function: \`${data.functionSelector}\``);
        lines.push(`_(ABI not available for decoding)_`);
      }
    }
  } else {
    lines.push(`*${actionType}*`);
  }

  lines.push('');
  if (chain) lines.push(`Network: ${chain}`);
  lines.push(`Wallet: \`${truncateAddress(walletAddr)}\``);
  lines.push(`Expires: ${formatExpiry(expiresAt)}`);

  return lines.join('\n');
}

/**
 * Send an approval request to a user via Telegram
 */
export async function sendApprovalRequest(approvalId: string): Promise<boolean> {
  if (!bot) return false;

  const approval = await prisma.pendingApproval.findUnique({
    where: { id: approvalId },
    include: {
      transactionLog: {
        include: {
          secret: { include: { user: true, walletMetadata: true } },
        },
      },
    },
  });

  if (!approval) return false;

  const user = approval.transactionLog.secret.user;
  if (!user?.telegramChatId) return false;

  const txLog = approval.transactionLog;
  const requestData = txLog.requestData as Record<string, unknown>;
  const walletAddr =
    approval.transactionLog.secret.walletMetadata?.smartAccountAddress ?? 'unknown';
  const chainId = requestData.chainId as number | undefined;

  const message = await formatApprovalMessage(
    txLog.actionType,
    requestData,
    walletAddr,
    chainId,
    approval.expiresAt
  );

  const keyboard = new InlineKeyboard()
    .text('Approve', `approve:${approval.id}`)
    .text('Deny', `deny:${approval.id}`);

  try {
    const sent = await bot.api.sendMessage(user.telegramChatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });

    // Store the telegram message ID for reference
    await prisma.pendingApproval.update({
      where: { id: approval.id },
      data: { telegramMessageId: sent.message_id.toString() },
    });

    return true;
  } catch (error) {
    console.error('Failed to send Telegram approval request:', error);
    return false;
  }
}

/**
 * Send a notification message to a user
 */
export async function sendNotification(userId: string, message: string): Promise<boolean> {
  if (!bot) return false;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.telegramChatId) return false;

  try {
    await bot.api.sendMessage(user.telegramChatId, message, { parse_mode: 'Markdown' });
    return true;
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
    return false;
  }
}
