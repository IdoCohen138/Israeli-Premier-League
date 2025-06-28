// פונקציה לקביעת שם העונה הנוכחית
export function getCurrentSeason(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  
  // אם אנחנו אחרי יוני (חודש 6), העונה החדשה כבר התחילה
  // אחרת, אנחנו עדיין בעונה הקודמת
  let season;
  if (currentMonth >= 6) {
    // העונה החדשה: 2025-2026 (אם השנה 2025)
    season = `${currentYear}-${currentYear + 1}`;
  } else {
    // העונה הקודמת: 2024-2025 (אם השנה 2025)
    season = `${currentYear - 1}-${currentYear}`;
  }
  
  return season;
}

// פונקציה לקבלת נתיב העונה הנוכחית
export function getSeasonPath(): string {
  const path = `season/${getCurrentSeason()}`;
  return path;
}

// פונקציה לקבלת נתוני העונה הנוכחית
export async function getCurrentSeasonData() {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    
    const currentSeason = getCurrentSeason();
    const seasonRef = doc(db, 'season', currentSeason);
    const seasonDoc = await getDoc(seasonRef);
    
    if (seasonDoc.exists()) {
      const data = seasonDoc.data();
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting season data:', error);
    return null;
  }
} 