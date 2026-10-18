# Community themes and plugins

Everything here can be installed by every MixMusic user from the
marketplace (the store icon of the sidebar). The app reads
[registry.json](registry.json), which lists the themes in `themes/` and the
plugins in `plugins/`, and downloads the files of what the user installs.

## Share yours

1. Make it, following [docs/themes.md](../docs/themes.md) or
   [docs/plugins.md](../docs/plugins.md), and try it from your add-ons folder.
2. Fork this repository and add its folder:
   - a theme: `community/themes/<id>/`, with `theme.json` and its other files;
   - a plugin: `community/plugins/<id>/`, with `plugin.json` and its other
     files.
3. List every file of the folder in the manifest's `files`.
4. Update the registry, and check it:

   ```sh
   go run ./tools/registry
   go run ./tools/registry -check
   ```

5. Open a pull request titled `feat(community): add the <name> theme` (or
   plugin), with a screenshot of it in MixMusic.

To update your add-on, change its files, raise its `version`, run the
registry again, and open a pull request: users see the update in the
marketplace.

## What reviewers check

- The manifest is valid and its `id` is new, lowercase letters, digits and
  dashes; `tools/registry -check` passes.
- The `description` says what it is in one sentence, and `author` is you.
- Themes: every color reads on its ground (text on `bg`, `accent-text` on
  `accent`, `tile-text` on each tile: 4.5:1 at least), options work, and the
  stylesheet styles the hooks of [docs/themes.md](../docs/themes.md).
- Plugins: the code is readable (no minified or obfuscated code), loads
  nothing from other servers unless its `permissions` say `network` and the
  description says why, and cleans up after itself. Plugins run with
  everything MixMusic can do, so reviewers read every line.
- No add-on uses the logos or the look of other brands, or presents itself as
  official.
- An add-on's folder stays under 4 MB.

By opening the pull request, you agree that your add-on is published under
the [MIT license](../LICENSE), as the rest of the repository.
