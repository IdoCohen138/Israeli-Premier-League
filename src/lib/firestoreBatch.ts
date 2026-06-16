import { writeBatch, type DocumentData, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

const MAX_BATCH_SIZE = 500;

export type FirestoreBatchOp =
  | { ref: DocumentReference; type: 'set'; data: DocumentData; merge?: boolean }
  | { ref: DocumentReference; type: 'update'; data: DocumentData };

export async function runFirestoreBatches(ops: FirestoreBatchOp[]): Promise<void> {
  if (ops.length === 0) return;

  for (let i = 0; i < ops.length; i += MAX_BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = ops.slice(i, i + MAX_BATCH_SIZE);

    for (const op of chunk) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data, { merge: op.merge ?? false });
      } else {
        batch.update(op.ref, op.data);
      }
    }

    await batch.commit();
  }
}
