import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { extractActualResult, extractMetadata } from '../helpers/test-metadata.js';
import type {
  ExecutionStatus,
  TestExecutionRecord,
} from '../types/test-report.js';

export interface CsvReporterOptions {
  outputFile?: string;
  summaryFile?: string;
  environmentName?: string;
}

export const CSV_HEADER = [
  'Test ID',
  'Module',
  'Test Case',
  'Test Type',
  'Priority',
  'Preconditions',
  'Execution Status',
  'Expected Result',
  'Actual Result',
  'Error Details',
  'Duration (ms)',
  'Execution Date',
  'Environment',
  'Run ID',
  'Commit SHA',
  'Branch',
  'Execution Attempt',
].join(',');

function getGitMetadata(): { commitSha: string; branch: string } {
  let commitSha = process.env.GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
  let branch = process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || '';

  if (!commitSha || !branch) {
    try {
      if (!commitSha) {
        commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      }
      if (!branch) {
        branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      }
    } catch {
      commitSha = commitSha || 'local-worktree';
      branch = branch || 'feat/playwright-test-suite';
    }
  }

  return { commitSha, branch };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatRecordToCsvRow(record: TestExecutionRecord): string {
  return [
    escapeCsvCell(record.testId),
    escapeCsvCell(record.module),
    escapeCsvCell(record.testCase),
    escapeCsvCell(record.testType),
    escapeCsvCell(record.priority),
    escapeCsvCell(record.preconditions),
    escapeCsvCell(record.executionStatus),
    escapeCsvCell(record.expectedResult),
    escapeCsvCell(record.actualResult),
    escapeCsvCell(record.errorDetails),
    escapeCsvCell(record.durationMs),
    escapeCsvCell(record.executionDate),
    escapeCsvCell(record.environment),
    escapeCsvCell(record.runId),
    escapeCsvCell(record.commitSha),
    escapeCsvCell(record.branch),
    escapeCsvCell(record.executionAttempt),
  ].join(',');
}

export default class PlaywrightCsvReporter implements Reporter {
  private records: TestExecutionRecord[] = [];
  private outputFile: string;
  private summaryFile: string;
  private environmentName: string;
  private runId: string;
  private commitSha: string;
  private branch: string;

  constructor(options: CsvReporterOptions = {}) {
    this.outputFile = options.outputFile || 'test-results/execution-report.csv';
    this.summaryFile = options.summaryFile || 'test-results/summary.md';
    this.environmentName =
      options.environmentName ||
      process.env.TEST_ENV ||
      (process.env.CI ? 'CI' : 'Local');

    const git = getGitMetadata();
    this.commitSha = git.commitSha;
    this.branch = git.branch;
    this.runId = process.env.TEST_RUN_ID || `RUN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.records = [];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const meta = extractMetadata(test.annotations);
    const observedActual = extractActualResult(test.annotations);

    let executionStatus: ExecutionStatus = 'PASS';
    if (result.status === 'passed') {
      executionStatus = 'PASS';
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      executionStatus = 'FAIL';
    } else if (result.status === 'skipped') {
      executionStatus = 'SKIPPED';
    } else if (result.status === 'interrupted') {
      executionStatus = 'BLOCKED';
    }

    const testId = meta?.testId || `TC-AUTO-${test.id}`;
    const moduleName =
      meta?.module ||
      path.basename(test.location.file, path.extname(test.location.file));

    // For non-annotated tests (like responsive density sweeps), use full hierarchy to prevent duplicate titles
    const hierarchy = test.titlePath().slice(1).join(' › ');
    const testCaseTitle = meta?.testCase || (hierarchy.length > 0 ? hierarchy : test.title);
    const testType = meta?.testType || 'UI Browser';
    const priority = meta?.priority || 'P1';
    const preconditions = meta?.preconditions || 'Application initialized in test environment';
    const expectedResult = meta?.expectedResult || `Expected to verify: ${test.title}`;

    let actualResult = observedActual || (meta?.expectedResult ? `Verified: ${meta.expectedResult}` : `Assertion satisfied: verified "${test.title}" rendered and validated as expected.`);
    let errorDetails = '';

    if (executionStatus === 'FAIL') {
      const firstError = result.errors?.[0];
      const message = firstError?.message || 'Test assertion failed';
      actualResult = message.split('\n')[0] || 'Test assertion failed';
      errorDetails = result.errors
        .map((e) => e.stack || e.message || String(e))
        .join('\n---\n');
    } else if (executionStatus === 'SKIPPED') {
      actualResult = 'Test skipped during test execution run.';
    } else if (executionStatus === 'BLOCKED') {
      actualResult = 'Test execution was interrupted or blocked.';
    }

    const executionAttempt = result.retry > 0 ? `Attempt ${result.retry + 1} (Retry #${result.retry})` : 'Attempt 1';

    const record: TestExecutionRecord = {
      testId,
      module: moduleName,
      testCase: testCaseTitle,
      testType,
      priority,
      preconditions,
      executionStatus,
      expectedResult,
      actualResult,
      errorDetails,
      durationMs: Math.round(result.duration),
      executionDate: new Date().toISOString(),
      environment: this.environmentName,
      runId: this.runId,
      commitSha: this.commitSha,
      branch: this.branch,
      executionAttempt,
    };

    this.records.push(record);
  }

  onEnd(_result: FullResult): void {
    const outPath = path.resolve(process.cwd(), this.outputFile);
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const rows = [CSV_HEADER, ...this.records.map(formatRecordToCsvRow)];
    fs.writeFileSync(outPath, rows.join('\n') + '\n', 'utf-8');

    // Generate markdown summary
    const summaryPath = path.resolve(process.cwd(), this.summaryFile);
    const passCount = this.records.filter((r) => r.executionStatus === 'PASS').length;
    const failCount = this.records.filter((r) => r.executionStatus === 'FAIL').length;
    const skipCount = this.records.filter((r) => r.executionStatus === 'SKIPPED').length;
    const blockedCount = this.records.filter((r) => r.executionStatus === 'BLOCKED').length;
    const retriesCount = this.records.filter((r) => r.executionAttempt.includes('Retry')).length;
    const uniqueTestIds = new Set(this.records.map((r) => r.testId)).size;

    const summaryContent = `# Test Run Execution Summary

- **Run ID**: \`${this.runId}\`
- **Commit SHA**: \`${this.commitSha}\`
- **Branch**: \`${this.branch}\`
- **Environment**: \`${this.environmentName}\`
- **Generated At**: ${new Date().toISOString()}

## Totals
- **Total Records Logged**: ${this.records.length}
- **Unique Test Scenarios**: ${uniqueTestIds}
- **Retried Attempts**: ${retriesCount}
- **Status Counts**: PASS: ${passCount} | FAIL: ${failCount} | SKIPPED: ${skipCount} | BLOCKED: ${blockedCount}
`;
    fs.writeFileSync(summaryPath, summaryContent, 'utf-8');
  }
}
