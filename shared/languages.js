// 언어 정의: 확장자/파일명 → 언어, 주석 문법, 복잡도 계산 계열(family), 분류(type)
// type: programming | markup | data | prose

const SL = ['//'];
const CB = [['/*', '*/']];
const HASH = ['#'];
const Q = ['"', "'"];
const QJS = ['"', "'", '`'];

const c = (color, ext, family = 'c', extra = {}) => ({ color, ext, line: SL, block: CB, quotes: Q, family, type: 'programming', ...extra });
const hash = (color, ext, family = null, extra = {}) => ({ color, ext, line: HASH, block: [], quotes: Q, family, type: 'programming', ...extra });

export const LANGUAGES = {
  JavaScript: c('#f1e05a', ['js', 'mjs', 'cjs', 'jsx'], 'js', { quotes: QJS }),
  TypeScript: c('#3178c6', ['ts', 'tsx', 'mts', 'cts'], 'js', { quotes: QJS }),
  Python: hash('#3572A5', ['py', 'pyw', 'pyi'], 'py', { multiline: ['"""', "'''"] }),
  Java: c('#b07219', ['java']),
  Kotlin: c('#A97BFF', ['kt', 'kts'], 'kotlin'),
  Scala: c('#c22d40', ['scala', 'sc']),
  Groovy: c('#4298b8', ['groovy']),
  Gradle: c('#3d8fa8', ['gradle']),
  C: c('#7d8590', ['c', 'h']),
  'C++': c('#f34b7d', ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'c++', 'inl', 'ipp', 'tpp']),
  'C#': c('#178600', ['cs', 'csx']),
  'Objective-C': c('#438eff', ['m', 'mm']),
  Go: c('#00ADD8', ['go'], 'go', { quotes: ['"', '`'] }),
  Rust: c('#dea584', ['rs'], 'rust', { quotes: ['"'] }),
  Ruby: hash('#a91e50', ['rb', 'rake', 'gemspec'], 'rb', { block: [['=begin', '=end']] }),
  PHP: c('#4F5D95', ['php', 'phtml'], 'php', { line: ['//', '#'] }),
  Swift: c('#F05138', ['swift'], 'swift'),
  Dart: c('#00B4AB', ['dart']),
  Lua: { color: '#4a6cd4', ext: ['lua'], line: ['--'], block: [['--[[', ']]']], quotes: Q, family: 'lua', type: 'programming' },
  Perl: hash('#0298c3', ['pl', 'pm']),
  R: hash('#198CE7', ['r']),
  Julia: hash('#a270ba', ['jl'], null, { block: [['#=', '=#']] }),
  Haskell: { color: '#5e5086', ext: ['hs', 'lhs'], line: ['--'], block: [['{-', '-}']], quotes: ['"'], family: null, type: 'programming' },
  Elixir: hash('#6e4a7e', ['ex', 'exs']),
  Erlang: { color: '#B83998', ext: ['erl', 'hrl'], line: ['%'], block: [], quotes: ['"'], family: null, type: 'programming' },
  Clojure: { color: '#db5855', ext: ['clj', 'cljs', 'cljc', 'edn'], line: [';'], block: [], quotes: ['"'], family: null, type: 'programming' },
  'F#': c('#b845fc', ['fs', 'fsi', 'fsx'], null, { block: [['(*', '*)']], quotes: ['"'] }),
  OCaml: { color: '#ef7a08', ext: ['ml', 'mli'], line: [], block: [['(*', '*)']], quotes: ['"'], family: null, type: 'programming' },
  Zig: c('#ec915c', ['zig'], 'c', { block: [] }),
  Nim: hash('#ffc200', ['nim']),
  'Visual Basic': { color: '#945db7', ext: ['vb', 'bas', 'vbs'], line: ["'"], block: [], quotes: ['"'], family: null, type: 'programming' },
  Assembly: { color: '#6E4C13', ext: ['asm', 's', 'nasm'], line: [';', '#', '//'], block: [], quotes: Q, family: null, type: 'programming' },
  Fortran: { color: '#4d41b1', ext: ['f', 'f90', 'f95', 'f03', 'for'], line: ['!'], block: [], quotes: Q, family: null, type: 'programming' },
  Pascal: { color: '#c9c25b', ext: ['pas', 'pp', 'dpr'], line: ['//'], block: [['{', '}'], ['(*', '*)']], quotes: ["'"], family: null, type: 'programming' },
  Solidity: c('#AA6746', ['sol']),
  GDScript: hash('#478cbf', ['gd'], 'py', { multiline: ['"""'] }),
  GLSL: c('#5686a5', ['glsl', 'vert', 'frag', 'geom', 'comp', 'tesc', 'tese']),
  HLSL: c('#aace60', ['hlsl', 'cginc', 'fx', 'compute', 'hlsli']),
  ShaderLab: c('#7b8a9a', ['shader']),
  Shell: hash('#89e051', ['sh', 'bash', 'zsh', 'fish', 'ksh'], 'sh'),
  PowerShell: hash('#2f6db5', ['ps1', 'psm1', 'psd1'], 'ps', { block: [['<#', '#>']] }),
  Batchfile: { color: '#C1F12E', ext: ['bat', 'cmd'], line: ['REM ', 'rem ', '@REM ', '@rem ', '::'], block: [], quotes: ['"'], family: null, type: 'programming' },
  SQL: { color: '#e38c00', ext: ['sql', 'psql', 'mysql'], line: ['--'], block: CB, quotes: Q, family: null, type: 'data' },
  HCL: c('#844FBA', ['tf', 'tfvars', 'hcl'], null, { line: ['#', '//'] }),
  Dockerfile: hash('#4a7a8c', ['dockerfile']),
  Makefile: hash('#427819', ['mk', 'mak']),
  CMake: hash('#DA3434', ['cmake']),
  Nix: hash('#7e7eff', ['nix']),
  Vue: c('#41b883', ['vue'], 'js', { block: [['/*', '*/'], ['<!--', '-->']], quotes: QJS }),
  Svelte: c('#ff3e00', ['svelte'], 'js', { block: [['/*', '*/'], ['<!--', '-->']], quotes: QJS }),
  Astro: c('#ff5a03', ['astro'], 'js', { block: [['/*', '*/'], ['<!--', '-->']], quotes: QJS }),

  HTML: { color: '#e34c26', ext: ['html', 'htm', 'xhtml'], line: [], block: [['<!--', '-->']], quotes: [], family: null, type: 'markup' },
  Razor: { color: '#512be4', ext: ['cshtml', 'razor'], line: [], block: [['@*', '*@'], ['<!--', '-->']], quotes: [], family: null, type: 'markup' },
  CSS: { color: '#563d7c', ext: ['css'], line: [], block: CB, quotes: Q, family: null, type: 'markup' },
  SCSS: { color: '#c6538c', ext: ['scss'], line: SL, block: CB, quotes: Q, family: null, type: 'markup' },
  Sass: { color: '#a53b70', ext: ['sass'], line: SL, block: CB, quotes: Q, family: null, type: 'markup' },
  Less: { color: '#3b6fb6', ext: ['less'], line: SL, block: CB, quotes: Q, family: null, type: 'markup' },
  Stylus: { color: '#ff6347', ext: ['styl'], line: SL, block: CB, quotes: Q, family: null, type: 'markup' },
  USS: { color: '#8a6fd1', ext: ['uss', 'tss'], line: [], block: CB, quotes: Q, family: null, type: 'markup' },
  XAML: { color: '#0d7fd8', ext: ['xaml', 'axaml'], line: [], block: [['<!--', '-->']], quotes: [], family: null, type: 'markup' },
  UXML: { color: '#3aa0c8', ext: ['uxml'], line: [], block: [['<!--', '-->']], quotes: [], family: null, type: 'markup' },
  TeX: { color: '#3D6117', ext: ['tex', 'sty', 'cls', 'bib'], line: ['%'], block: [], quotes: [], family: null, type: 'markup' },

  Markdown: { color: '#2b7bdb', ext: ['md', 'markdown', 'mdx'], line: [], block: [['<!--', '-->']], quotes: [], family: null, type: 'prose' },
  reStructuredText: { color: '#8a8f98', ext: ['rst'], line: [], block: [], quotes: [], family: null, type: 'prose' },
  AsciiDoc: { color: '#73a0c5', ext: ['adoc', 'asciidoc'], line: [], block: [], quotes: [], family: null, type: 'prose' },
  Text: { color: '#9aa4ae', ext: ['txt', 'text', 'log'], line: [], block: [], quotes: [], family: null, type: 'prose' },

  JSON: { color: '#a0a0a0', ext: ['json', 'jsonc', 'json5', 'webmanifest', 'geojson', 'excalidraw', 'har'], line: SL, block: CB, quotes: ['"'], family: null, type: 'data' },
  YAML: { color: '#cb171e', ext: ['yml', 'yaml'], line: HASH, block: [], quotes: Q, family: null, type: 'data' },
  TOML: { color: '#9c4221', ext: ['toml'], line: HASH, block: [], quotes: Q, family: null, type: 'data' },
  INI: { color: '#b7c4cc', ext: ['ini', 'cfg', 'conf', 'properties', 'editorconfig', 'env'], line: [';', '#'], block: [], quotes: [], family: null, type: 'data' },
  XML: { color: '#0060ac', ext: ['xml', 'xsd', 'xsl', 'xslt', 'plist', 'csproj', 'vbproj', 'fsproj', 'props', 'targets', 'resx', 'config', 'nuspec', 'manifest'], line: [], block: [['<!--', '-->']], quotes: [], family: null, type: 'data' },
  SVG: { color: '#ff9a00', ext: ['svg'], line: [], block: [['<!--', '-->']], quotes: [], family: null, type: 'data' },
  CSV: { color: '#237346', ext: ['csv', 'tsv'], line: [], block: [], quotes: [], family: null, type: 'data' },
  GraphQL: { color: '#e10098', ext: ['graphql', 'gql'], line: HASH, block: [], quotes: ['"'], family: null, type: 'data' },
  'Protocol Buffers': c('#6a9fb5', ['proto'], null, { type: 'data' }),
  'Jupyter Notebook': { color: '#DA5B0B', ext: ['ipynb'], line: [], block: [], quotes: [], family: null, type: 'data' },
  'Unity Asset': { color: '#6b7c8f', ext: ['unity', 'prefab', 'asset', 'mat', 'anim', 'controller', 'meta', 'physicmaterial', 'overridecontroller', 'mask', 'playable', 'lighting', 'mixer', 'spriteatlas', 'asmdef', 'asmref', 'inputactions'], line: HASH, block: [], quotes: [], family: null, type: 'data' },
  Snapshot: { color: '#99425b', ext: ['snap'], line: [], block: [], quotes: [], family: null, type: 'data' },
  Diff: { color: '#88dddd', ext: ['diff', 'patch'], line: [], block: [], quotes: [], family: null, type: 'data' },
  'Ignore List': { color: '#7a7a7a', ext: ['gitignore', 'dockerignore', 'npmignore', 'eslintignore', 'prettierignore', 'gitattributes'], line: HASH, block: [], quotes: [], family: null, type: 'data' },
  Lockfile: { color: '#8c8c8c', ext: ['lock'], line: [], block: [], quotes: [], family: null, type: 'data', generated: true },
};

