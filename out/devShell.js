"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProject = exports.createLaunchForActiveFile = exports.buildTargetForActiveFile = exports.buildSolutionForActiveFile = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
async function findVsWhere() {
    // try locate vswhere under Program Files (x86)
    const pf = process.env['ProgramFiles(x86)'] || process.env['ProgramFiles'];
    if (pf) {
        const candidate = path.join(pf, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
        if (fs.existsSync(candidate))
            return candidate;
    }
    // fallback: try PATH
    try {
        const whichOut = (0, child_process_1.execFileSync)('where', ['vswhere.exe'], { encoding: 'utf8' });
        const which = String(whichOut).split(/\r?\n/)[0];
        if (which && fs.existsSync(which))
            return which;
    }
    catch (e) {
        // ignore
    }
    return undefined;
}
async function findVsDevCmd() {
    // 1. extension config override
    const cfg = vscode.workspace.getConfiguration('msvcProjectManager');
    const override = cfg.get('vsDevCmdPath');
    if (override && fs.existsSync(override))
        return override;
    // 2. VSINSTALLDIR env
    const vsInstall = process.env['VSINSTALLDIR'];
    if (vsInstall) {
        const candidate = path.join(vsInstall, 'Common7', 'Tools', 'VsDevCmd.bat');
        if (fs.existsSync(candidate))
            return candidate;
    }
    // 3. try vswhere to find VS2022
    const vswhere = await findVsWhere();
    if (vswhere) {
        try {
            const out = (0, child_process_1.execFileSync)(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim();
            if (out) {
                const editions = ['Community', 'Professional', 'Enterprise', 'BuildTools'];
                const p = out;
                const candidate = path.join(p, 'Common7', 'Tools', 'VsDevCmd.bat');
                if (fs.existsSync(candidate))
                    return candidate;
            }
        }
        catch (e) {
            // ignore
        }
    }
    // 4. common program files search
    const programFiles = process.env['ProgramFiles(x86)'] || process.env['ProgramFiles'];
    if (programFiles) {
        const root = path.join(programFiles, 'Microsoft Visual Studio', '2022');
        if (fs.existsSync(root)) {
            const editions = ['Community', 'Professional', 'Enterprise', 'BuildTools'];
            for (const e of editions) {
                const p = path.join(root, e, 'Common7', 'Tools', 'VsDevCmd.bat');
                if (fs.existsSync(p))
                    return p;
            }
        }
    }
    return undefined;
}
function findSolutionAbove(filePath) {
    let dir = path.dirname(filePath);
    while (dir && dir.length > 3) {
        try {
            const files = fs.readdirSync(dir);
            const sln = files.find((f) => f.endsWith('.sln'));
            if (sln)
                return path.join(dir, sln);
        }
        catch (e) {
            // ignore
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return undefined;
}
const outputChannel = vscode.window.createOutputChannel('MSVC Build');
async function buildSolutionForActiveFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor to determine project.');
        return;
    }
    const file = editor.document.uri.fsPath;
    const rootSln = findSolutionAbove(file);
    if (!rootSln) {
        vscode.window.showErrorMessage('Could not find a .sln above the current file.');
        return;
    }
    const vsDev = await findVsDevCmd();
    if (!vsDev) {
        vscode.window.showErrorMessage('Could not locate VsDevCmd.bat. Install Visual Studio 2022 or set the path in settings: msvcProjectManager.vsDevCmdPath');
        return;
    }
    // Ask user for Configuration/Platform (default to Debug/x64)
    const cfg = vscode.workspace.getConfiguration('msvcProjectManager');
    const defCfg = cfg.get('defaultConfiguration') || 'Debug';
    const defPlat = cfg.get('defaultPlatform') || 'x64';
    const configuration = await vscode.window.showQuickPick([defCfg, 'Release'], { placeHolder: 'Select Configuration', ignoreFocusOut: true }) || defCfg;
    const platform = await vscode.window.showQuickPick([defPlat, 'x86', 'ARM64'], { placeHolder: 'Select Platform', ignoreFocusOut: true }) || defPlat;
    // select target
    const target = await vscode.window.showQuickPick(['Build', 'Rebuild', 'Clean'], { placeHolder: 'Select build target', ignoreFocusOut: true }) || 'Build';
    // prepare command: call VsDevCmd.bat then msbuild with properties
    const msbuildArgs = [rootSln, '/m', `/t:${target}`, `/p:Configuration=${configuration}`, `/p:Platform=${platform}`];
    // Use integrated terminal and also stream messages to output channel
    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine(`Using VsDevCmd: ${vsDev}`);
    outputChannel.appendLine(`Building: ${rootSln}`);
    outputChannel.appendLine(`Configuration=${configuration}, Platform=${platform}`);
    // Try spawn a temp batch to capture output into OutputChannel
    try {
        const tmpDir = os.tmpdir();
        const batPath = path.join(tmpDir, `msvcpm_build_${Date.now()}.bat`);
        const msbuildPart = msbuildArgs.map(a => a.includes(' ') ? '"' + a + '"' : a).join(' ');
        // Batch content: call VsDevCmd then run msbuild
        const batContent = `@echo off\r\ncall "${vsDev}" -no_logo\r\nmsbuild ${msbuildPart}\r\nexit /b %ERRORLEVEL%`;
        fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });
        outputChannel.appendLine(`Running batch: ${batPath}`);
        const child = (0, child_process_1.spawn)('cmd.exe', ['/c', batPath], { windowsHide: true });
        const terminal = vscode.window.createTerminal({ name: 'MSVC Build (live)' });
        terminal.show(true);
        child.stdout.on('data', (chunk) => {
            const s = chunk.toString();
            outputChannel.append(s);
            // write to terminal via echo to keep simple (escape double quotes)
            const safe = s.replace(/"/g, '""');
            // split large chunks to avoid terminal overrun
            for (const line of s.split(/\r?\n/)) {
                if (line.trim().length > 0)
                    terminal.sendText(`echo ${line.replace(/"/g, '""')}`, false);
            }
        });
        child.stderr.on('data', (chunk) => {
            const s = chunk.toString();
            outputChannel.append(s);
            for (const line of s.split(/\r?\n/)) {
                if (line.trim().length > 0)
                    terminal.sendText(`echo ${line.replace(/"/g, '""')}`, false);
            }
        });
        child.on('close', (code) => {
            outputChannel.appendLine(`\nBuild finished with exit code ${code}`);
            try {
                fs.unlinkSync(batPath);
            }
            catch (e) { /* ignore */ }
            if (code !== 0) {
                vscode.window.showErrorMessage(`Build finished with exit code ${code}. See MSVC Build output for details.`);
            }
            else {
                vscode.window.showInformationMessage(`Build succeeded: ${path.basename(rootSln)}`);
            }
        });
        // ensure user sees output
        outputChannel.show(true);
    }
    catch (e) {
        // fallback: open terminal and run commands (e.g., if spawn not allowed)
        const terminal = vscode.window.createTerminal({ name: 'VS Dev Build' });
        const msbuildPart = msbuildArgs.map(a => a.includes(' ') ? '"' + a + '"' : a).join(' ');
        const cmd = `"${vsDev}" -no_logo && msbuild ${msbuildPart}`;
        terminal.show(true);
        terminal.sendText(cmd, true);
    }
}
exports.buildSolutionForActiveFile = buildSolutionForActiveFile;
async function buildTargetForActiveFile(forceTarget) {
    // reuse build flow but allow passing a forced target
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor to determine project.');
        return;
    }
    const file = editor.document.uri.fsPath;
    const rootSln = findSolutionAbove(file);
    if (!rootSln) {
        vscode.window.showErrorMessage('Could not find a .sln above the current file.');
        return;
    }
    const vsDev = await findVsDevCmd();
    if (!vsDev) {
        vscode.window.showErrorMessage('Could not locate VsDevCmd.bat.');
        return;
    }
    const cfg = vscode.workspace.getConfiguration('msvcProjectManager');
    const configuration = cfg.get('defaultConfiguration') || 'Debug';
    const platform = cfg.get('defaultPlatform') || 'x64';
    const target = forceTarget || await vscode.window.showQuickPick(['Build', 'Rebuild', 'Clean'], { placeHolder: 'Select build target', ignoreFocusOut: true }) || 'Build';
    // prepare args and run similar to buildSolutionForActiveFile by delegating to internal runner
    const msbuildArgs = [rootSln, '/m', `/t:${target}`, `/p:Configuration=${configuration}`, `/p:Platform=${platform}`];
    // reuse small runner: spawn tmp batch
    try {
        const tmpDir = os.tmpdir();
        const batPath = path.join(tmpDir, `msvcpm_build_${Date.now()}.bat`);
        const msbuildPart = msbuildArgs.map(a => a.includes(' ') ? '"' + a + '"' : a).join(' ');
        const batContent = `@echo off\r\ncall "${vsDev}" -no_logo\r\nmsbuild ${msbuildPart}\r\nexit /b %ERRORLEVEL%`;
        fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });
        outputChannel.appendLine(`Running batch: ${batPath}`);
        const child = (0, child_process_1.spawn)('cmd.exe', ['/c', batPath], { windowsHide: true });
        child.stdout.on('data', (chunk) => outputChannel.append(chunk.toString()));
        child.stderr.on('data', (chunk) => outputChannel.append(chunk.toString()));
        child.on('close', (code) => {
            outputChannel.appendLine(`\nBuild finished with exit code ${code}`);
            try {
                fs.unlinkSync(batPath);
            }
            catch (e) { /* ignore */ }
            if (code !== 0)
                vscode.window.showErrorMessage(`Build finished with exit code ${code}. See MSVC Build output for details.`);
        });
        outputChannel.show(true);
    }
    catch (e) {
        vscode.window.showErrorMessage('Failed to spawn build process.');
    }
}
exports.buildTargetForActiveFile = buildTargetForActiveFile;
async function createLaunchForActiveFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Open a file in the project to create launch config.');
        return;
    }
    const file = editor.document.uri.fsPath;
    const root = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!root) {
        vscode.window.showErrorMessage('Open this file inside a workspace folder.');
        return;
    }
    const vscodeDir = path.join(root.uri.fsPath, '.vscode');
    try {
        if (!fs.existsSync(vscodeDir))
            fs.mkdirSync(vscodeDir);
    }
    catch (e) { /* ignore */ }
    const launchPath = path.join(vscodeDir, 'launch.json');
    const tasksPath = path.join(vscodeDir, 'tasks.json');
    const launch = {
        version: '0.2.0',
        configurations: [
            {
                name: 'Launch Program',
                type: 'cppvsdbg',
                request: 'launch',
                program: '${workspaceFolder}/path/to/exe',
                args: [],
                cwd: '${workspaceFolder}',
                stopAtEntry: false
            }
        ]
    };
    const tasks = {
        version: '2.0.0',
        tasks: [
            {
                label: 'msvc: build',
                type: 'shell',
                command: 'msbuild',
                args: ["${workspaceFolder}/YourSolution.sln", '/m'],
                group: 'build'
            }
        ]
    };
    fs.writeFileSync(launchPath, JSON.stringify(launch, null, 2), 'utf8');
    fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');
    vscode.window.showInformationMessage('Created .vscode/launch.json and tasks.json. Please edit program path before debugging.');
}
exports.createLaunchForActiveFile = createLaunchForActiveFile;
async function buildProject(projectPath, target = 'Build') {
    if (!projectPath) {
        vscode.window.showErrorMessage('No project path provided');
        return;
    }
    const vsDev = await findVsDevCmd();
    if (!vsDev) {
        vscode.window.showErrorMessage('Could not locate VsDevCmd.bat.');
        return;
    }
    const configuration = vscode.workspace.getConfiguration('msvcProjectManager').get('defaultConfiguration') || 'Debug';
    const platform = vscode.workspace.getConfiguration('msvcProjectManager').get('defaultPlatform') || 'x64';
    const msbuildArgs = [projectPath, '/m', `/t:${target}`, `/p:Configuration=${configuration}`, `/p:Platform=${platform}`];
    try {
        const tmpDir = os.tmpdir();
        const batPath = path.join(tmpDir, `msvcpm_projbuild_${Date.now()}.bat`);
        const msbuildPart = msbuildArgs.map(a => a.includes(' ') ? '"' + a + '"' : a).join(' ');
        const batContent = `@echo off\r\ncall "${vsDev}" -no_logo\r\nmsbuild ${msbuildPart}\r\nexit /b %ERRORLEVEL%`;
        fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });
        outputChannel.appendLine(`Running project batch: ${batPath}`);
        const child = (0, child_process_1.spawn)('cmd.exe', ['/c', batPath], { windowsHide: true });
        child.stdout.on('data', (chunk) => outputChannel.append(chunk.toString()));
        child.stderr.on('data', (chunk) => outputChannel.append(chunk.toString()));
        child.on('close', (code) => {
            outputChannel.appendLine(`\nProject build finished with exit code ${code}`);
            try {
                fs.unlinkSync(batPath);
            }
            catch (e) { /* ignore */ }
            if (code !== 0)
                vscode.window.showErrorMessage(`Project build finished with exit code ${code}. See MSVC Build output for details.`);
        });
        outputChannel.show(true);
    }
    catch (e) {
        vscode.window.showErrorMessage('Failed to spawn project build process.');
    }
}
exports.buildProject = buildProject;
//# sourceMappingURL=devShell.js.map