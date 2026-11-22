'use strict';

const { describe, it, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXTENSION_MODULE_PATH = require.resolve(path.join(REPO_ROOT, 'extension.js'));
const themeMetadata = require(path.join(REPO_ROOT, 'theme-metadata.json'));

const ORIGINAL_MODULE_LOAD = Module._load;

// Use the built Explorer bundle when present; fall back to a faithful temp fixture
// so extension unit tests stay runnable independently before Explorer builds.
let tempFixtureDir = null;
function getExplorerExtensionPath() {
  const realHtml = path.join(REPO_ROOT, 'assets', 'explorer', 'explorer.html');
  if (fs.existsSync(realHtml)) return REPO_ROOT;
  if (!tempFixtureDir) {
    tempFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-palette-ext-test-'));
    const explorerDir = path.join(tempFixtureDir, 'assets', 'explorer');
    fs.mkdirSync(explorerDir, { recursive: true });
    fs.writeFileSync(
      path.join(explorerDir, 'explorer.html'),
      [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head><meta charset="utf-8" />{{CSP_META}}<title>Campus Palette Explorer</title></head>',
        '<body data-target="webview" data-initial-theme="">',
        '  <div id="map-strip"><svg id="mds-svg"></svg></div>',
        '  <script nonce="{{CSP_NONCE}}">window.__explorerLoaded = true;</script>',
        '</body>',
        '</html>',
      ].join('\n')
    );
  }
  return tempFixtureDir;
}

function createVscodeMock(initialSettings = {}) {
  const settings = new Map(
    Object.entries({
      'workbench.colorTheme': 'Harvard Light',
      'campusPalette.showStatusBarItem': true,
      ...initialSettings,
    })
  );

  const configListeners = [];
  const commands = new Map();
  const updateCalls = [];
  const statusBarItems = [];
  const quickPicks = [];
  const webviewPanels = [];
  const infoMessages = [];
  const errorMessages = [];
  const statusBarMessages = [];
  const showQuickPickCalls = [];
  const clipboardWrites = [];
  let nextQuickPickResult = undefined;
  let failOnUpdate = null;
  let failOnClipboard = null;

  function makeConfigChangeEvent(changedKeys) {
    const keys = Array.isArray(changedKeys) ? changedKeys : [changedKeys];
    return {
      affectsConfiguration(section) {
        return keys.some(
          (k) => k === section || k.startsWith(`${section}.`) || section.startsWith(`${k}.`)
        );
      },
    };
  }

  function fireConfigChange(changedKeys) {
    const event = makeConfigChangeEvent(changedKeys);
    for (const listener of [...configListeners]) {
      listener(event);
    }
  }

  function setSetting(fullKey, value, { fireEvent = true } = {}) {
    settings.set(fullKey, value);
    if (fireEvent) {
      fireConfigChange(fullKey);
    }
  }

  function registerCommand(id, handler) {
    commands.set(id, handler);
    return {
      dispose() {
        if (commands.get(id) === handler) {
          commands.delete(id);
        }
      },
    };
  }

  const StatusBarAlignment = { Left: 1, Right: 2 };
  const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
  const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2 };
  const QuickPickItemKind = { Separator: -1, Default: 0 };

  const Uri = {
    file(fsPath) {
      return {
        fsPath,
        path: fsPath,
        scheme: 'file',
        toString() {
          return `file://${fsPath}`;
        },
      };
    },
    joinPath(base, ...segments) {
      const basePath = (base && (base.fsPath || base.path)) || String(base || '');
      const joined = path.join(basePath, ...segments);
      return Uri.file(joined);
    },
  };

  const vscode = {
    StatusBarAlignment,
    ConfigurationTarget,
    ViewColumn,
    QuickPickItemKind,
    Uri,
    workspace: {
      getConfiguration(section) {
        const resolveKey = (key) => (section ? `${section}.${key}` : key);
        return {
          get(key, defaultValue) {
            const fullKey = resolveKey(key);
            if (settings.has(fullKey) && settings.get(fullKey) !== undefined) {
              return settings.get(fullKey);
            }
            return defaultValue;
          },
          has(key) {
            return settings.has(resolveKey(key));
          },
          update(key, value, target) {
            if (failOnUpdate) {
              return Promise.reject(failOnUpdate);
            }
            const fullKey = resolveKey(key);
            updateCalls.push({ section: section || '', key, fullKey, value, target });
            settings.set(fullKey, value);
            fireConfigChange(fullKey);
            return Promise.resolve();
          },
        };
      },
      onDidChangeConfiguration(listener, thisArgs, disposables) {
        const bound = thisArgs ? listener.bind(thisArgs) : listener;
        configListeners.push(bound);
        const disposable = {
          dispose() {
            const idx = configListeners.indexOf(bound);
            if (idx >= 0) configListeners.splice(idx, 1);
          },
        };
        if (Array.isArray(disposables)) disposables.push(disposable);
        return disposable;
      },
    },
    commands: {
      registerCommand,
      async executeCommand(id, ...args) {
        const handler = commands.get(id);
        if (!handler) {
          throw new Error(`Command not registered: ${id}`);
        }
        return handler(...args);
      },
    },
    window: {
      registerCommand,
      createStatusBarItem(...args) {
        let id;
        let alignment;
        let priority;
        if (typeof args[0] === 'string') {
          [id, alignment, priority] = args;
        } else {
          [alignment, priority] = args;
        }
        const item = {
          id,
          alignment,
          priority,
          text: '',
          command: undefined,
          tooltip: undefined,
          visible: false,
          disposed: false,
          show() {
            this.visible = true;
          },
          hide() {
            this.visible = false;
          },
          dispose() {
            this.disposed = true;
            this.visible = false;
          },
        };
        statusBarItems.push(item);
        return item;
      },
      createQuickPick() {
        const activeListeners = [];
        const acceptListeners = [];
        const hideListeners = [];
        let hideFired = false;

        const qp = {
          title: '',
          placeholder: '',
          matchOnDescription: false,
          matchOnDetail: false,
          items: [],
          activeItems: [],
          selectedItems: [],
          shown: false,
          hidden: false,
          disposed: false,
          onDidChangeActive(cb) {
            activeListeners.push(cb);
            return { dispose() {} };
          },
          onDidAccept(cb) {
            acceptListeners.push(cb);
            return { dispose() {} };
          },
          onDidHide(cb) {
            hideListeners.push(cb);
            return { dispose() {} };
          },
          show() {
            this.shown = true;
            this.hidden = false;
            hideFired = false;
          },
          hide() {
            if (hideFired) return;
            hideFired = true;
            this.hidden = true;
            for (const cb of [...hideListeners]) {
              cb();
            }
          },
          dispose() {
            this.disposed = true;
          },
          async _emitDidChangeActive(items) {
            this.activeItems = items;
            for (const cb of [...activeListeners]) {
              await cb(items);
            }
            await Promise.resolve();
          },
          async _emitDidAccept(selectedItems) {
            if (selectedItems !== undefined) {
              this.selectedItems = selectedItems;
              this.activeItems = selectedItems;
            }
            for (const cb of [...acceptListeners]) {
              await cb();
            }
            await Promise.resolve();
          },
          async _emitDidHide() {
            if (hideFired) return;
            hideFired = true;
            this.hidden = true;
            for (const cb of [...hideListeners]) {
              await cb();
            }
            await Promise.resolve();
          },
        };
        quickPicks.push(qp);
        return qp;
      },
      createWebviewPanel(viewType, title, showOptions, options) {
        const messageListeners = [];
        const disposeListeners = [];
        const webview = {
          cspSource: 'https://vscode-resource.mock',
          html: '',
          postedMessages: [],
          postMessage(msg) {
            this.postedMessages.push(msg);
            return Promise.resolve(true);
          },
          onDidReceiveMessage(cb, thisArgs, disposables) {
            const bound = thisArgs ? cb.bind(thisArgs) : cb;
            messageListeners.push(bound);
            const disp = { dispose() {} };
            if (Array.isArray(disposables)) disposables.push(disp);
            return disp;
          },
          async _emitDidReceiveMessage(msg) {
            for (const cb of [...messageListeners]) {
              await cb(msg);
            }
          },
        };
        const panel = {
          viewType,
          title,
          showOptions,
          options,
          iconPath: undefined,
          webview,
          revealCount: 0,
          disposed: false,
          reveal() {
            this.revealCount += 1;
          },
          onDidDispose(cb, thisArgs, disposables) {
            const bound = thisArgs ? cb.bind(thisArgs) : cb;
            disposeListeners.push(bound);
            const disp = { dispose() {} };
            if (Array.isArray(disposables)) disposables.push(disp);
            return disp;
          },
          dispose() {
            if (this.disposed) return;
            this.disposed = true;
            for (const cb of [...disposeListeners]) {
              cb();
            }
          },
        };
        webviewPanels.push(panel);
        return panel;
      },
      showInformationMessage(msg, ...items) {
        infoMessages.push({ msg, items });
        return Promise.resolve(undefined);
      },
      showErrorMessage(msg, ...items) {
        errorMessages.push({ msg, items });
        return Promise.resolve(undefined);
      },
      setStatusBarMessage(text, timeout) {
        statusBarMessages.push({ text, timeout });
        return { dispose() {} };
      },
      showQuickPick(items, options) {
        showQuickPickCalls.push({ items, options });
        const result =
          typeof nextQuickPickResult === 'function'
            ? nextQuickPickResult(items, options)
            : nextQuickPickResult;
        return Promise.resolve(result);
      },
    },
    env: {
      clipboard: {
        writeText(text) {
          if (failOnClipboard) {
            return Promise.reject(failOnClipboard);
          }
          clipboardWrites.push(text);
          return Promise.resolve();
        },
      },
    },
  };

  return {
    vscode,
    settings,
    commands,
    updateCalls,
    statusBarItems,
    quickPicks,
    webviewPanels,
    infoMessages,
    errorMessages,
    statusBarMessages,
    showQuickPickCalls,
    clipboardWrites,
    setSetting,
    fireConfigChange,
    setNextQuickPickResult(val) {
      nextQuickPickResult = val;
    },
    setFailOnUpdate(err) {
      failOnUpdate = err;
    },
    setFailOnClipboard(err) {
      failOnClipboard = err;
    },
  };
}

