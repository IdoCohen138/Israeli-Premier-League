import { isDryRunEnv } from './dryRun.mjs';

function assertDryRun(value, expected, label) {
  if (isDryRunEnv(value) !== expected) {
    throw new Error(`${label}: expected ${expected}`);
  }
}

assertDryRun('1', true, '1');
assertDryRun('true', true, 'true');
assertDryRun('TRUE', true, 'TRUE');
assertDryRun('false', false, 'false');
assertDryRun('0', false, '0');
assertDryRun(undefined, false, 'undefined');
assertDryRun('', false, 'empty');

console.log('dryRun tests passed');
