/* WebLab compose.js
 * Pure functions that combine the three editor files (html/css/js) into:
 *  - a full preview document (inline <style>/<script>, plus an error forwarder)
 *  - an export set of files (index.html linking ./style.css and ./script.js)
 * UMD: usable in the browser (window.WeblabCompose) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WeblabCompose = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isFullDoc(html) {
    return /<html[\s>]/i.test(html || '');
  }

  function stripTags(s) {
    return String(s).replace(/<[^>]*>/g, ' ');
  }

  function titleFromHtml(html) {
    var m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m && stripTags(m[1]).trim()) return stripTags(m[1]).trim().slice(0, 80);
    var h = String(html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h && stripTags(h[1]).trim()) return stripTags(h[1]).trim().slice(0, 80);
    return 'My Page';
  }

  /* Script injected only into the *preview* document: forwards runtime errors
   * to the parent page so students see what broke, with the line number. */
  var ERROR_HOOK =
    '<script>window.addEventListener("error",function(e){try{parent.postMessage({' +
    'type:"weblab-error",message:(e.message||"Script error")+(e.lineno?" (line "+e.lineno+")":"")},"*")}catch(_){}});<' + '/script>';

  function injectIntoHead(doc, headContent) {
    if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, headContent + '\n</head>');
    var m = doc.match(/<body[^>]*>/i);
    if (m) return doc.replace(/(<body[^>]*>)/i, '$1\n' + headContent);
    return headContent + '\n' + doc;
  }

  function injectIntoBodyEnd(doc, bodyContent) {
    if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, '\n' + bodyContent + '\n</body>');
    return doc + '\n' + bodyContent;
  }

  function wrapFragment(html, headContent, bodyContent) {
    return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + escapeHtml(titleFromHtml(html)) + '</title>\n' +
      headContent + '\n</head>\n<body>\n' + (html || '') + '\n' + bodyContent + '\n</body>\n</html>';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Build the full document shown in the preview iframe. */
  function composePreview(code) {
    code = code || {};
    var html = code.html || '';
    var styleTag = '<style>\n' + (code.css || '') + '\n</style>';
    var scriptTag = '<script>\n' + (code.js || '') + '\n<' + '/script>';
    var headContent = ERROR_HOOK + '\n' + styleTag;

    if (isFullDoc(html)) {
      var doc = injectIntoHead(html, headContent);
      return injectIntoBodyEnd(doc, scriptTag);
    }
    return wrapFragment(html, headContent, scriptTag);
  }

  /* Build the downloadable file set. index.html references ./style.css and
   * ./script.js so the folder works offline: unzip, double-click, it opens. */
  function composeExport(code, projectName) {
    code = code || {};
    var html = code.html || '';
    var name = String(projectName || 'my-site');
    var linkTag = '<link rel="stylesheet" href="style.css">';
    var scriptTag = '<script src="script.js"><' + '/script>';
    var doc;

    if (isFullDoc(html)) {
      doc = injectIntoHead(html, linkTag);
      doc = injectIntoBodyEnd(doc, scriptTag);
    } else {
      doc = wrapFragment(html, linkTag, scriptTag);
    }

    var readme =
      name + ' — exported from WebLab\n' +
      '==================================\n\n' +
      'HOW TO OPEN YOUR SITE:\n' +
      '  1. Unzip this file (right-click -> Extract All, or double-click it).\n' +
      '  2. Open the folder it created.\n' +
      '  3. Double-click index.html — your site opens in the web browser!\n\n' +
      'FILES:\n' +
      '  index.html : the structure of your page\n' +
      '  style.css  : the design (colors, fonts, layout)\n' +
      '  script.js  : the behavior (what happens when you interact)\n\n' +
      'Created with WebLab, the classroom code playground.\n';

    return {
      files: [
        { name: 'index.html', content: doc },
        { name: 'style.css', content: code.css || '' },
        { name: 'script.js', content: code.js || '' },
        { name: 'README.txt', content: readme }
      ]
    };
  }

  return {
    composePreview: composePreview,
    composeExport: composeExport,
    isFullDoc: isFullDoc,
    titleFromHtml: titleFromHtml
  };
});