function setupExtension(initialSettings = {}, { extensionPath } = {}) {
  const resolvedExtPath = extensionPath !== undefined ? extensionPath : getExplorerExtensionPath();
  const mock = createVscodeMock(initialSettings);

  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return mock.vscode;
    }
    return ORIGINAL_MODULE_LOAD.call(this, request, parent, isMain);
  };

  delete require.cache[EXTENSION_MODULE_PATH];
  const ext = require(EXTENSION_MODULE_PATH);

  const context = {
    extensionPath: resolvedExtPath,
    extensionUri: mock.vscode.Uri.file(resolvedExtPath),
    subscriptions: [],
  };

  ext.activate(context);

  return {
    ext,
    mock,
    context,
    invokeCommand: (id, ...args) => mock.vscode.commands.executeCommand(id, ...args),
  };
}

afterEach(() => {
  Module._load = ORIGINAL_MODULE_LOAD;
  delete require.cache[EXTENSION_MODULE_PATH];
});

after(() => {
  Module._load = ORIGINAL_MODULE_LOAD;
  if (tempFixtureDir) {
    fs.rmSync(tempFixtureDir, { recursive: true, force: true });
    tempFixtureDir = null;
  }
});

describe('extension: activation & command registration', () => {
  it('registers all 7 campusPalette.* commands, 9 initial subscriptions, and displays the status bar badge', () => {
    const { mock, context } = setupExtension({ 'workbench.colorTheme': 'Harvard Light' });

    const expectedCommands = [
      'campusPalette.toggleTheme',
      'campusPalette.pickTheme',
      'campusPalette.pickSimilarTheme',
      'campusPalette.randomTheme',
      'campusPalette.randomThemeSameMode',
      'campusPalette.syncOsThemePair',
      'campusPalette.openExplorer',
    ];

    assert.equal(mock.commands.size, 7);
    for (const id of expectedCommands) {
      assert.equal(typeof mock.commands.get(id), 'function', `Expected command "${id}" to be registered`);
    }

    assert.equal(context.subscriptions.length, 9);
    assert.equal(mock.statusBarItems.length, 1);
    const badge = mock.statusBarItems[0];
    assert.equal(badge.visible, true);
    assert.equal(badge.command, 'campusPalette.pickTheme');
    assert.equal(badge.text, '$(symbol-color) Harvard Light');
    assert.equal(badge.tooltip, 'Campus Palette: choose a university theme (live preview)');
  });
});

