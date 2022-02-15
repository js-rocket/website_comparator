/*
Script to compare pages from two websites

Example configuration file:
{
  "site_a" : "https://www1.example.com",
  "site_a_auth": "",
  "site_b" : "https://www2.example.com",
  "site_b_auth": "user:pass",
  "masks": {
    "one_ad": { "x1": 1180, "y1": 159, "x2": 1345, "y2": 760 },
    "two_ad": { "x1": 1182, "y1": 282, "x2": 1347, "y2": 1503 }
  },
  "pages": [
    { "url": "/", "mask": "two_ad" },
    { "url": "/about", "mask": "one_ad" }
  ]
}
*/
const puppeteer = require('puppeteer');
const fs = require('fs');
const PNG = require("pngjs").PNG;
const pixelmatch = require('pixelmatch');
const { exec } = require("child_process");

const print = console.log;

const SETTINGS_FILE = 'wc_config.json';
const RESULT_FOLDER = 'result';
const SCREEN_WIDTH = 1366;
const SCREEN_HEIGHT = 3 * 768;

const CSS_STYLE = `<style>
.col1 img { width: 40vw }
.col2 img { width: 40vw }
.row_diff { background-color: orange; }
.row_same { background-color: green; }
</style>`;

// converts url to a filename
const url2Filename = (url) => {
  const withoutProtocol = url
    .replace('http://', '')
    .replace('https://', '');

  const withoutSpecialChars = withoutProtocol
    .replace(/\//g, '^');

  return withoutSpecialChars;
}

// takes a snapshop of a webpage
const snapSite = async (url, filename) => {
  const browser = await puppeteer.launch({
    args: [`--window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT}`],
    defaultViewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 45 * 1000, // in milliseconds
    });
    await page.screenshot({ path: filename });
  } catch (e) {
    print(`Error taking page snapshot: `, e);
  }

  await browser.close();
}

const exitMessage = (code, message) => {
  print(message);
  process.exit(code);
}

// Compare pictures and return number of pixels different
const compareImages = (file1name, file2name) => {
  const img1 = PNG.sync.read(fs.readFileSync(file1name));
  const img2 = PNG.sync.read(fs.readFileSync(file2name));

  const { width, height } = img1;
  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height); // { threshold: 0.1 })

  return { pixelDiff: numDiffPixels, imageDiff: diff };
}


const readSettings = () => {
  const content = fs.readFileSync(SETTINGS_FILE);
  var settings = {};
  try {
    settings = JSON.parse(content);
  } catch (e) { }

  return settings;
}


const htmllog = async (content, createFile = false) => {
  const filename = `${RESULT_FOLDER}/index.htm`;

  if (createFile) {
    fs.writeFileSync(filename, content);
  } else {

    fs.appendFileSync(filename, content)
  }
}


const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const getSettings = async () => {
  const settings = await readSettings();
  if (!settings.site_a || !settings.site_b || !Array.isArray(settings.pages)) {
    exitMessage(-1, 'Settings file incorrect');
  };

  return settings;
}


const drawRect = (points, rect) => {
  for (var y = rect.y1; y < rect.y2; y++) {
    for (var x = rect.x1; x < rect.x2; x++) {
      var pixel = (points.width * y + x) << 2;

      // make pixel black
      points.data[pixel] = 0;
      points.data[pixel + 1] = 0;
      points.data[pixel + 2] = 0;

      // set pixel opacity
      points.data[pixel + 3] = 255;
    }
  }
}

const pngAddRectangle = async (fileIn, rect) => {
  fs.createReadStream(fileIn)
    .pipe(new PNG({ filterType: 4 }))
    .on("parsed", function () {
      drawRect(this, rect);
      this.pack().pipe(fs.createWriteStream(fileIn));
    });
}

