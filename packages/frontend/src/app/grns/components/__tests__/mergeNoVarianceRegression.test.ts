import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as summaryHelper from '../mergeConfirmSummary.helper';

describe('Merge Step 4 Repacking Net Variance Removal Regression Tests', () => {
  const componentsDir = path.resolve(__dirname, '..');
  const step4SectionPath = path.join(componentsDir, 'MergeStep4RepackSection.tsx');
  const confirmSummaryPath = path.join(componentsDir, 'MergeConfirmSummary.tsx');
  const confirmHelperPath = path.join(componentsDir, 'mergeConfirmSummary.helper.ts');

  it('confirms MergeStep4RepackSection.tsx never renders Repacking Net Variance or variance labels', () => {
    const source = fs.readFileSync(step4SectionPath, 'utf-8');

    // Regression check: Variance UI elements and labels must never be present
    expect(source).not.toContain('Repacking Net Variance');
    expect(source).not.toContain('Repack Net Variance');
    expect(source).not.toContain('Smaller Packaging');
    expect(source).not.toContain('Shrinkage / Loss');

    // Regression check: Core operational metrics MUST remain present
    expect(source).not.toContain('Consolidated Stock Pool:');
    expect(source).toContain('Physical Repacked Total:');
    expect(source).toContain('Repacking Hamali Labor:');
  });

  it('confirms MergeConfirmSummary.tsx never renders Repack Net Variance or uses variance helpers', () => {
    const source = fs.readFileSync(confirmSummaryPath, 'utf-8');

    // Regression check: Variance summary row and helpers must never be present
    expect(source).not.toContain('Repack Net Variance');
    expect(source).not.toContain('Repacking Net Variance');
    expect(source).not.toContain('formatRepackVariance');
    expect(source).not.toContain('warningValue');

    // Regression check: Summary card must retain required confirmation items
    expect(source).toContain('Target GRN (Surviving)');
    expect(source).toContain('Source GRN(s) (Closing)');
    expect(source).toContain('Repacked Composition');
    expect(source).toContain('Repacking Labor Hamali');
    expect(source).toContain('Consolidated Stock Pool');
  });

  it('confirms mergeConfirmSummary.helper.ts does not export formatRepackVariance or RepackVarianceResult', () => {
    const source = fs.readFileSync(confirmHelperPath, 'utf-8');

    expect(source).not.toContain('formatRepackVariance');
    expect(source).not.toContain('RepackVarianceResult');
    expect((summaryHelper as Record<string, unknown>).formatRepackVariance).toBeUndefined();
  });

  it('verifies remaining summary helpers produce clean composition and hamali without variance', () => {
    // 38 Consolidated Bags -> 54 Repacked S/B Bags
    const composition = summaryHelper.formatRepackComposition(true, 'S/B', 25, 29, 54, 30, 38);
    expect(composition).toBe('25 Small / 29 Big (54 Total)');
    expect(composition).not.toContain('Variance');
    expect(composition).not.toContain('Smaller');
    expect(composition).not.toContain('Shrinkage');

    // Repacking hamali formatting
    const hamali = summaryHelper.formatRepackHamali(1350, 54, 25);
    expect(hamali).toBe('₹1,350.00 (54 bags @ ₹25/bag)');
    expect(hamali).not.toContain('Variance');
  });
});
