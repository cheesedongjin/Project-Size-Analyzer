// 기술 스택 탐지와 프로젝트 위생(hygiene) 점검 — 파일 경로와 의존성 이름만 사용

export const STACK_CATEGORIES = ['언어 · 런타임', '프레임워크 · 라이브러리', '게임 엔진', '빌드 · 패키지 관리', '테스트', '코드 품질', 'CI/CD', '인프라 · 배포', '문서화'];

// [이름, 분류, 탐지 규칙] — 규칙: { dep: [...], file: [...정규식], ext: [...] }
const RULES = [
  ['Node.js', '언어 · 런타임', { file: [/(^|\/)package\.json$/] }],
  ['TypeScript', '언어 · 런타임', { file: [/(^|\/)tsconfig(\.[\w-]+)?\.json$/], dep: ['typescript'] }],
  ['Deno', '언어 · 런타임', { file: [/(^|\/)deno\.jsonc?$/] }],
  ['Bun', '언어 · 런타임', { file: [/(^|\/)bun\.lockb?$/, /(^|\/)bunfig\.toml$/] }],
  ['Python', '언어 · 런타임', { file: [/(^|\/)(pyproject\.toml|setup\.py|requirements[^/]*\.txt|Pipfile)$/] }],
  ['.NET', '언어 · 런타임', { file: [/\.(csproj|fsproj|vbproj|sln)$/] }],
  ['JVM', '언어 · 런타임', { file: [/(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/] }],
  ['Go', '언어 · 런타임', { file: [/(^|\/)go\.mod$/] }],
  ['Rust', '언어 · 런타임', { file: [/(^|\/)Cargo\.toml$/] }],
  ['WebAssembly', '언어 · 런타임', { dep: ['wasm-bindgen', 'wasm-pack'], ext: ['wasm', 'wat'] }],

  ['React', '프레임워크 · 라이브러리', { dep: ['react'] }],
  ['Next.js', '프레임워크 · 라이브러리', { dep: ['next'], file: [/(^|\/)next\.config\.(js|mjs|ts)$/] }],
  ['Vue', '프레임워크 · 라이브러리', { dep: ['vue'], ext: ['vue'] }],
  ['Nuxt', '프레임워크 · 라이브러리', { dep: ['nuxt'], file: [/(^|\/)nuxt\.config\.(js|ts)$/] }],
  ['Angular', '프레임워크 · 라이브러리', { dep: ['@angular/core'], file: [/(^|\/)angular\.json$/] }],
  ['Svelte', '프레임워크 · 라이브러리', { dep: ['svelte'], ext: ['svelte'] }],
  ['SvelteKit', '프레임워크 · 라이브러리', { dep: ['@sveltejs/kit'] }],
  ['Solid', '프레임워크 · 라이브러리', { dep: ['solid-js'] }],
  ['Preact', '프레임워크 · 라이브러리', { dep: ['preact'] }],
  ['Astro', '프레임워크 · 라이브러리', { dep: ['astro'], ext: ['astro'] }],
  ['Remix', '프레임워크 · 라이브러리', { dep: ['@remix-run/react'] }],
  ['jQuery', '프레임워크 · 라이브러리', { dep: ['jquery'] }],
  ['Express', '프레임워크 · 라이브러리', { dep: ['express'] }],
  ['Koa', '프레임워크 · 라이브러리', { dep: ['koa'] }],
  ['Fastify', '프레임워크 · 라이브러리', { dep: ['fastify'] }],
  ['NestJS', '프레임워크 · 라이브러리', { dep: ['@nestjs/core'] }],
  ['Electron', '프레임워크 · 라이브러리', { dep: ['electron'] }],
  ['React Native', '프레임워크 · 라이브러리', { dep: ['react-native'] }],
  ['Expo', '프레임워크 · 라이브러리', { dep: ['expo'] }],
  ['Tailwind CSS', '프레임워크 · 라이브러리', { dep: ['tailwindcss'], file: [/(^|\/)tailwind\.config\.(js|cjs|mjs|ts)$/] }],
  ['Redux', '프레임워크 · 라이브러리', { dep: ['redux', '@reduxjs/toolkit'] }],
  ['GraphQL', '프레임워크 · 라이브러리', { dep: ['graphql', '@apollo/client', 'apollo-server'], ext: ['graphql', 'gql'] }],
  ['Prisma', '프레임워크 · 라이브러리', { dep: ['prisma', '@prisma/client'], file: [/\.prisma$/] }],
  ['Three.js', '프레임워크 · 라이브러리', { dep: ['three'] }],
  ['Django', '프레임워크 · 라이브러리', { dep: ['django'], file: [/(^|\/)manage\.py$/] }],
  ['Flask', '프레임워크 · 라이브러리', { dep: ['flask'] }],
  ['FastAPI', '프레임워크 · 라이브러리', { dep: ['fastapi'] }],
  ['NumPy', '프레임워크 · 라이브러리', { dep: ['numpy'] }],
  ['pandas', '프레임워크 · 라이브러리', { dep: ['pandas'] }],
  ['PyTorch', '프레임워크 · 라이브러리', { dep: ['torch'] }],
  ['TensorFlow', '프레임워크 · 라이브러리', { dep: ['tensorflow'] }],
  ['scikit-learn', '프레임워크 · 라이브러리', { dep: ['scikit-learn', 'sklearn'] }],
  ['Spring Boot', '프레임워크 · 라이브러리', { depPrefix: ['org.springframework.boot', 'spring-boot'] }],
  ['Android', '프레임워크 · 라이브러리', { file: [/(^|\/)AndroidManifest\.xml$/] }],
  ['ASP.NET Core', '프레임워크 · 라이브러리', { depPrefix: ['Microsoft.AspNetCore'] }],
  ['Entity Framework', '프레임워크 · 라이브러리', { depPrefix: ['Microsoft.EntityFrameworkCore'] }],
  ['WPF / WinForms', '프레임워크 · 라이브러리', { ext: ['xaml'] }],
  ['Ruby on Rails', '프레임워크 · 라이브러리', { dep: ['rails'] }],
  ['Laravel', '프레임워크 · 라이브러리', { dep: ['laravel/framework'] }],
  ['Gin', '프레임워크 · 라이브러리', { dep: ['github.com/gin-gonic/gin'] }],
  ['Tokio', '프레임워크 · 라이브러리', { dep: ['tokio'] }],
  ['Actix Web', '프레임워크 · 라이브러리', { dep: ['actix-web'] }],
  ['Axum', '프레임워크 · 라이브러리', { dep: ['axum'] }],
  ['Serde', '프레임워크 · 라이브러리', { dep: ['serde'] }],
  ['Flutter', '프레임워크 · 라이브러리', { dep: ['flutter'] }],

  ['Unity', '게임 엔진', { file: [/(^|\/)ProjectSettings\/ProjectVersion\.txt$/, /(^|\/)Packages\/manifest\.json$/, /(^|\/)Assets\/.+\.meta$/] }],
  ['Unreal Engine', '게임 엔진', { ext: ['uproject', 'uplugin'] }],
  ['Godot', '게임 엔진', { file: [/(^|\/)project\.godot$/], ext: ['gd', 'tscn'] }],

  ['npm', '빌드 · 패키지 관리', { file: [/(^|\/)package-lock\.json$/] }],
  ['Yarn', '빌드 · 패키지 관리', { file: [/(^|\/)yarn\.lock$/, /(^|\/)\.yarnrc(\.yml)?$/] }],
  ['pnpm', '빌드 · 패키지 관리', { file: [/(^|\/)pnpm-lock\.yaml$/, /(^|\/)pnpm-workspace\.yaml$/] }],
  ['Vite', '빌드 · 패키지 관리', { dep: ['vite'], file: [/(^|\/)vite\.config\.(js|mjs|ts)$/] }],
  ['Webpack', '빌드 · 패키지 관리', { dep: ['webpack'], file: [/(^|\/)webpack\.config\.(js|ts)$/] }],
  ['Rollup', '빌드 · 패키지 관리', { dep: ['rollup'], file: [/(^|\/)rollup\.config\.(js|mjs|ts)$/] }],
  ['esbuild', '빌드 · 패키지 관리', { dep: ['esbuild'] }],
  ['Babel', '빌드 · 패키지 관리', { dep: ['@babel/core'], file: [/(^|\/)(\.babelrc|babel\.config\.(js|json))$/] }],
  ['Turborepo', '빌드 · 패키지 관리', { dep: ['turbo'], file: [/(^|\/)turbo\.json$/] }],
  ['Nx', '빌드 · 패키지 관리', { dep: ['nx'], file: [/(^|\/)nx\.json$/] }],
  ['Lerna', '빌드 · 패키지 관리', { dep: ['lerna'], file: [/(^|\/)lerna\.json$/] }],
  ['Poetry', '빌드 · 패키지 관리', { file: [/(^|\/)poetry\.lock$/] }],
  ['uv', '빌드 · 패키지 관리', { file: [/(^|\/)uv\.lock$/] }],
  ['Pipenv', '빌드 · 패키지 관리', { file: [/(^|\/)Pipfile$/] }],
  ['Maven', '빌드 · 패키지 관리', { file: [/(^|\/)pom\.xml$/] }],
  ['Gradle', '빌드 · 패키지 관리', { file: [/(^|\/)build\.gradle(\.kts)?$/, /(^|\/)gradlew$/] }],
  ['CMake', '빌드 · 패키지 관리', { file: [/(^|\/)CMakeLists\.txt$/] }],
  ['Make', '빌드 · 패키지 관리', { file: [/(^|\/)(GNU)?[Mm]akefile$/] }],
  ['Bazel', '빌드 · 패키지 관리', { file: [/(^|\/)(WORKSPACE|MODULE\.bazel|BUILD\.bazel)$/] }],
  ['Cargo', '빌드 · 패키지 관리', { file: [/(^|\/)Cargo\.lock$/] }],
  ['NuGet', '빌드 · 패키지 관리', { file: [/(^|\/)(packages\.config|nuget\.config|Directory\.Packages\.props)$/i] }],

  ['Jest', '테스트', { dep: ['jest'], file: [/(^|\/)jest\.config\.(js|ts|mjs|cjs|json)$/] }],
  ['Vitest', '테스트', { dep: ['vitest'], file: [/(^|\/)vitest\.config\.(js|ts|mjs)$/] }],
  ['Mocha', '테스트', { dep: ['mocha'], file: [/(^|\/)\.mocharc/] }],
  ['Cypress', '테스트', { dep: ['cypress'], file: [/(^|\/)cypress\.config\.(js|ts)$/] }],
  ['Playwright', '테스트', { dep: ['@playwright/test', 'playwright'], file: [/(^|\/)playwright\.config\.(js|ts)$/] }],
  ['Testing Library', '테스트', { depPrefix: ['@testing-library/'] }],
  ['pytest', '테스트', { dep: ['pytest'], file: [/(^|\/)(conftest\.py|pytest\.ini)$/] }],
  ['tox', '테스트', { file: [/(^|\/)tox\.ini$/] }],
  ['JUnit', '테스트', { depPrefix: ['junit:', 'org.junit'] }],
  ['xUnit / NUnit / MSTest', '테스트', { depPrefix: ['xunit', 'NUnit', 'MSTest'] }],
  ['RSpec', '테스트', { dep: ['rspec', 'rspec-rails'], file: [/(^|\/)\.rspec$/] }],
  ['Go test', '테스트', { file: [/_test\.go$/] }],
  ['Unity Test Framework', '테스트', { dep: ['com.unity.test-framework'] }],
  ['Storybook', '테스트', { file: [/(^|\/)\.storybook\//], depPrefix: ['@storybook/'] }],

  ['ESLint', '코드 품질', { dep: ['eslint'], file: [/(^|\/)(\.eslintrc(\.\w+)?|eslint\.config\.(js|mjs|cjs|ts))$/] }],
  ['Prettier', '코드 품질', { dep: ['prettier'], file: [/(^|\/)(\.prettierrc(\.\w+)?|prettier\.config\.(js|cjs|mjs))$/] }],
  ['Biome', '코드 품질', { dep: ['@biomejs/biome'], file: [/(^|\/)biome\.jsonc?$/] }],
  ['Stylelint', '코드 품질', { dep: ['stylelint'], file: [/(^|\/)\.stylelintrc/] }],
  ['EditorConfig', '코드 품질', { file: [/(^|\/)\.editorconfig$/] }],
  ['Husky', '코드 품질', { dep: ['husky'], file: [/(^|\/)\.husky\//] }],
  ['lint-staged', '코드 품질', { dep: ['lint-staged'] }],
  ['commitlint', '코드 품질', { depPrefix: ['@commitlint/'], file: [/(^|\/)commitlint\.config\./] }],
  ['pre-commit', '코드 품질', { file: [/(^|\/)\.pre-commit-config\.yaml$/] }],
  ['Ruff', '코드 품질', { dep: ['ruff'], file: [/(^|\/)\.?ruff\.toml$/] }],
  ['Black', '코드 품질', { dep: ['black'] }],
  ['Flake8', '코드 품질', { dep: ['flake8'], file: [/(^|\/)\.flake8$/] }],
  ['mypy', '코드 품질', { dep: ['mypy'], file: [/(^|\/)mypy\.ini$/] }],
  ['Pylint', '코드 품질', { dep: ['pylint'], file: [/(^|\/)\.pylintrc$/] }],
  ['RuboCop', '코드 품질', { dep: ['rubocop'], file: [/(^|\/)\.rubocop\.yml$/] }],
  ['golangci-lint', '코드 품질', { file: [/(^|\/)\.golangci\.ya?ml$/] }],
  ['rustfmt / Clippy', '코드 품질', { file: [/(^|\/)(rustfmt|\.rustfmt|clippy)\.toml$/] }],
  ['StyleCop / .NET Analyzers', '코드 품질', { depPrefix: ['StyleCop.Analyzers', 'Microsoft.CodeAnalysis'] }],
  ['SonarQube', '코드 품질', { file: [/(^|\/)sonar-project\.properties$/] }],
  ['Codecov', '코드 품질', { file: [/(^|\/)\.?codecov\.ya?ml$/] }],
  ['Dependabot', '코드 품질', { file: [/(^|\/)\.github\/dependabot\.ya?ml$/] }],
  ['Renovate', '코드 품질', { file: [/(^|\/)(\.github\/)?renovate\.json5?$/, /(^|\/)\.renovaterc/] }],

  ['GitHub Actions', 'CI/CD', { file: [/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/] }],
  ['GitLab CI', 'CI/CD', { file: [/(^|\/)\.gitlab-ci\.ya?ml$/] }],
  ['CircleCI', 'CI/CD', { file: [/(^|\/)\.circleci\//] }],
  ['Travis CI', 'CI/CD', { file: [/(^|\/)\.travis\.ya?ml$/] }],
  ['Azure Pipelines', 'CI/CD', { file: [/(^|\/)azure-pipelines\.ya?ml$/] }],
  ['Jenkins', 'CI/CD', { file: [/(^|\/)Jenkinsfile$/] }],
  ['Bitbucket Pipelines', 'CI/CD', { file: [/(^|\/)bitbucket-pipelines\.ya?ml$/] }],
  ['AppVeyor', 'CI/CD', { file: [/(^|\/)\.?appveyor\.ya?ml$/] }],

  ['Docker', '인프라 · 배포', { file: [/(^|\/)(Dockerfile|Containerfile)([.-][\w.-]+)?$/i, /\.dockerfile$/i] }],
  ['Docker Compose', '인프라 · 배포', { file: [/(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/] }],
  ['Kubernetes', '인프라 · 배포', { file: [/(^|\/)(k8s|kubernetes|manifests)\/.+\.ya?ml$/, /(^|\/)kustomization\.ya?ml$/] }],
  ['Helm', '인프라 · 배포', { file: [/(^|\/)Chart\.yaml$/] }],
  ['Terraform', '인프라 · 배포', { ext: ['tf'] }],
  ['Vercel', '인프라 · 배포', { file: [/(^|\/)vercel\.json$/] }],
  ['Netlify', '인프라 · 배포', { file: [/(^|\/)netlify\.toml$/] }],
  ['Heroku', '인프라 · 배포', { file: [/(^|\/)Procfile$/] }],
  ['Firebase', '인프라 · 배포', { file: [/(^|\/)firebase\.json$/], dep: ['firebase', 'firebase-admin'] }],
  ['Serverless', '인프라 · 배포', { file: [/(^|\/)serverless\.ya?ml$/] }],
  ['Nix', '인프라 · 배포', { file: [/(^|\/)(flake|default|shell)\.nix$/] }],
  ['Dev Container', '인프라 · 배포', { file: [/(^|\/)\.devcontainer\//] }],

  ['Docusaurus', '문서화', { depPrefix: ['@docusaurus/'] }],
  ['VitePress', '문서화', { dep: ['vitepress'] }],
  ['MkDocs', '문서화', { file: [/(^|\/)mkdocs\.ya?ml$/] }],
  ['Sphinx', '문서화', { file: [/(^|\/)docs?\/(source\/)?conf\.py$/] }],
  ['TypeDoc', '문서화', { dep: ['typedoc'] }],
  ['JSDoc', '문서화', { dep: ['jsdoc'] }],
  ['Doxygen', '문서화', { file: [/(^|\/)Doxyfile$/] }],
];

export function detectStack(report) {
  const paths = report.files.map((f) => f.path);
  const exts = new Set(paths.map((p) => { const n = p.split('/').pop(); const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; }));
  const depIndex = new Map();
  for (const d of report.dependencies) for (const x of d.deps) {
    const k = x.name.toLowerCase();
    if (!depIndex.has(k)) depIndex.set(k, d.file);
  }

  const stack = [];
  for (const [name, category, rule] of RULES) {
    let evidence = null;
    for (const dep of rule.dep || []) if (depIndex.has(dep.toLowerCase())) { evidence = `${depIndex.get(dep.toLowerCase())}의 의존성 "${dep}"`; break; }
    if (!evidence) for (const pre of rule.depPrefix || []) {
      const hit = [...depIndex.keys()].find((k) => k.startsWith(pre.toLowerCase()));
      if (hit) { evidence = `${depIndex.get(hit)}의 의존성 "${hit}"`; break; }
    }
    if (!evidence) for (const re of rule.file || []) {
      const hit = paths.find((p) => re.test(p));
      if (hit) { evidence = `파일 ${hit}`; break; }
    }
    if (!evidence) for (const e of rule.ext || []) if (exts.has(e)) { evidence = `.${e} 파일`; break; }
    if (evidence) stack.push({ name, category, evidence });
  }

  return { stack, hygiene: hygiene(report, paths, stack) };
}

function hygiene(report, paths, stack) {
  const has = (re) => paths.find((p) => re.test(p));
  const inStack = (cat, names) => stack.filter((s) => s.category === cat && (!names || names.includes(s.name)));
  const manifests = report.dependencies.length > 0;
  const linters = inStack('코드 품질', ['ESLint', 'Biome', 'Stylelint', 'Ruff', 'Flake8', 'Pylint', 'RuboCop', 'golangci-lint', 'rustfmt / Clippy', 'StyleCop / .NET Analyzers', 'SonarQube', 'mypy']);
  const formatters = inStack('코드 품질', ['Prettier', 'Biome', 'Black', 'Ruff', 'EditorConfig', 'rustfmt / Clippy']);
  const lock = has(/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum|packages\.lock\.json|packages-lock\.json)$/);
  const items = [
    { key: 'readme', label: 'README', ok: !!has(/^(readme)(\.\w+)?$/i), file: has(/^readme(\.\w+)?$/i), why: '프로젝트의 목적, 설치·실행 방법을 설명하는 첫 관문입니다.' },
    { key: 'license', label: '라이선스', ok: !!has(/^(license|licence|copying)(\.\w+)?$/i), file: has(/^(license|licence|copying)(\.\w+)?$/i), why: '라이선스가 없으면 법적으로 다른 사람이 코드를 사용·수정할 수 없습니다.' },
    { key: 'gitignore', label: '.gitignore', ok: !!has(/(^|\/)\.gitignore$/), file: has(/^\.gitignore$/), why: '빌드 산출물, 비밀 정보, 의존성 폴더가 저장소에 들어가는 것을 막습니다.' },
    { key: 'contributing', label: '기여 가이드', ok: !!has(/^(\.github\/|docs\/)?contributing(\.\w+)?$/i), file: has(/^(\.github\/|docs\/)?contributing(\.\w+)?$/i), why: '외부 기여자가 개발 환경, 코딩 규칙, PR 절차를 알 수 있습니다.' },
    { key: 'changelog', label: '변경 이력', ok: !!has(/^(changelog|changes|history|releases|news)(\.\w+)?$/i), file: has(/^(changelog|changes|history|releases|news)(\.\w+)?$/i), why: '버전별 변경 사항을 사용자에게 알려 업그레이드 위험을 줄입니다.' },
    { key: 'coc', label: '행동 강령', ok: !!has(/^(\.github\/|docs\/)?code_of_conduct(\.\w+)?$/i), why: '커뮤니티 참여 규칙을 명시합니다 (오픈소스 프로젝트에 권장).' },
    { key: 'security', label: '보안 정책', ok: !!has(/^(\.github\/|docs\/)?security(\.\w+)?$/i), why: '취약점을 어디로 어떻게 제보해야 하는지 알려줍니다.' },
    { key: 'templates', label: '이슈/PR 템플릿', ok: !!has(/(^|\/)\.github\/(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE|pull_request_template)/i), why: '이슈와 PR에 필요한 정보가 빠지지 않게 합니다.' },
    { key: 'ci', label: 'CI 파이프라인', ok: inStack('CI/CD').length > 0, file: inStack('CI/CD').map((s) => s.name).join(', '), why: '푸시마다 빌드·테스트를 자동 실행해 회귀 버그를 빨리 발견합니다.' },
    { key: 'tests', label: '테스트 코드', ok: (report.categories.test?.files || 0) > 0, file: report.categories.test ? `${report.categories.test.files}개 파일` : '', why: '변경이 기존 기능을 깨뜨리지 않았음을 검증하는 안전망입니다.' },
    { key: 'linter', label: '린터 설정', ok: linters.length > 0, file: linters.map((s) => s.name).join(', '), why: '버그 패턴과 스타일 위반을 자동으로 찾아냅니다.' },
    { key: 'formatter', label: '포매터 / 에디터 설정', ok: formatters.length > 0, file: formatters.map((s) => s.name).join(', '), why: '코드 스타일을 통일해 리뷰에서 불필요한 논쟁을 없앱니다.' },
    { key: 'lock', label: '의존성 잠금 파일', ok: !manifests || !!lock, na: !manifests, file: lock, why: '모든 환경에서 같은 버전의 의존성이 설치되도록 보장합니다.' },
    { key: 'deps-bot', label: '의존성 자동 업데이트', ok: inStack('코드 품질', ['Dependabot', 'Renovate']).length > 0, why: '보안 패치가 포함된 새 버전을 자동으로 제안받습니다.' },
    { key: 'docs', label: '문서 폴더', ok: !!has(/^(docs?|documentation|wiki)\//i) || inStack('문서화').length > 0, why: 'README를 넘어서는 상세 문서(설계, API, 운영)를 관리합니다.' },
  ];
  const applicable = items.filter((i) => !i.na);
  const passed = applicable.filter((i) => i.ok).length;
  return { items, passed, total: applicable.length, score: applicable.length ? passed / applicable.length : 0 };
}
