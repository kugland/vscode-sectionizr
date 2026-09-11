{
  perSystem = {pkgs, ...}: {
    devshells.default = {
      packages = with pkgs; [
        nodejs
        typescript-language-server
      ];
      commands = [
        {
          help = "Install npm dependencies";
          name = "deps";
          command = "npm ci";
        }
        {
          help = "Build the extension bundle";
          name = "build";
          command = "npm run compile -- \"$@\"";
        }
        {
          help = "Run the unit tests (vitest)";
          # Not named `test`: that would be shadowed by the shell builtin.
          name = "check";
          command = "npm run test -- \"$@\"";
        }
        {
          help = "Run the VS Code integration tests (downloads VS Code)";
          name = "check-integration";
          command = "npm run test:integration";
        }
        {
          help = "Typecheck the sources";
          name = "lint";
          command = "npx --no-install tsc -p tsconfig.json --noEmit";
        }
        {
          help = "Package the extension as a .vsix";
          name = "package";
          command = "npm run package";
        }
      ];
    };
  };
}
