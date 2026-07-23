const projectId = 'israeli-premier-league';

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

async function createFirestoreClient() {
  const { getAccessToken, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
  const { Client, setRefreshToken } = require('firebase-tools/lib/apiv2');

  const account = getGlobalDefaultAccount();
  if (!account) {
    throw new Error('Not logged in to Firebase CLI. Run: firebase login');
  }

  setRefreshToken(account.tokens.refresh_token);
  await getAccessToken(account.tokens.refresh_token, []);

  return new Client({
    urlPrefix: 'https://firestore.googleapis.com/v1',
    auth: true,
  });
}

function buildPlayerDocId(name, teamUid) {
  const parts = name.trim().split(/\s+/);
  const encodedParts = parts.map((part) =>
    [...part].map((char) => char.codePointAt(0)).join('')
  );
  return `${encodedParts.join('_')}_${teamUid.toLowerCase()}`;
}

module.exports = {
  projectId,
  firestoreValueToJs,
  jsToFirestoreValue,
  documentToData,
  dataToDocument,
  firestoreRequest,
  listAllDocuments,
  createFirestoreClient,
  buildPlayerDocId,
};
