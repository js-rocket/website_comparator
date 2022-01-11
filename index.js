/*
Script to compare pages from two websites

Example configuration file:
{
  "site_a" : "https://www1.example.com",
  "site_a_auth": "",
  "site_b" : "https://www2.example.com",
  "site_b_auth": "user:pass",
  "pages": [
    { "url": "/", "mask": "x y width height" },
    { "url": "/about", "mask": "0 0 32 100" }
  ]
}
*/
const puppeteer = require('puppeteer');
const fs = require('fs');
const pixelmatch = require('pixelmatch');
const { exec } = require("child_process");

const print = console.log;

const URL_TEST = "https://www.google.com"
const SETTINGS_FILE = 'wc_config.json';
const RESULT_FOLDER = 'result';
const SCREEN_WIDTH = 1366;
const SCREEN_HEIGHT = 2 * 768;

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

// Compare pictures and return number of pixels different
const compareImages = (file1name, file2name) => {
  const PNG = require('pngjs').PNG;

  const img1 = PNG.sync.read(fs.readFileSync(file1name));
  const img2 = PNG.sync.read(fs.readFileSync(file2name));

  const { width, height } = img1;
  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height); // { threshold: 0.1 })

  return numDiffPixels;
}

const maintest = async () => {
  const file1name = url2Filename(URL_TEST) + '_before.png';
  const file2name = url2Filename(URL_TEST) + '_after.png';
  await snapSite(URL_TEST, file1name);
  await snapSite(URL_TEST, file2name);

  print(`Image differences: ${compareImages(file1name, file2name)}`);
};


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

const checkPage = async (i, settings, page) => {
  const url1 = `${settings.site_a}${page.url}`;
  const url2 = `${settings.site_b}${page.url}`;
  const prefix = `000${i}`.slice(-4);
  const file1 = `${prefix}_${url2Filename(url1)}.png`;
  const file2 = `${prefix}_${url2Filename(url2)}.png`;

  const url1full = (settings.site_a_auth) ? url1.replace('://', `://${settings.site_a_auth}@`) : url1;
  const url2full = (settings.site_b_auth) ? url2.replace('://', `://${settings.site_b_auth}@`) : url2;

  print(`CHECKING ${url1full}`);

  await snapSite(url1full, `${RESULT_FOLDER}/${file1}`);
  await snapSite(url1full, `${RESULT_FOLDER}/${file2}`);

  const compareResult = compareImages(`${RESULT_FOLDER}/${file1}`, `${RESULT_FOLDER}/${file2}`);
  const diffClass = compareResult < 10 ? 'row_same' : 'row_diff';

  print(`URL: ${url1}   differences: ${compareResult}`);

  htmllog(`<tr class="${diffClass}">
<td colspan=3>${page.url}</td>
</tr>
<tr class="${diffClass}">
  <tr class="${diffClass}">
  <td class="col1"><img src="${file1}"></td>
  <td>${compareResult}</td>
  <td class="col2"><img src="${file2}"></td>
</tr>\n`);
}

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const main = async () => {
  exec(`mkdir ${RESULT_FOLDER}`);

  await sleep(1500);

  const settings = await readSettings();
  if (!settings.site_a || !settings.site_b || !Array.isArray(settings.pages)) {
    print('Settings file incorrect');
    process.exit(-1);
  };

  htmllog(`<html>
<head>
${CSS_STYLE}
</head>
<body>
<table class="maintable">
<tr><td>${settings.site_a}</td><td> </td><td>${settings.site_b}</td></tr>\n`, true);

  for (var i = 0; i < settings.pages.length; i++) {
    await checkPage(i, settings, settings.pages[i]);
  }

  htmllog('</table>\n</body>\n</html>\n');
}

main();
