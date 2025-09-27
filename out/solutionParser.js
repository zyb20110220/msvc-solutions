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
exports.SolutionProvider = exports.SolutionItem = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vcxprojParser_1 = require("./vcxprojParser");
class SolutionItem extends vscode.TreeItem {
    constructor(label, collapsibleState, resourceUri) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.resourceUri = resourceUri;
        if (resourceUri) {
            this.resourceUri = resourceUri;
            this.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [resourceUri]
            };
            this.iconPath = vscode.ThemeIcon.File;
        }
    }
}
exports.SolutionItem = SolutionItem;
class SolutionProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        // root: list .sln/.slnx in workspace
        if (!element) {
            const roots = [];
            if (vscode.workspace.workspaceFolders) {
                for (const wf of vscode.workspace.workspaceFolders) {
                    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(wf, '**/*.slnx'), undefined, 20);
                    const files2 = await vscode.workspace.findFiles(new vscode.RelativePattern(wf, '**/*.sln'), undefined, 20);
                    for (const f of files.concat(files2)) {
                        roots.push(new SolutionItem(path.basename(f.fsPath), vscode.TreeItemCollapsibleState.Collapsed, f));
                    }
                }
            }
            return roots;
        }
        // Filters node children
        if (element.filters) {
            const fmap = element.filters;
            const nodes = [];
            for (const k of Object.keys(fmap)) {
                const node = new SolutionItem(k, vscode.TreeItemCollapsibleState.Collapsed);
                node.iconPath = vscode.ThemeIcon.Folder;
                node.files = fmap[k];
                nodes.push(node);
            }
            return nodes;
        }
        // category node with files attached
        if (element.files) {
            const files = element.files;
            const nodes = [];
            for (const f of files) {
                try {
                    const uri = vscode.Uri.file(f);
                    nodes.push(new SolutionItem(path.basename(f), vscode.TreeItemCollapsibleState.None, uri));
                }
                catch (e) {
                    // skip
                }
            }
            return nodes;
        }
        // if element is a .sln file: parse projects
        if (element.resourceUri && element.resourceUri.fsPath.endsWith('.sln')) {
            const p = element.resourceUri.fsPath;
            try {
                const txt = fs.readFileSync(p, 'utf8');
                const projects = [];
                const rx = /Project\("\{[A-F0-9\-]+\}"\) = "([^\"]+)", "([^\"]+)", "\{[A-F0-9\-]+\}"/gi;
                let m;
                while ((m = rx.exec(txt)) !== null) {
                    const name = m[1];
                    const rel = m[2];
                    const projPath = path.resolve(path.dirname(p), rel.replace(/\\\\/g, path.sep));
                    projects.push(new SolutionItem(name, vscode.TreeItemCollapsibleState.Collapsed, vscode.Uri.file(projPath)));
                }
                return projects;
            }
            catch (e) {
                return [new SolutionItem('Could not read solution', vscode.TreeItemCollapsibleState.None)];
            }
        }
        // if element is a .vcxproj file: parse and return category nodes with files attached
        if (element.resourceUri && element.resourceUri.fsPath.endsWith('.vcxproj')) {
            try {
                const tree = (0, vcxprojParser_1.parseVcxproj)(element.resourceUri.fsPath);
                const make = (label, arr) => {
                    const node = new SolutionItem(label, vscode.TreeItemCollapsibleState.Collapsed);
                    node.files = arr;
                    return node;
                };
                const refs = tree.references.concat(tree.projectReferences || []);
                const nodes = [make('References', refs), make('External Dependencies', tree.externalDependencies), make('Header Files', tree.headers), make('Source Files', tree.sources), make('Resource Files', tree.resources)];
                if (tree.filters) {
                    const fnode = new SolutionItem('Filters', vscode.TreeItemCollapsibleState.Collapsed);
                    fnode.filters = tree.filters;
                    nodes.push(fnode);
                }
                return nodes;
            }
            catch (e) {
                return [new SolutionItem('Could not parse project', vscode.TreeItemCollapsibleState.None)];
            }
        }
        return [];
    }
}
exports.SolutionProvider = SolutionProvider;
//# sourceMappingURL=solutionParser.js.map