const FILENAMES = {
  dockerfile: 'Dockerfile', containerfile: 'Dockerfile',
  makefile: 'Makefile', gnumakefile: 'Makefile',
  'cmakelists.txt': 'CMake',
  rakefile: 'Ruby', gemfile: 'Ruby', vagrantfile: 'Ruby', podfile: 'Ruby', fastfile: 'Ruby',
  jenkinsfile: 'Groovy',
  'package-lock.json': 'Lockfile', 'yarn.lock': 'Lockfile', 'pnpm-lock.yaml': 'Lockfile', 'cargo.lock': 'Lockfile',
  'gemfile.lock': 'Lockfile', 'poetry.lock': 'Lockfile', 'composer.lock': 'Lockfile', 'go.sum': 'Lockfile',
  'pipfile.lock': 'Lockfile', 'packages.lock.json': 'Lockfile', 'bun.lockb': 'Lockfile', 'uv.lock': 'Lockfile',
  '.bashrc': 'Shell', '.zshrc': 'Shell', '.profile': 'Shell', '.bash_profile': 'Shell',
  '.babelrc': 'JSON', '.eslintrc': 'JSON', '.prettierrc': 'JSON',
  license: 'Text', licence: 'Text', copying: 'Text', authors: 'Text', notice: 'Text', readme: 'Text', changelog: 'Text',
  '.env': 'INI', '.editorconfig': 'INI', '.npmrc': 'INI',
  pipfile: 'TOML',
};

