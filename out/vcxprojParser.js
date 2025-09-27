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
exports.parseVcxproj = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fast_xml_parser_1 = require("fast-xml-parser");
function parseVcxproj(filePath) {
    const txt = fs.readFileSync(filePath, 'utf8');
    const p = new fast_xml_parser_1.XMLParser({ ignoreAttributes: false });
    const j = p.parse(txt);
    const proj = j.Project || {};
    const items = proj.ItemGroup || [];
    const refs = [];
    const ext = [];
    const headers = [];
    const sources = [];
    const resources = [];
    const projectRefs = [];
    const filtersMap = {};
    const groups = Array.isArray(items) ? items : [items];
    for (const g of groups) {
        if (!g)
            continue;
        if (g.ClInclude) {
            const arr = Array.isArray(g.ClInclude) ? g.ClInclude : [g.ClInclude];
            for (const it of arr) {
                const inc = it['@_Include'] || it['Include'];
                if (inc)
                    headers.push(path.normalize(path.resolve(path.dirname(filePath), inc)));
            }
        }
        if (g.ClCompile) {
            const arr = Array.isArray(g.ClCompile) ? g.ClCompile : [g.ClCompile];
            for (const it of arr) {
                const inc = it['@_Include'] || it['Include'];
                if (inc)
                    sources.push(path.normalize(path.resolve(path.dirname(filePath), inc)));
            }
        }
        if (g.ResourceCompile || g.Resource) {
            const r = g.ResourceCompile || g.Resource;
            const arr = Array.isArray(r) ? r : [r];
            for (const it of arr) {
                const inc = it['@_Include'] || it['Include'];
                if (inc)
                    resources.push(path.normalize(path.resolve(path.dirname(filePath), inc)));
            }
        }
        if (g.Reference) {
            const arr = Array.isArray(g.Reference) ? g.Reference : [g.Reference];
            for (const it of arr) {
                const hint = it['HintPath'] || it['@_Include'] || it['Include'];
                if (hint)
                    refs.push(String(hint));
            }
        }
        if (g.ProjectReference) {
            const arr = Array.isArray(g.ProjectReference) ? g.ProjectReference : [g.ProjectReference];
            for (const it of arr) {
                const inc = it['@_Include'] || it['Include'];
                if (inc)
                    projectRefs.push(path.normalize(path.resolve(path.dirname(filePath), inc)));
            }
        }
    }
    // try parse optional .filters to group files by virtual folder
    try {
        const filtersPath = filePath + '.filters';
        if (fs.existsSync(filtersPath)) {
            const txtFilters = fs.readFileSync(filtersPath, 'utf8');
            const pf = new fast_xml_parser_1.XMLParser({ ignoreAttributes: false });
            const jf = pf.parse(txtFilters);
            const projf = jf.Project || {};
            const groups = projf.ItemGroup || [];
            const ig = Array.isArray(groups) ? groups : [groups];
            for (const g of ig) {
                if (!g)
                    continue;
                for (const key of Object.keys(g)) {
                    const items = Array.isArray(g[key]) ? g[key] : [g[key]];
                    for (const it of items) {
                        const include = it['@_Include'] || it['Include'];
                        const filter = it['Filter'] || it['@_Filter'];
                        if (include && filter) {
                            const abs = path.normalize(path.resolve(path.dirname(filePath), include));
                            filtersMap[filter] = filtersMap[filter] || [];
                            filtersMap[filter].push(abs);
                        }
                    }
                }
            }
        }
    }
    catch (e) {
        // ignore filters parsing errors
    }
    // convert flat filtersMap (key 'A\\B\\C') into nested FilterNode[]
    function buildTree(map) {
        const root = {};
        for (const key of Object.keys(map)) {
            const parts = key.split('\\').filter(p => p && p.length);
            let cur = root;
            for (let i = 0; i < parts.length; i++) {
                const pName = parts[i];
                cur[pName] = cur[pName] || { __files: [], __children: {} };
                if (i === parts.length - 1) {
                    cur[pName].__files = (cur[pName].__files || []).concat(map[key]);
                }
                cur = cur[pName].__children;
            }
        }
        function toNodes(obj) {
            return Object.keys(obj).map(k => {
                const entry = obj[k];
                const node = { name: k };
                if (entry.__files && entry.__files.length)
                    node.files = entry.__files;
                const children = entry.__children ? toNodes(entry.__children) : undefined;
                if (children && children.length)
                    node.children = children;
                return node;
            });
        }
        return toNodes(root);
    }
    const filterNodes = Object.keys(filtersMap).length ? buildTree(filtersMap) : undefined;
    return { references: refs, externalDependencies: ext, headers, sources, resources, projectReferences: projectRefs, filters: filterNodes };
}
exports.parseVcxproj = parseVcxproj;
//# sourceMappingURL=vcxprojParser.js.map