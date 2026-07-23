const {
  dataToDocument,
  documentToData,
  firestoreRequest,
  listAllDocuments,
  createFirestoreClient,
} = require('../lib/firestore-utils.cjs');

const sourceSeason = process.argv[2] ?? '2025-2026';
const targetSeason = process.argv[3] ?? '2026-2027';

async function copyPlayers() {
  const client = await createFirestoreClient();

  const sourcePath = `/season/${sourceSeason}/players`;
  const targetPath = `/season/${targetSeason}/players`;

  const documents = await listAllDocuments(client, sourcePath);

  if (documents.length === 0) {
    throw new Error(`No players found at season/${sourceSeason}/players`);
  }

  let copied = 0;
  for (const doc of documents) {
    const docId = doc.name.split('/').pop();
    const data = documentToData(doc);
    await firestoreRequest(client, `${targetPath}/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify(dataToDocument(data)),
    });
    copied += 1;
    console.log(`Copied ${docId}: ${data.name ?? '(no name)'} - ${data.team ?? ''}`);
  }

  console.log(`\nDone. Copied ${copied} players to season/${targetSeason}/players`);
}

copyPlayers().catch((error) => {
  console.error('Copy failed:', error.message || error);
  process.exit(1);
});
