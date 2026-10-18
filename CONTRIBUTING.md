# Contributing

Thank you for helping. There are three ways in: themes and plugins for the
community registry, fixes and features of the app, and reports of what does
not work.

## Themes and plugins

[community/README.md](community/README.md) tells how to share a theme or a
plugin: a pull request adding one folder.

## The app

You need [Go](https://go.dev/dl/) 1.27 or later and [Bun](https://bun.sh).

```sh
git clone https://github.com/fzn0x/mixmusic
cd mixmusic
bun install
bun run dev
```

`bun run dev` builds the app, starts it, and rebuilds it as you edit the Go
code; the interface reloads as you edit `src/`. Development builds keep their
data apart from an installed MixMusic, under the name `MixMusic Dev`.

Before you open a pull request:

```sh
gofmt -l .                      # prints nothing
go vet ./... && GOOS=linux go vet ./...
go test ./...
bun run typecheck
go run ./tools/registry -check
```

[docs/architecture.md](docs/architecture.md) tells where things live. A few
rules keep the project healthy:

- **Both systems.** Changes must build for Windows and Linux; `GOOS=linux go vet ./...` checks it from Windows.
- **The theme contract is public.** Community themes style the `--mm-*`
  variables, root attributes and `mm-*` classes of
  [docs/themes.md](docs/themes.md): rename or remove one only with a plan
  for the themes that use it, and document new ones there.
- **The plugin API is public.** Change `src/plugins/api.ts` and
  `sdk/index.d.ts` together; the typecheck fails when they differ.
- **Tests do not need the network.** Parsers are tested on recorded
  responses in `testdata/`; live tests run only with `MIXMUSIC_LIVE=1`.
- **Honest errors.** When a service refuses something, say what and how to
  get past it, in the words of the interface.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org),
one change per commit:

```
feat(player): crossfade between tracks
fix(youtube): read albums without a year
docs: explain the plugin storage
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`. Scopes name the part changed: `app`, `player`, `ui`, `theme`,
`themes`, `plugins`, `youtube`, `spotify`, `stream`, `match`, `lyrics`,
`library`, `addons`, `community`, `sdk`, `tools`.

## Reports

Open an [issue](https://github.com/fzn0x/mixmusic/issues) with what you did,
what happened, and what you expected, with your system and MixMusic's
version (Settings › About). For security problems, see
[SECURITY.md](SECURITY.md) instead.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
