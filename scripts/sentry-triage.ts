import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

type SentryCredentialConfig = {
  token: string;
  orgSlug: string;
  projectSlugs: string[];
  baseUrl?: string;
};

type SentryIssue = {
  id: string;
  shortId?: string;
  title?: string;
  culprit?: string;
  permalink?: string;
  level?: string;
  count?: string;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  status?: string;
  metadata?: {
    type?: string;
    value?: string;
    filename?: string;
    function?: string;
  };
};

type Classification = {
  category: 'actionable_bug' | 'likely_user_error' | 'likely_noise' | 'needs_review';
  confidence: number;
  reasons: string[];
};

type TriageResult = {
  project: string;
  issue: SentryIssue;
  classification: Classification;
};

type Summary = {
  actionable_bug: number;
  likely_user_error: number;
  likely_noise: number;
  needs_review: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const [key, inlineValue] = arg.slice(2).split('=');
    if (inlineValue !== undefined) {
      out[key] = inlineValue;
      continue;
    }

    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = 'true';
    }
  }

  return out;
}

function readConfig(credentialsPath: string): SentryCredentialConfig {
  const raw = readFileSync(credentialsPath, 'utf8');
  const config = JSON.parse(raw) as Partial<SentryCredentialConfig>;

  if (!config.token) throw new Error('Missing token in credentials file');
  if (!config.orgSlug) throw new Error('Missing orgSlug in credentials file');
  if (!Array.isArray(config.projectSlugs) || config.projectSlugs.length === 0) {
    throw new Error('Missing projectSlugs[] in credentials file');
  }

  return {
    token: config.token,
    orgSlug: config.orgSlug,
    projectSlugs: config.projectSlugs,
    baseUrl: config.baseUrl || 'https://sentry.io',
  };
}

