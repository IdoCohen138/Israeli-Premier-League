const {
  dataToDocument,
  firestoreRequest,
  createFirestoreClient,
  buildPlayerDocId,
} = require('../lib/firestore-utils.cjs');

const seasonId = process.argv[2] ?? '2026-2027';
const playerName = process.argv[3];
const teamName = process.argv[4];
const teamId = process.argv[5];

if (!playerName || !teamName || !teamId) {
  console.error(`Usage: node scripts/players/add-season-player.cjs <season> <playerName> <teamName> <teamId>

Example:
  node scripts/players/add-season-player.cjs 2026-2027 "סייד אבו פרחי" "מכבי ת\\"א" 6xIqFlWU7Vd4iI0bR3sI`);
  process.exit(1);
}

async function addPlayer() {
  const client = await createFirestoreClient();
  const playerId = buildPlayerDocId(playerName, teamId);
  const playerData = {
    name: playerName,
    team: teamName,
    teamId,
  };

  await firestoreRequest(client, `/season/${seasonId}/players/${playerId}`, {
    method: 'PATCH',
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
