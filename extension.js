'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vscode = require('vscode');
const themeMetadata = require('./theme-metadata.json');

const DEFAULT_THEME = 'Harvard Light';
const TOGGLE_COMMAND_ID = 'campusPalette.toggleTheme';
const PICK_COMMAND_ID = 'campusPalette.pickTheme';
const PICK_SIMILAR_COMMAND_ID = 'campusPalette.pickSimilarTheme';
const RANDOM_COMMAND_ID = 'campusPalette.randomTheme';
const RANDOM_SAME_MODE_COMMAND_ID = 'campusPalette.randomThemeSameMode';
const SYNC_OS_PAIR_COMMAND_ID = 'campusPalette.syncOsThemePair';
const EXPLORER_COMMAND_ID = 'campusPalette.openExplorer';

function findByLabel(label) {
  return themeMetadata.find((t) => t.label === label);
}

function findBySlug(slug) {
  return themeMetadata.find((t) => t.slug === slug);
}

function findSibling(entry) {
  if (!entry || typeof entry.slug !== 'string') return undefined;

  let currentMode;
  if (entry.mode !== undefined) {
    if (entry.mode !== 'light' && entry.mode !== 'dark') return undefined;
    currentMode = entry.mode;
  } else {
    const modeMatch = entry.slug.match(/-(light|dark)$/);
    if (!modeMatch) return undefined;
    currentMode = modeMatch[1];
  }

  const otherMode = currentMode === 'light' ? 'dark' : 'light';
  const uniSlug = entry.slug.replace(/-(light|dark)$/, '');
  return themeMetadata.find(
    (t) => t.slug !== entry.slug && t.slug.replace(/-(light|dark)$/, '') === uniSlug && t.mode === otherMode
  );
}

function findPairForUniversity(universityOrEntry) {
  if (!universityOrEntry) return null;
  let universityName = null;
  let shortName = null;
  let uniSlug = null;

  if (typeof universityOrEntry === 'object') {
    universityName = universityOrEntry.university || null;
    shortName = universityOrEntry.shortName || null;
    if (typeof universityOrEntry.slug === 'string') {
      uniSlug = universityOrEntry.slug.replace(/-(light|dark)$/, '');
    }
    if (!universityName && !shortName && !uniSlug && typeof universityOrEntry.label === 'string') {
      const byLabel = findByLabel(universityOrEntry.label);
      if (byLabel) {
        universityName = byLabel.university;
        shortName = byLabel.shortName;
        uniSlug = byLabel.slug.replace(/-(light|dark)$/, '');
      }
    }
  } else if (typeof universityOrEntry === 'string') {
    const byLabel = findByLabel(universityOrEntry) || findByLabel(`${universityOrEntry} Light`);
    if (byLabel) {
      universityName = byLabel.university;
      shortName = byLabel.shortName;
      uniSlug = byLabel.slug.replace(/-(light|dark)$/, '');
    } else {
      universityName = universityOrEntry;
      shortName = universityOrEntry;
      uniSlug = universityOrEntry.replace(/-(light|dark)$/, '');
    }
  } else {
    return null;
  }

  const matches = themeMetadata.filter(
    (t) =>
      (universityName && t.university === universityName) ||
      (shortName && t.shortName === shortName) ||
      (uniSlug && t.slug.replace(/-(light|dark)$/, '') === uniSlug)
  );
  const light = matches.find((t) => t.mode === 'light');
  const dark = matches.find((t) => t.mode === 'dark');
  if (!light || !dark) return null;
  return { light, dark };
}

async function setTheme(label) {
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', label, vscode.ConfigurationTarget.Global);
}

function escapeHtmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function shouldShowStatusBar(visibilitySetting, isCampusThemeActive) {
  if (visibilitySetting === false || visibilitySetting === 'never') return false;
  if (visibilitySetting === 'whenActive') return Boolean(isCampusThemeActive);
  return true;
}

