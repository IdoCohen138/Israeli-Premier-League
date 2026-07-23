const fs = require('fs');
const path = require('path');
const {
  dataToDocument,
  documentToData,
  firestoreRequest,
  listAllDocuments,
  createFirestoreClient,
  buildPlayerDocId,
} = require('../lib/firestore-utils.cjs');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const configPath = args.find((arg) => !arg.startsWith('--'));

if (!configPath) {
  console.error(`Usage: node scripts/players/update-season-players.cjs <config.json> [--dry-run]

Updates season players (joins/leaves) from a JSON config file.

Example:
  npm run update-season-players -- scripts/players/season-player-updates.example.json --dry-run
  npm run update-season-players -- scripts/players/season-player-updates.example.json`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'));
const seasonId = config.season;

if (!seasonId) {
  throw new Error('Config must include a "season" field (e.g. "2026-2027")');
}

function normalizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[''`´ʼ′׳]/gu, '')
    .replace(/[""„"]/gu, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parsePlayerEntry(entry) {
  if (typeof entry === 'string') {
    return { name: entry.trim(), aliases: [] };
  }
  if (entry && typeof entry === 'object' && entry.name) {
    return {
      name: String(entry.name).trim(),
      aliases: (entry.aliases ?? []).map((alias) => String(alias).trim()).filter(Boolean),
    };
  }
  throw new Error(`Invalid player entry: ${JSON.stringify(entry)}`);
}

function getNameVariants(entry) {
  const parsed = parsePlayerEntry(entry);
  return [parsed.name, ...parsed.aliases];
}

function getNormalizedVariants(entry) {
  return [...new Set(getNameVariants(entry).map(normalizeName).filter(Boolean))];
}

function namesOverlap(entryA, entryB) {
  const variantsA = getNormalizedVariants(entryA);
  const variantsB = getNormalizedVariants(entryB);
  return variantsA.some((variant) => variantsB.includes(variant));
}

function findMatchingPlayer(existingPlayers, teamId, entry) {
  return existingPlayers.find(
    (player) => player.teamId === teamId && namesOverlap(entry, player.name)
  );
}

function resolveTeamId(teamName, teamConfig, teamsByName) {
  if (teamConfig?.teamId) {
    return teamConfig.teamId;
  }

  const normalizedTarget = normalizeName(teamName);
  const team = teamsByName.get(normalizedTarget);
  if (!team) {
    throw new Error(`Team not found: "${teamName}". Add "teamId" to the config or check the team name.`);
  }
  return team.uid;
}

async function updateSeasonPlayers() {
  const client = await createFirestoreClient();

  const [teamDocs, playerDocs] = await Promise.all([
    listAllDocuments(client, `/season/${seasonId}/teams`),
    listAllDocuments(client, `/season/${seasonId}/players`),
  ]);

  const teams = teamDocs.map((doc) => ({
    uid: doc.name.split('/').pop(),
    ...documentToData(doc),
  }));

  const teamsByName = new Map(teams.map((team) => [normalizeName(team.name), team]));

  let existingPlayers = playerDocs.map((doc) => ({
    uid: doc.name.split('/').pop(),
    ...documentToData(doc),
  }));

  const summary = {
    added: [],
    removed: [],
    skippedDuplicate: [],
    skippedNotFound: [],
  };

  console.log(`Season: ${seasonId}`);
  console.log(dryRun ? 'Mode: dry-run (no changes will be written)\n' : 'Mode: apply\n');

  for (const [teamName, teamConfig] of Object.entries(config.teams ?? {})) {
    const teamId = resolveTeamId(teamName, teamConfig, teamsByName);
    const teamDisplayName = teams.find((team) => team.uid === teamId)?.name ?? teamName;
    const joined = teamConfig.joined ?? [];
    const left = teamConfig.left ?? [];

    console.log(`=== ${teamDisplayName} (${teamId}) ===`);

    for (const entry of left) {
      const parsed = parsePlayerEntry(entry);
      const match = findMatchingPlayer(existingPlayers, teamId, entry);

      if (!match) {
        summary.skippedNotFound.push({ team: teamDisplayName, name: parsed.name });
        console.log(`  LEFT (not found): ${parsed.name}`);
        continue;
      }

      summary.removed.push({ team: teamDisplayName, name: match.name, uid: match.uid });
      console.log(`  LEFT: ${match.name} (${match.uid})`);

      if (!dryRun) {
        await firestoreRequest(client, `/season/${seasonId}/players/${match.uid}`, {
          method: 'DELETE',
        });
      }

      existingPlayers = existingPlayers.filter((player) => player.uid !== match.uid);
    }

    for (const entry of joined) {
      const parsed = parsePlayerEntry(entry);
      const duplicate = findMatchingPlayer(existingPlayers, teamId, entry);

      if (duplicate) {
        summary.skippedDuplicate.push({
          team: teamDisplayName,
          requestedName: parsed.name,
          existingName: duplicate.name,
          uid: duplicate.uid,
        });
        console.log(`  JOIN (skipped, already exists): ${parsed.name} -> "${duplicate.name}" (${duplicate.uid})`);
        continue;
      }

      const playerId = buildPlayerDocId(parsed.name, teamId);
      const alreadyExistsById = existingPlayers.some((player) => player.uid === playerId);
      if (alreadyExistsById) {
        const existing = existingPlayers.find((player) => player.uid === playerId);
        summary.skippedDuplicate.push({
          team: teamDisplayName,
          requestedName: parsed.name,
          existingName: existing?.name ?? parsed.name,
          uid: playerId,
        });
        console.log(`  JOIN (skipped, doc id exists): ${parsed.name} (${playerId})`);
        continue;
      }

      const playerData = {
        name: parsed.name,
        team: teamDisplayName,
        teamId,
      };

      summary.added.push({ team: teamDisplayName, name: parsed.name, uid: playerId });
      console.log(`  JOIN: ${parsed.name} (${playerId})`);

      if (!dryRun) {
        await firestoreRequest(client, `/season/${seasonId}/players/${playerId}`, {
          method: 'PATCH',
          body: JSON.stringify(dataToDocument(playerData)),
        });
      }

      existingPlayers.push({ uid: playerId, ...playerData });
    }

    console.log('');
  }

  console.log('--- Summary ---');
  console.log(`Added: ${summary.added.length}`);
  console.log(`Removed: ${summary.removed.length}`);
  console.log(`Skipped (duplicate): ${summary.skippedDuplicate.length}`);
  console.log(`Skipped (not found on leave): ${summary.skippedNotFound.length}`);

  if (summary.skippedNotFound.length > 0) {
    console.log('\nPlayers marked as left but not found:');
    for (const item of summary.skippedNotFound) {
      console.log(`  - ${item.team}: ${item.name}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run complete. Re-run without --dry-run to apply changes.');
  } else {
    console.log('\nDone.');
  }
}

updateSeasonPlayers().catch((error) => {
  console.error('Update failed:', error.message || error);
  process.exit(1);
});