const snapPage = async (i, siteKey, settings) => {
  const page = settings.pages[i];
  const url1 = `${settings[siteKey]}${page.url}`;
  const prefix = `000${i}`.slice(-4);
  const file1 = `${siteKey}_${prefix}_${url2Filename(url1)}.png`;

  const siteAuth = settings[`${siteKey}_auth`];
  const url1full = siteAuth ? url1.replace('://', `://${siteAuth}@`) : url1;

  print(`Capturing: ${url1}`);

  const fullFilePath = `${RESULT_FOLDER}/${file1}`;
  await snapSite(url1full, fullFilePath);
  return fullFilePath;
}

const snapshotBefore = async () => {
  const settings = await getSettings();

  for (var i = 0; i < settings.pages.length; i++) {
    const fullfilePath = await snapPage(i, 'site_a', settings);

    // if page has a mask defined, then draw mask over page
    const page = settings.pages[i];
    if (page.mask !== '' && settings.masks[page.mask]) {
      pngAddRectangle(fullfilePath, settings.masks[page.mask]);
    };
  }
}

const snapshotAfter = async () => {
  const settings = await getSettings();

  for (var i = 0; i < settings.pages.length; i++) {
    const fullfilePath = await snapPage(i, 'site_b', settings);

    // if page has a mask defined, then draw mask over page
    const page = settings.pages[i];
    if (page.mask !== '' && settings.masks[page.mask]) {
      pngAddRectangle(fullfilePath, settings.masks[page.mask]);
    };
  }
}


const writeCompareHeader = (settings) => {
  htmllog(`<html>
<head>
${CSS_STYLE}
</head>
<body>
<table class="maintable">
<tr><td>${settings.site_a}</td><td> </td><td>${settings.site_b}</td></tr>\n`, true);
}

const writeCompareFooter = (settings) => {
  htmllog('</table>\n</body>\n</html>\n');
}

const comparePages = (i, settings) => {
  const page = settings.pages[i];
  const prefix = `000${i}`.slice(-4);

  const url1 = `${settings.site_a}${page.url}`;
  const file1 = `site_a_${prefix}_${url2Filename(url1)}.png`;

  const url2 = `${settings.site_b}${page.url}`;
  const file2 = `site_b_${prefix}_${url2Filename(url2)}.png`;

  // Compare the two image files
  const diffResult = compareImages(`${RESULT_FOLDER}/${file1}`, `${RESULT_FOLDER}/${file2}`);
  const compareResult = diffResult.pixelDiff;
  const diffClass = compareResult < 10 ? 'row_same' : 'row_diff';

  const diffFilename = `diff_${prefix}_${url2Filename(page.url)}.png`;
  if (compareResult > 0) {
    fs.writeFileSync(`${RESULT_FOLDER}/${diffFilename}`, PNG.sync.write(diffResult.imageDiff));
  };

  print(`URL: ${url1}   differences: ${compareResult}`);

  // Log result to html file
  htmllog(`<tr class="${diffClass}">
<td colspan=3>${page.url}</td>
</tr>
<tr class="${diffClass}">
  <tr class="${diffClass}">
  <td class="col1"><img src="${file1}"></td>
  <td><a href="${diffFilename}" target="_blank">${compareResult}</a></td>
  <td class="col2"><img src="${file2}"></td>
</tr>\n`);
}

const snapshotCompare = async () => {
  const settings = await getSettings();

  writeCompareHeader(settings);
  for (var i = 0; i < settings.pages.length; i++) {
    comparePages(i, settings);
  }
  writeCompareFooter();
}


const main = async () => {
  if (process.argv.length !== 3) exitMessage(-1, 'Invalid number of arguments');

  const option = process.argv[2];

  if (option === 'snap-before' || option === 'snap-after') {
    exec(`mkdir ${RESULT_FOLDER}`);
    await sleep(1500);
  }

  switch (option) {
    case 'snap-before':
      return await snapshotBefore();
    case 'snap-after':
      return await snapshotAfter();
    case 'compare':
      return await snapshotCompare();
  }
}

main();
