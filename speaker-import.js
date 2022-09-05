const properties = PropertiesService.getScriptProperties();
const baseUrl = properties.getProperty('baseUrl');
const apiKey = properties.getProperty('apiKey');
const slug = properties.getProperty('slug');

/**
 * Get short names for institutions
 *
 * Splits provided team names from "Form Responses 1", removing the last component
 * split by spaces and returning the rest as the Institution name (fallback to custom
 * name). Then correlates full institution name and code to place on the Institutions
 * sheet.
 *
 * The "Form Responses 1" sheet's relevent fields are:
 *   Institution (column D), Custom Institution Name (E), Team Name (F)
 *
 * The "Institutions" sheet is:
 *   Full Name, Code, ID
 */
function getShortNames() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const rS = sS.getSheetByName('Form Responses 1');
  const iS = sS.getSheetByName('Institutions');

  const institutions = iS.getRange(1, 1, iS.getLastRow(), 2).getValues();
  const iNames = institutions.map(x => x[0]);
  let codes = institutions.map(x => x[1]);
  rS.getRange(2, 4, rS.getLastRow(), 3).getValues().forEach(r => {
    const iName = r[0] !== 'Other' ? r[0] : r[1];
    const tName = r[2].trim().split(' ').slice(0, -1).join(' ');

    const index = iNames.indexOf(iName);
    if (index >= 0) {
      if (!codes[index]) {
        codes[index] = tName;
      } else if (codes[index] !== tName) {
        Logger.log(`Duplicate code for ${iName}: "${codes[index]}"/"${tName}"`);
      }
    } else {
      Logger.log(`No institution by name "${iName}" ("${tName}")`);
    }
  });
  iS.getRange(1, 2, codes.length, 1).setValues(codes.map(x => [x]));
}

/**
 * Import institutions to Tabbycat
 *
 * Takes the institutions from the "Institutions" sheet with a code and no ID
 * and imports them into Tabbycat, putting the new ID on the sheet.
 *
 * The "Institutions" sheet is:
 *   Full Name, Code, ID
 */
function importInstitutions() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const iS = sS.getSheetByName('Institutions');

  const institutions = iS.getRange(1, 1, iS.getLastRow(), 3).getValues();
  let ids = [];
  institutions.forEach(([name, code, idx]) => {
    if (code.trim() == '') { // No code, can't create
      ids.push('');
      return;
    }
    if (idx) { // Already exists
      ids.push(idx);
      return;
    }
    const fetch = UrlFetchApp.fetch(baseUrl + "/institutions", {
      muteHttpExceptions: true,
      method: 'post',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({
        name: name.trim().substring(0, 100),
        code: code.substring(0, 20),
      }),
    });
    if (fetch.getResponseCode() === 201) {
      const d = JSON.parse(fetch.getContentText());
      Logger.log(`Created institution: ${d.name} (${d.code})`)
      ids.push(d.id)
    } else {
      ids.push('');
    }
  });
  iS.getRange(1, 3, ids.length, 1).setValues(ids.map(x => [x]));
}

/**
 * Go through the Form Responses and import into Tabbycat.
 *
 * The Form Responses 1 sheet has these columns:
 *   Timestamp, T&C Agree, Country of Institution, Name of Institution, Custom Institution Name, Team Name,
 *   [Debater 1] Full Name, Nationality, Zoom Email, Contact Email, Alt. Contact, Gender, Language Status
 *               Have you ever been to a major tournament?, Live stream Consent
 *   [Debater 2] Full Name, Nationality, Zoom Email, Contact Email, Alt. Contact, Gender, Language Status
 *               Have you ever been to a major tournament?, Live stream Consent
 *   Equity Release, Comments
 *
 * The "Institutions" sheet is:
 *   Full Name, Code, ID
 * The "Genders" sheet is:
 *   Gender, ε|M|F|O
 *
 * Adds a Speaker Category for Live stream consent.
 * Team name is from institution object + letter from field.
 */
function importTeams() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const tS = sS.getSheetByName('Form Responses 1');
  const iS = sS.getSheetByName('Institutions');
  const gS = sS.getSheetByName('Genders');

  const institutions = new Map(iS.getRange(1, 1, iS.getLastRow(), 3).getValues().map(r => [r[0], r[2]]));
  const genders = new Map(gS.getRange(1, 1, gS.getLastRow() - 1, 2).getValues());

  for (const [inst, _0, tName, d0Name, _1, d0Email, _2, _3, d0Gender, _4, _5, d0LS, d1Name, _7, d1Email, _8, _9, d1Gender, _10, _11, d1LS] of tS.getRange(2, 4, tS.getLastRow(), 21).getValues()) {
    if (!inst) {
      Logger.log("No institution");
      break;
    }
    const reference = tName.trim().split(' ').pop();
    const iId = institutions.get(inst) ?? null;
    const institution = iId && `${baseUrl}/institutions/${iId}`;
    const speakers = []
    for (const [name, email, gender, ls] of [[d0Name, d0Email, d0Gender, d0LS], [d1Name, d1Email, d1Gender, d1LS]]) {
      const categories = ls === 'Yes' ? ['https://wudc2022.calicotab.com/api/v1/tournaments/wudc/speaker-categories/1'] : []
      speakers.push({
        name: name.trim(),
        email: email.trim(),
        gender: genders.get(gender.trim().toLowerCase()) ?? '',
        categories,
      });
    }
    const fetch = UrlFetchApp.fetch(baseUrl + `/tournaments/${slug}/teams`, {
      muteHttpExceptions: true,
      method: 'post',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({
        institution,
        reference,
        use_institution_prefix: true,
        speakers,
        break_categories: [],
        institution_conflicts: [],
      }),
    });
    const team = JSON.parse(fetch.getContentText());
    if (fetch.getResponseCode() === 201) {
      Logger.log(`Created ${team.short_name} (${team.emoji} ${team.code_name})`);
    } else {
      Logger.log(team);
      break;
    }
  }
}

/**
 * Log to console teams that may have duplicate registrations (similar team/speaker names)
 */
function findDuplicateTeams() {
  const sS = SpreadsheetApp.getActiveSpreadsheet();
  const tS = sS.getSheetByName('Form Responses 1');
  const iS = sS.getSheetByName('Institutions');

  const institutions = new Map(iS.getRange(1, 1, iS.getLastRow(), 3).getValues().map(r => [r[0], r[2]]));
  const names = new Set();
  const speakers = new Set();

  for (const [inst, _0, tName, d0Name, _1, _2, _3, _4, _5, _6, _7, _8, d1Name] of tS.getRange(2, 4, tS.getLastRow() - 1, 13).getValues()) {
    const reference = tName.trim().split(' ').pop();
    if (!reference) {
      Logger.log(`Invalid team name: ${tName}`);
      continue;
    }
    if (inst === 'Other') {
      Logger.log(`Invalid institution: ${tName} (${inst})`);
      continue;
    }
    const shortName = institutions.get(inst) + " " + reference;
    if (names.has(shortName)) {
      Logger.log(`Duplicate team?: ${tName}`);
      continue;
    }
    if (speakers.has(d0Name) || speakers.has(d1Name)) {
      Logger.log(`Duplicate speaker?: ${tName}`);
      continue;
    }
    speakers.add(d0Name);
    speakers.add(d1Name);
    names.add(shortName);
  }
}
