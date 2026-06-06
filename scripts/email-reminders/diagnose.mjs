import admin from 'firebase-admin';
import { parseIsraelDateTime, formatIsraelDateTime } from './israelTime.mjs';
import { getReminderWindow } from './reminderWindows.mjs';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(raw)),
});

const db = admin.firestore();
const now = new Date();

function parseDeadline(value) {
  const date = parseIsraelDateTime(value);
  return isNaN(date.getTime()) ? null : date;
}

function hoursLabel(ms) {
  const h = ms / (60 * 60 * 1000);
  return `${h.toFixed(2)}h`;
}

console.log('=== Email reminders diagnostic ===');
console.log('Now (UTC):', now.toISOString());
console.log('RESEND_API_KEY set:', Boolean(process.env.RESEND_API_KEY));
console.log('EMAIL_FROM:', process.env.EMAIL_FROM ?? '(default)');
console.log('APP_URL:', process.env.APP_URL ?? '(default)');

const configDoc = await db.doc('config/season').get();
const config = configDoc.data() ?? {};
console.log('\n--- Season config ---');
console.log('config exists:', configDoc.exists);
console.log('activeSeasonId:', config.activeSeasonId ?? '(missing)');
console.log('seasonOpen:', config.seasonOpen);

const subscribersSnap = await db.collection('users').where('emailReminders', '==', true).get();
console.log('\n--- Subscribers ---');
console.log('count:', subscribersSnap.size);
for (const doc of subscribersSnap.docs) {
  const data = doc.data();
  console.log(`  - ${data.email ?? '(no email)'} (${data.displayName ?? doc.id})`);
}

const seasonId = config.activeSeasonId;
if (!seasonId) {
  console.log('\nNo activeSeasonId — reminders will not run.');
  process.exit(0);
}

const seasonDoc = await db.doc(`season/${seasonId}`).get();
const seasonData = seasonDoc.data() ?? {};

if (seasonData.seasonStart) {
  const deadline = parseDeadline(seasonData.seasonStart);
  if (deadline) {
    const msUntil = deadline.getTime() - now.getTime();
    const window = getReminderWindow(msUntil);
    console.log('\n--- Pre-season ---');
    console.log('seasonStart:', formatIsraelDateTime(deadline), `(${hoursLabel(msUntil)} until close)`);
    console.log('reminder window now:', window ?? 'none');
    if (window) {
      const reminderId = `preseason:${seasonId}:seasonStart:${window}`;
      console.log('already sent:', (await db.doc(`emailReminderLog/${reminderId}`).get()).exists, `(${reminderId})`);
    }
  }
}

const roundsSnap = await db.collection(`season/${seasonId}/rounds`).get();
console.log('\n--- Rounds (betting closes at round.startTime, not match time) ---');

for (const roundDoc of roundsSnap.docs) {
  const data = roundDoc.data();
  if (!data.startTime) {
    console.log(`  Round ${roundDoc.id}: no startTime set — no deadline reminders`);
    continue;
  }

  const deadline = parseDeadline(data.startTime);
  if (!deadline) {
    console.log(`  Round ${roundDoc.id}: invalid startTime`, data.startTime);
    continue;
  }

  const msUntil = deadline.getTime() - now.getTime();
  if (msUntil <= 0) {
    console.log(`  Round ${roundDoc.id}: CLOSED (${formatIsraelDateTime(deadline)})`);
    continue;
  }

  const window = getReminderWindow(msUntil);
  const name = data.name?.trim() || `מחזור ${roundDoc.id}`;
  console.log(`  Round ${roundDoc.id} (${name}): closes ${formatIsraelDateTime(deadline)} — ${hoursLabel(msUntil)} left — window: ${window ?? 'none'}`);

  if (window) {
    const reminderId = `round:${seasonId}:${roundDoc.id}:${window}`;
    console.log(`    already sent: ${(await db.doc(`emailReminderLog/${reminderId}`).get()).exists} (${reminderId})`);
  }
}

console.log('\n=== Done ===');