const EXT_MAP = new Map();
for (const [name, def] of Object.entries(LANGUAGES)) {
  def.name = name;
  for (const e of def.ext) if (!EXT_MAP.has(e)) EXT_MAP.set(e, name);
}

export const BINARY_EXT = new Set(`png jpg jpeg gif bmp ico icns webp tiff tif psd ai eps heic avif cur
mp3 wav ogg flac aac m4a wma aiff mid midi
mp4 mov avi mkv webm wmv flv m4v
zip gz tgz bz2 xz 7z rar tar jar war ear nupkg whl
exe dll so dylib a lib o obj class pyc pyo pdb ilk exp idb ncb suo
woff woff2 ttf otf eot fon
pdf doc docx xls xlsx ppt pptx odt ods odp
db sqlite sqlite3 mdb accdb
bin dat pak cache
fbx blend 3ds max dae glb ma mb c4d unitypackage bundle
wasm iso dmg msi apk ipa aab deb rpm node
npy npz pkl pickle h5 hdf5 onnx pt pth ckpt safetensors tflite pb
tga dds exr hdr ktx ktx2 astc pvr
swf keystore jks p12 pfx der cer
ogv opus snd`.split(/\s+/));

export function extOf(name) {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot <= 0) return lower.startsWith('.') ? lower.slice(1) : '';
  return lower.slice(dot + 1);
}

