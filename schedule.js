#!/usr/bin/env node

// config
const startDate = "09/04/20";
const endDate = "10/01/20";
// meeting day of the week. 0, 4 = Sunday, Thursday
const findIntegerDays = [0, 4];
const dateFormat = "MM/DD/YY";
const wtConductor = "stevenserrano";

// packages
const _ = require("lodash");
const fs = require("fs");
const moment = require("moment");
const csv = require("csvtojson");

// init
let allNames = [];
let niceNamesMap = {};
// to get started
let currentDate = startDate;
let exclusions = {};
let preferredList = [];
let preferredForRole = {};
let roles = {};

// methods
function _standardize(str) {
  if (str) {
    str = str.toLowerCase().replace(/\s/, "", "g");
  }

  return str;
}

function parse(file) {
  return csv().fromFile(file);
}

function buildRoles(_roles) {
  const sound = _roles.all;
  const mics = sound.concat(_roles.mpa);
  const platform = mics.slice(0);
  const attendant = platform.concat(_roles.attendant);

  return {
    sound,
    mics,
    platform,
    attendant,
  };
}

async function init() {
  const meetings = {};
  const meetingsCsv = await parse("./files/meeting-parts.csv");
  for (const row of meetingsCsv) {
    const vals = _.compact(_.values(row));
    const type = vals.shift();
    meetings[type] = _.shuffle(vals.map((x) => _standardize(x)));
  }
  exclusions = {
    lastMeeting: await parse("./files/last-week.csv"),
    meetings,
  };

  const rolesCsv = await parse("./files/roles.csv");
  let _roles = {};
  for (const row of rolesCsv) {
    const vals = _.compact(_.values(row));
    const type = vals.shift();
    allNames = allNames.concat(vals);
    _roles[type] = _.shuffle(vals.map((x) => _standardize(x)));
  }
  roles = buildRoles(_roles);

  // build nice names map
  allNames = _.compact(_.uniq(allNames));
  for (const name of allNames) {
    niceNamesMap[_standardize(name)] = name;
  }
}

function daysUntilDate(current, target) {
  const now = moment(current, dateFormat);
  const end = moment(target, dateFormat);
  const duration = moment.duration(end.diff(now));

  return duration.asDays();
}

function getNextMeeting(fromDate) {
  const searchDate = moment(fromDate, dateFormat);

  while (findIntegerDays.indexOf(searchDate.day()) === -1) {
    searchDate.add(1, "day");
  }

  return {
    date: searchDate.format("M/D"),
    day: searchDate.format("dddd").toLowerCase(),
    nextDay: searchDate.add(1, "day"),
  };
}

function pickRandomPerson(position, passedSource, exclude) {
  let result = false;

  // keep track of a preferred list ot make sure everyone gets a chance
  if (preferredList.length === 0) {
    // repopulate preferred list
    preferredList = allNames.slice(0).map((x) => _standardize(x));
  }

  // repopulate preferred roles
  // this ensures everyone gets a chance at the specified role
  if (
    preferredForRole[position] === undefined ||
    preferredForRole[position].length === 0
  ) {
    preferredForRole[position] = roles[position];
  }

  // set sample source to preferred list with roles taken into consideration
  let sampleSource = _.intersection(preferredForRole[position], preferredList);
  // if empty sample source revert to preferredForRole
  if (sampleSource.length === 0) {
    sampleSource = preferredForRole[position];
  }

  // debug
  // console.log(position, preferredForRole[position], preferredList, sampleSource);

  // edge case where preferred and exclude are the same. switch up and use the passed source
  if (_.difference(sampleSource, exclude).length === 0) {
    sampleSource = passedSource;
  }

  while (result === false) {
    const temp = _.sample(sampleSource);

    // if temp value is not in exclude then set value and return
    if (exclude.indexOf(temp) === -1) {
      result = temp;
      // remove person from preferred list to give others a try
      preferredList = preferredList.filter((x) => x !== result);
      // remove person from preferred list to give others a try
      preferredForRole[position] = preferredForRole[position].filter(
        (x) => x !== result
      );
    }
  }

  // return their nice name
  return niceNamesMap[result];
}

function buildSchdule() {
  let exclude = [];
  let lastMeeting = [];
  let lastMeetingParts = {};
  let lastLastMeeting = [];
  let schedule = [];

  // keep building schedule till current date passes end date
  while (daysUntilDate(currentDate, endDate) > 0) {
    let nextMeeting = getNextMeeting(currentDate);
    // if we have passed the end date then stop
    if (daysUntilDate(nextMeeting.nextDay, endDate) <= 1) {
      currentDate = nextMeeting.nextDay;
      continue;
    }

    // debug
    // console.log(nextMeeting.date);

    const meetingDay = nextMeeting.day;
    let parts = {};

    // if first run then populate previous week
    if (currentDate === startDate) {
      // populate last week with standardized names
      lastMeeting = _.map(_.map(exclusions.lastMeeting, "name"), (x) =>
        _standardize(x)
      );
    }

    // build exlusion list
    // add intersection of lastMeeting and lastLastMeeting to exclude
    exclude = _.intersection(lastMeeting, lastLastMeeting);
    // add those who have meeting parts
    if (exclusions.meetings[nextMeeting.date]) {
      const meetingParts = exclusions.meetings[nextMeeting.date].map((x) =>
        _standardize(x)
      );
      exclude = exclude.concat(meetingParts);
    }
    // add watchtower study conductor to exclude if Sunday
    if (nextMeeting.day === "sunday") {
      exclude.push(wtConductor);
    }

    // set sound and exclude
    parts.sound = pickRandomPerson(
      "sound",
      roles.sound,
      exclude.concat(_standardize(lastMeetingParts.sound))
    );
    exclude.push(_standardize(parts.sound));

    // set mics and exclude
    parts.mics = pickRandomPerson(
      "mics",
      roles.mics,
      exclude.concat(_standardize(lastMeetingParts.mics))
    );
    exclude.push(_standardize(parts.mics));

    // set platform and exclude
    parts.platform = pickRandomPerson(
      "platform",
      roles.platform,
      exclude.concat(_standardize(lastMeetingParts.platform))
    );
    exclude.push(_standardize(parts.platform));

    // set attendant and exclude
    parts.attendant = pickRandomPerson(
      "attendant",
      roles.attendant,
      exclude.concat(_standardize(lastMeetingParts.attendant))
    );
    exclude.push(_standardize(parts.attendant));

    // set exclusions for previous weeks
    lastLastMeeting = lastMeeting;
    lastMeeting = _.values(parts).map((x) => _standardize(x));
    lastMeetingParts = parts;

    // add date
    parts.date = nextMeeting.date;
    // check for those who are unable for certain days
    schedule.push(parts);

    // move the current date to tomorrow
    currentDate = nextMeeting.nextDay;
  }

  return schedule;
}

async function run() {
  await init();
  const schedule = buildSchdule();

  const headers = ["date", "sound", "mics", "platform", "attendant"];
  const csv = [headers];

  // build csv
  for (const row of schedule) {
    const _data = [];
    for (const col of headers) {
      _data.push(row[col]);
    }
    csv.push(_data);
  }

  // write csv
  fs.writeFileSync("./schedule.csv", csv.join("\n"));
}
run();
