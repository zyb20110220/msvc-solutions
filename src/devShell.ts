import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync, spawn } from 'child_process';

async function findVsWhere(): Promise<string | undefined> {
	// try locate vswhere under Program Files (x86)
	const pf = process.env['ProgramFiles(x86)'] || process.env['ProgramFiles'];
	if (pf) {
		const candidate = path.join(pf, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
		if (fs.existsSync(candidate)) return candidate;
	}
	// fallback: try PATH
	try {
		const whichOut = execFileSync('where', ['vswhere.exe'], { encoding: 'utf8' });
		const which = String(whichOut).split(/\r?\n/)[0];
		if (which && fs.existsSync(which)) return which;
	} catch (e) {
		// ignore
	}
	return undefined;
}

async function findVsDevCmd(): Promise<string | undefined> {
	// 1. extension config override
	const cfg = vscode.workspace.getConfiguration('msvcProjectManager');
	const override = cfg.get<string>('vsDevCmdPath');
	if (override && fs.existsSync(override)) return override;

	// 2. VSINSTALLDIR env
	const vsInstall = process.env['VSINSTALLDIR'];
	if (vsInstall) {
		const candidate = path.join(vsInstall, 'Common7', 'Tools', 'VsDevCmd.bat');
		if (fs.existsSync(candidate)) return candidate;
	}

	// 3. try vswhere to find VS2022
	const vswhere = await findVsWhere();
	if (vswhere) {
		try {
			const out = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim();
			if (out) {
				const editions = ['Community', 'Professional', 'Enterprise', 'BuildTools'];
				const p = out;
				const candidate = path.join(p, 'Common7', 'Tools', 'VsDevCmd.bat');
				if (fs.existsSync(candidate)) return candidate;
			}
		} catch (e) {
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
				if (fs.existsSync(p)) return p;
			}
		}
	}

	return undefined;
}

function findSolutionAbove(filePath: string): string | undefined {
	let dir: string = path.dirname(filePath);
	while (dir && dir.length > 3) {
		try {
			const files = fs.readdirSync(dir);
			const sln = files.find((f: string) => f.endsWith('.sln'));
			if (sln) return path.join(dir, sln);
		} catch (e) {
			// ignore
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

const outputChannel = vscode.window.createOutputChannel('MSVC Build');

export async function buildSolutionForActiveFile() {
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
	const defCfg = cfg.get<string>('defaultConfiguration') || 'Debug';
	const defPlat = cfg.get<string>('defaultPlatform') || 'x64';

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
			const child = spawn('cmd.exe', ['/c', batPath], { windowsHide: true });
			const terminal = vscode.window.createTerminal({ name: 'MSVC Build (live)' });
			terminal.show(true);
			child.stdout.on('data', (chunk: Buffer) => {
				const s = chunk.toString();
				outputChannel.append(s);
				// write to terminal via echo to keep simple (escape double quotes)
				const safe = s.replace(/"/g, '""');
				// split large chunks to avoid terminal overrun
				for (const line of s.split(/\r?\n/)) {
					if (line.trim().length > 0) terminal.sendText(`echo ${line.replace(/"/g, '""')}`, false);
				}
			});
			child.stderr.on('data', (chunk: Buffer) => {
				const s = chunk.toString();
				outputChannel.append(s);
				for (const line of s.split(/\r?\n/)) {
					if (line.trim().length > 0) terminal.sendText(`echo ${line.replace(/"/g, '""')}`, false);
				}
			});
		child.on('close', (code: number) => {
			outputChannel.appendLine(`\nBuild finished with exit code ${code}`);
			try { fs.unlinkSync(batPath); } catch (e) { /* ignore */ }
			if (code !== 0) {
				vscode.window.showErrorMessage(`Build finished with exit code ${code}. See MSVC Build output for details.`);
			} else {
				vscode.window.showInformationMessage(`Build succeeded: ${path.basename(rootSln)}`);
			}
		});
		// ensure user sees output
		outputChannel.show(true);
	} catch (e) {
		// fallback: open terminal and run commands (e.g., if spawn not allowed)
		const terminal = vscode.window.createTerminal({ name: 'VS Dev Build' });
		const msbuildPart = msbuildArgs.map(a => a.includes(' ') ? '"' + a + '"' : a).join(' ');
		const cmd = `"${vsDev}" -no_logo && msbuild ${msbuildPart}`;
		terminal.show(true);
		terminal.sendText(cmd, true);
	}
}

export async function buildTargetForActiveFile(forceTarget?: string) {
	// reuse build flow but allow passing a forced target
	const editor = vscode.window.activeTextEditor;
	if (!editor) { vscode.window.showErrorMessage('No active editor to determine project.'); return; }
	const file = editor.document.uri.fsPath;
	const rootSln = findSolutionAbove(file);
	if (!rootSln) { vscode.window.showErrorMessage('Could not find a .sln above the current file.'); return; }
	const vsDev = await findVsDevCmd();
	if (!vsDev) { vscode.window.showErrorMessage('Could not locate VsDevCmd.bat.'); return; }
	const cfg = vscode.workspace.getConfiguration('msvcProjectManager');
	const configuration = cfg.get<string>('defaultConfiguration') || 'Debug';
	const platform = cfg.get<string>('defaultPlatform') || 'x64';
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
		const child = spawn('cmd.exe', ['/c', batPath], { windowsHide: true });
		child.stdout.on('data', (chunk: Buffer) => outputChannel.append(chunk.toString()));
		child.stderr.on('data', (chunk: Buffer) => outputChannel.append(chunk.toString()));
		child.on('close', (code: number) => {
			outputChannel.appendLine(`\nBuild finished with exit code ${code}`);
			try { fs.unlinkSync(batPath); } catch (e) { /* ignore */ }
			if (code !== 0) vscode.window.showErrorMessage(`Build finished with exit code ${code}. See MSVC Build output for details.`);
		});
		outputChannel.show(true);
	} catch (e) {
		vscode.window.showErrorMessage('Failed to spawn build process.');
	}
}

export async function createLaunchForActiveFile() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) { vscode.window.showErrorMessage('Open a file in the project to create launch config.'); return; }
	const file = editor.document.uri.fsPath;
	const root = vscode.workspace.getWorkspaceFolder(editor.document.uri);
	if (!root) { vscode.window.showErrorMessage('Open this file inside a workspace folder.'); return; }
	const vscodeDir = path.join(root.uri.fsPath, '.vscode');
	try { if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir); } catch (e) { /* ignore */ }
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

