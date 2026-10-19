import { defineConfig } from "mygo-cli";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  name: "MixMusic",
  identifier: "app.mixmusic.desktop",
  version: pkg.version,
  copyright: "© 2026 MixMusic contributors",
  // `mygo dev` runs devCommand and loads devUrl; `mygo build` runs
  // buildCommand and embeds frontendDist into the app.
  devUrl: "http://localhost:5173",
  devCommand: "bun run dev:web",
  buildCommand: "bun run build:web",
  frontendDist: "dist",
  bindings: "src/mygo.ts",
  out: "build",
  urlSchemes: ["mixmusic"],
  // Apps update themselves from the releases of the repository, signed with
  // the key whose public half is here (the secret one is the
  // MYGO_UPDATER_PRIVATE_KEY secret of the release workflow).
  updates: {
    publicKey: "y/g7m+MircfXqdGupUFNygznyyR/Y41D1YAOYw41ISU=",
    github: "fzn0x/mixmusic",
  },
  linux: {
    comment: "Spotify and YouTube Music in one customizable player",
    categories: ["AudioVideo", "Audio", "Player"],
    command: "mixmusic",
    // WebKitGTK plays audio through GStreamer: Opus in WebM, and AAC.
    depends: ["gstreamer1.0-plugins-good", "gstreamer1.0-libav"],
  },
});
