import type { TestInfo } from '@playwright/test';
import type { TestCaseMetadata } from '../types/test-report.js';

export const METADATA_ANNOTATION_TYPE = 'test-case-metadata';
export const ACTUAL_RESULT_ANNOTATION_TYPE = 'test-actual-result';

/**
 * Annotates a Playwright test with structured catalog metadata so the
 * custom CSV reporter can extract and report it.
 */
export function annotateTest(testInfo: TestInfo, metadata: TestCaseMetadata): void {
  testInfo.annotations.push({
    type: METADATA_ANNOTATION_TYPE,
    description: JSON.stringify(metadata),
  });
  if (metadata.actualResult) {
    recordActualResult(testInfo, metadata.actualResult);
  }
}

/**
 * Records explicit observable actual result / evidence for this test execution.
 */
export function recordActualResult(testInfo: TestInfo, actualResult: string): void {
  const existing = testInfo.annotations.find((a) => a.type === ACTUAL_RESULT_ANNOTATION_TYPE);
  if (existing) {
    existing.description = actualResult;
  } else {
    testInfo.annotations.push({
      type: ACTUAL_RESULT_ANNOTATION_TYPE,
      description: actualResult,
    });
  }
}

/**
 * Extracts structured metadata from Playwright test annotations if present.
 */
export function extractMetadata(annotations: Array<{ type: string; description?: string }>): TestCaseMetadata | null {
  const metaAnnotation = annotations.find((a) => a.type === METADATA_ANNOTATION_TYPE);
  if (!metaAnnotation?.description) {
    return null;
  }
  try {
    return JSON.parse(metaAnnotation.description) as TestCaseMetadata;
  } catch {
    return null;
  }
}

/**
 * Extracts observed actual result if recorded by the test.
 */
export function extractActualResult(annotations: Array<{ type: string; description?: string }>): string | null {
  const ann = annotations.find((a) => a.type === ACTUAL_RESULT_ANNOTATION_TYPE);
  return ann?.description || null;
}
