const properties = PropertiesService.getScriptProperties();
const baseUrl = properties.getProperty('baseUrl');
const apiKey = properties.getProperty('apiKey');
const slug = properties.getProperty('slug');

/**
 * Takes conflicts of the "Conflicts" sheet and imports them into Tabbycat.
 *
 * The "Conflicts" sheet has the format:
 *   Nature of Clash, Clasher, Clashed With
 *
 * The "Nature of Clash" field takes the following options:
 * - Judge-Team
 * - Judge-Judge
 * - Team-Institution
 * - Judge-Institution
 *
 * Short team names must be used in the "clasher"/"clashed with" columns.
 */
function exportConflicts() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const cS = sS.getSheetByName('Conflicts');

  const conflicts = cS.getRange(292, 1, cS.getLastRow(), 3).getValues();

  const iMap = new Map(JSON.parse(UrlFetchApp.fetch(baseUrl + "/institutions", {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }).getContentText()).map(i => [i.name, i.url]));

  const adjs = JSON.parse(UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/adjudicators`, {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }).getContentText());
  const aMap = new Map(adjs.map(i => [i.name, i.url]));
  const aConflicts = adjs.reduce((a, v) => {
    const { url, team_conflicts, adjudicator_conflicts, institution_conflicts } = v;
    return {...a, [url]: {
      team_conflicts: new Set(team_conflicts),
      adjudicator_conflicts: new Set(adjudicator_conflicts),
      institution_conflicts: new Set(institution_conflicts)}};
  }, {});

  const teams = JSON.parse(UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/teams`, {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }).getContentText());
  const tMap = new Map(teams.map(i => [i.short_name, i.url]));
  const tConflicts = teams.reduce((a, v) => {
    const { url, institution_conflicts } = v;
    return {...a, [url]: {institution_conflicts: new Set(institution_conflicts)}};
  }, {});

  cLoop: for (const [cType, subject, target, _] of conflicts) {
    switch (cType) {
      case 'Judge-Team': {
        const aUrl = aMap.get(subject);
        const tUrl = tMap.get(subject);
        if (aUrl) {
          if (!tMap.get(target)) {
            Logger.log(subject + "\t" + target);
            break;
          }
          aConflicts[aUrl].team_conflicts.add(tMap.get(target));
          break;
        } else if (tUrl) {
          if (!aMap.get(target)) {
            Logger.log(subject + "\t" + target);
            break;
          }
          aConflicts[aMap.get(target)].team_conflicts.add(tUrl);
          break;
        } else {
          continue cLoop;
        }
      }
      case 'Judge-Judge': {
        const aUrl = aMap.get(subject);
        if (!aUrl) {
          continue cLoop;
        }
        if (!aMap.get(target)) {
          Logger.log(subject + "\t" + target);
          break;
        }
        aConflicts[aUrl].adjudicator_conflicts.add(aMap.get(target));
        break;
      }
      case 'Judge-Institution': {
        const aUrl = aMap.get(subject);
        if (!aUrl) {
          continue cLoop;
        }
        if (!iMap.get(target)) {
          Logger.log(subject + "\t" + target);
          break;
        }
        aConflicts[aUrl].institution_conflicts.add(iMap.get(target));
        break;
      }
      case 'Team-Institution': {
        const tUrl = tMap.get(subject);
        if (!tUrl) {
          continue cLoop;
        }
        if (!iMap.get(target)) {
          Logger.log(subject + "\t" + target);
          break;
        }
        tConflicts[tUrl].institution_conflicts.add(iMap.get(target));
        break;
      }
      default: {
        break cLoop;
      }
    }
  }

  Object.entries({...aConflicts, ...tConflicts}).forEach(([url, conflicts]) => {
    for (const conflict in conflicts) {
      conflicts[conflict] = [...conflicts[conflict]].filter(url => !!url);
      if (!conflicts[conflict] || conflicts[conflict].length === 0) {
        delete conflicts[conflict];
      }
    }
    UrlFetchApp.fetch(url, {
      muteHttpExceptions: false,
      method: 'patch',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(conflicts),
    });
  });
}

/**
 * Add participants' lists to Spreadsheet (decoded team names)
 * Adds to 3 sheets:
 * - Institutions: Name, Code, ID
 * - Adjudicators: Name, Institution name, ID
 * - Teams: Short name, Code name, Institution name, Speaker 1 name, Speaker 2 name, ID
 */
function importParticipants() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();

  const insts = JSON.parse(UrlFetchApp.fetch(baseUrl + "/institutions", {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }).getContentText()).map(i => [i.name, i.code, i.id]);
  sS.getSheetByName('Institutions').getRange(2, 1, insts.length, 3).setValues(insts);

  const iMap = new Map(insts.map(([name, _, id]) => [baseUrl + "/institutions/" + id, name]));

  const adjs = JSON.parse(UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/adjudicators`, {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }).getContentText()).map(a => [a.name, iMap.get(a.institution) ?? '', a.id]);
  sS.getSheetByName('Adjudicators').getRange(2, 1, adjs.length, 3).setValues(adjs);

  const teams = JSON.parse(UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/teams`, {
    method: 'get',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }).getContentText()).map(t => [
    t.short_name, t.emoji + " " + t.code_name, iMap.get(t.institution) ?? '', ...t.speakers.map(s => s.name), t.id
  ]);
  sS.getSheetByName('Teams').getRange(2, 1, teams.length, 6).setValues(teams);
}
