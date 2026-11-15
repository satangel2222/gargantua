/**
 * GARGANTUA · Google Apps Script web-app host
 * ------------------------------------------
 * Serves index.html straight out of Google Drive as a real public website.
 * Free, permanent, no credit card, URL looks like:
 *   https://script.google.com/macros/s/AKfy.../exec
 */

// Drive file id of gargantua.html  (from its share link .../file/d/<THIS>/view)
const FILE_ID = '1rWJBOGLj3nzIYJrstLzdfkqLnNdoX1sv';

function doGet() {
  const html = DriveApp.getFileById(FILE_ID).getBlob().getDataAsString('UTF-8');
  return HtmlService.createHtmlOutput(html)
    .setTitle('GARGANTUA · RELATIVISTIC SINGULARITY')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // so Google Sites can iframe it
}
