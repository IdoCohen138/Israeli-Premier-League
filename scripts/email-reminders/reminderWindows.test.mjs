import { getReminderWindow } from './reminderWindows.mjs';

function minutes(m) {
  return m * 60 * 1000;
}

function hours(h, m = 0) {
  return (h * 60 + m) * 60 * 1000;
}

function assertWindow(msUntil, expected, label) {
  const actual = getReminderWindow(msUntil);
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected ?? 'null'}, got ${actual ?? 'null'}`);
  }
}

assertWindow(hours(24, 25), '24h', '24:25');
assertWindow(hours(23, 40), '24h', '23:40');
assertWindow(hours(10), null, '10:00');
assertWindow(minutes(70), '1h', '1:10');
assertWindow(minutes(50), '1h', '0:50');
assertWindow(minutes(30), null, '0:30');
assertWindow(hours(24, 45), '24h', '24:45 inclusive max');
assertWindow(hours(23, 30), null, '23:30 exclusive min');
assertWindow(minutes(45), null, '45 min exclusive min');
assertWindow(minutes(75), '1h', '75 min inclusive max');
assertWindow(minutes(90), null, '90 min — no 1h');

console.log('reminderWindows tests passed');
