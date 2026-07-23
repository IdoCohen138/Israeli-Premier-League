const fs = require('fs');
const path = require('path');
const {
  dataToDocument,
  documentToData,
  firestoreRequest,
  listAllDocuments,
  createFirestoreClient,
} = require('../lib/firestore-utils.cjs');

const SEASON = process.env.SEASON ?? '2026-2027';
const dryRun = process.argv.includes('--dry-run');
const inputPath =
  process.argv.find((arg) => !arg.startsWith('--') && arg.endsWith('.txt')) ??
  path.join(__dirname, 'rounds.example.raw.txt');

const TEAM_ALIASES = {
  'מכבי תל אביב': 'מכבי ת"א',
  'מכבי ת"א': 'מכבי ת"א',
  'מכבי חיפה': 'מכבי חיפה',
  'מכבי נתניה': 'מכבי נתניה',
  'מכבי פתח תקוה': 'מכבי פ"ת',
  'מכבי פ"ת': 'מכבי פ"ת',
  'הפועל תל אביב': 'הפועל ת"א',
  'הפועל ת"א': 'הפועל ת"א',
  'הפועל חיפה': 'הפועל חיפה',
  'הפועל באר שבע': 'הפועל ב"ש',
  'הפועל ב"ש': 'הפועל ב"ש',
  'הפועל ירושלים': 'הפועל ירושלים',
  'הפועל פתח תקוה': 'הפועל פ"ת',
  'הפועל פ"ת': 'הפועל פ"ת',
  'בית"ר ירושלים': 'בית"ר ירושלים',
  'בני סכנין': 'בני סכנין',
  'עירוני טבריה': 'עירוני טבריה',
  'עירוני ק"ש': 'עירוני קריית שמונה',
  'עירוני קרית שמונה': 'עירוני קריית שמונה',
  'עירוני קריית שמונה': 'עירוני קריית שמונה',
  'הפועל רמת גן': 'הפועל רמת גן',
};

function normalizeTeamName(name) {
  const trimmed = name.trim();
  return TEAM_ALIASES[trimmed] ?? trimmed;
}

function isGarbageLine(line) {
  return (
    line.includes('ווידג') ||
    line.includes('HTML') ||
    line.includes('יצירת ווידג') ||
    line.includes('אפשרויות') ||
    line.includes('תוצאות של')
  );
}

function parseDateToIso(dateStr) {
  const [day, month, year] = dateStr.split('/').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseRounds(rawText) {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !isGarbageLine(line));

  const rounds = [];
  let index = 0;

  while (index < lines.length) {
    const roundMatch = lines[index].match(/^מחזור\s+(\d+)$/);
    if (!roundMatch) {
      index += 1;
      continue;
    }

    const number = Number(roundMatch[1]);
    index += 1;

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(lines[index])) {
      throw new Error(`Missing date for round ${number}`);
    }
    const dateIso = parseDateToIso(lines[index]);
    index += 1;

    const matches = [];
    while (index < lines.length && !/^מחזור\s+\d+$/.test(lines[index])) {
      if (index + 4 >= lines.length) {
        break;
      }

      const home = lines[index];
      const time = lines[index + 2];
      const away = lines[index + 3];

      if (!/^\d{2}:\d{2}$/.test(time)) {
        break;
      }

      matches.push({
        home,
        away,
        kickoff: `${dateIso}T${time}`,
      });
      index += 5;
    }

    if (matches.length === 0) {
      throw new Error(`No matches parsed for round ${number}`);
    }

    rounds.push({
      number,
      dateIso,
      name: `מחזור ${number}`,
      startTime: matches[0].kickoff,
      matches,
    });
  }

  return rounds;
}

function buildTeamLookup(teams) {
  const byCanonical = new Map();
  const byAlias = new Map();

  for (const team of teams) {
    byCanonical.set(team.name, team);
    byAlias.set(normalizeTeamName(team.name), team);
  }

  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    const team = byCanonical.get(canonical);
    if (team) {
      byAlias.set(alias, team);
      byAlias.set(normalizeTeamName(alias), team);
    }
  }

  return byAlias;
}

function resolveTeam(teamName, lookup) {
  const canonical = normalizeTeamName(teamName);
  const team = lookup.get(canonical) ?? lookup.get(teamName.trim());
  if (!team) {
    throw new Error(`Unknown team: "${teamName}" (normalized: "${canonical}")`);
  }
  return team;
}

function createMatchId(roundNumber, matchIndex) {
  return `${Date.now()}${roundNumber}${matchIndex}${Math.random().toString(36).slice(2, 9)}`;
}

async function importRounds() {
  const rawText = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const rounds = parseRounds(rawText);

  const client = await createFirestoreClient();
  const teamDocs = await listAllDocuments(client, `/season/${SEASON}/teams`);
  const teams = teamDocs.map((doc) => ({
    uid: doc.name.split('/').pop(),
    ...documentToData(doc),
  }));
  const teamLookup = buildTeamLookup(teams);

  console.log(`Season: ${SEASON}`);
  console.log(dryRun ? 'Mode: dry-run\n' : 'Mode: apply\n');
  console.log(`Parsed ${rounds.length} rounds`);

  let totalMatches = 0;

  for (const round of rounds) {
    const matchIds = [];
    console.log(`Round ${round.number} (${round.dateIso}) - ${round.matches.length} matches`);

    if (!dryRun) {
      await firestoreRequest(client, `/season/${SEASON}/rounds/${round.number}`, {
        method: 'PATCH',
        body: JSON.stringify(
          dataToDocument({
            number: round.number,
            name: round.name,
            matches: [],
            startTime: round.startTime,
            isActive: false,
          })
        ),
      });
    }

    for (const [matchIndex, match] of round.matches.entries()) {
      const homeTeam = resolveTeam(match.home, teamLookup);
      const awayTeam = resolveTeam(match.away, teamLookup);
      const matchId = createMatchId(round.number, matchIndex);
      matchIds.push(matchId);
      totalMatches += 1;

      const matchData = {
        uid: matchId,
        round: round.number,
        homeTeam: homeTeam.name,
        homeTeamId: homeTeam.uid,
        awayTeam: awayTeam.name,
        awayTeamId: awayTeam.uid,
        date: match.kickoff,
        startTime: match.kickoff,
      };

      console.log(`  ${homeTeam.name} vs ${awayTeam.name} (${match.kickoff})`);

      if (!dryRun) {
        await firestoreRequest(
          client,
          `/season/${SEASON}/rounds/${round.number}/matches/${matchId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(dataToDocument(matchData)),
          }
        );
      }
    }

    if (!dryRun) {
      await firestoreRequest(client, `/season/${SEASON}/rounds/${round.number}`, {
        method: 'PATCH',
        body: JSON.stringify(
          dataToDocument({
            number: round.number,
            name: round.name,
            matches: matchIds,
            startTime: round.startTime,
            isActive: false,
          })
        ),
      });
    }
  }

  console.log(`\nTotal: ${rounds.length} rounds, ${totalMatches} matches`);
  if (dryRun) {
    console.log('Dry run complete. Re-run without --dry-run to apply.');
  } else {
    console.log('Done.');
  }
}

importRounds().catch((error) => {
  console.error('Import failed:', error.message || error);
  process.exit(1);
});
