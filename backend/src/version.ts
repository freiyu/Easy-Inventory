// The installed version: package.json is bundled into main.mjs, and installer/stage.sh refuses to build when it
// differs from installer/versions.json (the number the installer and the release carry).
import pkg from "../package.json" with { type: "json" };

export const VERSION: string = pkg.version;
