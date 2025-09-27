import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseVcxproj } from './vcxprojParser';

export class SolutionItem extends vscode.TreeItem {
  // optional files metadata for category nodes
  files?: string[];
  constructor(public readonly label: string, public readonly collapsibleState: vscode.TreeItemCollapsibleState, public readonly resourceUri?: vscode.Uri) {
    super(label, collapsibleState);
    if (resourceUri) {
      this.resourceUri = resourceUri;
      this.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [resourceUri]
      } as any;
      this.iconPath = vscode.ThemeIcon.File;
    }
  }
}

export class SolutionProvider implements vscode.TreeDataProvider<SolutionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SolutionItem | undefined | void> = new vscode.EventEmitter<SolutionItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<SolutionItem | undefined | void> = this._onDidChangeTreeData.event;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SolutionItem): vscode.TreeItem | Promise<vscode.TreeItem> {
    return element;
  }

  async getChildren(element?: SolutionItem): Promise<SolutionItem[]> {
    // root: list .sln/.slnx in workspace
    if (!element) {
      const roots: SolutionItem[] = [];
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
    if ((element as any).filters) {
      const fmap: { [k: string]: string[] } = (element as any).filters;
      const nodes: SolutionItem[] = [];
      for (const k of Object.keys(fmap)) {
        const node = new SolutionItem(k, vscode.TreeItemCollapsibleState.Collapsed);
        node.iconPath = vscode.ThemeIcon.Folder;
        (node as any).files = fmap[k];
        nodes.push(node);
      }
      return nodes;
    }

    // category node with files attached
    if ((element as any).files) {
      const files: string[] = (element as any).files;
      const nodes: SolutionItem[] = [];
      for (const f of files) {
        try {
          const uri = vscode.Uri.file(f);
          nodes.push(new SolutionItem(path.basename(f), vscode.TreeItemCollapsibleState.None, uri));
        } catch (e) {
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
        const projects: SolutionItem[] = [];
        const rx = /Project\("\{[A-F0-9\-]+\}"\) = "([^\"]+)", "([^\"]+)", "\{[A-F0-9\-]+\}"/gi;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(txt)) !== null) {
          const name = m[1];
          const rel = m[2];
          const projPath = path.resolve(path.dirname(p), rel.replace(/\\\\/g, path.sep));
          projects.push(new SolutionItem(name, vscode.TreeItemCollapsibleState.Collapsed, vscode.Uri.file(projPath)));
        }
        return projects;
      } catch (e) {
        return [new SolutionItem('Could not read solution', vscode.TreeItemCollapsibleState.None)];
      }
    }

    // if element is a .vcxproj file: parse and return category nodes with files attached
    if (element.resourceUri && element.resourceUri.fsPath.endsWith('.vcxproj')) {
      try {
        const tree = parseVcxproj(element.resourceUri.fsPath);
        const make = (label: string, arr: string[]) => {
          const node = new SolutionItem(label, vscode.TreeItemCollapsibleState.Collapsed);
          (node as any).files = arr;
          return node;
        };
        const refs = tree.references.concat(tree.projectReferences || []);
        const nodes = [make('References', refs), make('External Dependencies', tree.externalDependencies), make('Header Files', tree.headers), make('Source Files', tree.sources), make('Resource Files', tree.resources)];
        if (tree.filters) {
          const fnode = new SolutionItem('Filters', vscode.TreeItemCollapsibleState.Collapsed);
          (fnode as any).filters = tree.filters;
          nodes.push(fnode);
        }
        return nodes;
      } catch (e) {
        return [new SolutionItem('Could not parse project', vscode.TreeItemCollapsibleState.None)];
      }
    }

    return [];
  }
}
