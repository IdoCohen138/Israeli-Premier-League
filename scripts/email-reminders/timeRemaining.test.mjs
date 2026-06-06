import { formatRemainingSentence } from './timeRemaining.mjs';

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

const h23m50 = (23 * 60 + 50) * 60 * 1000;
const m54 = 54 * 60 * 1000;

assertEqual(
  formatRemainingSentence(h23m50, 'הימורי מחזור 12'),
  'נותרו כ־23 שעות ו־50 דקות לסגירת הימורי מחזור 12',
  '23h50m'
);

assertEqual(
  formatRemainingSentence(m54, 'הימורי מחזור 12'),
  'נותרו כ־54 דקות לסגירת הימורי מחזור 12',
  '54m'
);

assertEqual(
  formatRemainingSentence(60 * 60 * 1000, 'ההימורים המקדימים'),
  'נותרה כשעה לסגירת ההימורים המקדימים',
  '1h exact'
);

console.log('timeRemaining tests passed');
