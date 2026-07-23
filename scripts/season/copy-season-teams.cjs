const {
  dataToDocument,
  documentToData,
  firestoreRequest,
  createFirestoreClient,
} = require('../lib/firestore-utils.cjs');

const sourceSeason = process.argv[2] ?? '2025-2026';
const targetSeason = process.argv[3] ?? '2026-2027';

async function copyTeams() {
  const client = await createFirestoreClient();

  const sourcePath = `/season/${sourceSeason}/teams`;
  const targetPath = `/season/${targetSeason}/teams`;

  const list = await firestoreRequest(client, sourcePath);
  const documents = list.documents ?? [];

  if (documents.length === 0) {
    throw new Error(`No teams found at season/${sourceSeason}/teams`);
  }

  try {
    await firestoreRequest(client, `/season/${targetSeason}`);
  } catch {
    const sourceSeasonDoc = await firestoreRequest(client, `/season/${sourceSeason}`);
    const seasonData = documentToData(sourceSeasonDoc);
    seasonData.seasonStart = '';
    seasonData.createdAt = new Date().toISOString();
    await firestoreRequest(client, `/season/${targetSeason}`, {
      method: 'PATCH',
      body: JSON.stringify(dataToDocument(seasonData)),
    });
    console.log(`Created season/${targetSeason} document`);
  }

  for (const doc of documents) {
    const docId = doc.name.split('/').pop();
    const data = documentToData(doc);
    await firestoreRequest(client, `${targetPath}/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify(dataToDocument(data)),
    });
    console.log(`Copied ${docId}: ${data.name ?? '(no name)'}`);
  }

  console.log(`\nDone. Copied ${documents.length} teams to season/${targetSeason}/teams`);
}

copyTeams().catch((error) => {
  console.error('Copy failed:', error.message || error);
  process.exit(1);
});