describe('extension: campusPalette.showStatusBarItem config', () => {
  it('shows badge when true even on external themes and hides it when false', () => {
    const { mock } = setupExtension({
      'workbench.colorTheme': 'Default Dark+',
      'campusPalette.showStatusBarItem': true,
    });
    const badge = mock.statusBarItems[0];
    assert.equal(badge.visible, true);
    assert.equal(badge.text, '$(symbol-color) Campus Palette');

    mock.setSetting('workbench.colorTheme', 'Oxford Dark');
    assert.equal(badge.text, '$(symbol-color) Oxford Dark');

    mock.setSetting('campusPalette.showStatusBarItem', false);
    assert.equal(badge.visible, false);

    mock.setSetting('campusPalette.showStatusBarItem', true);
    assert.equal(badge.visible, true);
  });

  it('responds to live config changes without emitting spurious activeThemeChanged messages and normalizes non-string labels', async () => {
    const { mock, invokeCommand } = setupExtension({
      'workbench.colorTheme': 'Harvard Light',
      'campusPalette.showStatusBarItem': false,
    });

    const badge = mock.statusBarItems[0];
    assert.equal(badge.visible, false);

    await invokeCommand('campusPalette.openExplorer');
    const panel = mock.webviewPanels[0];

    mock.setSetting('campusPalette.showStatusBarItem', true);
    assert.equal(badge.visible, true);
    mock.setSetting('campusPalette.showStatusBarItem', false);
    assert.equal(badge.visible, false);
    assert.equal(panel.webview.postedMessages.length, 0);

    mock.setSetting('workbench.colorTheme', 'ETH Zurich Dark');
    mock.setSetting('workbench.colorTheme', undefined);
    mock.setSetting('workbench.colorTheme', null);
    assert.deepEqual(panel.webview.postedMessages, [
      { type: 'activeThemeChanged', label: 'ETH Zurich Dark' },
      { type: 'activeThemeChanged', label: '' },
      { type: 'activeThemeChanged', label: '' },
    ]);

    mock.setSetting('workbench.colorTheme', 42, { fireEvent: false });
    await invokeCommand('campusPalette.openExplorer');
    assert.deepEqual(panel.webview.postedMessages[panel.webview.postedMessages.length - 1], {
      type: 'activeThemeChanged',
      label: '',
    });
  });
});

