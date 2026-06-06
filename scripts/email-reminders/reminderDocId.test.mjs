import { reminderDocId } from './reminders.mjs';

const reminder = {
  kind: 'round',
  seasonId: '2025-2026',
  targetId: '5',
  window: '24h',
};

const id = reminderDocId('abc123', reminder);
if (id !== 'abc123:round:2025-2026:5:24h') {
  throw new Error(`unexpected id: ${id}`);
}

console.log('reminderDocId tests passed');
