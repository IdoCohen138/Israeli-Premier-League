import admin from 'firebase-admin';
import { formatIsraelDateTime, parseIsraelDateTime } from './israelTime.mjs';
import { sendEmail } from './email.mjs';
import { getReminderWindow } from './reminderWindows.mjs';
import { formatRemainingSentence } from './timeRemaining.mjs';
import { isDryRunEnv } from './dryRun.mjs';

function getDb() {
  return admin.firestore();
}

export function reminderDocId(uid, reminder) {
  return `${uid}:${reminder.kind}:${reminder.seasonId}:${reminder.targetId}:${reminder.window}`;
}

function getCloseLabel(reminder) {
  if (reminder.kind === 'preseason') {
    return 'ההימורים המקדימים';
  }
  return reminder.label;
}

function buildEmailHtml(subscriber, reminder, appUrl, msUntil) {
  const greeting = subscriber.displayName ? `שלום ${subscriber.displayName},` : 'שלום,';
  const deadlineText = formatIsraelDateTime(reminder.deadline);
  const remainingSentence = formatRemainingSentence(msUntil, getCloseLabel(reminder));
  const link = `${appUrl.replace(/\/$/, '')}${reminder.linkPath}`;

  return `
    <div dir="rtl" style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#111">
      <p>${greeting}</p>
      <p>
        <strong>${remainingSentence}</strong>.
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

function buildSubject(reminder, msUntil) {
  const remainingSentence = formatRemainingSentence(msUntil, getCloseLabel(reminder));
  return `תזכורת: ${remainingSentence}`;
}

async function wasReminderSent(docId) {
  const doc = await getDb().doc(`emailReminderLog/${docId}`).get();
  return doc.exists;
}

async function markReminderSent(docId, { uid, email, reminder, providerMessageId }) {
  const entry = {
    uid,
    email,
    kind: reminder.kind,
    seasonId: reminder.seasonId,
    targetId: reminder.targetId,
    window: reminder.window,
    deadline: admin.firestore.Timestamp.fromDate(reminder.deadline),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (providerMessageId) {
    entry.providerMessageId = providerMessageId;
  }

  await getDb().doc(`emailReminderLog/${docId}`).set(entry);
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

async function sendReminderToSubscriber(subscriber, reminder, { appUrl, msUntil, dryRun }) {
  const docId = reminderDocId(subscriber.uid, reminder);

  if (await wasReminderSent(docId)) {
    console.log(`  Skip ${subscriber.email}: already sent (${docId})`);
    return { sent: false, skipped: true };
  }

  if (dryRun) {
    console.log(`  DRY RUN - would email ${subscriber.email} — ${buildSubject(reminder, msUntil)} (${docId})`);
    return { sent: false, skipped: false, dryRun: true };
  }

  const result = await sendEmail({
    to: subscriber.email,
    subject: buildSubject(reminder, msUntil),
    html: buildEmailHtml(subscriber, reminder, appUrl, msUntil),
  });

  if (!result.ok) {
    console.error(`  Failed for ${subscriber.email} (${docId}) — no log written, will retry next run`);
    return { sent: false, skipped: false };
  }

  await markReminderSent(docId, {
    uid: subscriber.uid,
    email: subscriber.email,
    reminder,
    providerMessageId: result.providerMessageId,
  });

  console.log(
    `  Sent to ${subscriber.email} (${docId})` +
      (result.providerMessageId ? ` — id: ${result.providerMessageId}` : '')
  );
  return { sent: true, skipped: false };
}

export async function processBetDeadlineReminders() {
  const appUrl = process.env.APP_URL ?? 'https://israeli-premier-league.web.app';
  const dryRun = isDryRunEnv();

  if (dryRun) {
    console.log('DRY RUN - no emails sent');
  }

  if (!process.env.RESEND_API_KEY && !dryRun) {
    throw new Error('RESEND_API_KEY secret is missing — add it in GitHub → Settings → Secrets');
  }

  const seasonId = await getActiveSeasonId();

  if (!seasonId) {
    console.log('No active open season — skipping reminders');
    return;
  }

  const subscribers = await getSubscribers();
  if (subscribers.length === 0) {
    console.log('No subscribers with emailReminders=true in Firestore');
    return;
  }

  console.log(`Active season: ${seasonId}, subscribers: ${subscribers.length}, dryRun: ${dryRun}`);

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
    console.log('No reminders due in this run (deadline uses round.startTime, not match time)');
    return;
  }

  for (const reminder of pendingReminders) {
    const msUntil = reminder.deadline.getTime() - now.getTime();
    const reminderKey = `${reminder.kind}:${reminder.seasonId}:${reminder.targetId}:${reminder.window}`;
    console.log(
      `Due: ${reminderKey} — closes ${formatIsraelDateTime(reminder.deadline)} (${Math.round(msUntil / 60000)} min left)`
    );

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let dryRunWouldSendCount = 0;

    for (const subscriber of subscribers) {
      const outcome = await sendReminderToSubscriber(subscriber, reminder, { appUrl, msUntil, dryRun });
      if (outcome.sent) sentCount += 1;
      else if (outcome.skipped) skippedCount += 1;
      else if (outcome.dryRun) dryRunWouldSendCount += 1;
      else failedCount += 1;
    }

    if (dryRun) {
      console.log(`  Summary: dryRunWouldSend=${dryRunWouldSendCount}, skipped=${skippedCount}`);
    } else {
      console.log(`  Summary: sent=${sentCount}, skipped=${skippedCount}, failed=${failedCount}`);
    }
  }

  if (dryRun && pendingReminders.length > 0) {
    console.log('DRY RUN - no emails sent');
  }
}
