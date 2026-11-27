const assert = require('node:assert/strict');
const fs = require('node:fs');

function verify(env) {
  assert.ok(['true', 'false'].includes(env.EXPECT_FAILURE), 'Invalid scenario');
  const fail = env.EXPECT_FAILURE === 'true';
  assert.equal(env.BROWSER_JOB_RESULT, 'success', 'Browser setup/contract check failed');
  assert.equal(env.BROWSER_RESULT, fail ? 'failure' : 'success', 'Wrong browser outcome');
  assert.equal(env.CLASSIFICATION, fail ? 'intentional_failure' : 'success',
    'Infrastructure errors must not count as the expected browser failure');
  if (fail) {
    assert.equal(env.RELEASE_MARKER || '', '', 'Failed browser test allowed publication');
    // GitHub may skip the entire reusable call when its only job is skipped.
    const skipped = env.RELEASE_RESULT === 'skipped' ||
      (env.PUBLICATION_RESULT === 'skipped' && !env.RELEASE_RESULT);
    assert.ok(skipped, 'Publication job must be skipped');
    assert.ok(['success', 'skipped'].includes(env.PUBLICATION_RESULT), 'Publication workflow errored');
  } else {
    assert.equal(env.PUBLICATION_RESULT, 'success');
    assert.equal(env.RELEASE_RESULT, 'success');
    assert.equal(env.RELEASE_MARKER, 'RELEASE_GATE_CANARY_EXECUTED', 'Publication never ran');
  }
}

if (require.main === module) {
  const evidence = Object.fromEntries([
    'EXPECT_FAILURE', 'BROWSER_JOB_RESULT', 'BROWSER_RESULT', 'CLASSIFICATION',
    'PUBLICATION_RESULT', 'RELEASE_RESULT', 'RELEASE_MARKER'
  ].map(key => [key, process.env[key] || '']));
  try {
    verify(evidence);
    evidence.verified = true;
  } catch (error) {
    evidence.verified = false;
    evidence.error = error.message;
    process.exitCode = 1;
  }
  fs.mkdirSync('test-output', { recursive: true });
  fs.writeFileSync('test-output/release-gate.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Release gate: ${evidence.EXPECT_FAILURE === 'true' ? 'failing' : 'passing'} browser\n\n` +
      '```json\n' + JSON.stringify(evidence, null, 2) + '\n```\n');
  }
}

module.exports = { verify };