describe('extension: toggleTheme', () => {
  it("flips Light <-> Dark pairs across groupings including Queen's and St. Edward's apostrophe labels", async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Harvard Light' });

    const pairs = [
      ['Harvard Light', 'Harvard Dark'],
      ["Queen's Dark", "Queen's Light"],
      ["St. Edward's Light", "St. Edward's Dark"],
      ['U of T Light', 'U of T Dark'],
      ['UTokyo Dark', 'UTokyo Light'],
    ];

    for (const [start, toggled] of pairs) {
      mock.setSetting('workbench.colorTheme', start);
      await invokeCommand('campusPalette.toggleTheme');
      assert.equal(mock.settings.get('workbench.colorTheme'), toggled);
      assert.ok(
        mock.statusBarMessages.some((m) => m.text === `Theme switched to "${toggled}"` && m.timeout === 3000)
      );
      await invokeCommand('campusPalette.toggleTheme');
      assert.equal(mock.settings.get('workbench.colorTheme'), start);
    }
  });

  it('falls back to Harvard Light when active theme is external and contains async write errors', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Default Dark+' });

    await invokeCommand('campusPalette.toggleTheme');
    assert.equal(mock.settings.get('workbench.colorTheme'), 'Harvard Light');
    assert.equal(mock.errorMessages.length, 0);

    mock.setFailOnUpdate(new Error('toggle write blocked'));
    await invokeCommand('campusPalette.toggleTheme');
    assert.ok(
      mock.errorMessages.some((m) =>
        m.msg.includes('Campus Palette: failed to toggle theme -- toggle write blocked')
      )
    );
  });
});

describe('extension: pickTheme', () => {
  it('builds 126 items (6 collegiate grouping separators + 120 Light-before-Dark themes) with university, city & year metadata', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Oxford Dark' });

    await invokeCommand('campusPalette.pickTheme');
    assert.equal(mock.quickPicks.length, 1);

    const qp = mock.quickPicks[0];
    assert.equal(qp.shown, true);
    assert.equal(qp.title, 'Campus Palette — 60 Iconic Universities · 120 Themes');
    assert.equal(qp.matchOnDescription, true);
    assert.equal(qp.matchOnDetail, true);

    const separators = qp.items.filter((i) => i.kind === mock.vscode.QuickPickItemKind.Separator);
    const themeItems = qp.items.filter((i) => i.kind !== mock.vscode.QuickPickItemKind.Separator);

    assert.equal(separators.length, 6);
    assert.equal(themeItems.length, 120);
    assert.equal(qp.items.length, 126);

    const expectedGroups = [
      'Ivy League',
      'Canadian Universities',
      'US Public Flagships',
      'US Private Research & STEM',
      'Liberal Arts & Independent',
      'Global Universities',
    ];
    for (let i = 0; i < expectedGroups.length; i++) {
      assert.ok(
        separators[i].label.startsWith(expectedGroups[i]),
        `Expected separator ${i} to start with "${expectedGroups[i]}", got "${separators[i].label}"`
      );
    }

    const metaByLabel = new Map(themeMetadata.map((m) => [m.label, m]));
    for (let i = 0; i < themeItems.length; i += 2) {
      const lightItem = themeItems[i];
      const darkItem = themeItems[i + 1];
      const lightMeta = metaByLabel.get(lightItem.themeLabel);
      const darkMeta = metaByLabel.get(darkItem.themeLabel);

      assert.ok(lightMeta && darkMeta);
      assert.equal(lightMeta.mode, 'light');
      assert.equal(darkMeta.mode, 'dark');
      assert.equal(lightMeta.university, darkMeta.university);

      for (const [item, entry] of [
        [lightItem, lightMeta],
        [darkItem, darkMeta],
      ]) {
        assert.ok(item.description.includes(entry.university), `Missing university in "${item.description}"`);
        assert.ok(item.description.includes(entry.city), `Missing city in "${item.description}"`);
        assert.ok(item.description.includes(String(entry.year)), `Missing year in "${item.description}"`);
      }
    }

    assert.equal(qp.activeItems[0].themeLabel, 'Oxford Dark');
    assert.ok(qp.activeItems[0].description.includes('$(check) Active'));
  });

  it('live-previews highlighted themes, rolls back on Esc, ignores separators, commits on Enter, and contains async apply errors', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Harvard Light' });

    await invokeCommand('campusPalette.pickTheme');
    const qp = mock.quickPicks[0];
    const previewTarget = qp.items.find((i) => i.themeLabel === 'MIT Dark');
    assert.ok(previewTarget);

    await qp._emitDidChangeActive([previewTarget]);
    assert.equal(mock.settings.get('workbench.colorTheme'), 'MIT Dark');

    await qp._emitDidHide();
    assert.equal(qp.disposed, true);
    assert.equal(mock.settings.get('workbench.colorTheme'), 'Harvard Light');

    // Highlighting a separator and pressing Esc emits zero config writes
    const updatesBeforeSep = mock.updateCalls.length;
    await invokeCommand('campusPalette.pickTheme');
    const qpSep = mock.quickPicks[1];
    const sepItem = qpSep.items.find((i) => i.kind === mock.vscode.QuickPickItemKind.Separator);
    await qpSep._emitDidChangeActive([sepItem]);
    await qpSep._emitDidHide();
    assert.equal(qpSep.disposed, true);
    assert.equal(mock.updateCalls.length, updatesBeforeSep);

    // Committing on Enter keeps selected theme
    await invokeCommand('campusPalette.pickTheme');
    const qpAccept = mock.quickPicks[2];
    const chosen = qpAccept.items.find((i) => i.themeLabel === 'McGill Dark');
    await qpAccept._emitDidChangeActive([chosen]);
    await qpAccept._emitDidAccept([chosen]);
    assert.equal(qpAccept.disposed, true);
    assert.equal(mock.settings.get('workbench.colorTheme'), 'McGill Dark');

    // Async apply error contained cleanly
    await invokeCommand('campusPalette.pickTheme');
    const qpErr = mock.quickPicks[3];
    const errTarget = qpErr.items.find((i) => i.themeLabel === 'Yale Light');
    mock.setFailOnUpdate(new Error('settings locked'));
    await qpErr._emitDidAccept([errTarget]);
    assert.ok(
      mock.errorMessages.some((m) => m.msg.includes('Campus Palette: failed to apply theme -- settings locked'))
    );
  });
});