export function detectLanguage(name) {
  const lower = name.toLowerCase();
  if (FILENAMES[lower]) return LANGUAGES[FILENAMES[lower]];
  if (lower.startsWith('dockerfile.') || lower.endsWith('.dockerfile')) return LANGUAGES.Dockerfile;
  if (lower.startsWith('.env.')) return LANGUAGES.INI;
  if (lower.startsWith('readme') || lower.startsWith('license')) {
    const e = extOf(lower);
    if (!e || e === 'txt') return LANGUAGES.Text;
  }
  const e = extOf(lower);
  const lang = EXT_MAP.get(e);
  return lang ? LANGUAGES[lang] : null;
}

export function isBinaryName(name) {
  return BINARY_EXT.has(extOf(name));
}

// 복잡도(분기) 및 함수 탐지 규칙 — 정밀한 파서가 아닌 휴리스틱
const C_DECISION = /\b(?:if|for|foreach|while|case|catch)\b|&&|\|\||\?\?|\s\?\s/g;
const C_FN = /^\s*(?!(?:if|for|while|switch|catch|return|else|new|throw|do|using|lock|foreach|sizeof|case|delete|await|yield|typeof|elif)\b)(?:[\w<>\[\],.*&:~?]+\s+)+[\w~:.<>]+\s*\([^;]*\)\s*(?:const|override|noexcept|final|throws\s+[\w.,\s]+)*\s*\{?\s*$/g;

export const FAMILIES = {
  js: {
    decision: C_DECISION,
    fn: /\bfunction\b|=>|^\s*(?:(?:public|private|protected|static|async|override|readonly|get|set)\s+)*(?!(?:if|for|while|switch|catch|return|function|else|do|try|with|await|typeof|new)\b)[A-Za-z_$][\w$]*\s*\([^()]*\)\s*(?::[^{=;]+)?\{/g,
    nest: 'brace',
  },
  c: { decision: C_DECISION, fn: C_FN, nest: 'brace' },
  kotlin: { decision: /\b(?:if|for|while|when|catch)\b|&&|\|\||\?:|->/g, fn: /\bfun\b/g, nest: 'brace' },
  swift: { decision: /\b(?:if|guard|for|while|case|catch)\b|&&|\|\||\?\?|\s\?\s/g, fn: /\bfunc\b/g, nest: 'brace' },
  go: { decision: /\b(?:if|for|case|select)\b|&&|\|\|/g, fn: /\bfunc\b/g, nest: 'brace' },
  rust: { decision: /\b(?:if|for|while|loop)\b|&&|\|\||=>/g, fn: /\bfn\b/g, nest: 'brace' },
  php: { decision: C_DECISION, fn: /\bfunction\b|\bfn\s*\(/g, nest: 'brace' },
  ps: { decision: /\b(?:if|elseif|for|foreach|while|switch|catch)\b|-and\b|-or\b/gi, fn: /\bfunction\b/gi, nest: 'brace' },
  py: { decision: /\b(?:if|elif|for|while|except|and|or|case)\b/g, fn: /\bdef\b|\blambda\b/g, nest: 'indent' },
  rb: { decision: /\b(?:if|elsif|unless|while|until|for|rescue|when|and|or)\b|&&|\|\|/g, fn: /^\s*def\b/g, nest: 'indent' },
  sh: { decision: /\b(?:if|elif|for|while|until)\b|&&|\|\||;;/g, fn: /^\s*(?:function\s+[\w-]+|[\w-]+\s*\(\)\s*\{?)/g, nest: 'indent' },
  lua: { decision: /\b(?:if|elseif|for|while|repeat|and|or)\b/g, fn: /\bfunction\b/g, nest: 'indent' },
};
