const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { verify } = require('../scripts/ci/verify-release-gate.cjs');
const read = name => YAML.parse(fs.readFileSync(path.join(__dirname, '../.github/workflows', name), 'utf8'));

function checkRelease(release) {
  assert.deepEqual(release.on, { push: { tags: ['v*'] } });
  assert.deepEqual(Object.keys(release.jobs).sort(), ['checks', 'release']);
  assert.deepEqual(release.jobs.checks, { uses: './.github/workflows/test.yml' });
  assert.deepEqual(release.jobs.release, {
    needs: 'checks', permissions: { contents: 'write' },
    uses: './.github/workflows/release-publish.yml',
    with: { checks_result: '${{ needs.checks.result }}', dry_run: false }
  });
}

test('real releases use the tested publication workflow and require the complete test suite', () => {
  checkRelease(read('release.yml'));
  const tests = read('test.yml');
  for (const job of Object.values(tests.jobs)) {
    assert.ok(!job['continue-on-error']);
    assert.ok(!job.if, 'Test jobs must not be conditionally skipped');
    for (const step of job.steps) assert.ok(!step['continue-on-error']);
  }
  assert.ok(tests.jobs.browser.steps.some(step => step.run?.includes('npm run test:browser')));
});

test('contract catches release dependency bypass and hardcoded success', () => {
  for (const mutate of [
    workflow => { delete workflow.jobs.release.needs; },
    workflow => { workflow.jobs.release.with.checks_result = 'success'; },
    workflow => { workflow.jobs.release.if = 'always()'; },
    workflow => { workflow.jobs.checks.uses = './.github/workflows/release-gate-test.yml'; }
  ]) {
    const workflow = read('release.yml');
    mutate(workflow);
    assert.throws(() => checkRelease(workflow));
  }
});

test('dry runs cannot execute any real publication step and have read-only permissions', () => {
  const shared = read('release-publish.yml');
  assert.equal(shared.on.workflow_call.inputs.dry_run.default, true);
  assert.equal(shared.permissions, undefined, 'Permissions must be inherited from caller');
  assert.deepEqual(Object.keys(shared.jobs), ['release']);
  assert.equal(shared.jobs.release.permissions, undefined);
  const steps = shared.jobs.release.steps;
  const canary = steps.find(step => step.id === 'canary');
  assert.equal(canary.if, '${{ inputs.dry_run }}');
  assert.equal(canary.run, 'echo "marker=RELEASE_GATE_CANARY_EXECUTED" >> "$GITHUB_OUTPUT"');
  for (const step of steps.filter(step => step !== canary)) {
    assert.equal(step.if, '${{ !inputs.dry_run }}');
  }
  for (const name of ['release-gate-test.yml', 'release-gate-case.yml']) {
    const workflow = read(name);
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    for (const job of Object.values(workflow.jobs)) assert.equal(job.permissions, undefined);
  }
  const scenario = read('release-gate-case.yml');
  assert.deepEqual(scenario.jobs.publication, {
    needs: 'browser', uses: './.github/workflows/release-publish.yml',
    with: { checks_result: '${{ needs.browser.outputs.result }}', dry_run: true }
  });
  assert.equal(scenario.jobs.browser.outputs.result, '${{ steps.probe.outcome }}');
});

test('workflow changes automatically run both release gate scenarios', () => {
  const workflow = read('release-gate-test.yml');
  for (const event of ['push', 'pull_request']) {
    assert.ok(workflow.on[event].paths.includes('.github/workflows/**'));
  }
  assert.deepEqual(Object.values(workflow.jobs).map(job => job.with.expect_failure).sort(), [false, true]);
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job.uses, './.github/workflows/release-gate-case.yml');
  }
});

const passing = {
  EXPECT_FAILURE: 'false', BROWSER_JOB_RESULT: 'success', BROWSER_RESULT: 'success',
  CLASSIFICATION: 'success', PUBLICATION_RESULT: 'success', RELEASE_RESULT: 'success',
  RELEASE_MARKER: 'RELEASE_GATE_CANARY_EXECUTED'
};
const failing = {
  EXPECT_FAILURE: 'true', BROWSER_JOB_RESULT: 'success', BROWSER_RESULT: 'failure',
  CLASSIFICATION: 'intentional_failure', PUBLICATION_RESULT: 'success',
  RELEASE_RESULT: 'skipped', RELEASE_MARKER: ''
};

test('verifier accepts passing and deliberately failing browser scenarios', () => {
  verify(passing);
  verify(failing);
  verify({ ...failing, PUBLICATION_RESULT: 'skipped', RELEASE_RESULT: '' });
});

test('verifier rejects publication after failure, missing publication and infrastructure errors', () => {
  for (const evidence of [
    { ...failing, RELEASE_MARKER: passing.RELEASE_MARKER },
    { ...failing, RELEASE_RESULT: 'success' },
    { ...failing, CLASSIFICATION: '' },
    { ...failing, BROWSER_JOB_RESULT: 'failure' },
    { ...failing, PUBLICATION_RESULT: 'failure' },
    { ...failing, BROWSER_RESULT: 'success' },
    { ...passing, RELEASE_MARKER: '' },
    { ...passing, PUBLICATION_RESULT: 'skipped' },
    { ...passing, RELEASE_RESULT: 'failure' }
  ]) assert.throws(() => verify(evidence));
});
