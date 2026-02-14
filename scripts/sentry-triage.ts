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

function summarize(results: TriageResult[]) {
  const summary = {
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

async function main() {
  const args = parseArgs();
  const lookbackHours = Number(args.hours || '24');
  const limitPerProject = Number(args.limit || '25');
  const credentialsPath = resolve(
    args.credentials || process.env.SENTRY_CREDENTIALS_PATH || '/root/.openclaw/credentials/sentry.json',
  );
  const outPath = resolve(args.out || `./reports/sentry-triage-${new Date().toISOString().slice(0, 10)}.md`);
  const outJsonPath = resolve(args.outJson || outPath.replace(/\.md$/, '.json'));

  const config = readConfig(credentialsPath);
  const statsPeriod = `${lookbackHours}h`;

  const allResults: TriageResult[] = [];

  for (const project of config.projectSlugs) {
    const issues = await sentryGet<SentryIssue[]>(
      config,
      `/api/0/projects/${encodeURIComponent(config.orgSlug)}/${encodeURIComponent(project)}/issues/?query=is:unresolved+statsPeriod:${encodeURIComponent(statsPeriod)}&limit=${limitPerProject}`,
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