describe('extension: pickSimilarTheme', () => {
  it('lists 6 ascending CIEDE2000 neighbors, paired Light/Dark sibling, and farthest same-mode theme with live preview + Esc rollback', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Harvard Light' });
    const harvardLight = themeMetadata.find((m) => m.slug === 'harvard-light');

    await invokeCommand('campusPalette.pickSimilarTheme');
    assert.equal(mock.quickPicks.length, 1);

    const qp = mock.quickPicks[0];
    assert.equal(qp.shown, true);
    assert.equal(qp.title, 'Similar to Harvard Light (CIEDE2000 ΔE₀₀)');
    assert.equal(qp.items.length, 11);

    const separators = qp.items.filter((i) => i.kind === mock.vscode.QuickPickItemKind.Separator);
    assert.equal(separators.length, 3);
    assert.equal(separators[0].label, 'Nearest Chromatic Siblings to Harvard Light (CIEDE2000 ΔE₀₀)');
    assert.equal(separators[1].label, 'Paired Light / Dark Variant');
    assert.equal(separators[2].label, 'Maximum Chromatic Contrast (Farthest Same-Mode)');

    const selectable = qp.items.filter((i) => i.themeLabel);
    assert.equal(selectable.length, 8);
    const neighborItems = selectable.slice(0, 6);
    assert.equal(neighborItems[0].themeLabel, harvardLight.neighbors[0].label);
    assert.equal(neighborItems[0].deltaE00, harvardLight.neighbors[0].de00);
    assert.ok(neighborItems[0].description.includes(`ΔE₀₀ ${harvardLight.neighbors[0].de00.toFixed(1)}`));
    for (let i = 1; i < neighborItems.length; i++) {
      assert.ok(neighborItems[i].deltaE00 >= neighborItems[i - 1].deltaE00);
    }

    assert.equal(selectable[6].themeLabel, 'Harvard Dark');
    assert.ok(selectable[6].description.includes('Dark sibling · Harvard University'));

    assert.equal(selectable[7].themeLabel, harvardLight.farthest.label);
    assert.equal(selectable[7].deltaE00, harvardLight.farthest.de00);

    // Live preview + Esc rollback
    await qp._emitDidChangeActive([neighborItems[0]]);
    assert.equal(mock.settings.get('workbench.colorTheme'), neighborItems[0].themeLabel);
    await qp._emitDidHide();
    assert.equal(qp.disposed, true);
    assert.equal(mock.settings.get('workbench.colorTheme'), 'Harvard Light');
  });

  it('commits accepted similar theme, falls back to pickTheme on external themes, and contains async apply errors', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Oxford Dark' });

    await invokeCommand('campusPalette.pickSimilarTheme');
    const qp = mock.quickPicks[0];
    const firstNeighbor = qp.items.find((i) => i.themeLabel);
    await qp._emitDidChangeActive([firstNeighbor]);
    await qp._emitDidAccept([firstNeighbor]);
    assert.equal(mock.settings.get('workbench.colorTheme'), firstNeighbor.themeLabel);

    // External theme falls back to pickTheme with an info message
    mock.setSetting('workbench.colorTheme', 'Default Dark+');
    await invokeCommand('campusPalette.pickSimilarTheme');
    assert.ok(mock.infoMessages.some((m) => String(m.msg).includes('activate any Campus Palette theme')));
    assert.equal(mock.quickPicks.length, 2);
    assert.equal(mock.quickPicks[1].title, 'Campus Palette — 60 Iconic Universities · 120 Themes');

    // Async apply error contained cleanly
    mock.setSetting('workbench.colorTheme', 'Stanford Light');
    await invokeCommand('campusPalette.pickSimilarTheme');
    const qpErr = mock.quickPicks[2];
    const target = qpErr.items.find((i) => i.themeLabel);
    mock.setFailOnUpdate(new Error('disk readonly'));
    await qpErr._emitDidAccept([target]);
    assert.ok(
      mock.errorMessages.some((m) => m.msg.includes('Campus Palette: failed to apply theme -- disk readonly'))
    );
  });
});

