/**
 * Formats actual time remaining (at send time) into natural Hebrew.
 * Avoids hard-coded "24 שעות" / "שעה" labels.
 */
export function formatRemainingHebrew(msUntil) {
  if (msUntil <= 0) {
    return { verb: 'נותרו', timePart: 'פחות מדקה' };
  }

  const totalMinutes = Math.max(1, Math.round(msUntil / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 2) {
    const timePart =
      minutes > 0 ? `כ־${hours} שעות ו־${minutes} דקות` : `כ־${hours} שעות`;
    return { verb: 'נותרו', timePart };
  }

  if (hours === 1 && minutes === 0) {
    return { verb: 'נותרה', timePart: 'כשעה' };
  }

  if (hours === 1) {
    return { verb: 'נותרו', timePart: `כ־שעה ו־${minutes} דקות` };
  }

  return { verb: 'נותרו', timePart: `כ־${minutes} דקות` };
}

export function formatRemainingSentence(msUntil, closeLabel) {
  const { verb, timePart } = formatRemainingHebrew(msUntil);
  return `${verb} ${timePart} לסגירת ${closeLabel}`;
}
