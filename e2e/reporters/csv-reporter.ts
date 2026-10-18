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
import { extractMetadata } from '../helpers/test-metadata.js';
import type {
  ExecutionStatus,
  TestExecutionRecord,
} from '../types/test-report.js';

export interface CsvReporterOptions {
  outputFile?: string;
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
].join(',');

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
  ].join(',');
}

export default class PlaywrightCsvReporter implements Reporter {
  private records: TestExecutionRecord[] = [];
  private outputFile: string;
  private environmentName: string;

  constructor(options: CsvReporterOptions = {}) {
    this.outputFile = options.outputFile || 'test-results/execution-report.csv';
    this.environmentName =
      options.environmentName ||
      process.env.TEST_ENV ||
      (process.env.CI ? 'CI' : 'Local');
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.records = [];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const meta = extractMetadata(test.annotations);

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
    const testCaseTitle = meta?.testCase || test.title;
    const testType = meta?.testType || 'UI Browser';
    const priority = meta?.priority || 'P1';
    const preconditions = meta?.preconditions || 'Application initialized in test environment';
    const expectedResult = meta?.expectedResult || 'Assertions pass without error';

    let actualResult = 'Execution completed successfully with all assertions satisfied.';
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
    };

    this.records.push(record);
  }

  onEnd(_result: FullResult): void {
    const absolutePath = path.resolve(process.cwd(), this.outputFile);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const rows = [CSV_HEADER, ...this.records.map(formatRecordToCsvRow)];
    fs.writeFileSync(absolutePath, rows.join('\n') + '\n', 'utf-8');
  }
}
