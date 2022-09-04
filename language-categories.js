const properties = PropertiesService.getScriptProperties();
const baseUrl = properties.getProperty('baseUrl');
const apiKey = properties.getProperty('apiKey');
const slug = properties.getProperty('slug');

/**
 * From speaker names placed in the Language Status sheet, find their team
 * name and ID to place on the sheet. The sheet is called "Speakers".
 */
function getIDsAndTeams() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const spS = sS.getSheetByName('Speakers');
  const speakers = {};

  const fetch = UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/teams`, {
    muteHttpExceptions: true,
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (fetch.getResponseCode() === 200) {
    const data = JSON.parse(fetch.getContentText());
    for (const team of data) {
      for (const speaker of team.speakers) {
        speakers[speaker.name] = [team.emoji + " " + team.code_name, speaker.id];
      }
    }
  }
  spS.getRange(2, 2, 6, 2).setValues(
    spS.getRange(2, 1, 6, 1).getValues().map(([name]) => speakers[name.trim()])
  );
}

/**
 * Gives speakers the categories that they've been given, ESL or EFL.
 * The API URLs for the categories have to be modified per tournament.
 * The Speaker sheet is formatted as:
 *   Speaker Name; Team Name; Speaker ID; Initial Status; Verified; ESL; EFL
 * Speakers have to have the Verified cell as TRUE in order to be given a status.
 * All EFL are also given ESL status.
 */
function exportCategories() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const spS = sS.getSheetByName('Speakers');
  const cats = {
    esl: 'https://wudc2022.calicotab.com/api/v1/tournaments/wudc/speaker-categories/2',
    efl: 'https://wudc2022.calicotab.com/api/v1/tournaments/wudc/speaker-categories/3',
  };
  const initialSCats = [];
  JSON.parse(UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/speakers`, {
    muteHttpExceptions: true,
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }).getContentText()).forEach(s => {
    initialSCats[s.id] = s.categories;
  })

  for (const [idx, _, verified, esl, efl] of spS.getRange(2, 3, spS.getLastRow()-1, 5).getValues()) {
    if (!idx) {
      Logger.log("No id");
      break;
    }
    if (verified && (esl || efl)) {
      const categories = initialSCats[idx] ?? [];
      categories.push(cats.esl);
      if (efl) categories.push(cats.efl);

      const f = UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/speakers/` + idx, {
        muteHttpExceptions: true,
        method: 'patch',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        payload: JSON.stringify({ categories }),
      });
      Logger.log(JSON.parse(f.getContentText()).name);
    }
  }
}

/**
 * Reconciling names from an external Language Committee spreadsheet into a temporary
 * "Sheet3" sheet in our spreadsheet.
 */
function exportCategoriesSheet3() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const spS = sS.getSheetByName('Sheet3');
  const cats = {
    lsc: 'https://wudc2022.calicotab.com/api/v1/tournaments/wudc/speaker-categories/1',
    esl: 'https://wudc2022.calicotab.com/api/v1/tournaments/wudc/speaker-categories/2',
    efl: 'https://wudc2022.calicotab.com/api/v1/tournaments/wudc/speaker-categories/3',
  };
  /*const bCats = {
    open: 'https://wudc2022.calicotab.com/api/v1/tournaments/wudc/break-categories/1',
    esl: 'https://wudc2022.calicotab.com/api/v1/tournaments/wudc/break-categories/3',
    efl: 'https://wudc2022.calicotab.com/api/v1/tournaments/wudc/break-categories/4',
  };*/
  const initialSCats = [];
  let speakerMap = [];
  JSON.parse(UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/speakers`, {
    muteHttpExceptions: true,
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }).getContentText()).forEach(s => {
    speakerMap.push([s.name, s.url]);
    initialSCats[s.name] = s.categories.filter(c => !Object.values(cats).includes(c));
  })
  speakerMap = new Map(speakerMap);
  const unfound = [];

  for (const [name, status] of spS.getRange(1, 1, spS.getLastRow(), 2).getValues()) {
    if (!name) {
      Logger.log("No name");
      break;
    }
    const sUrl = speakerMap.get(name);
    if (!sUrl) {
      unfound.push([name, status]);
      continue;
    }
    const categories = initialSCats[name] ?? [];
    if (['EFL', 'ESL'].includes(status)) {
      categories.push(cats.esl);
    }
    if (status === 'EFL') {
      categories.push(cats.efl);
    }

    const f = UrlFetchApp.fetch(sUrl, {
      muteHttpExceptions: true,
      method: 'patch',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ categories }),
    });
    Logger.log(JSON.parse(f.getContentText()).name);
  }
  Logger.log(unfound);
}