export async function buildProject(projectPath: string, target: string = 'Build') {
	if (!projectPath) { vscode.window.showErrorMessage('No project path provided'); return; }
	const vsDev = await findVsDevCmd();
	if (!vsDev) { vscode.window.showErrorMessage('Could not locate VsDevCmd.bat.'); return; }
	const configuration = vscode.workspace.getConfiguration('msvcProjectManager').get<string>('defaultConfiguration') || 'Debug';
	const platform = vscode.workspace.getConfiguration('msvcProjectManager').get<string>('defaultPlatform') || 'x64';
	const msbuildArgs = [projectPath, '/m', `/t:${target}`, `/p:Configuration=${configuration}`, `/p:Platform=${platform}`];
	try {
		const tmpDir = os.tmpdir();
		const batPath = path.join(tmpDir, `msvcpm_projbuild_${Date.now()}.bat`);
		const msbuildPart = msbuildArgs.map(a => a.includes(' ') ? '"' + a + '"' : a).join(' ');
		const batContent = `@echo off\r\ncall "${vsDev}" -no_logo\r\nmsbuild ${msbuildPart}\r\nexit /b %ERRORLEVEL%`;
		fs.writeFileSync(batPath, batContent, { encoding: 'utf8' });
		outputChannel.appendLine(`Running project batch: ${batPath}`);
		const child = spawn('cmd.exe', ['/c', batPath], { windowsHide: true });
		child.stdout.on('data', (chunk: Buffer) => outputChannel.append(chunk.toString()));
		child.stderr.on('data', (chunk: Buffer) => outputChannel.append(chunk.toString()));
		child.on('close', (code: number) => {
			outputChannel.appendLine(`\nProject build finished with exit code ${code}`);
			try { fs.unlinkSync(batPath); } catch (e) { /* ignore */ }
			if (code !== 0) vscode.window.showErrorMessage(`Project build finished with exit code ${code}. See MSVC Build output for details.`);
		});
		outputChannel.show(true);
	} catch (e) {
		vscode.window.showErrorMessage('Failed to spawn project build process.');
	}
}
