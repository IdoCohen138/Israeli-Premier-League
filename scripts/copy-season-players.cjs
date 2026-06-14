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
    queryParams: options.queryParams,
  });
  return response.body;
}

async function listAllDocuments(client, collectionPath) {
  const documents = [];
  let pageToken;

  do {
    const queryParams = { pageSize: '300' };
    if (pageToken) {
      queryParams.pageToken = pageToken;
    }

    const list = await firestoreRequest(client, collectionPath, { queryParams });
    documents.push(...(list.documents ?? []));
    pageToken = list.nextPageToken;
  } while (pageToken);

  return documents;
}

async function copyPlayers() {
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
