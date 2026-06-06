import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { setEmailRemindersEnabled } from '@/lib/emailReminders';
import { cn } from '@/lib/utils';

export default function NotificationToggle() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(user?.emailReminders ?? false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(user?.emailReminders ?? false);
  }, [user?.emailReminders, user?.uid]);

  if (!user?.email) return null;

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await setEmailRemindersEnabled(user.uid, next);
    } catch (error) {
      console.error('Failed to update email reminders preference:', error);
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="home-notifications" aria-label="התראות אימייל">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={saving}
        onClick={handleToggle}
        className={cn(
          'home-notifications-toggle',
          enabled && 'home-notifications-toggle--on'
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3 text-right">
          <div className="home-notifications-icon">
            <Mail size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="home-notifications-title">תזכורות באימייל</p>
            <p className="home-notifications-desc">
              {enabled
                ? `נשלח ל-${user.email} · 24 שעות ושעה לפני סגירת הימורים`
                : 'קבל תזכורת 24 שעות ושעה לפני סגירת הימור מחזור או הימורים מקדימים'}
            </p>
          </div>
        </div>
        <span className="home-notifications-switch" aria-hidden="true">
          <span className="home-notifications-switch-knob" />
        </span>
      </button>
    </section>
  );
}
