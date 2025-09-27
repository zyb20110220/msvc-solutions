import * as vscode from 'vscode';
import { SolutionProvider } from './solutionParser';
import { buildSolutionForActiveFile, buildTargetForActiveFile, createLaunchForActiveFile, buildProject } from './devShell';

export function activate(context: vscode.ExtensionContext) {
	const provider = new SolutionProvider();
	vscode.window.registerTreeDataProvider('msvcProjectExplorer', provider);

	context.subscriptions.push(vscode.commands.registerCommand('msvcpm.refresh', () => provider.refresh()));
	context.subscriptions.push(vscode.commands.registerCommand('msvcpm.buildSolution', async () => {
		await buildSolutionForActiveFile();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('msvcpm.rebuildSolution', async () => {
		await buildTargetForActiveFile('Rebuild');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('msvcpm.cleanSolution', async () => {
		await buildTargetForActiveFile('Clean');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('msvcpm.createLaunch', async () => {
		await createLaunchForActiveFile();
	}));
		context.subscriptions.push(vscode.commands.registerCommand('msvcpm.buildProject', async (node) => {
			// node.resourceUri expected to point to .vcxproj
			const proj = node && node.resourceUri ? node.resourceUri.fsPath : undefined;
			if (!proj) { vscode.window.showErrorMessage('No project selected'); return; }
			await buildProject(proj, 'Build');
		}));
		context.subscriptions.push(vscode.commands.registerCommand('msvcpm.rebuildProject', async (node) => {
			const proj = node && node.resourceUri ? node.resourceUri.fsPath : undefined;
			if (!proj) { vscode.window.showErrorMessage('No project selected'); return; }
			await buildProject(proj, 'Rebuild');
		}));
		context.subscriptions.push(vscode.commands.registerCommand('msvcpm.cleanProject', async (node) => {
			const proj = node && node.resourceUri ? node.resourceUri.fsPath : undefined;
			if (!proj) { vscode.window.showErrorMessage('No project selected'); return; }
			await buildProject(proj, 'Clean');
		}));

	// Bind F5 when a supported file is focused
	context.subscriptions.push(vscode.commands.registerCommand('extension.f5Build', async () => {
		await buildSolutionForActiveFile();
	}));

	// Keybindings should be declared in package.json when packaging; for development user can map F5 to extension.f5Build
}

export function deactivate() { }
