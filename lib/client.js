// dsh-sidebar-enhancement-folder — Client half (browser bundle, __ModuleLoader__ contract)
// v0.5.0: PER-TAB reveal buttons embedded in each editor's own toolbar.
// v1.0.2: adapted to dsh-better-sidebar 0.14 — the path source changed from
// span[class*="editorTitle"][title=<path>] to input[class*="editorPathInput"][title=<path>]
// (0.14 renders an editable path input in the editor header; the editorTitle
// class survives only on OrphanedTab where title is the tab TYPE, not a path).
//
// better-sidebar renders EVERY tab's content in the DOM (pane > paneContent >
// paneTab, hidden ones via .paneTabHidden{display:none}) and every editor tab
// carries a input[class*="editorPathInput"][title=<path>]. For EACH such paneTab we
// embed ONE small "open containing folder" button into that editor's toolbar
// row (the header that holds the built-in 预览/编辑 mode buttons, or the title
// header for PDF/image/binary viewers) — the same position the user confirmed
// correct in v0.3.1. Each button points at ITS OWN paneTab's path (read from
// the DOM, no active-pane logic), works for PDFs, and follows every layout
// change because it lives inside the paneTab's own header row.
//
// A global self-heal pass runs on store changes + host mutations + a 2s
// heartbeat: it (re)embeds missing buttons, refreshes each button's path, and
// removes any leftover/orphaned mount from paneTabs that no longer exist or
// whose path changed — no stale button can survive a layout rebuild.
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
  var btnByPaneTab = new Map(); // paneTab element -> button element (Map: needs forEach for the orphan sweep)

  function makeButton(paneTab, path, sessionId) {
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

  /** The toolbar row of an editor paneTab: the header holding the built-in
  *  预览/编辑 mode buttons when present (md/html), else the path-input
  *  header. */
  function toolbarOf(paneTab) {
    var toggle = paneTab.querySelector('[class*="editorModeToggle"]');
    if (toggle) {
      var row = toggle.parentElement;
      if (row) return row;
    }
    var pathInput = paneTab.querySelector('[class*="editorPathInput"]');
    if (pathInput) {
      var header = pathInput.parentElement;
      if (header) return header;
    }
    return null;
  }

  /**
  * THE single self-heal pass (IDEMPOTENT — steady state makes no DOM changes,
  * so the observer loop always settles). For every paneTab in the DOM:
  * 1. remove every mount node inside it EXCEPT the tracked button — this kills
  *    duplicates left by innerHTML copies, stale plugin instances, or React
  *    rebuilds (the "button stays at the old spot" bug);
  * 2. rebuild the tracked button when missing or its path changed;
  * 3. ensure it sits in THIS paneTab's toolbar (mode-toggle header, else the
  *    title header), bound to THIS paneTab's own editorTitle[title] path —
  *    active tab or not.
  */
  function sync() {
    var host = document.querySelector('[data-dsh-better-sidebar]');
    if (!host) return;
    var snap = sidebarBs ? sidebarBs.getSnapshot() : null;
    if (snap && snap.sessionId) currentSessionId = snap.sessionId;

    var paneTabs = host.querySelectorAll('[class*="paneTab"]');
    var editors = 0;
    var buttons = 0;

    for (var i = 0; i < paneTabs.length; i++) {
      var paneTab = paneTabs[i];
      var titleEl = paneTab.querySelector('[class*="editorPathInput"]');
      if (!titleEl) continue;
      var path = titleEl.getAttribute('title');
      if (!path) continue;
      editors += 1;

      var btn = btnByPaneTab.get(paneTab);
      var needRebuild = !btn || !btn.isConnected || btn.getAttribute('data-dsh-reveal-path') !== path;

      // remove every OTHER mount inside this paneTab (duplicates/stale)
      var existing = paneTab.querySelectorAll('[' + MOUNT_ATTR + ']');
      for (var x = 0; x < existing.length; x++) {
        if (existing[x] !== btn) {
          try { existing[x].parentNode.removeChild(existing[x]); } catch (e) {}
        }
      }

      if (needRebuild) {
        if (btn && btn.isConnected) {
          try { btn.parentNode.removeChild(btn); } catch (e) {}
        }
        btn = makeButton(paneTab, path, currentSessionId);
        btnByPaneTab.set(paneTab, btn);
      } else {
        btn.setAttribute('data-dsh-reveal-session', currentSessionId);
      }

      var row = toolbarOf(paneTab);
      if (!row) continue; // no toolbar yet (loading edge); retry on next pass
      if (btn.parentElement !== row) {
        try { btn.parentNode.removeChild(btn); } catch (e) {}
        row.appendChild(btn);
      }
      buttons += 1;
    }

    // orphan sweep: buttons not bound to a current editor paneTab must die
    var strays = [];
    btnByPaneTab.forEach(function (b, pt) {
      if (!paneTabIsCurrent(pt, paneTabs)) strays.push([pt, b]);
    });
    for (var s = 0; s < strays.length; s++) {
      var b2 = strays[s][1];
      if (b2 && b2.isConnected) {
        try { b2.parentNode.removeChild(b2); } catch (e) {}
        dbg('orphan button removed');
      }
      btnByPaneTab.delete(strays[s][0]);
    }
    // also sweep ANY mount node in the document that is not inside a current
    // editor paneTab (defense against mounts from stale plugin instances
    // that are still in this document)
    var allMounts = document.querySelectorAll('[' + MOUNT_ATTR + ']');
    for (var m = 0; m < allMounts.length; m++) {
      var mn = allMounts[m];
      if (!paneTabIsCurrent(mn.parentElement ? closestPaneTab(mn) : null, paneTabs)) {
        try { mn.parentNode.removeChild(mn); } catch (e) {}
      }
    }
    countLog('paneTabs: editors=' + editors + ' buttons=' + buttons);
  }

  function closestPaneTab(el) {
    var n = el;
    while (n) {
      if (n.className && typeof n.className === 'string' && n.className.indexOf('paneTab') !== -1) return n;
      n = n.parentElement;
    }
    return null;
  }
  function paneTabIsCurrent(pt, paneTabs) {
    if (!pt) return false;
    for (var i = 0; i < paneTabs.length; i++) {
      if (paneTabs[i] === pt) {
        // only editor paneTabs (with a path) count
        var t = pt.querySelector('[class*="editorPathInput"]');
        return !!(t && t.getAttribute('title'));
      }
    }
    return false;
  }

  // ---- scheduling ----
  var syncTimer = null;
  function scheduleSync() {
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(function () {
      syncTimer = null;
      try { sync(); } catch (e) { trace('sync error: ' + ((e && e.message) || e)); }
    }, 120);
  }

  var hostObserver = null;
  function startObserver() {
    function tryStart() {
      var host = document.querySelector('[data-dsh-better-sidebar]');
      if (!host) return false;
      if (hostObserver) return true;
      hostObserver = new MutationObserver(function () { scheduleSync(); });
      hostObserver.observe(host, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['style', 'class', 'title']
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
    dbg('client loaded (v1.0.4)');
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
      if (syncTimer) { window.clearTimeout(syncTimer); syncTimer = null; }
      stopObserver();
      stopHeartbeat();
      window.removeEventListener('resize', onResize);
      btnByPaneTab.clear();
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
