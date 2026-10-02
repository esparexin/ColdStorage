import { danger, warn, fail, message } from 'danger';

// 1. Pull Request Description Check
if (danger.github && danger.github.pr) {
  const prBody = danger.github.pr.body ?? '';
  if (prBody.trim().length < 20) {
    warn('Please provide a descriptive summary of your changes in the PR description.');
  }

  // 2. PR Size Governance (Enforces small, reviewable PRs)
  const totalChanges = danger.github.pr.additions + danger.github.pr.deletions;
  if (totalChanges > 500) {
    warn(
      `PR size warning: ${totalChanges} lines changed. ColdStorage governance mandates small, reviewable pull-request sized changes (< 500 lines).`
    );
  }
}

// 3. Package and Lockfile Synchronicity
const modifiedFiles = danger.git.modified_files;
const createdFiles = danger.git.created_files;
const allChangedFiles = [...modifiedFiles, ...createdFiles];

const packageChanged = modifiedFiles.includes('package.json');
const lockfileChanged = modifiedFiles.includes('package-lock.json');

if (packageChanged && !lockfileChanged) {
  fail('Changes were made to `package.json`, but not to `package-lock.json`. Run `npm install` to update the lockfile.');
}

// 4. Governance & Architecture Lock Check
if (allChangedFiles.includes('docs/00-p0-lock.md')) {
  warn('This PR modifies `docs/00-p0-lock.md`. Any architecture lock modifications require explicit sign-off.');
}

if (allChangedFiles.includes('scripts/line-budget-baseline.json')) {
  message('Line-budget baseline was modified. Verify that baseline files only decreased in size and no files grew.');
}

// 5. Test Coverage Verification for Source Changes
const hasSourceChanges = allChangedFiles.some(
  (file) =>
    file.startsWith('packages/') &&
    (file.endsWith('.ts') || file.endsWith('.tsx')) &&
    !file.includes('.test.') &&
    !file.includes('.spec.')
);

const hasTestChanges = allChangedFiles.some(
  (file) => file.includes('.test.ts') || file.includes('.test.tsx') || file.includes('.spec.ts')
);

if (hasSourceChanges && !hasTestChanges) {
  warn('Source code in `packages/` was added or modified without corresponding test files. Please ensure test coverage.');
}
