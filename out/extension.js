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
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const solutionParser_1 = require("./solutionParser");
const devShell_1 = require("./devShell");
function activate(context) {
    const provider = new solutionParser_1.SolutionProvider();
    vscode.window.registerTreeDataProvider('msvcProjectExplorer', provider);
    context.subscriptions.push(vscode.commands.registerCommand('msvcpm.refresh', () => provider.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand('msvcpm.buildSolution', async () => {
        await (0, devShell_1.buildSolutionForActiveFile)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('msvcpm.rebuildSolution', async () => {
        await (0, devShell_1.buildTargetForActiveFile)('Rebuild');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('msvcpm.cleanSolution', async () => {
        await (0, devShell_1.buildTargetForActiveFile)('Clean');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('msvcpm.createLaunch', async () => {
        await (0, devShell_1.createLaunchForActiveFile)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('msvcpm.buildProject', async (node) => {
        // node.resourceUri expected to point to .vcxproj
        const proj = node && node.resourceUri ? node.resourceUri.fsPath : undefined;
        if (!proj) {
            vscode.window.showErrorMessage('No project selected');
            return;
        }
        await (0, devShell_1.buildProject)(proj, 'Build');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('msvcpm.rebuildProject', async (node) => {
        const proj = node && node.resourceUri ? node.resourceUri.fsPath : undefined;
        if (!proj) {
            vscode.window.showErrorMessage('No project selected');
            return;
        }
        await (0, devShell_1.buildProject)(proj, 'Rebuild');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('msvcpm.cleanProject', async (node) => {
        const proj = node && node.resourceUri ? node.resourceUri.fsPath : undefined;
        if (!proj) {
            vscode.window.showErrorMessage('No project selected');
            return;
        }
        await (0, devShell_1.buildProject)(proj, 'Clean');
    }));
    // Bind F5 when a supported file is focused
    context.subscriptions.push(vscode.commands.registerCommand('extension.f5Build', async () => {
        await (0, devShell_1.buildSolutionForActiveFile)();
    }));
    // Keybindings should be declared in package.json when packaging; for development user can map F5 to extension.f5Build
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map