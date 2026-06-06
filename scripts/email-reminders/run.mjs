import admin from 'firebase-admin';
import { processBetDeadlineReminders } from './reminders.mjs';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT environment variable');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(raw);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT must be valid JSON');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

try {
  await processBetDeadlineReminders();
} catch (error) {
  console.error('Reminder job failed:', error);
  process.exit(1);
}
