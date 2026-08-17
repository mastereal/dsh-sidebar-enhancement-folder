// dsh-sidebar-enhancement-folder — Client half (browser bundle, __ModuleLoader__ contract)
// v0.5.0: PER-TAB reveal buttons embedded in each editor's own toolbar.
//
// better-sidebar renders EVERY tab's content in the DOM (pane > paneContent >
// paneTab, hidden ones via .paneTabHidden{display:none}) and every editor tab
// carries a span[class*="editorTitle"][title=<path>]. For EACH such paneTab we
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

  // ---- icon: official IconFolderOpen16 (outline style, currentColor) ----
  var FOLDER_ICON_SVG =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block" aria-hidden="true">' +
    '<path fill="currentColor" d="M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z"/>' +
    '<path opacity="0.2" fill="currentColor" d="M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z"/>' +
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
  *  预览/编辑 mode buttons when present (md/html), else the title header. */
  function toolbarOf(paneTab) {
    var toggle = paneTab.querySelector('[class*="editorModeToggle"]');
    if (toggle) {
      var row = toggle.parentElement;
      if (row) return row;
    }
    var title = paneTab.querySelector('[class*="editorTitle"]');
    if (title) {
      var header = title.parentElement;
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
      var titleEl = paneTab.querySelector('[class*="editorTitle"]');
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
        var t = pt.querySelector('[class*="editorTitle"]');
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
    dbg('client loaded (v1.0.0)');
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
