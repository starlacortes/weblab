/* WebLab transform tests — run: npm test */
'use strict';
const assert = require('assert');
const C = require('../public/compose.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('composePreview:');

t('wraps a fragment into a full document with title from <h1>', () => {
  const doc = C.composePreview({ html: '<h1>My Fun Page</h1><p>hi</p>', css: 'body{}', js: '' });
  assert(doc.startsWith('<!DOCTYPE html>'), 'should start with doctype');
  assert(/<title>My Fun Page<\/title>/.test(doc), 'title should come from h1');
  assert(doc.includes('<style>'), 'inline style should be injected');
  assert(doc.includes('<h1>My Fun Page</h1>'), 'original html preserved');
  assert(!doc.includes('src="script.js"'), 'preview must not reference external script.js');
});

t('injects inline style before </head> in a full document', () => {
  const html = '<!DOCTYPE html><html><head><title>T</title></head><body><p>x</p></body></html>';
  const doc = C.composePreview({ html, css: 'h1{color:red}', js: 'console.log(1)' });
  assert(doc.indexOf('<style>') < doc.indexOf('</head>'), 'style before </head>');
  assert(doc.indexOf('<script>') < doc.indexOf('</body>'), 'script before </body>');
  assert(doc.includes('<title>T</title>'), 'existing title preserved');
});

t('includes the error-forwarder hook', () => {
  const doc = C.composePreview({ html: '<p>x</p>', css: '', js: '' });
  assert(doc.includes('weblab-error'), 'error hook present');
});

t('handles empty html without throwing', () => {
  const doc = C.composePreview({ html: '', css: '', js: '' });
  assert(doc.includes('<body>'));
});

console.log('composeExport:');

t('index.html links style.css and script.js relatively', () => {
  const exp = C.composeExport({ html: '<h1>Hi</h1>', css: 'body{}', js: 'let x=1;' }, 'demo site');
  const idx = exp.files.find(f => f.name === 'index.html').content;
  assert(idx.includes('<link rel="stylesheet" href="style.css">'), 'css link');
  assert(idx.includes('<script src="script.js">'), 'js script tag');
  assert(!idx.includes('weblab-error'), 'no preview hook in export');
  const css = exp.files.find(f => f.name === 'style.css').content;
  const js = exp.files.find(f => f.name === 'script.js').content;
  assert.strictEqual(css, 'body{}');
  assert.strictEqual(js, 'let x=1;');
});

t('full documents keep their own head, tags injected correctly', () => {
  const html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>Custom</title>\n</head>\n<body>\n<p>yo</p>\n</body>\n</html>';
  const exp = C.composeExport({ html, css: 'a{}', js: 'b{}' }, 'x');
  const idx = exp.files.find(f => f.name === 'index.html').content;
  const linkPos = idx.indexOf('<link rel="stylesheet" href="style.css">');
  const headEnd = idx.indexOf('</head>');
  assert(linkPos > -1 && linkPos < headEnd, 'link inside head');
  const scriptPos = idx.indexOf('<script src="script.js">');
  const bodyEnd = idx.indexOf('</body>');
  assert(scriptPos > -1 && scriptPos < bodyEnd, 'script before </body>');
  assert(idx.includes('<title>Custom</title>'));
});

t('export includes README.txt with instructions', () => {
  const exp = C.composeExport({ html: '<p>x</p>', css: '', js: '' }, 'demo');
  const rd = exp.files.find(f => f.name === 'README.txt').content;
  assert(rd.includes('index.html'));
  assert(rd.includes('demo'));
});

t('title is escaped in preview', () => {
  const doc = C.composePreview({ html: '<h1><script>x</script> & stuff</h1>', css: '', js: '' });
  const m = doc.match(/<title>([\s\S]*?)<\/title>/);
  assert(m, 'title exists');
  assert(!m[1].includes('<'), 'no raw tags in title: ' + m[1]);
  assert(m[1].includes('&amp;'), 'ampersand escaped');
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
