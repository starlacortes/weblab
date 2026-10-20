/* WebLab app.js — client logic: tabs, editors, live preview, AI chat, ZIP download */
(function () {
  'use strict';

  var LS_KEY = 'weblab.v1';
  var Compose = window.WeblabCompose;

  // ------------------------------------------------------------------ starter

  var STARTER_HTML = [
    '<!-- This is the HTML tab: the STRUCTURE of your page -->',
    '<h1>Welcome to WebLab! 🧪</h1>',
    '<p>Edit the code on the left and watch the Preview tab on the right.</p>',
    '',
    '<button id="party-btn">🎉 Click me!</button>',
    '<p id="counter">Clicks: 0</p>'
  ].join('\n');

  var STARTER_CSS = [
    '/* This is the CSS tab: how your page LOOKS */',
    'body {',
    '  font-family: system-ui, sans-serif;',
    '  padding: 32px;',
    '  background: #f0f4ff;',
    '  color: #1e293b;',
    '}',
    '',
    'h1 {',
    '  color: #4f46e5;',
    '}',
    '',
    'button {',
    '  padding: 10px 18px;',
    '  font-size: 16px;',
    '  border: none;',
    '  border-radius: 8px;',
    '  background: #4f46e5;',
    '  color: white;',
    '  cursor: pointer;',
    '}',
    '',
    'button:hover {',
    '  background: #4338ca;',
    '}'
  ].join('\n');

  var STARTER_JS = [
    '// This is the JavaScript tab: how your page BEHAVES',
    'let clicks = 0;',
    '',
    "document.getElementById('party-btn').addEventListener('click', () => {",
    '  clicks = clicks + 1;',
    "  document.getElementById('counter').textContent = 'Clicks: ' + clicks;",
    "  document.body.style.background = clicks % 2 === 0 ? '#f0f4ff' : '#e0e7ff';",
    '});'
  ].join('\n');

  var STARTER_CHAT_HINT = [
    '💬 <strong>New here?</strong> Ask me things like:',
    '• "How do I add an image?"',
    '• "Why is my button not working?"',
    '• "Give me a cool CSS hover effect"',
    '• "What does <code class="inline-code">&lt;div&gt;</code> do?"'
  ].join('<br>');

  // ------------------------------------------------------------------- state

  var state = {
    projectName: 'my-site',
    html: STARTER_HTML,
    css: STARTER_CSS,
    js: STARTER_JS,
    chat: []
  };

  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.html === 'string') state.html = saved.html;
      if (typeof saved.css === 'string') state.css = saved.css;
      if (typeof saved.js === 'string') state.js = saved.js;
      if (Array.isArray(saved.chat)) state.chat = saved.chat.slice(-40);
      if (typeof saved.projectName === 'string' && saved.projectName) state.projectName = saved.projectName;
    }
  } catch (e) { /* corrupt localStorage — start fresh */ }

  // ------------------------------------------------------------------ helpers

  function $(id) { return document.getElementById(id); }

  var saveTimer = null;
  function persist(showStatus) {
    if (showStatus) $('save-status').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* full/blocked */ }
      $('save-status').textContent = 'Saved ✓';
    }, 400);
  }

  var toastTimer = null;
  function toast(text, ms) {
    var el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, ms || 3200);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Very small markdown renderer for tutor replies:
   * fenced ``` blocks, `inline code`, **bold**, bullets. Everything escaped first. */
  function renderMarkdown(md) {
    var parts = String(md).split('```');
    return parts.map(function (part, i) {
      if (i % 2 === 1) {
        var nl = part.indexOf('\n');
        var body = nl >= 0 ? part.slice(nl + 1) : part;
        return '<pre class="code-block"><code>' + escapeHtml(body.replace(/\n$/, '')) + '</code></pre>';
      }
      var s = escapeHtml(part);
      s = s.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/^- (.*)$/gm, '• $1');
      s = s.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
      return s;
    }).join('');
  }

  // ------------------------------------------------------------- editor tabs

  var EDITOR_TABS = [
    { id: 'html', label: 'HTML', mode: 'htmlmixed', hint: 'Structure' },
    { id: 'css', label: 'CSS', mode: 'css', hint: 'Design' },
    { id: 'js', label: 'JS', mode: 'javascript', hint: 'Behavior' }
  ];
  var activeEditorTab = 'html';

  var editorTabsEl = $('editor-tabs');
  EDITOR_TABS.forEach(function (t) {
    var b = document.createElement('button');
    b.className = 'tab' + (t.id === activeEditorTab ? ' active' : '');
    b.dataset.tab = t.id;
    b.title = t.hint;
    b.textContent = t.label;
    b.addEventListener('click', function () { switchEditorTab(t.id); });
    editorTabsEl.appendChild(b);
  });

  function refreshEditorTabHighlight() {
    editorTabsEl.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === activeEditorTab);
    });
  }

  // ------------------------------------------------------------- CodeMirror

  var cm = null;          // CodeMirror instance, or null for textarea fallback
  var fallbackTA = null;
  var textareaEl = $('editor');

  if (window.CodeMirror) {
    cm = CodeMirror.fromTextArea(textareaEl, {
      mode: 'htmlmixed',
      theme: 'material-darker',
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      autoCloseBrackets: false
    });
    cm.setValue(state.html);
    cm.on('change', onEditorChange);
  } else {
    // No CodeMirror (offline vendoring failed): plain textarea, still fully functional.
    textareaEl.classList.add('fallback');
    textareaEl.value = state.html;
    textareaEl.addEventListener('input', onEditorChange);
    fallbackTA = textareaEl;
  }

  function getEditorValue() { return cm ? cm.getValue() : textareaEl.value; }
  function setEditorValue(v) {
    if (cm) { cm.setValue(v); } else { textareaEl.value = v; }
  }
  function setEditorMode(mode) {
    if (cm) cm.setOption('mode', mode);
  }

  function switchEditorTab(id) {
    state[activeEditorTab] = getEditorValue();   // save outgoing tab
    activeEditorTab = id;
    var tab = EDITOR_TABS.find(function (t) { return t.id === id; });
    setEditorMode(tab.mode);
    setEditorValue(state[id]);
    refreshEditorTabHighlight();
    if (cm) cm.focus();
  }

  var previewTimer = null;
  function onEditorChange() {
    state[activeEditorTab] = getEditorValue();
    persist(true);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 700);
  }

  // ---------------------------------------------------------------- preview

  var previewFrame = $('preview-frame');

  function updatePreview() {
    previewFrame.srcdoc = Compose.composePreview(state);
    $('error-bar').classList.add('hidden');
  }

  // Errors forwarded from the sandboxed preview iframe:
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'weblab-error') {
      $('error-text').textContent = '⚠ ' + e.data.message;
      $('error-bar').classList.remove('hidden');
    }
  });
  $('error-close').addEventListener('click', function () {
    $('error-bar').classList.add('hidden');
  });

  // -------------------------------------------------------------- view tabs

  var VIEW_TABS = [
    { id: 'preview', label: '👀 Preview' },
    { id: 'chat', label: '🤖 AI Tutor' }
  ];
  var activeViewTab = 'preview';

  var viewTabsEl = $('view-tabs');
  VIEW_TABS.forEach(function (t) {
    var b = document.createElement('button');
    b.className = 'tab' + (t.id === activeViewTab ? ' active' : '');
    b.dataset.view = t.id;
    b.textContent = t.label;
    b.addEventListener('click', function () { switchViewTab(t.id); });
    viewTabsEl.appendChild(b);
  });

  function switchViewTab(id) {
    activeViewTab = id;
    viewTabsEl.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === id);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + id);
    });
    if (id === 'preview') updatePreview();
    if (id === 'chat') scrollChatToBottom();
  }

  // ------------------------------------------------------------------ chat

  var chatLog = $('chat-log');
  var chatForm = $('chat-form');
  var chatText = $('chat-text');
  var chatSend = $('chat-send');
  var chatBusy = false;
  var aiConfigured = null;

  function appendMsgEl(role, html, cls) {
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + role + (cls ? ' ' + cls : '');
    wrap.innerHTML =
      '<div class="avatar">' + (role === 'user' ? '🧑‍🎓' : '🤖') + '</div>' +
      '<div class="bubble">' + html + '</div>';
    chatLog.appendChild(wrap);
    scrollChatToBottom();
    return wrap;
  }

  function scrollChatToBottom() {
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderChat() {
    chatLog.innerHTML = '';
    if (!state.chat.length) {
      var hint = document.createElement('div');
      hint.className = 'chat-hint';
      hint.innerHTML = STARTER_CHAT_HINT;
      chatLog.appendChild(hint);
      return;
    }
    state.chat.forEach(function (m) {
      appendMsgEl(m.role === 'user' ? 'user' : 'tutor', renderMarkdown(m.content));
    });
  }

  async function checkHealth() {
    try {
      var res = await fetch('/api/health');
      var data = await res.json();
      aiConfigured = !!data.aiConfigured;
      if (!aiConfigured) $('chat-banner').classList.remove('hidden');
    } catch (e) {
      $('chat-banner').classList.remove('hidden');
    }
  }

  async function sendChat() {
    var text = chatText.value.trim();
    if (!text || chatBusy) return;

    if (aiConfigured === false) {
      toast('The AI tutor is not configured on the server yet — ask your teacher. 🛠️');
      return;
    }

    chatBusy = true;
    chatSend.disabled = true;
    chatText.value = '';

    state.chat.push({ role: 'user', content: text });
    appendMsgEl('user', escapeHtml(text));
    persist(false);

    var typing = appendMsgEl('tutor', 'Thinking…', 'typing');

    // send recent history + current code
    var history = state.chat.slice(-10).map(function (m) {
      return { role: m.role, content: m.content };
    });
    var code = { html: state.html, css: state.css, js: state.js };

    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, code: code })
      });
      var data = await res.json();
      typing.remove();
      if (!res.ok) {
        appendMsgEl('tutor', '⚠️ ' + escapeHtml(data.error || 'Something went wrong. Try again.'));
      } else {
        state.chat.push({ role: 'assistant', content: data.reply });
        appendMsgEl('tutor', renderMarkdown(data.reply));
        persist(false);
      }
    } catch (e) {
      typing.remove();
      appendMsgEl('tutor', '⚠️ Could not reach the server. Check your internet connection.');
    }

    chatBusy = false;
    chatSend.disabled = false;
    chatText.focus();
  }

  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    sendChat();
  });

  // Enter sends (Shift+Enter = new line)
  chatText.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  // ------------------------------------------------------------ project name

  var nameInput = $('project-name');
  nameInput.value = state.projectName;
  nameInput.addEventListener('input', function () {
    state.projectName = nameInput.value;
    persist(false);
  });

  // --------------------------------------------------------------- download

  $('download-btn').addEventListener('click', async function () {
    try {
      state[activeEditorTab] = getEditorValue(); // make sure current tab is saved
      if (!window.JSZip) { toast('ZIP library not loaded — check the server logs.'); return; }

      var name = sanitizeName(state.projectName) || 'my-site';
      var exp = Compose.composeExport(state, name);

      var zip = new JSZip();
      var folder = zip.folder(name);
      exp.files.forEach(function (f) { folder.file(f.name, f.content); });

      var blob = await zip.generateAsync({ type: 'blob' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name + '.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('ZIP saved ✓ — unzip it and double-click index.html!');
    } catch (e) {
      console.error(e);
      toast('Could not build the ZIP: ' + (e && e.message ? e.message : 'unknown error'));
    }
  });

  function sanitizeName(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  // ------------------------------------------------------------------ reset

  $('reset-btn').addEventListener('click', function () {
    if (!confirm('Start fresh? This clears your code and chat history.')) return;
    state = {
      projectName: 'my-site',
      html: STARTER_HTML,
      css: STARTER_CSS,
      js: STARTER_JS,
      chat: []
    };
    nameInput.value = state.projectName;
    activeEditorTab = 'html';
    setEditorMode('htmlmixed');
    setEditorValue(state.html);
    refreshEditorTabHighlight();
    renderChat();
    persist(true);
    updatePreview();
    toast('Fresh start! 🌱');
  });

  // --------------------------------------------------------------- splitter

  var divider = $('divider');
  var paneLeft = $('pane-left');
  var dragging = false;

  divider.addEventListener('pointerdown', function (e) {
    dragging = true;
    divider.classList.add('dragging');
    divider.setPointerCapture(e.pointerId);
  });
  divider.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var rect = $('workbench').getBoundingClientRect();
    var pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.min(75, Math.max(25, pct));
    paneLeft.style.width = pct + '%';
    if (cm) cm.refresh();
  });
  function endDrag() {
    dragging = false;
    divider.classList.remove('dragging');
    if (cm) cm.refresh();
  }
  divider.addEventListener('pointerup', endDrag);
  divider.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', function () { if (cm) cm.refresh(); });

  // Ctrl/Cmd+S: everything autosaves anyway; make it explicit and satisfying.
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      persist(false);
      toast('Saved ✓ (your work is saved automatically)');
    }
  });

  // ------------------------------------------------------------------- init

  renderChat();
  updatePreview();
  checkHealth();
})();