describe('extension: randomTheme & randomThemeSameMode', () => {
  it('randomTheme never selects the currently active theme and contains write failures', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Harvard Light' });
    const validLabels = new Set(themeMetadata.map((t) => t.label));

    for (let i = 0; i < 30; i++) {
      const before = mock.settings.get('workbench.colorTheme');
      await invokeCommand('campusPalette.randomTheme');
      const afterTheme = mock.settings.get('workbench.colorTheme');
      assert.ok(validLabels.has(afterTheme), `Expected valid theme label, got "${afterTheme}"`);
      assert.notEqual(afterTheme, before);
      const lastToast = mock.statusBarMessages[mock.statusBarMessages.length - 1];
      assert.equal(lastToast.text, `Random theme: "${afterTheme}"`);
      assert.equal(lastToast.timeout, 3000);
    }

    mock.setFailOnUpdate(new Error('random write blocked'));
    await invokeCommand('campusPalette.randomTheme');
    assert.ok(
      mock.errorMessages.some((m) =>
        m.msg.includes('Campus Palette: failed to pick a random theme -- random write blocked')
      )
    );
  });

  it('randomThemeSameMode preserves polarity on dark/light themes, handles external themes, and guards non-finite RNG', async () => {
    const { ext, mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Cambridge Dark' });
    const metaByLabel = new Map(themeMetadata.map((t) => [t.label, t]));

    for (let i = 0; i < 20; i++) {
      const before = mock.settings.get('workbench.colorTheme');
      await invokeCommand('campusPalette.randomThemeSameMode');
      const next = mock.settings.get('workbench.colorTheme');
      const entry = metaByLabel.get(next);
      assert.ok(entry);
      assert.equal(entry.mode, 'dark');
      assert.notEqual(next, before);
    }

    mock.setSetting('workbench.colorTheme', 'UBC Light');
    for (let i = 0; i < 20; i++) {
      const before = mock.settings.get('workbench.colorTheme');
      await invokeCommand('campusPalette.randomThemeSameMode');
      const next = mock.settings.get('workbench.colorTheme');
      const entry = metaByLabel.get(next);
      assert.ok(entry);
      assert.equal(entry.mode, 'light');
      assert.notEqual(next, before);
    }

    mock.setSetting('workbench.colorTheme', 'Default Dark+');
    await invokeCommand('campusPalette.randomThemeSameMode');
    assert.ok(metaByLabel.has(mock.settings.get('workbench.colorTheme')));
    assert.equal(mock.errorMessages.length, 0);

    for (const val of [NaN, Infinity, -Infinity, -10, 999]) {
      const pick = ext.pickRandomTheme('Harvard Light', { rng: () => val });
      assert.ok(pick && typeof pick.label === 'string');
      assert.notEqual(pick.label, 'Harvard Light');
    }

    mock.setFailOnUpdate(new Error('same-mode write blocked'));
    await invokeCommand('campusPalette.randomThemeSameMode');
    assert.ok(
      mock.errorMessages.some((m) =>
        m.msg.includes('Campus Palette: failed to pick a random theme -- same-mode write blocked')
      )
    );
  });
});

describe('extension: syncOsThemePair', () => {
  it('syncs preferredLightColorTheme, preferredDarkColorTheme, and autoDetectColorScheme globally for active campus themes', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'U of T Dark' });

    await invokeCommand('campusPalette.syncOsThemePair');

    assert.equal(mock.settings.get('workbench.preferredLightColorTheme'), 'U of T Light');
    assert.equal(mock.settings.get('workbench.preferredDarkColorTheme'), 'U of T Dark');
    assert.equal(mock.settings.get('window.autoDetectColorScheme'), true);

    for (const key of [
      'workbench.preferredLightColorTheme',
      'workbench.preferredDarkColorTheme',
      'window.autoDetectColorScheme',
    ]) {
      const call = mock.updateCalls.find((c) => c.fullKey === key);
      assert.equal(call.target, mock.vscode.ConfigurationTarget.Global);
    }
    assert.equal(mock.infoMessages.length, 1);
    assert.equal(mock.errorMessages.length, 0);

    mock.setFailOnUpdate(new Error('sync write blocked'));
    await invokeCommand('campusPalette.syncOsThemePair');
    assert.ok(
      mock.errorMessages.some((m) =>
        m.msg.includes('Campus Palette: failed to sync OS Light/Dark pair -- sync write blocked')
      )
    );
  });

  it('prompts via 60-university QuickPick on external theme and exits silently on cancel', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Default Dark+' });

    mock.setNextQuickPickResult((items) => items.find((i) => i.label === 'ETH Zurich'));
    await invokeCommand('campusPalette.syncOsThemePair');

    assert.equal(mock.showQuickPickCalls.length, 1);
    const items = mock.showQuickPickCalls[0].items;
    assert.equal(items.length, 60);
    assert.equal(items[0].label, 'Harvard University');
    assert.equal(items[items.length - 1].label, 'Imperial College London');

    assert.equal(mock.settings.get('workbench.preferredLightColorTheme'), 'ETH Zurich Light');
    assert.equal(mock.settings.get('workbench.preferredDarkColorTheme'), 'ETH Zurich Dark');
    assert.equal(mock.settings.get('window.autoDetectColorScheme'), true);

    const updatesBeforeCancel = mock.updateCalls.length;
    mock.setNextQuickPickResult(undefined);
    await invokeCommand('campusPalette.syncOsThemePair');
    assert.equal(mock.updateCalls.length, updatesBeforeCancel);
  });
});

