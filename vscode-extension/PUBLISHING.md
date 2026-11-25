# Building, trying and publishing the extension

Everything here is done from a terminal. Commands that start with `cd` move you into a folder;
run the commands in the order shown.

You need **Node.js 22 or newer** (check with `node -v`) and **VS Code**.

## 1. Get the code ready (once per computer)

```
git clone https://github.com/SAIMKAXI/HeapHop.git
cd HeapHop
npm ci
cd vscode-extension
npm ci
```

The first `npm ci` installs what the website and the engine need; the second installs the two
tools the extension adds (VS Code's type definitions and `vsce`, the packaging tool).

## 2. Build the extension file

From the `vscode-extension` folder:

```
npm run package
```

This makes **`heaphop.vsix`** in the `vscode-extension` folder. That one file is the whole
extension.

## 3. Try it before publishing

In VS Code: open the **Extensions** view (Ctrl+Shift+X), click the **`...`** menu at its top,
choose **Install from VSIX...**, and pick `heaphop.vsix`. Then open any `.cpp` file and press
**Ctrl+Alt+H** (or the HeapHop button at the top right of the editor).

To remove it again: Extensions view → HeapHop → **Uninstall**.

Developers can also open the `vscode-extension` folder in VS Code and press **F5**: a second
VS Code window starts with the extension loaded, rebuilt from the current code.

## 4. Publish it for the first time

1. Go to **https://marketplace.visualstudio.com/manage** and sign in with a Microsoft account.
   Use one the whole team can reach (for example a shared HeapHop account), not one person's,
   so any of you can publish updates later.
2. Click **Create publisher**. Choose an **ID** (letters, numbers and dashes, for example
   `heaphop-team`). The ID can never be changed, and it becomes part of the extension's address.
3. Open `vscode-extension/package.json` and replace `"publisher": "heaphop"` with your ID:
   ```
   "publisher": "heaphop-team",
   ```
4. Build again: `npm run package`.
5. Back on the management page, click **+ New extension** → **Visual Studio Code**, and drop in
   `heaphop.vsix`. The Marketplace checks it for a few minutes, then it is live at
   `https://marketplace.visualstudio.com/items?itemName=<your-ID>.heaphop`, and anyone can
   install it from VS Code by searching for **HeapHop**.

Commit the `package.json` change so the publisher ID is saved in the repository.

## 5. Publish an update

1. Make your changes (in `src/` for the engine and the picture, which also changes the website;
   in `vscode-extension/` for the extension only).
2. Raise the version number, from the `vscode-extension` folder:
   ```
   npm run version:patch      for fixes:        1.0.0 → 1.0.1
   npm run version:minor      for new features: 1.0.0 → 1.1.0
   ```
   Every upload needs a higher version than the last one; the Marketplace refuses the same
   number twice.
3. Add a line about what changed at the top of `CHANGELOG.md`.
4. Build: `npm run package`.
5. On **https://marketplace.visualstudio.com/manage**, click the **`...`** next to HeapHop →
   **Update**, and drop in the new `heaphop.vsix`.

Everyone who installed HeapHop gets the update automatically: VS Code updates extensions on
its own. Commit the changes (with the new version number) afterwards.

Never unpublish the extension to fix something: unpublishing deletes its install count and
ratings. Publish an update instead.

### A note on publishing from the command line

`vsce publish` can also publish straight from the terminal, but it needs a Personal Access
Token, and Azure DevOps stops accepting the kind of token it needs ("All accessible
organizations") on **1 December 2026**. Uploading the `.vsix` on the management page, as above,
needs no token at all.

## 6. Check everything still works

From the `vscode-extension` folder:

```
npm run check
```

This type-checks the extension, runs its tests, builds it, and opens the panel in headless
Chrome (with the same security rules VS Code uses) to run and step through real programs. It
needs Google Chrome installed. Screenshots of the panel are saved in `test/screenshots/`.

From the repository's main folder, `npm run check` checks the website and the engine,
including the `std::list` test programs.
