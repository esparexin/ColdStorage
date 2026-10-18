export type ExecutionStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'BLOCKED';

export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';

export type TestCategory = 'UI Browser' | 'API Integration' | 'E2E Flow' | 'Contract Validation';

export interface TestCaseMetadata {
  testId: string;
  module: string;
  testCase: string;
  testType: TestCategory;
  priority: PriorityLevel;
  preconditions: string;
  expectedResult: string;
  actualResult?: string;
}

export interface TestExecutionRecord extends TestCaseMetadata {
  executionStatus: ExecutionStatus;
  actualResult: string;
  errorDetails: string;
  durationMs: number;
  executionDate: string;
  environment: string;
  runId: string;
  commitSha: string;
  branch: string;
  executionAttempt: string;
}