describe('extension: openExplorer & CSP3 webview hardening', () => {
  it("injects strict nonce CSP3, preserves apostrophes on Queen's Dark, escapes malicious labels, reveals existing panel, and rotates nonce on reopen", async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': "Queen's Dark" });

    await invokeCommand('campusPalette.openExplorer');
    assert.equal(mock.webviewPanels.length, 1);

    const panel = mock.webviewPanels[0];
    assert.equal(panel.viewType, 'campusPalette.explorer');
    assert.equal(panel.options.enableScripts, true);
    assert.equal(panel.options.retainContextWhenHidden, true);
    assert.ok(panel.options.localResourceRoots[0].fsPath.endsWith(path.join('assets', 'explorer')));
    assert.ok(panel.iconPath && panel.iconPath.fsPath.endsWith('icon.png'));

    const html = panel.webview.html;
    assert.ok(!html.includes('{{CSP_META}}'));
    assert.ok(!html.includes('{{CSP_NONCE}}'));
    assert.ok(html.includes('<meta http-equiv="Content-Security-Policy"'));
    assert.ok(html.includes("default-src 'none'"));

    const nonceMatch = html.match(/script-src 'nonce-([^']+)'/);
    assert.ok(nonceMatch && nonceMatch[1].length >= 16);
    const firstNonce = nonceMatch[1];
    assert.ok(html.includes(`<script nonce="${firstNonce}">`));
    assert.ok(html.includes('data-initial-theme="Queen\'s Dark"'));

    // Second invocation reveals existing panel and posts activeThemeChanged
    await invokeCommand('campusPalette.openExplorer');
    assert.equal(mock.webviewPanels.length, 1);
    assert.equal(panel.revealCount, 1);
    assert.deepEqual(panel.webview.postedMessages, [{ type: 'activeThemeChanged', label: "Queen's Dark" }]);

    // Dispose and reopen with malicious label -> fresh panel, rotated nonce, HTML-escaped attribute
    panel.dispose();
    const maliciousLabel = 'Fake "Theme" <script>&</script>';
    mock.setSetting('workbench.colorTheme', maliciousLabel);
    await invokeCommand('campusPalette.openExplorer');

    assert.equal(mock.webviewPanels.length, 2);
    const secondHtml = mock.webviewPanels[1].webview.html;
    const secondNonceMatch = secondHtml.match(/script-src 'nonce-([^']+)'/);
    assert.ok(secondNonceMatch && secondNonceMatch[1].length >= 16);
    assert.notEqual(secondNonceMatch[1], firstNonce);
    assert.ok(
      secondHtml.includes('data-initial-theme="Fake &quot;Theme&quot; &lt;script&gt;&amp;&lt;/script&gt;"')
    );
  });

  it('validates applyTheme, writes copyText to clipboard, contains message handler errors, and disposes panel on HTML load error', async () => {
    const { mock, invokeCommand } = setupExtension({ 'workbench.colorTheme': 'Harvard Light' });

    await invokeCommand('campusPalette.openExplorer');
    const panel = mock.webviewPanels[0];

    await panel.webview._emitDidReceiveMessage({ type: 'applyTheme', label: 'Yale Dark' });
    assert.equal(mock.settings.get('workbench.colorTheme'), 'Yale Dark');

    const updatesBefore = mock.updateCalls.length;
    await panel.webview._emitDidReceiveMessage({ type: 'applyTheme', label: 'Unknown Malicious Theme' });
    await panel.webview._emitDidReceiveMessage({ type: 'applyTheme', label: 12345 });
    await panel.webview._emitDidReceiveMessage({ type: 'applyTheme', label: 'toString' });
    await panel.webview._emitDidReceiveMessage(null);
    assert.equal(mock.updateCalls.length, updatesBefore);

    await panel.webview._emitDidReceiveMessage({ type: 'copyText', text: '#A51C30' });
    await panel.webview._emitDidReceiveMessage({ type: 'copyText', text: 12345 });
    await panel.webview._emitDidReceiveMessage({ type: 'copyText' });
    assert.deepEqual(mock.clipboardWrites, ['#A51C30']);

    mock.setFailOnClipboard(new Error('clipboard unavailable'));
    await panel.webview._emitDidReceiveMessage({ type: 'copyText', text: '#A51C30' });
    assert.ok(
      mock.errorMessages.some((m) =>
        m.msg.includes('Campus Palette: failed to handle Explorer action -- clipboard unavailable')
      )
    );

    // HTML load error disposes panel and leaves explorer state clean for subsequent open
    const missingDir = path.join(REPO_ROOT, '__missing_explorer_dir__');
    const failedEnv = setupExtension({ 'workbench.colorTheme': 'Harvard Light' }, { extensionPath: missingDir });
    await failedEnv.invokeCommand('campusPalette.openExplorer');
    assert.equal(failedEnv.mock.webviewPanels.length, 1);
    assert.equal(failedEnv.mock.webviewPanels[0].disposed, true);
    assert.ok(failedEnv.mock.errorMessages[0].msg.includes('Campus Palette: failed to open Explorer -- '));

    failedEnv.context.extensionPath = getExplorerExtensionPath();
    await failedEnv.invokeCommand('campusPalette.openExplorer');
    assert.equal(failedEnv.mock.webviewPanels.length, 2);
    assert.equal(failedEnv.mock.webviewPanels[1].disposed, false);
    assert.ok(failedEnv.mock.webviewPanels[1].webview.html.includes('id="map-strip"'));
  });
});