async function sentryGet<T>(config: SentryCredentialConfig, path: string): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sentry API error ${response.status} ${response.statusText}: ${body.slice(0, 400)}`);
  }

  return (await response.json()) as T;
}

function classifyIssue(issue: SentryIssue): Classification {
  const title = (issue.title || '').toLowerCase();
  const type = (issue.metadata?.type || '').toLowerCase();
  const value = (issue.metadata?.value || '').toLowerCase();
  const culprit = (issue.culprit || '').toLowerCase();

  const haystack = `${title}\n${type}\n${value}\n${culprit}`;

  const reasons: string[] = [];
  let bugScore = 0;
  let userErrorScore = 0;
  let noiseScore = 0;

  const bugSignals = [
    'typeerror',
    'referenceerror',
    'cannot read properties of undefined',
    'cannot read properties of null',
    '500',
    'internal server error',
    'failed to fetch',
    'database',
    'timeout',
  ];

  const userErrorSignals = [
    'insufficient funds',
    'user rejected',
    'user denied',
    'invalid parameter',
    'invalid input',
    'not found',
    'already exists',
    'rate limit',
    '429',
    'forbidden',
    'unauthorized',
    '400',
  ];

  const noiseSignals = [
    'networkerror',
    'chunk load error',
    'non-error promise rejection captured',
    'script error',
    'aborterror',
    'the operation was aborted',
    'extension context invalidated',
  ];

  for (const s of bugSignals) {
    if (haystack.includes(s)) {
      bugScore += 1;
      reasons.push(`bug signal: "${s}"`);
    }
  }

  for (const s of userErrorSignals) {
    if (haystack.includes(s)) {
      userErrorScore += 1;
      reasons.push(`user-error signal: "${s}"`);
    }
  }

  for (const s of noiseSignals) {
    if (haystack.includes(s)) {
      noiseScore += 1;
      reasons.push(`noise signal: "${s}"`);
    }
  }

  if (issue.status === 'resolved') {
    noiseScore += 1;
    reasons.push('issue already resolved');
  }

  const topScore = Math.max(bugScore, userErrorScore, noiseScore);

  if (topScore === 0) {
    return {
      category: 'needs_review',
      confidence: 0.5,
      reasons: ['no strong heuristic matches'],
    };
  }

  if (bugScore >= userErrorScore && bugScore >= noiseScore) {
    return {
      category: 'actionable_bug',
      confidence: Math.min(0.55 + bugScore * 0.1, 0.95),
      reasons,
    };
  }

  if (userErrorScore >= bugScore && userErrorScore >= noiseScore) {
    return {
      category: 'likely_user_error',
      confidence: Math.min(0.55 + userErrorScore * 0.1, 0.95),
      reasons,
    };
  }

  return {
    category: 'likely_noise',
    confidence: Math.min(0.55 + noiseScore * 0.1, 0.95),
    reasons,
  };
}

function summarize(results: TriageResult[]): Summary {
  const summary: Summary = {
    actionable_bug: 0,
    likely_user_error: 0,
    likely_noise: 0,
    needs_review: 0,
  };

  for (const r of results) summary[r.classification.category] += 1;
  return summary;
}

function buildMarkdownReport(results: TriageResult[], lookbackHours: number): string {
  const summary = summarize(results);
  const now = new Date().toISOString();

  const lines: string[] = [];
  lines.push('# Sentry Triage Report');
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push(`Lookback: last ${lookbackHours}h`);
  lines.push(`Total issues: ${results.length}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- actionable_bug: ${summary.actionable_bug}`);
  lines.push(`- likely_user_error: ${summary.likely_user_error}`);
  lines.push(`- likely_noise: ${summary.likely_noise}`);
  lines.push(`- needs_review: ${summary.needs_review}`);

  const grouped = {
    actionable_bug: results.filter((r) => r.classification.category === 'actionable_bug'),
    likely_user_error: results.filter((r) => r.classification.category === 'likely_user_error'),
    likely_noise: results.filter((r) => r.classification.category === 'likely_noise'),
    needs_review: results.filter((r) => r.classification.category === 'needs_review'),
  };

  for (const [category, items] of Object.entries(grouped)) {
    lines.push('');
    lines.push(`## ${category}`);
    lines.push('');

    if (items.length === 0) {
      lines.push('_None_');
      continue;
    }

    for (const item of items) {
      const shortId = item.issue.shortId || item.issue.id;
      const title = item.issue.title || item.issue.metadata?.value || 'Untitled issue';
      const link = item.issue.permalink || `${item.project} / ${shortId}`;
      lines.push(`- [${shortId}](${link}) (${item.project}) — ${title}`);
      lines.push(
        `  - confidence: ${item.classification.confidence.toFixed(2)} | status: ${item.issue.status || 'unknown'} | events: ${item.issue.count || '0'}`,
      );
      if (item.classification.reasons.length > 0) {
        lines.push(`  - reasons: ${item.classification.reasons.slice(0, 4).join('; ')}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function buildTelegramSummary(results: TriageResult[], lookbackHours: number): string {
  const summary = summarize(results);
  const topActionable = results
    .filter((r) => r.classification.category === 'actionable_bug')
    .sort((a, b) => b.classification.confidence - a.classification.confidence)
    .slice(0, 5);

  const lines: string[] = [];
  lines.push(`🔥 Sentry triage (${lookbackHours}h)`);
  lines.push(`Total: ${results.length}`);
  lines.push(`Actionable: ${summary.actionable_bug} | User error: ${summary.likely_user_error} | Noise: ${summary.likely_noise} | Review: ${summary.needs_review}`);

  if (topActionable.length > 0) {
    lines.push('');
    lines.push('Top actionable:');
    for (const item of topActionable) {
      const shortId = item.issue.shortId || item.issue.id;
      const title = item.issue.title || item.issue.metadata?.value || 'Untitled issue';
      lines.push(`- ${shortId} (${item.project}) c=${item.classification.confidence.toFixed(2)}: ${title}`);
    }
  }

  return lines.join('\n');
}

async function sendTelegramSummary(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('Skipping Telegram summary: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing');
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body.slice(0, 400)}`);
  }

  console.log('Sent Telegram summary');
}

type GitHubIssue = {
  number: number;
  title: string;
  html_url: string;
};

type GitHubRepo = {
  default_branch: string;
};

type GitHubRef = {
  object: {
    sha: string;
  };
};