function buildQuickPickItems(currentThemeLabel, separatorKind) {
  const sepKind =
    separatorKind !== undefined
      ? separatorKind
      : vscode && vscode.QuickPickItemKind && vscode.QuickPickItemKind.Separator !== undefined
        ? vscode.QuickPickItemKind.Separator
        : -1;

  // Group by the 6 collegiate groupings, preserving the chronological
  // founding-year order (Light before Dark) baked into theme-metadata.json.
  const groups = [];
  for (const entry of themeMetadata) {
    let bucket = groups.find((g) => g.group === entry.group);
    if (!bucket) {
      bucket = { group: entry.group, universities: new Set(), entries: [] };
      groups.push(bucket);
    }
    bucket.universities.add(entry.university);
    bucket.entries.push(entry);
  }

  const items = [];
  for (const bucket of groups) {
    items.push({
      label: `${bucket.group} (${bucket.universities.size} universities · ${bucket.entries.length} themes)`,
      kind: sepKind,
    });
    for (const entry of bucket.entries) {
      const isCurrent = entry.label === currentThemeLabel;
      const modeLabel = entry.mode === 'light' ? 'Light' : 'Dark';
      const meta = `${modeLabel} · ${entry.university} · ${entry.city} · ${entry.year}`;
      items.push({
        label: entry.label,
        description: isCurrent ? `${meta}  $(check) Active` : meta,
        detail: entry.subtitle || undefined,
        themeLabel: entry.label,
      });
    }
  }

  return items;
}

function buildSimilarQuickPickItems(currentThemeLabel, separatorKind) {
  const sepKind =
    separatorKind !== undefined
      ? separatorKind
      : vscode && vscode.QuickPickItemKind && vscode.QuickPickItemKind.Separator !== undefined
        ? vscode.QuickPickItemKind.Separator
        : -1;

  const current = findByLabel(currentThemeLabel);
  if (!current) return [];

  const items = [];
  const neighbors = Array.isArray(current.neighbors) ? current.neighbors : [];
  if (neighbors.length > 0) {
    items.push({
      label: `Nearest Chromatic Siblings to ${current.label} (CIEDE2000 ΔE₀₀)`,
      kind: sepKind,
    });
    for (const nb of neighbors) {
      const target = findBySlug(nb.slug);
      if (!target) continue;
      const modeLabel = target.mode === 'light' ? 'Light' : 'Dark';
      const deVal = nb.de00 !== undefined ? nb.de00 : nb.de;
      items.push({
        label: target.label,
        description: `ΔE₀₀ ${Number(deVal).toFixed(1)} · ${modeLabel} · ${target.university} · ${target.group} · ${target.year}`,
        detail: target.subtitle || undefined,
        themeLabel: target.label,
        deltaE00: deVal,
      });
    }
  }

  const sib = findSibling(current);
  if (sib) {
    items.push({
      label: 'Paired Light / Dark Variant',
      kind: sepKind,
    });
    items.push({
      label: sib.label,
      description: `${sib.mode === 'light' ? 'Light' : 'Dark'} sibling · ${sib.university} · ${sib.city} · ${sib.year}`,
      detail: sib.subtitle || undefined,
      themeLabel: sib.label,
    });
  }

  if (current.farthest) {
    const far = findBySlug(current.farthest.slug);
    if (far) {
      const farDe = current.farthest.de00 !== undefined ? current.farthest.de00 : current.farthest.de;
      items.push({
        label: 'Maximum Chromatic Contrast (Farthest Same-Mode)',
        kind: sepKind,
      });
      items.push({
        label: far.label,
        description: `ΔE₀₀ ${Number(farDe).toFixed(1)} · ${far.mode === 'light' ? 'Light' : 'Dark'} · ${far.university} · ${far.group} · ${far.year}`,
        detail: far.subtitle || undefined,
        themeLabel: far.label,
        deltaE00: farDe,
      });
    }
  }

  return items;
}

function pickRandomTheme(currentLabel, options = {}) {
  const sameMode = typeof options === 'boolean' ? options : Boolean(options && options.sameMode);
  const rng = options && typeof options.rng === 'function' ? options.rng : Math.random;

  const currentEntry = findByLabel(currentLabel);
  let pool = themeMetadata;
  if (sameMode && currentEntry) {
    pool = themeMetadata.filter((t) => t.mode === currentEntry.mode);
  }
  const choices = pool.filter((t) => t.label !== currentLabel);
  const candidates = choices.length > 0 ? choices : pool;
  const rawRng = Number(rng());
  const safeRng = Number.isFinite(rawRng) ? rawRng : 0;
  const idx = Math.floor(safeRng * candidates.length);
  return candidates[Math.min(Math.max(idx, 0), candidates.length - 1)];
}