describe('extension: exported pure helpers & CSP3 sanitization', () => {
  it('exports exact 12 helpers and validates findByLabel, findBySlug, findSibling, findPairForUniversity, shouldShowStatusBar & deactivate', () => {
    const { ext } = setupExtension();

    assert.deepEqual(Object.keys(ext).sort(), [
      'activate',
      'buildQuickPickItems',
      'buildSimilarQuickPickItems',
      'buildWebviewHtmlFromSource',
      'deactivate',
      'escapeHtmlAttr',
      'findByLabel',
      'findBySlug',
      'findPairForUniversity',
      'findSibling',
      'pickRandomTheme',
      'shouldShowStatusBar',
    ]);

    const harvardLight = ext.findByLabel('Harvard Light');
    assert.equal(harvardLight.slug, 'harvard-light');
    assert.equal(ext.findByLabel('Not A Real Theme'), undefined);
    assert.equal(ext.findBySlug('stedwards-dark').label, "St. Edward's Dark");
    assert.equal(ext.findBySlug('unknown'), undefined);

    // findSibling mode validation and self-guard checks
    assert.equal(ext.findSibling(harvardLight).label, 'Harvard Dark');
    assert.equal(ext.findSibling({ slug: 'harvard-light' }).label, 'Harvard Dark');
    assert.equal(ext.findSibling({ slug: 'harvard-dark' }).label, 'Harvard Light');
    assert.equal(ext.findSibling({ slug: 'harvard-light', mode: 'sepia' }), undefined);
    assert.equal(ext.findSibling({ slug: 'harvard-light', mode: 'dark' }), undefined);
    assert.equal(ext.findSibling({ slug: 'harvard-dark', mode: 'light' }), undefined);
    assert.equal(ext.findSibling({ slug: 'harvard' }), undefined);
    assert.equal(ext.findSibling(null), undefined);

    // findPairForUniversity across full name, shortName, theme label, slug, and objects
    for (const q of ['University of Toronto', 'U of T', 'U of T Dark', 'utoronto-light', { slug: 'utoronto-dark' }, { label: 'U of T Light' }]) {
      const pair = ext.findPairForUniversity(q);
      assert.equal(pair.light.label, 'U of T Light');
      assert.equal(pair.dark.label, 'U of T Dark');
    }
    assert.equal(ext.findPairForUniversity('Unknown University'), null);
    assert.equal(ext.findPairForUniversity(null), null);
    assert.equal(ext.findPairForUniversity(123), null);

    assert.equal(ext.escapeHtmlAttr('a & "b" <c>'), 'a &amp; &quot;b&quot; &lt;c&gt;');
    assert.equal(ext.escapeHtmlAttr("St. Edward's Light"), "St. Edward's Light");

    assert.equal(ext.shouldShowStatusBar(true, false), true);
    assert.equal(ext.shouldShowStatusBar(false, true), false);
    assert.equal(ext.shouldShowStatusBar('always', false), true);
    assert.equal(ext.shouldShowStatusBar('whenActive', false), false);
    assert.equal(ext.shouldShowStatusBar('whenActive', true), true);
    assert.equal(ext.shouldShowStatusBar('never', true), false);
    assert.equal(ext.shouldShowStatusBar(undefined, false), true);

    assert.deepEqual(ext.buildSimilarQuickPickItems('Not A Real Theme'), []);
    assert.doesNotThrow(() => ext.deactivate());
  });

  it('hardens buildWebviewHtmlFromSource against CSP3 delimiter breakouts, XSS, $& expansion, and chained placeholder injection', () => {
    const { ext } = setupExtension();

    const rawHtml =
      '<html><head>{{CSP_META}}{{CSP_META}}</head><body data-initial-theme=""><div data-initial-theme=""></div><script nonce="{{CSP_NONCE}}"></script><script nonce="{{CSP_NONCE}}"></script></body></html>';
    const hostileCspSource =
      'https://csp.example" /><script>alert(1)&</script>; script-src \'unsafe-inline\',\r\n\x00';
    const hostileNonce = 'NONCE"><tag>&\' ;script-src, \t\nABC';
    const hostileInitialTheme = 'Queen\'s & "Dark" $& $1 $$ {{CSP_NONCE}}';

    const rendered = ext.buildWebviewHtmlFromSource(
      rawHtml,
      hostileCspSource,
      hostileNonce,
      hostileInitialTheme
    );

    assert.equal(rendered.includes("; script-src 'unsafe-inline'"), false);
    assert.equal(rendered.includes('<script>alert(1)'), false);
    assert.equal(rendered.includes('<tag>'), false);
    assert.ok(
      rendered.includes(
        'img-src https://csp.example&quot; /&gt;&lt;script&gt;alert(1)&amp;&lt;/script&gt; script-src unsafe-inline data:'
      )
    );
    assert.ok(rendered.includes("script-src 'nonce-NONCE&quot;&gt;&lt;tag&gt;&amp;script-srcABC';"));

    const scriptNonceMatches =
      rendered.match(/<script nonce="NONCE&quot;&gt;&lt;tag&gt;&amp;script-srcABC"><\/script>/g) || [];
    assert.equal(scriptNonceMatches.length, 2);

    assert.equal((rendered.match(/<meta http-equiv="Content-Security-Policy"/g) || []).length, 1);
    assert.ok(rendered.includes('/>{{CSP_META}}</head>'));
    assert.ok(rendered.includes('<div data-initial-theme=""></div>'));
    assert.ok(
      rendered.includes('data-initial-theme="Queen\'s &amp; &quot;Dark&quot; $&amp; $1 $$ {{CSP_NONCE}}"')
    );
  });
});
