const { getAccessToken, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { Client, setRefreshToken } = require('firebase-tools/lib/apiv2');

const projectId = 'israeli-premier-league';
const seasonId = process.argv[2] ?? '2026-2027';
const playerName = process.argv[3] ?? 'תומר יוספי';
const teamName = process.argv[4] ?? 'בית"ר ירושלים';
const teamId = process.argv[5] ?? 'cEwxSXc30mGjpHERA6YZ';

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

function dataToDocument(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = jsToFirestoreValue(value);
  }
  return { fields };
}

function buildPlayerDocId(name, teamUid) {
  const parts = name.trim().split(/\s+/);
  const encodedParts = parts.map((part) =>
    [...part].map((char) => char.codePointAt(0)).join('')
  );
  return `${encodedParts.join('_')}_${teamUid.toLowerCase()}`;
}

async function addPlayer() {
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

  const playerId = buildPlayerDocId(playerName, teamId);
  const playerData = {
    name: playerName,
    team: teamName,
    teamId,
  };

  const path = `/projects/${projectId}/databases/(default)/documents/season/${seasonId}/players/${playerId}`;
  await client.request({
    method: 'PATCH',
    path,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dataToDocument(playerData)),
  });

  console.log(`Added player to season/${seasonId}/players/${playerId}`);
  console.log(`  name: ${playerName}`);
  console.log(`  team: ${teamName}`);
  console.log(`  teamId: ${teamId}`);
}

addPlayer().catch((error) => {
  console.error('Add player failed:', error.message || error);
  process.exit(1);
});
