export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'ניחושים ליגת העל <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set — skipping email to', to);
    return false;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    console.error('Failed to send email:', await response.text());
    return false;
  }

  return true;
}
