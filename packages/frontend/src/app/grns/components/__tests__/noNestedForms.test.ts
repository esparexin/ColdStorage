import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Nested Form Prevention Governance', () => {
  const grnComponentsDir = path.resolve(__dirname, '..');
  const frontendSrcDir = path.resolve(__dirname, '../../../../');

  it('TransferStep1Customer does not render CustomerFormModal or <form>', () => {
    const step1FilePath = path.join(grnComponentsDir, 'TransferStep1Customer.tsx');
    const content = fs.readFileSync(step1FilePath, 'utf-8');

    // TransferStep1Customer must not directly render CustomerFormModal inside its template
    expect(content).not.toContain('<CustomerFormModal');
    expect(content).not.toContain('<form');
  });

  it('InternalMovementTransferTab renders CustomerFormModal and ConfirmDialog outside <form>', () => {
    const tabFilePath = path.join(grnComponentsDir, 'InternalMovementTransferTab.tsx');
    const content = fs.readFileSync(tabFilePath, 'utf-8');

    // Find closing </form>
    const formCloseIdx = content.indexOf('</form>');
    expect(formCloseIdx).toBeGreaterThan(-1);

    // ConfirmDialog must appear after </form>
    const confirmDialogIdx = content.indexOf('<ConfirmDialog');
    expect(confirmDialogIdx).toBeGreaterThan(formCloseIdx);

    // CustomerFormModal must appear after </form>
    const customerModalIdx = content.indexOf('<CustomerFormModal');
    expect(customerModalIdx).toBeGreaterThan(formCloseIdx);
  });

  it('No component rendered inside a <form> in frontend contains another <form>', () => {
    // Scan all files containing <form
    const filesWithForms = [
      'app/grns/components/InternalMovementTransferTab.tsx',
      'app/grns/components/InternalMovementMergeTab.tsx',
      'app/grns/components/CreateGrnModal.tsx',
    ];

    for (const relFile of filesWithForms) {
      const fullPath = path.join(frontendSrcDir, relFile);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Extract content within <form ...> ... </form>
      const formMatch = content.match(/<form\b[^>]*>([\s\S]*?)<\/form>/);
      if (formMatch) {
        const innerContent = formMatch[1];
        // Ensure no nested <form> tag exists inside the form body
        expect(innerContent).not.toMatch(/<form\b/);
        // Ensure sub-modals that own forms are not placed inside the form body
        expect(innerContent).not.toMatch(/<(CustomerFormModal|CommodityFormModal|FacilityFormModal)\b/);
      }
    }
  });
});