async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required for GitHub issue sync');

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body.slice(0, 400)}`);
  }

  return (await response.json()) as T;
}

function isSafeDraftFixCandidate(item: TriageResult): boolean {
  const title = (item.issue.title || '').toLowerCase();
  const value = (item.issue.metadata?.value || '').toLowerCase();
  const haystack = `${title}\n${value}`;

  return (
    haystack.includes('cannot read properties of undefined') ||
    haystack.includes('cannot read properties of null') ||
    haystack.includes('typeerror')
  );
}

async function ensureGitHubIssuesForActionable(results: TriageResult[], minConfidence: number): Promise<number> {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is required for GitHub issue sync');

  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`Invalid GITHUB_REPOSITORY format: ${repo}`);

  const actionable = results.filter(
    (r) => r.classification.category === 'actionable_bug' && r.classification.confidence >= minConfidence,
  );

  let created = 0;
  for (const item of actionable) {
    const shortId = item.issue.shortId || item.issue.id;
    const title = `[sentry] Investigate ${shortId}: ${item.issue.title || 'Untitled issue'}`;

    const search = await githubRequest<{ items: Array<{ number: number; title: string }> }>(
      `/search/issues?q=${encodeURIComponent(`repo:${repo} is:issue in:title "${shortId}" label:sentry-triage`)}`,
    );

    if (search.items.length > 0) continue;

    const body = [
      `Automated Sentry triage flagged this as likely actionable (confidence ${item.classification.confidence.toFixed(2)}).`,
      '',
      `- Project: ${item.project}`,
      `- Sentry issue: ${shortId}`,
      `- Link: ${item.issue.permalink || 'n/a'}`,
      `- Events: ${item.issue.count || '0'}`,
      `- Last seen: ${item.issue.lastSeen || 'n/a'}`,
      '',
      '### Heuristic signals',
      ...item.classification.reasons.map((r) => `- ${r}`),
      '',
      '### Next step',
      '- Investigate root cause and submit a fix PR if confirmed.',
    ].join('\n');

    await githubRequest<GitHubIssue>(`/repos/${owner}/${name}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        labels: ['bug', 'sentry-triage'],
      }),
    });

    created += 1;
  }

  return created;
}

async function ensureDraftFixPrsForActionable(
  results: TriageResult[],
  minConfidence: number,
  maxDraftFixPrs: number,
): Promise<number> {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is required for draft fix PR sync');

  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`Invalid GITHUB_REPOSITORY format: ${repo}`);

  const repoInfo = await githubRequest<GitHubRepo>(`/repos/${owner}/${name}`);
  const baseBranch = repoInfo.default_branch || 'main';
  const baseRef = await githubRequest<GitHubRef>(`/repos/${owner}/${name}/git/ref/heads/${baseBranch}`);

  const candidates = results
    .filter(
      (r) =>
        r.classification.category === 'actionable_bug' &&
        r.classification.confidence >= minConfidence &&
        isSafeDraftFixCandidate(r),
    )
    .slice(0, maxDraftFixPrs);

  let created = 0;

  for (const item of candidates) {
    const shortId = (item.issue.shortId || item.issue.id).replace(/[^a-zA-Z0-9-]/g, '-');

    const existing = await githubRequest<{ items: Array<{ number: number; title: string }> }>(
      `/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr in:title "${shortId}" "[sentry-autofix]"`)}`,
    );
    if (existing.items.length > 0) continue;

    const branch = `sentry-autofix/${shortId.toLowerCase()}`;

    try {
      await githubRequest(`/repos/${owner}/${name}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: baseRef.object.sha,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Reference already exists')) {
        throw error;
      }
    }

    const rawId = item.issue.shortId || item.issue.id;
    const planPath = `plans/sentry-autofix/${rawId.replace(/[^a-zA-Z0-9-]/g, '-')}.md`;
    const plan = [
      `# Sentry Autofix Attempt: ${rawId}`,
      '',
      `- Project: ${item.project}`,
      `- Sentry link: ${item.issue.permalink || 'n/a'}`,
      `- Confidence: ${item.classification.confidence.toFixed(2)}`,
      '',
      '## Why this is a safe candidate',
      '- TypeError / nullish access style issue detected',
      '- Candidate for defensive null/undefined guard',
      '',
      '## Suggested patch approach',
      '- Reproduce using stack trace and culprit path from Sentry',
      '- Add a narrow null/undefined guard at the faulting access',
      '- Preserve existing behavior for valid inputs',
      '- Add a regression test for the failing payload/path',
      '',
      '## Heuristic signals',
      ...item.classification.reasons.map((r) => `- ${r}`),
      '',
      '## Human review checklist',
      '- [ ] Confirm root cause in logs/stack',
      '- [ ] Confirm guard does not mask deeper invariant break',
      '- [ ] Add/verify tests',
      '- [ ] Merge only if behavior is correct',
      '',
    ].join('\n');

    await githubRequest(`/repos/${owner}/${name}/contents/${planPath}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `chore(sentry): add autofix attempt plan for ${rawId}`,
        content: Buffer.from(plan, 'utf8').toString('base64'),
        branch,
      }),
    });

    const prTitle = `[sentry-autofix] Draft fix attempt for ${rawId}`;
    const prBody = [
      'Automated draft PR for a safe Sentry autofix candidate.',
      '',
      `Sentry issue: ${item.issue.permalink || rawId}`,
      `Confidence: ${item.classification.confidence.toFixed(2)}`,
      '',
      'This PR currently contains a structured fix plan/checklist to keep automation conservative.',
      'Next step is implementing and validating the concrete code fix before merge.',
    ].join('\n');

    await githubRequest(`/repos/${owner}/${name}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: prTitle,
        head: branch,
        base: baseBranch,
        body: prBody,
        draft: true,
      }),
    });

    created += 1;
  }

  return created;
}

