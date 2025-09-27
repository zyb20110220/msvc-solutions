import * as path from 'path';
import * as assert from 'assert';
import { parseVcxproj, FilterNode } from '../vcxprojParser';

function findFilter(root: FilterNode[]|undefined, name: string): FilterNode | undefined {
  if (!root) return undefined;
  for (const n of root) {
    if (n.name === name) return n;
    if (n.children) {
      const r = findFilter(n.children, name);
      if (r) return r;
    }
  }
  return undefined;
}

async function run() {
  try {
    const fixture = path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'Sample.vcxproj');
    const tree = parseVcxproj(fixture);

    // basic file counts
    assert.ok(tree.headers && tree.headers.length === 1, 'Expected 1 header');
    assert.ok(tree.sources && tree.sources.length === 1, 'Expected 1 source');
    assert.ok(tree.resources && tree.resources.length === 1, 'Expected 1 resource');
    assert.ok(tree.projectReferences && tree.projectReferences.length === 1, 'Expected 1 project reference');

    // check that resolved paths end with expected names
    assert.ok(tree.headers[0].endsWith('Sample.h'), 'Header path should end with Sample.h');
    assert.ok(tree.sources[0].endsWith('Sample.cpp'), 'Source path should end with Sample.cpp');
    assert.ok(tree.resources[0].endsWith('resource.rc'), 'Resource path should end with resource.rc');
    assert.ok(tree.projectReferences[0].endsWith(path.join('..', 'Other', 'Other.vcxproj')) || tree.projectReferences[0].endsWith('Other.vcxproj'), 'ProjectReference should point to Other.vcxproj');

    // filters structure: expect UI -> Dialogs -> contains Sample.cpp
    const ui = findFilter(tree.filters, 'UI');
    assert.ok(ui, 'Expected top-level filter UI');
    const dialogs = findFilter(ui!.children, 'Dialogs');
    assert.ok(dialogs, 'Expected UI->Dialogs filter');
    assert.ok(dialogs!.files && dialogs!.files.some(f => f.endsWith('Sample.cpp')), 'Dialogs filter should include Sample.cpp');

    console.log('All parseVcxproj tests passed');

    // additional sample solution parsing test
    const slnPath = path.resolve(__dirname, '..', '..', 'test', 'sample', 'SampleSolution.sln');
    const slnTxt = require('fs').readFileSync(slnPath, 'utf8');
    const rx = /Project\("\{[A-F0-9\-]+\}"\) = "([^"]+)", "([^"]+)", "\{[A-F0-9\-]+\}"/gi;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(slnTxt)) !== null) {
      matches.push(m[2]);
    }
    assert.ok(matches.length >= 1, 'Expected at least one project in sample solution');
    const projRel = matches[0].replace(/\\\\/g, path.sep);
    const projPath = path.resolve(path.dirname(slnPath), projRel);
    const expected = path.resolve(path.join(path.dirname(slnPath), 'App', 'App.vcxproj'));
    assert.strictEqual(projPath, expected, 'Project path from .sln should match App.vcxproj');

    // parse the sample project and ensure files are discovered
    const sampleTree = parseVcxproj(projPath);
    assert.ok(sampleTree.headers && sampleTree.headers.some(h => h.endsWith('main.h')), 'Sample project should have main.h');
    assert.ok(sampleTree.sources && sampleTree.sources.some(s => s.endsWith('main.cpp')), 'Sample project should have main.cpp');

    console.log('Sample solution/project parsing tests passed');
    process.exit(0);
  } catch (err) {
    const e = err as any;
    console.error('Tests failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

run();
