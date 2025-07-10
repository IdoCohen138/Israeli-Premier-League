import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import { User } from '@/types';

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
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const existingUser = userDoc.data() as User;
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
        setUser(newUser);
      }
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
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