async function main() {
  const args = parseArgs();
  const lookbackHours = Number(args.hours || '24');
  const limitPerProject = Number(args.limit || '25');
  const minConfidence = Number(args.minConfidence || '0.85');
  const syncGitHubIssues = (args.syncGithubIssues || 'false') === 'true';
  const openDraftFixPrs = (args.openDraftFixPrs || 'false') === 'true';
  const maxDraftFixPrs = Number(args.maxDraftFixPrs || '1');
  const sendTelegram = (args.sendTelegram || 'false') === 'true';

  const credentialsPath = resolve(
    args.credentials || process.env.SENTRY_CREDENTIALS_PATH || '/root/.openclaw/credentials/sentry.json',
  );
  const outPath = resolve(args.out || `./reports/sentry-triage-${new Date().toISOString().slice(0, 10)}.md`);
  const outJsonPath = resolve(args.outJson || outPath.replace(/\.md$/, '.json'));

  const config = readConfig(credentialsPath);
  const statsPeriod = `${lookbackHours}h`;
  const onlyActiveInLookback = (args.onlyActiveInLookback || 'false') === 'true';

  const allResults: TriageResult[] = [];

  for (const project of config.projectSlugs) {
    const query = onlyActiveInLookback
      ? `is:unresolved statsPeriod:${statsPeriod}`
      : 'is:unresolved';

    const issues = await sentryGet<SentryIssue[]>(
      config,
      `/api/0/projects/${encodeURIComponent(config.orgSlug)}/${encodeURIComponent(project)}/issues/?query=${encodeURIComponent(query)}&limit=${limitPerProject}`,
    );

    for (const issue of issues) {
      allResults.push({
        project,
        issue,
        classification: classifyIssue(issue),
      });
    }
  }

  const markdown = buildMarkdownReport(allResults, lookbackHours);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown, 'utf8');

  const jsonPayload = {
    generatedAt: new Date().toISOString(),
    lookbackHours,
    projects: config.projectSlugs,
    summary: summarize(allResults),
    results: allResults,
  };
  writeFileSync(outJsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8');

  console.log(`Wrote markdown report: ${outPath}`);
  console.log(`Wrote JSON report: ${outJsonPath}`);
  console.log('Summary:', jsonPayload.summary);

  if (syncGitHubIssues) {
    const created = await ensureGitHubIssuesForActionable(allResults, minConfidence);
    console.log(`GitHub issue sync complete. Created: ${created}`);
  }

  if (openDraftFixPrs) {
    const created = await ensureDraftFixPrsForActionable(allResults, minConfidence, maxDraftFixPrs);
    console.log(`Draft fix PR sync complete. Created: ${created}`);
  }

  if (sendTelegram) {
    const telegramText = buildTelegramSummary(allResults, lookbackHours);
    await sendTelegramSummary(telegramText);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
