import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { invalidateCache } from './firestoreCache';

export async function setEmailRemindersEnabled(userId: string, enabled: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { emailReminders: enabled });
  invalidateCache(`user:${userId}`);
}
