// dsh-sidebar-enhancement-folder — Client half (browser bundle, __ModuleLoader__ contract)
// v0.5.0: PER-TAB reveal buttons embedded in each editor's own toolbar.
// v1.0.2: adapted to dsh-better-sidebar 0.14 — the path source changed from
// span[class*="editorTitle"][title=<path>] to input[class*="editorPathInput"][title=<path>]
// (0.14 renders an editable path input in the editor header; the editorTitle
// class survives only on OrphanedTab where title is the tab TYPE, not a path).
// v1.0.6 (better-sidebar 0.19.1 adaptation): 0.19.1 moved editors OUT of the
// paneTab tree into the new dockkit layout —
//   [data-dsh-panel-host] > ... > section[data-dockkit-pane] >
//   div.nArs4W_nativeTabHost > div.nArs4W_editor > div.nArs4W_editorHeader >
//   input.nArs4W_editorPathInput
// — and left `[data-dsh-better-sidebar]` as a ZERO-HEIGHT shell. The old sync
// scanned `host.querySelectorAll('[class*="paneTab"]')`, so it found no editor
// (`editors=0`) and embedded nothing. The sync now anchors on the PATH INPUT
// itself (present in BOTH the paneTab structure and dockkit) and the observer
// watches the document body instead of the empty host.
//
// better-sidebar renders EVERY tab's content in the DOM and every editor tab
// carries a input[class*="editorPathInput"][title=<path>]. For EACH such input
// we embed ONE small "open containing folder" button into that editor's header
// row — the same position the user confirmed correct in v0.3.1. Each button
// points at ITS OWN path (read from the DOM, no active-pane logic), works for
// PDFs, and follows every layout change because it lives inside the editor's
// own header row.
//
// A global self-heal pass runs on store changes + document mutations + a 2s
// heartbeat: it (re)embeds missing buttons, refreshes each button's path, and
// removes any leftover/orphaned mount — no stale button can survive a layout
// rebuild.
window.__ModuleLoader__.load({ id: 'dsh-sidebar-enhancement-folder', factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;

  function dbg() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[dsh-sidebar-enhancement-folder]');
    try { console.log.apply(console, args); } catch (e) {}
  }
  var lastTrace = '';
  function trace(msg) {
    if (msg === lastTrace) return;
    lastTrace = msg;
    dbg(msg);
  }
  var lastCount = '';
  function countLog(msg) {
    if (msg === lastCount) return;
    lastCount = msg;
    dbg(msg);
  }

  // ---- icon: folder + magnifier (lucide "folder-search" outline), distinct
  // from better-sidebar 0.14's built-in "文件树面板" toggle, which uses the
  // same plain-folder icon our old button used (v1.0.3) ----
  var FOLDER_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="display:block" aria-hidden="true">' +
    '<path d="M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1"/>' +
    '<circle cx="17" cy="17" r="3"/>' +
    '<path d="m21 21-1.9-1.9"/>' +
    '</svg>';

  var MOUNT_ATTR = 'data-dsh-sidebar-enhancement-folder-mount';

  // ---- state ----
  var sidebarBs = null;
  var currentSessionId = '';
  var btnByInput = new Map(); // editorPathInput element -> button element (Map: needs forEach for the orphan sweep)

  function makeButton(input, path, sessionId) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(MOUNT_ATTR, '1');
    btn.title = '打开所在文件夹';
    btn.setAttribute('aria-label', '打开所在文件夹');
    btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;' +
      'width:22px;height:22px;border-radius:5px;cursor:pointer;padding:0;' +
      'border:none;background:transparent;' +
      'color:var(--dsw-alias-label-secondary,#999);flex:none;';
    btn.innerHTML = FOLDER_ICON_SVG;
    btn.addEventListener('mouseenter', function () {
      btn.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.15))';
      btn.style.color = 'var(--dsw-alias-label-primary,#ddd)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--dsw-alias-label-secondary,#999)';
    });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      // read the LATEST path/session (refreshed every sync pass)
      var p = btn.getAttribute('data-dsh-reveal-path') || '';
      var sid = btn.getAttribute('data-dsh-reveal-session') || '';
      dbg('reveal clicked:', p, 'session=', sid);
      fetch('/dsh-sidebar-enhancement-folder/reveal?path=' + encodeURIComponent(p) +
        '&sessionId=' + encodeURIComponent(sid)).catch(function (err) {
          dbg('reveal fetch error:', err);
        });
    });
    btn.setAttribute('data-dsh-reveal-path', path);
    btn.setAttribute('data-dsh-reveal-session', sessionId);
    return btn;
  }

  /** The header row of an editor, taken from the path input itself. In both
  *  structures (0.14–0.16 paneTab, 0.19+ dockkit) the input sits directly in
  *  `div[class*="editorHeader"]`; older versions also carried a
  *  `[class*="editorModeToggle"]` row, whose parent is that same header. */
  function toolbarOf(input) {
    var row = input.parentElement;
    if (!row) return null;
    var toggle = row.querySelector('[class*="editorModeToggle"]');
    if (toggle && toggle.parentElement) return toggle.parentElement;
    return row;
  }

  /**
  * THE single self-heal pass (IDEMPOTENT — steady state makes no DOM changes,
  * so the observer loop always settles). v1.0.6 anchors on every
  * `[class*="editorPathInput"][title]` in the document (found in both the old
  * paneTab structure and 0.19.1's dockkit layout — the paneTab scan is gone):
  * 1. remove every mount node inside that editor's header EXCEPT the tracked
  *    button — this kills duplicates left by innerHTML copies, stale plugin
  *    instances, or React rebuilds (the "button stays at the old spot" bug);
  * 2. rebuild the tracked button when missing or its path changed;
  * 3. ensure it sits in THIS editor's header, bound to THIS editor's own path —
  *    active tab or not;
  * 4. sweep every mount node whose header is no longer a live editor.
  */
  function sync() {
    var snap = sidebarBs ? sidebarBs.getSnapshot() : null;
    if (snap && snap.sessionId) currentSessionId = snap.sessionId;

    var inputs = document.querySelectorAll('[class*="editorPathInput"]');
    var editors = 0;
    var buttons = 0;
    var validRows = [];

    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var path = input.getAttribute('title');
      if (!path) continue;
      editors += 1;

      var btn = btnByInput.get(input);
      var needRebuild = !btn || !btn.isConnected || btn.getAttribute('data-dsh-reveal-path') !== path;

      if (needRebuild) {
        if (btn && btn.isConnected) {
          try { btn.parentNode.removeChild(btn); } catch (e) {}
        }
        btn = makeButton(input, path, currentSessionId);
        btnByInput.set(input, btn);
      } else {
        btn.setAttribute('data-dsh-reveal-session', currentSessionId);
      }

      var row = toolbarOf(input);
      if (!row) continue; // no header yet (loading edge); retry on next pass
      validRows.push(row);

      // remove every OTHER mount inside this header (duplicates/stale)
      var existing = row.querySelectorAll('[' + MOUNT_ATTR + ']');
      for (var x = 0; x < existing.length; x++) {
        if (existing[x] !== btn) {
          try { existing[x].parentNode.removeChild(existing[x]); } catch (e) {}
        }
      }

      if (btn.parentElement !== row) {
        try { btn.parentNode.removeChild(btn); } catch (e) {}
        row.appendChild(btn);
      }
      buttons += 1;
    }

    // orphan sweep: tracked buttons whose path input is gone must die
    var strays = [];
    btnByInput.forEach(function (b, input) {
      if (!input.isConnected) strays.push([input, b]);
    });
    for (var s = 0; s < strays.length; s++) {
      var b2 = strays[s][1];
      if (b2 && b2.isConnected) {
        try { b2.parentNode.removeChild(b2); } catch (e) {}
        dbg('orphan button removed');
      }
      btnByInput.delete(strays[s][0]);
    }
    // also sweep ANY mount node in the document that is not inside a live
    // editor header (defense against mounts from stale plugin instances)
    var allMounts = document.querySelectorAll('[' + MOUNT_ATTR + ']');
    for (var m = 0; m < allMounts.length; m++) {
      var mn = allMounts[m];
      var inValidRow = false;
      for (var v = 0; v < validRows.length; v++) {
        if (validRows[v] === mn.parentElement || validRows[v].contains(mn)) { inValidRow = true; break; }
      }
      if (!inValidRow) {
        try { mn.parentNode.removeChild(mn); } catch (e) {}
      }
    }
    countLog('editors=' + editors + ' buttons=' + buttons);
  }

  // ---- scheduling ----
  // v1.0.7: NO debounce. better-sidebar rebuilds the editor header on its own
  // cadence (~3s in a live session); the rebuild removes our button, and any
  // debounce window made that removal VISIBLE as a flicker. The observer now
  // schedules the idempotent sync on the next animation frame, so the button
  // is re-inserted before the browser paints the rebuilt header — the removal
  // never reaches the screen. Coalesced by the `syncScheduled` flag.
  var syncScheduled = false;
  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    var run = function () {
      syncScheduled = false;
      try { sync(); } catch (e) { trace('sync error: ' + ((e && e.message) || e)); }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else if (typeof Promise !== 'undefined') Promise.resolve().then(run);
    else window.setTimeout(run, 0);
  }

  var hostObserver = null;
  function startObserver() {
    function tryStart() {
      // v1.0.6: 0.19.1 keeps `[data-dsh-better-sidebar]` as a zero-height shell
      // and renders editors inside `[data-dsh-panel-host]`, so observing the
      // host would miss every layout change. Watch the document body instead.
      var target = document && document.body;
      if (!target) return false;
      if (hostObserver) return true;
      hostObserver = new MutationObserver(function () { scheduleSync(); });
      hostObserver.observe(target, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['title', 'class']
      });
      scheduleSync();
      return true;
    }
    if (tryStart()) return;
    var timer = setInterval(function () {
      if (tryStart()) {
        clearInterval(timer);
      }
    }, 500);
  }
  function stopObserver() {
    if (hostObserver) {
      try { hostObserver.disconnect(); } catch (e) {}
      hostObserver = null;
    }
  }

  // heartbeat: even if every observer dies, buttons are re-embedded and
  // strays swept — a stale button can never survive a layout rebuild.
  var heartbeatTimer = null;
  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function () {
      try { sync(); } catch (e) {}
    }, 2000);
  }
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function onResize() { scheduleSync(); }

  var apply = function (ctx) {
    dbg('client loaded (v1.0.7)');
    var bs = ctx.get('betterSidebar');
    var slots = ctx.get('slots');
    if (!bs || !slots) { dbg('apply: missing services, betterSidebar=', !!bs, 'slots=', !!slots); return; }
    sidebarBs = bs;
    var disposers = [];
    disposers.push(bs.subscribeState(function () { scheduleSync(); }));
    startObserver();
    window.addEventListener('resize', onResize);
    startHeartbeat();
    scheduleSync();
    var reg = slots.inject('shell.overlay', function () {
      return slots.register({
        name: 'shell.overlay',
        id: 'dsh-sidebar-enhancement-folder',
        order: 5,
        label: '打开所在文件夹',
        registrant: 'dsh-sidebar-enhancement-folder'
      }, function () { return null; });
    });
    if (reg) disposers.push(reg);
    return function () {
      syncScheduled = false;
      stopObserver();
      stopHeartbeat();
      window.removeEventListener('resize', onResize);
      btnByInput.clear();
      for (var i = 0; i < disposers.length; i++) {
        try { disposers[i](); } catch (e) {}
      }
    };
  };

  module.exports = { apply: apply, inject: ['betterSidebar'] };
  // The browser ModuleLoader materializes a bundle as factory(require)'s RETURN
  // value; without this explicit return the plugin is undefined.
  return module.exports;
}});
