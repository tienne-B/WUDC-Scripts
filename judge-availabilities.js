const properties = PropertiesService.getScriptProperties();
const baseUrl = properties.getProperty('baseUrl');
const apiKey = properties.getProperty('apiKey');
const slug = properties.getProperty('slug');

/**
 * Import adjudicator availabilties from "Sheet1" sheet.
 *
 * Sheet1 has the following columns:
 *   Email, Name, Status, Registration, Final Base Score, CV score,
 *   Test score, Blended score, Available Rounds, No. of available rounds,
 *   Comments on availability, Country, Region, Gender, Cleaned gender, Language
 * Only the "Name" and "Available Rounds" columns were used.
 *
 * The "Available Rounds" column is ", "-deliminated with the options being in the `rounds` var below.
 * `rounds` is in the sequence order of the Tabbycat tournament, and null values may be required if
 * an integer is skipped.
 */
function importAvailabilities() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const iS = sS.getSheetByName('Sheet1');

  const iFetch = UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/adjudicators`, {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  const adjs = new Map(JSON.parse(iFetch.getContentText()).map(i => [i.name.trim().toLowerCase(), i.url]));
  const rounds = [
    "Round 1 (Day 1)",
    "Round 2 (Day 1)",
    "Round 3 (Day 2)",
    "Round 4 (Day 2)",
    "Round 5 (Day 3)",
    "Round 6 (Day 3)",
    "Round 7 (Day 4)",
    "Round 8 (Day 4)",
    "Round 9 (Day 5)",
    "Open PDO",
    "Open Octo (Day 6)",
    "Open Quarters",
    "Open Semis",
    "Open Final (Day 8)",
    "ESL Quarters (Day 6)",
    "ESL Semis (Day 7)",
    "ESL Final (Day 8)",
    "EFL Semis (Day 7)",
    "EFL Final (Day 8)"
  ];
  const availabilities = [];
  for (const [name_, _status, _reg, _fs, _cv, _ts, _bs, available] of iS.getRange(2, 2, 312, 8).getValues()) {
    const url = adjs.get(name_.trim().toLowerCase());
    if (!url) {
      continue;
    }
    available.split(', ').forEach(a => {
      const index = rounds.indexOf(a);
      if (index < 0) {
        return;
      }
      if (!availabilities[index]) {
        availabilities[index] = [];
      }
      availabilities[index].push(url);
    })
  }
  for (const [i, participants] of availabilities.entries()) {
    UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/rounds/${i+1}/availabilities`, {
      method: 'put',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(participants),
    });
  }
}
