const properties = PropertiesService.getScriptProperties();
const baseUrl = properties.getProperty('baseUrl');
const apiKey = properties.getProperty('apiKey');
const slug = properties.getProperty('slug');

/**
 * Verifies that the rankings given to volunteers matches the rankings in
 * the submitted ballot(s). Used once all the rooms have been checked by
 * the volunteers. This was used for the silent rounds. The form responses
 * spreadsheet had the "Responses" sheet and was formatted as:
 *   Room Name; 1st place; 2nd place; 3rd place; 4th place
 * The places given were to sides, _i.e._ "oo", "cg".
 * If a discrepancy occurs, a message indicating the room will appear in the
 * console.
 *
 * The form responses are blanked after each round.
 */
function confirmBallots() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const bS = sS.getSheetByName("Responses");

  const tFetch = UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}`, {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  const round_seq = JSON.parse(tFetch.getContentText()).current_rounds[0];

  const venuesFetch = UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/venues`, {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  const venues = {};
  for (const v of JSON.parse(venuesFetch.getContentText())) {
    venues[v.name] = v.url;
  }

  const pairingsFetch = UrlFetchApp.fetch(round_seq + '/pairings', {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  const pairings = {};
  for (const p of JSON.parse(pairingsFetch.getContentText())) {
    pairings[p.venue] = p.url;
  }

  for (const [room, first, second, third, fourth] of bS.getRange(2, 2, bS.getLastRow()-1, 5).getValues()) {
    const pairing = pairings[venues[room]];
    const ballotFetch = UrlFetchApp.fetch(pairing + "/ballots?confirmed=true", {
      method: 'get',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const cBallot = JSON.parse(ballotFetch.getContentText())[0];
    const listA = [fourth, third, second, first];
    const listB = [];
    for (const team of cBallot.result.sheets[0].teams) {
      listB[team.points]=team.side;
    }
    for (var i = 0; i < 4; i += 1) {
      if (listA[i].split(" ")[0].toLowerCase() !== listB[i]) {
        Logger.log(room);
      }
    }
  }
}
