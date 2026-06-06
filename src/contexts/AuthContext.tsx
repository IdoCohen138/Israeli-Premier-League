import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import { User } from '@/types';
import { ensureServerTimeSynced } from '@/lib/serverTime';
import { getCached, invalidateCache, CACHE_TTL } from '@/lib/firestoreCache';

// רשימת מנהלים מוגדרת מראש - הוסף כאן את ה-UID שלך
const ADMIN_UIDS: string[] = [
  // הוסף כאן את ה-UID שלך
  // 'your-uid-here',
];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUserProfile(uid: string): Promise<User | null> {
  return getCached(`user:${uid}`, CACHE_TTL.user, async () => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists() ? (userDoc.data() as User) : null;
  });
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      const existingUser = await fetchUserProfile(firebaseUser.uid);
      if (existingUser) {
        setUser(existingUser);
      } else {
        const shouldBeAdmin = ADMIN_UIDS.includes(firebaseUser.uid);
        const newUser: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          role: shouldBeAdmin ? 'admin' : 'user',
          displayName: firebaseUser.displayName || undefined,
          photoURL: firebaseUser.photoURL || undefined,
        };
        
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        invalidateCache(`user:${firebaseUser.uid}`);
        setUser(newUser);
      }
      await ensureServerTimeSynced(firebaseUser.uid);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      invalidateCache('user:');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      
      if (firebaseUser) {
        try {
          const userData = await fetchUserProfile(firebaseUser.uid);
          if (userData) {
            setUser(userData);
          } else {
            // בדיקה אם המשתמש צריך להיות מנהל
            const shouldBeAdmin = ADMIN_UIDS.includes(firebaseUser.uid);
            
            // אם המשתמש לא קיים במסד הנתונים, ניצור אותו
            const newUser: User = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: shouldBeAdmin ? 'admin' : 'user',
              displayName: firebaseUser.displayName || undefined,
              photoURL: firebaseUser.photoURL || undefined,
            };
            
            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
            invalidateCache(`user:${firebaseUser.uid}`);
            setUser(newUser);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          // בדיקה אם המשתמש צריך להיות מנהל
          const shouldBeAdmin = ADMIN_UIDS.includes(firebaseUser.uid);
          
          // אם יש שגיאה, נשתמש בנתונים הבסיסיים
          const basicUser: User = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: shouldBeAdmin ? 'admin' : 'user',
            displayName: firebaseUser.displayName || undefined,
            photoURL: firebaseUser.photoURL || undefined,
          };
          setUser(basicUser);
        }
        await ensureServerTimeSynced(firebaseUser.uid);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    user,
    loading,
    signInWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 