function buildWebviewHtmlFromSource(rawHtml, cspSource, nonce, initialThemeLabel) {
  const safeCspSource = escapeHtmlAttr(String(cspSource || '').replace(/[';,\x00-\x1f\x7f]/g, ''));
  const safeNonce = escapeHtmlAttr(String(nonce || '').replace(/[';,\s\x00-\x1f\x7f]/g, ''));
  const safeInitialTheme = escapeHtmlAttr(initialThemeLabel);
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${safeCspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${safeNonce}';" />`;

  let replacedCspMeta = false;
  let replacedInitialTheme = false;

  return String(rawHtml).replace(
    /\{\{CSP_META\}\}|\{\{CSP_NONCE\}\}|data-initial-theme=""/g,
    (match) => {
      if (match === '{{CSP_META}}') {
        if (replacedCspMeta) return match;
        replacedCspMeta = true;
        return cspMeta;
      }
      if (match === '{{CSP_NONCE}}') {
        return safeNonce;
      }
      if (match === 'data-initial-theme=""') {
        if (replacedInitialTheme) return match;
        replacedInitialTheme = true;
        return `data-initial-theme="${safeInitialTheme}"`;
      }
      return match;
    }
  );
}

function buildWebviewHtml(context, webview, initialThemeLabel) {
  const htmlPath = path.join(context.extensionPath, 'assets', 'explorer', 'explorer.html');
  const rawHtml = fs.readFileSync(htmlPath, 'utf8');
  const nonce = crypto.randomBytes(16).toString('base64');
  return buildWebviewHtmlFromSource(rawHtml, webview.cspSource, nonce, initialThemeLabel);
}

function activate(context) {
  let explorerPanel = null;

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = PICK_COMMAND_ID;
  statusBarItem.tooltip = 'Campus Palette: choose a university theme (live preview)';

  function updateStatusBarItem() {
    const currentLabel = vscode.workspace.getConfiguration('workbench').get('colorTheme');
    const entry = findByLabel(currentLabel);
    const visibility = vscode.workspace
      .getConfiguration('campusPalette')
      .get('showStatusBarItem', true);

    statusBarItem.text = entry ? `$(symbol-color) ${entry.label}` : '$(symbol-color) Campus Palette';
    if (shouldShowStatusBar(visibility, Boolean(entry))) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  }
  updateStatusBarItem();

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    const themeChanged = e.affectsConfiguration('workbench.colorTheme');
    const statusBarChanged = e.affectsConfiguration('campusPalette.showStatusBarItem');
    if (themeChanged || statusBarChanged) {
      updateStatusBarItem();
    }
    if (themeChanged && explorerPanel) {
      const rawLabel = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      const currentLabel = typeof rawLabel === 'string' ? rawLabel : '';
      explorerPanel.webview
        .postMessage({ type: 'activeThemeChanged', label: currentLabel })
        .then(undefined, () => {});
    }
  });

  async function handleToggle() {
    try {
      const currentLabel = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      const currentEntry = findByLabel(currentLabel);
      const sibling = currentEntry ? findSibling(currentEntry) : undefined;
      const nextLabel = sibling ? sibling.label : DEFAULT_THEME;

      // Only workbench.colorTheme is touched, via the standard configuration API.
      await setTheme(nextLabel);
      vscode.window.setStatusBarMessage(`Theme switched to "${nextLabel}"`, 3000);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Campus Palette: failed to toggle theme -- ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const toggleDisposable = vscode.commands.registerCommand(TOGGLE_COMMAND_ID, handleToggle);

  const pickDisposable = vscode.commands.registerCommand(PICK_COMMAND_ID, async () => {
    try {
      const originalTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      const items = buildQuickPickItems(originalTheme, vscode.QuickPickItemKind.Separator);
      const activeItem = items.find((item) => item.themeLabel === originalTheme) || null;

      const qp = vscode.window.createQuickPick();
      qp.title = 'Campus Palette — 40 Iconic Universities · 80 Themes';
      qp.placeholder = 'Filter by university, grouping, city, or year · Arrow for live preview · Enter to keep · Esc to restore';
      qp.matchOnDescription = true;
      qp.matchOnDetail = true;
      qp.items = items;
      if (activeItem) qp.activeItems = [activeItem];

      let accepted = false;
      let lastPreviewed = originalTheme;

      qp.onDidChangeActive((active) => {
        const candidate = active && active[0] && active[0].themeLabel;
        if (candidate && candidate !== lastPreviewed) {
          lastPreviewed = candidate;
          setTheme(candidate).catch(() => {});
        }
      });

      qp.onDidAccept(async () => {
        try {
          const selected = qp.selectedItems && qp.selectedItems[0];
          if (selected && selected.themeLabel) {
            accepted = true;
            qp.hide();
            await setTheme(selected.themeLabel);
          }
        } catch (err) {
          vscode.window.showErrorMessage(
            `Campus Palette: failed to apply theme -- ${err instanceof Error ? err.message : String(err)}`
          );
        }
      });

      qp.onDidHide(async () => {
        qp.dispose();
        if (!accepted && originalTheme && lastPreviewed !== originalTheme) {
          await setTheme(originalTheme).catch(() => {});
        }
      });

      qp.show();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Campus Palette: failed to open theme picker -- ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  const pickSimilarDisposable = vscode.commands.registerCommand(PICK_SIMILAR_COMMAND_ID, async () => {
    try {
      const originalTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      const currentEntry = findByLabel(originalTheme);
      if (!currentEntry) {
        vscode.window.showInformationMessage(
          'Campus Palette: activate any Campus Palette theme first to browse its nearest CIEDE2000 neighbors.'
        );
        await vscode.commands.executeCommand(PICK_COMMAND_ID);
        return;
      }

      const items = buildSimilarQuickPickItems(originalTheme, vscode.QuickPickItemKind.Separator);
      const firstSelectable = items.find((item) => item.themeLabel) || null;

      const qp = vscode.window.createQuickPick();
      qp.title = `Similar to ${currentEntry.label} (CIEDE2000 ΔE₀₀)`;
      qp.placeholder = 'Arrow for live preview · Enter to keep · Esc to restore';
      qp.matchOnDescription = true;
      qp.matchOnDetail = true;
      qp.items = items;
      if (firstSelectable) qp.activeItems = [firstSelectable];

      let accepted = false;
      let lastPreviewed = originalTheme;

      qp.onDidChangeActive((active) => {
        const candidate = active && active[0] && active[0].themeLabel;
        if (candidate && candidate !== lastPreviewed) {
          lastPreviewed = candidate;
          setTheme(candidate).catch(() => {});
        }
      });

      qp.onDidAccept(async () => {
        try {
          const selected = qp.selectedItems && qp.selectedItems[0];
          if (selected && selected.themeLabel) {
            accepted = true;
            qp.hide();
            await setTheme(selected.themeLabel);
          }
        } catch (err) {
          vscode.window.showErrorMessage(
            `Campus Palette: failed to apply theme -- ${err instanceof Error ? err.message : String(err)}`
          );
        }
      });

      qp.onDidHide(async () => {
        qp.dispose();
        if (!accepted && originalTheme && lastPreviewed !== originalTheme) {
          await setTheme(originalTheme).catch(() => {});
        }
      });

      qp.show();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Campus Palette: failed to open similar-theme picker -- ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  const randomDisposable = vscode.commands.registerCommand(RANDOM_COMMAND_ID, async () => {
    try {
      const currentLabel = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      const pick = pickRandomTheme(currentLabel);
      await setTheme(pick.label);
      vscode.window.setStatusBarMessage(`Random theme: "${pick.label}"`, 3000);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Campus Palette: failed to pick a random theme -- ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  const randomSameModeDisposable = vscode.commands.registerCommand(RANDOM_SAME_MODE_COMMAND_ID, async () => {
    try {
      const currentLabel = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      const pick = pickRandomTheme(currentLabel, { sameMode: true });
      await setTheme(pick.label);
      vscode.window.setStatusBarMessage(`Random ${pick.mode} theme: "${pick.label}"`, 3000);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Campus Palette: failed to pick a random theme -- ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  const syncOsPairDisposable = vscode.commands.registerCommand(SYNC_OS_PAIR_COMMAND_ID, async () => {
    try {
      const currentLabel = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      const currentEntry = findByLabel(currentLabel);
      let pair = currentEntry ? findPairForUniversity(currentEntry) : null;

      if (!pair) {
        const universityItems = [];
        const seen = new Set();
        for (const entry of themeMetadata) {
          if (seen.has(entry.university)) continue;
          seen.add(entry.university);
          const candidatePair = findPairForUniversity(entry.university);
          if (!candidatePair) continue;
          universityItems.push({
            label: entry.university,
            description: `${entry.group} · ${entry.city} · ${entry.year}`,
            detail: `${candidatePair.light.label} ↔ ${candidatePair.dark.label}`,
            universityName: entry.university,
          });
        }

        const chosen = await vscode.window.showQuickPick(universityItems, {
          title: 'Campus Palette — Sync OS Light/Dark Pair',
          placeHolder: 'Choose a university whose Light & Dark themes will follow your OS appearance',
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (!chosen) return;
        pair = findPairForUniversity(chosen.universityName || chosen.label);
      }

      if (!pair) {
        vscode.window.showErrorMessage('Campus Palette: could not find both Light and Dark themes for that university.');
        return;
      }

      const workbenchConfig = vscode.workspace.getConfiguration('workbench');
      const windowConfig = vscode.workspace.getConfiguration('window');
      await workbenchConfig.update(
        'preferredLightColorTheme',
        pair.light.label,
        vscode.ConfigurationTarget.Global
      );
      await workbenchConfig.update(
        'preferredDarkColorTheme',
        pair.dark.label,
        vscode.ConfigurationTarget.Global
      );
      await windowConfig.update('autoDetectColorScheme', true, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        `Campus Palette: OS Light/Dark auto-switching synced to "${pair.light.label}" ↔ "${pair.dark.label}".`
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        `Campus Palette: failed to sync OS Light/Dark pair -- ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  const explorerDisposable = vscode.commands.registerCommand(EXPLORER_COMMAND_ID, () => {
    let panel = null;
    try {
      const rawLabel = vscode.workspace.getConfiguration('workbench').get('colorTheme');
      const currentLabel = typeof rawLabel === 'string' ? rawLabel : '';
      if (explorerPanel) {
        explorerPanel.reveal(vscode.ViewColumn.Active);
        explorerPanel.webview.postMessage({ type: 'activeThemeChanged', label: currentLabel }).then(undefined, () => {});
        return;
      }

      panel = vscode.window.createWebviewPanel(
        'campusPalette.explorer',
        'Campus Palette Explorer',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'assets', 'explorer')],
        }
      );

      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
      panel.webview.html = buildWebviewHtml(context, panel.webview, currentLabel);

      panel.webview.onDidReceiveMessage(
        async (msg) => {
          try {
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'applyTheme' && typeof msg.label === 'string' && findByLabel(msg.label)) {
              await setTheme(msg.label);
            } else if (msg.type === 'copyText' && typeof msg.text === 'string') {
              await vscode.env.clipboard.writeText(msg.text);
            }
          } catch (err) {
            vscode.window.showErrorMessage(
              `Campus Palette: failed to handle Explorer action -- ${err instanceof Error ? err.message : String(err)}`
            );
          }
        },
        undefined,
        context.subscriptions
      );

      panel.onDidDispose(
        () => {
          if (explorerPanel === panel) {
            explorerPanel = null;
          }
        },
        undefined,
        context.subscriptions
      );

      explorerPanel = panel;
    } catch (err) {
      if (panel && !explorerPanel) {
        try {
          panel.dispose();
        } catch {
          // Ignore secondary dispose errors during cleanup of a failed panel.
        }
      }
      vscode.window.showErrorMessage(
        `Campus Palette: failed to open Explorer -- ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  context.subscriptions.push(
    statusBarItem,
    configListener,
    toggleDisposable,
    pickDisposable,
    pickSimilarDisposable,
    randomDisposable,
    randomSameModeDisposable,
    syncOsPairDisposable,
    explorerDisposable
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  findByLabel,
  findBySlug,
  findSibling,
  findPairForUniversity,
  escapeHtmlAttr,
  shouldShowStatusBar,
  buildQuickPickItems,
  buildSimilarQuickPickItems,
  pickRandomTheme,
  buildWebviewHtmlFromSource,
};
