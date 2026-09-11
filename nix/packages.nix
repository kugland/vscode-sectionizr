let
  inherit (builtins.fromJSON (builtins.readFile ../package.json)) version;
in {
  perSystem = {
    pkgs,
    config,
    ...
  }: let
    inherit (pkgs) lib;

    # Single source of truth for the bundler options, shared with esbuild.js.
    # The Nix build can't run `node esbuild.js` (there is no node_modules in
    # the derivation), so the same options are rendered as CLI flags instead.
    esbuildOptions = let
      cfg = builtins.fromJSON (builtins.readFile ../esbuild.json);
    in
      cfg.base // cfg.production;

    # sourcesContent -> --sources-content, logLevel -> --log-level, ...
    kebab = builtins.replaceStrings lib.upperChars (map (c: "-${c}") lib.lowerChars);

    toFlag = name: value:
      if name == "sourcemap"
      # esbuild rejects `--sourcemap=false`; the flag must simply be absent.
      then lib.optional value "--sourcemap"
      else if builtins.isBool value
      then ["--${kebab name}=${lib.boolToString value}"]
      else ["--${kebab name}=${toString value}"];

    esbuildFlags =
      esbuildOptions.entryPoints
      ++ map (m: "--external:${m}") (esbuildOptions.external or [])
      ++ lib.concatLists (
        lib.mapAttrsToList toFlag (removeAttrs esbuildOptions ["entryPoints" "external"])
      );

    # The extension has no runtime `dependencies` — everything in package.json
    # is a devDependency, and esbuild inlines `src/` into a single file. So the
    # build needs no node_modules at all: no npmDepsHash to keep in sync, and
    # package.json/package-lock.json can change freely without touching Nix.
    vsix = pkgs.stdenvNoCC.mkDerivation {
      pname = "sectionizr-vsix";
      inherit version;
      src = pkgs.lib.cleanSource ../.;

      nativeBuildInputs = [pkgs.esbuild pkgs.jq pkgs.vsce];

      # vsce insists on running `vscode:prepublish` (which shells out to npm),
      # but the buildPhase below already produced the bundle it would build.
      postPatch = ''
        jq 'del(.scripts["vscode:prepublish"])' package.json > package.json.new
        mv package.json.new package.json
      '';

      buildPhase = ''
        runHook preBuild
        # Equivalent to `node esbuild.js --production`; the esbuild
        # devDependency is pinned to nixpkgs' version, so the bundle is
        # byte-identical to the one produced by `npm run compile`.
        esbuild ${lib.escapeShellArgs esbuildFlags}
        vsce package --no-dependencies --out sectionizr-${version}.vsix
        runHook postBuild
      '';

      installPhase = ''
        runHook preInstall
        install -Dm644 sectionizr-${version}.vsix $out/sectionizr-${version}.vsix
        runHook postInstall
      '';
    };
  in {
    # Derives `overlays.default` from these attrs (flake-parts easyOverlay).
    overlayAttrs = {
      vscode-sectionizr = config.packages.sectionizr;
    };

    packages = {
      # Unpacked into the layout home-manager's `programs.vscode.extensions`
      # (and `vscode-with-extensions`) expects.
      sectionizr = pkgs.vscode-utils.buildVscodeExtension {
        pname = "sectionizr";
        inherit version;
        src = "${vsix}/sectionizr-${version}.vsix";
        vscodeExtPublisher = "kugland";
        vscodeExtName = "sectionizr";
        vscodeExtUniqueId = "kugland.sectionizr";
        meta = with pkgs.lib; {
          description = "Creates comment section banners in multiple languages";
          homepage = "https://github.com/kugland/vscode-sectionizr";
          license = licenses.mit;
          maintainers = [maintainers.kugland];
          platforms = platforms.all;
        };
      };
      inherit vsix;
      default = config.packages.sectionizr;
    };
    legacyPackages = {
      sectionizr = config.packages.sectionizr;
      vsix = config.packages.vsix;
      default = config.packages.default;
    };
  };
}
