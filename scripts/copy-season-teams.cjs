const { getAccessToken, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { Client, setRefreshToken } = require('firebase-tools/lib/apiv2');

const projectId = 'israeli-premier-league';
const sourceSeason = process.argv[2] ?? '2025-2026';
const targetSeason = process.argv[3] ?? '2026-2027';

function firestoreValueToJs(value) {
  if (value == null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map(firestoreValueToJs);
  }
  if ('mapValue' in value) {
    const result = {};
    for (const [key, nested] of Object.entries(value.mapValue.fields ?? {})) {
      result[key] = firestoreValueToJs(nested);
    }
    return result;
  }
  return null;
}

function jsToFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(jsToFirestoreValue),
      },
    };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [key, nested] of Object.entries(value)) {
      fields[key] = jsToFirestoreValue(nested);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function documentToData(doc) {
  const data = {};
  for (const [key, value] of Object.entries(doc.fields ?? {})) {
    data[key] = firestoreValueToJs(value);
  }
  return data;
}

function dataToDocument(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = jsToFirestoreValue(value);
  }
  return { fields };
}

async function firestoreRequest(client, path, options = {}) {
  const base = `/projects/${projectId}/databases/(default)/documents`;
  const response = await client.request({
    method: options.method ?? 'GET',
    path: `${base}${path}`,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body,
  });
  return response.body;
}

async function copyTeams() {
  const account = getGlobalDefaultAccount();
  if (!account) {
    throw new Error('Not logged in to Firebase CLI. Run: firebase login');
  }

  setRefreshToken(account.tokens.refresh_token);
  await getAccessToken(account.tokens.refresh_token, []);

  const client = new Client({
    urlPrefix: 'https://firestore.googleapis.com/v1',
    auth: true,
  });

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
