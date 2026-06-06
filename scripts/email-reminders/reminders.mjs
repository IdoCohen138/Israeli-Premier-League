import admin from 'firebase-admin';
import { formatIsraelDateTime, parseIsraelDateTime } from './israelTime.mjs';
import { sendEmail } from './email.mjs';

const MS_24H = 24 * 60 * 60 * 1000;
const MS_1H = 60 * 60 * 1000;
const WINDOW_TOLERANCE_MS = 20 * 60 * 1000;

function getDb() {
  return admin.firestore();
}

function getReminderWindow(msUntilDeadline) {
  if (msUntilDeadline <= 0) return null;

  if (msUntilDeadline > MS_24H - WINDOW_TOLERANCE_MS && msUntilDeadline <= MS_24H + WINDOW_TOLERANCE_MS) {
    return '24h';
  }

  if (msUntilDeadline > MS_1H - WINDOW_TOLERANCE_MS && msUntilDeadline <= MS_1H + WINDOW_TOLERANCE_MS) {
    return '1h';
  }

  return null;
}

function reminderDocId(reminder) {
  return `${reminder.kind}:${reminder.seasonId}:${reminder.targetId}:${reminder.window}`;
}

function windowLabel(window) {
  return window === '24h' ? '24 שעות' : 'שעה';
}

function buildEmailHtml(subscriber, reminder, appUrl) {
  const greeting = subscriber.displayName ? `שלום ${subscriber.displayName},` : 'שלום,';
  const deadlineText = formatIsraelDateTime(reminder.deadline);
  const timeLeft = windowLabel(reminder.window);
  const link = `${appUrl.replace(/\/$/, '')}${reminder.linkPath}`;

  return `
    <div dir="rtl" style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <p>
        נשארו <strong>${timeLeft}</strong> עד סגירת ${reminder.label}.
        <br />
        מועד סגירה: <strong>${deadlineText}</strong> (שעון ישראל)
      </p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          להגשת הימורים
        </a>
      </p>
      <p style="font-size:12px;color:#666">
        קיבלת הודעה זו כי הפעלת תזכורות אימייל באפליקציית ניחושים ליגת העל.
      </p>
    </div>
  `;
}

function buildSubject(reminder) {
  const timeLeft = windowLabel(reminder.window);
  if (reminder.kind === 'preseason') {
    return `תזכורת: נשארו ${timeLeft} לסגירת ההימורים המקדימים`;
  }
  return `תזכורת: נשארו ${timeLeft} לסגירת ${reminder.label}`;
}

async function wasReminderSent(reminderId) {
  const doc = await getDb().doc(`emailReminderLog/${reminderId}`).get();
  return doc.exists;
}

async function markReminderSent(reminderId, reminder) {
  await getDb().doc(`emailReminderLog/${reminderId}`).set({
    ...reminder,
    deadline: admin.firestore.Timestamp.fromDate(reminder.deadline),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getSubscribers() {
  const snapshot = await getDb().collection('users').where('emailReminders', '==', true).get();
  const subscribers = [];

  for (const userDoc of snapshot.docs) {
    const data = userDoc.data();
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    if (!email) continue;

    subscribers.push({
      uid: userDoc.id,
      email,
      displayName: typeof data.displayName === 'string' ? data.displayName : '',
    });
  }

  return subscribers;
}

async function getActiveSeasonId() {
  const configDoc = await getDb().doc('config/season').get();
  if (!configDoc.exists) return null;

  const data = configDoc.data();
  if (data?.seasonOpen === false) return null;

  return typeof data?.activeSeasonId === 'string' ? data.activeSeasonId : null;
}

function parseDeadline(value) {
  const date = parseIsraelDateTime(value);
  return isNaN(date.getTime()) ? null : date;
}

function collectRoundReminders(seasonId, now, rounds) {
  const pending = [];

  for (const roundDoc of rounds) {
    const data = roundDoc.data();
    const startTime = data.startTime;
    if (!startTime) continue;

    const deadline = parseDeadline(startTime);
    if (!deadline || deadline <= now) continue;

    const msUntil = deadline.getTime() - now.getTime();
    const window = getReminderWindow(msUntil);
    if (!window) continue;

    const roundNumber = roundDoc.id;
    const roundName = typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : `מחזור ${roundNumber}`;

    pending.push({
      kind: 'round',
      seasonId,
      targetId: roundNumber,
      label: `הימורי ${roundName}`,
      deadline,
      window,
      linkPath: '/round-bets',
    });
  }

  return pending;
}

function collectPreSeasonReminder(seasonId, now, seasonStart) {
  const deadline = parseDeadline(seasonStart);
  if (!deadline || deadline <= now) return null;

  const msUntil = deadline.getTime() - now.getTime();
  const window = getReminderWindow(msUntil);
  if (!window) return null;

  return {
    kind: 'preseason',
    seasonId,
    targetId: 'seasonStart',
    label: 'ההימורים המקדימים',
    deadline,
    window,
    linkPath: '/pre-season-bets',
  };
}

export async function processBetDeadlineReminders() {
  const appUrl = process.env.APP_URL ?? 'https://israeli-premier-league.web.app';
  const seasonId = await getActiveSeasonId();

  if (!seasonId) {
    console.log('No active open season — skipping reminders');
    return;
  }

  const subscribers = await getSubscribers();
  if (subscribers.length === 0) {
    console.log('No subscribers with email reminders enabled');
    return;
  }

  const now = new Date();
  const seasonDoc = await getDb().doc(`season/${seasonId}`).get();
  const seasonData = seasonDoc.data();

  const roundsSnapshot = await getDb().collection(`season/${seasonId}/rounds`).get();
  const pendingReminders = [
    ...collectRoundReminders(seasonId, now, roundsSnapshot.docs),
  ];

  if (seasonData?.seasonStart) {
    const preSeasonReminder = collectPreSeasonReminder(seasonId, now, seasonData.seasonStart);
    if (preSeasonReminder) {
      pendingReminders.push(preSeasonReminder);
    }
  }

  if (pendingReminders.length === 0) {
    console.log('No reminders due in this run');
    return;
  }

  for (const reminder of pendingReminders) {
    const reminderId = reminderDocId(reminder);

    if (await wasReminderSent(reminderId)) {
      continue;
    }

    let sentCount = 0;

    for (const subscriber of subscribers) {
      const ok = await sendEmail({
        to: subscriber.email,
        subject: buildSubject(reminder),
        html: buildEmailHtml(subscriber, reminder, appUrl),
      });

      if (ok) sentCount += 1;
    }

    if (sentCount > 0) {
      await markReminderSent(reminderId, reminder);
      console.log(`Sent ${reminderId} to ${sentCount} subscribers`);
    }
  }
}
