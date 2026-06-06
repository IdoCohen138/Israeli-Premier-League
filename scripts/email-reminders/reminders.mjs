import admin from 'firebase-admin';
import { formatIsraelDateTime, parseIsraelDateTime } from './israelTime.mjs';
import { sendEmail } from './email.mjs';
import { getReminderWindow } from './reminderWindows.mjs';

function getDb() {
  return admin.firestore();
}

function reminderDocId(reminder) {
  return `${reminder.kind}:${reminder.seasonId}:${reminder.targetId}:${reminder.window}`;
}

function windowLabel(window, msUntil) {
  if (window === '1h') return 'שעה';
  const hours = Math.round(msUntil / (60 * 60 * 1000));
  if (hours >= 20) return '24 שעות';
  return `כ-${hours} שעות`;
}

function buildEmailHtml(subscriber, reminder, appUrl, msUntil) {
  const greeting = subscriber.displayName ? `שלום ${subscriber.displayName},` : 'שלום,';
  const deadlineText = formatIsraelDateTime(reminder.deadline);
  const timeLeft = windowLabel(reminder.window, msUntil);
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

function buildSubject(reminder, msUntil) {
  const timeLeft = windowLabel(reminder.window, msUntil);
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
  const dryRun = process.env.DRY_RUN === '1';

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
    const reminderId = reminderDocId(reminder);
    const msUntil = reminder.deadline.getTime() - now.getTime();
    console.log(
      `Due: ${reminderId} — closes ${formatIsraelDateTime(reminder.deadline)} (${Math.round(msUntil / 60000)} min left)`
    );

    if (await wasReminderSent(reminderId)) {
      console.log(`  Skip: already sent (${reminderId})`);
      continue;
    }

    if (dryRun) {
      console.log(`  Dry run: would email ${subscribers.length} subscribers`);
      continue;
    }

    let sentCount = 0;

    for (const subscriber of subscribers) {
      const ok = await sendEmail({
        to: subscriber.email,
        subject: buildSubject(reminder, msUntil),
        html: buildEmailHtml(subscriber, reminder, appUrl, msUntil),
      });

      if (ok) sentCount += 1;
    }

    if (sentCount > 0) {
      await markReminderSent(reminderId, reminder);
      console.log(`  Sent ${reminderId} to ${sentCount} subscribers`);
    } else {
      console.error(`  Failed to send ${reminderId} — check RESEND_API_KEY / EMAIL_FROM`);
    }
  }
}
