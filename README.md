MSVC Project Manager - VS Code Extension

This extension provides a Visual Studio-like project explorer for MSVC solutions and a quick F5 build using Developer Command Prompt (VS2022).

Features
- Parse .sln and show projects with categories: References, External Dependencies, Header Files, Source Files, Resource Files.
- When a file in a project is focused, press F5 to automatically locate VsDevCmd.bat, open a Developer Command Prompt, and build the solution with msbuild.

This is an initial implementation. The parser and project tree already parse common `.vcxproj` elements and `.filters` into nested virtual folders.

Development

1. Install dependencies

```powershell
npm install
```

Note: On Windows PowerShell, running `npm` can sometimes hit an execution policy error that mentions `npm.ps1` is not digitally signed. If you see an error about executing scripts, either:

- run the commands inside cmd.exe (example below), or
- temporarily change execution policy (only if you understand the security implications): `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (PowerShell admin may be required).

2. Build TypeScript

```powershell
npm run build
```

3. Run tests

The repository includes a minimal unit test for the `parseVcxproj` function. Use cmd to run the test script (this avoids PowerShell `npm.ps1` issues):

```powershell
cmd /c "npm test"
```

You should see output like:

```
> npm run build

All parseVcxproj tests passed
```

4. Run the extension in VS Code

Press F5 to launch the Extension Development Host. For development you can map F5 to the extension command `extension.f5Build` in your keybindings if desired.

Configuration

You can override the detected Developer Command Prompt by setting the extension configuration `msvcProjectManager.vsDevCmdPath` to the full path of `VsDevCmd.bat`.

