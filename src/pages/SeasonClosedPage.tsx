import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSeason } from '@/contexts/SeasonContext';
import { useNavigate } from 'react-router-dom';
import { Construction, LogOut, Settings } from 'lucide-react';
import ThemeToggle from '@/components/layout/ThemeToggle';
import { formatSeasonDisplay } from '@/lib/season';

export default function SeasonClosedPage() {
  const { user, logout } = useAuth();
  const { activeSeasonId } = useSeason();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div dir="rtl" className="app-shell relative flex items-center justify-center px-4 safe-bottom">
      <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
        <ThemeToggle />
      </div>
      <div className="app-card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
          <Construction className="h-7 w-7 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold">האפליקציה סגורה כרגע</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          עונה פעילה במערכת: {formatSeasonDisplay(activeSeasonId)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">בבנייה — נחזור בקרוב!</p>

        <div className="mt-5 space-y-2">
          {user?.role === 'admin' && (
            <Button onClick={() => navigate('/admin')} className="w-full gap-2">
              <Settings size={16} />
              כניסה לניהול — פתח גישה למשתמשים
            </Button>
          )}
          <Button variant="outline" onClick={handleLogout} className="w-full gap-2">
            <LogOut size={16} />
            התנתק
          </Button>
        </div>
      </div>
    </div>
  );
}
