import type { TestInfo } from '@playwright/test';
import type { TestCaseMetadata } from '../types/test-report.js';

export const METADATA_ANNOTATION_TYPE = 'test-case-metadata';

/**
 * Annotates a Playwright test with structured catalog metadata so the
 * custom CSV reporter can extract and report it.
 */
export function annotateTest(testInfo: TestInfo, metadata: TestCaseMetadata): void {
  testInfo.annotations.push({
    type: METADATA_ANNOTATION_TYPE,
    description: JSON.stringify(metadata),
  });
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
