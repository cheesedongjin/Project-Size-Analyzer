// 분석 결과를 바탕으로 사람이 읽을 수 있는 요약·건강도·인사이트(발견 사항과 권장 조치)를 생성

const pct = (v, d = 1) => `${((v || 0) * 100).toFixed(d)}%`;
const num = (n) => Math.round(n || 0).toLocaleString('ko-KR');
const clamp = (v) => Math.max(0, Math.min(100, v));
const ago = (ms) => {
  const days = Math.max(0, Math.round((Date.now() - ms) / 86400000));
  if (days < 1) return '오늘';
  if (days < 60) return `${days}일`;
  if (days < 730) return `${Math.round(days / 30.4)}개월`;
  return `${(days / 365.25).toFixed(1)}년`;
};
const span = (days) => (days < 60 ? `${days}일` : days < 730 ? `${Math.round(days / 30.4)}개월` : `${(days / 365.25).toFixed(1)}년`);
const short = (p) => (p.length > 60 ? `…${p.slice(-58)}` : p);

export function generateInsights(r) {
  return { profile: profile(r), health: health(r), items: findings(r) };
}

// ── 한 문단 요약
function profile(r) {
  const s = r.summary, sc = r.score;
  const langs = r.languages.filter((l) => (l.type === 'programming' || l.type === 'markup') && l.code > 0);
  const lt = langs.reduce((a, l) => a + l.code, 0) || 1;
  const main = langs[0];
  const out = [];
  out.push(`${r.meta?.name || '이 프로젝트'}은(는) ${main ? `${main.name} 중심의 ` : ''}${sc.sizeLabel}(${sc.sizeGrade} 등급) 프로젝트로, ${num(s.files)}개 파일(폴더 ${num(s.dirs)}개)에 ${num(s.code)}줄의 코드가 있습니다.`);
  if (langs.length > 1) out.push(`프로그래밍·마크업 언어 ${langs.length}개를 사용하며 비중이 큰 언어는 ${langs.slice(0, 3).map((l) => `${l.name}(${pct(l.code / lt, 0)})`).join(', ')}입니다.`);
  const fw = (r.stack || []).filter((x) => ['프레임워크 · 라이브러리', '게임 엔진'].includes(x.category)).map((x) => x.name);
  const tools = (r.stack || []).filter((x) => ['빌드 · 패키지 관리', '테스트', 'CI/CD'].includes(x.category)).map((x) => x.name);
  if (fw.length || tools.length) out.push(`탐지된 기술 스택은 ${[...fw.slice(0, 6), ...tools.slice(0, 5)].join(', ')} 등입니다.`);
  const f = r.functions;
  if (f?.count) out.push(`복잡도 지수는 ${sc.overall}/100(${sc.label})이며, 추정 함수 ${num(f.count)}개의 평균 길이는 ${f.avgLength.toFixed(1)}줄, 평균 순환 복잡도는 ${f.avgCx.toFixed(1)}입니다.`);
  else out.push(`복잡도 지수는 ${sc.overall}/100(${sc.label})입니다.`);
  const m = r.maintainability;
  if (m?.files) out.push(`평균 유지보수성 지수는 ${m.avgMI.toFixed(0)}점이고, 소스 코드 중복률은 ${pct(r.codeDup?.sourceRatio)}, 테스트 코드 비율은 ${pct(s.testRatio)}입니다.`);
  const g = r.git;
  if (g) out.push(`${span(g.ageDays)} 동안 ${num(g.contributors)}명이 ${num(g.commits)}개의 커밋을 남겼고, 마지막 커밋은 ${ago(g.lastCommit)} 전입니다.`);
  if (r.cocomo?.kloc > 0.5) out.push(`COCOMO 모델로 추정하면 처음부터 다시 만드는 데 약 ${r.cocomo.effortPM.toFixed(0)} 인·월(${r.cocomo.people.toFixed(1)}명이 ${r.cocomo.scheduleMonths.toFixed(0)}개월)이 필요합니다.`);
  return out;
}

// ── 건강도: 영역별 0~100점
function health(r) {
  const parts = [];
  const s = r.summary;
  if (r.maintainability?.files) {
    parts.push({ key: 'mi', label: '유지보수성', score: clamp(((r.maintainability.avgMI - 20) / 50) * 100), detail: `평균 MI ${r.maintainability.avgMI.toFixed(0)} (70 이상이면 만점, 20 이하면 0점)` });
  }
  if (r.functions?.count) {
    const okShare = 1 - r.functions.over10 / r.functions.count;
    parts.push({ key: 'cx', label: '함수 복잡도', score: clamp(((okShare - 0.85) / 0.15) * 100), detail: `복잡도 10 이하 함수 비율 ${pct(okShare)} (100%면 만점, 85% 이하면 0점)` });
  }
  if (r.codeDup?.analyzedLines) {
    parts.push({ key: 'dup', label: '중복 없음', score: clamp(100 - r.codeDup.sourceRatio * 100 * (100 / 15)), detail: `소스 중복률 ${pct(r.codeDup.sourceRatio)} (0%면 만점, 15% 이상이면 0점)` });
  }
  if ((r.categories.source?.code || 0) > 0) {
    parts.push({ key: 'test', label: '테스트', score: clamp((s.testRatio / 0.4) * 100), detail: `테스트 코드 비율 ${pct(s.testRatio)} (40% 이상이면 만점)` });
    const hasReadme = r.hygiene?.items.find((i) => i.key === 'readme')?.ok;
    const hasDocs = r.hygiene?.items.find((i) => i.key === 'docs')?.ok;
    parts.push({ key: 'docs', label: '문서화', score: clamp((s.commentRatio / 0.15) * 60 + (hasReadme ? 25 : 0) + (hasDocs ? 15 : 0)), detail: `주석 비율 ${pct(s.commentRatio)}, README ${hasReadme ? '있음' : '없음'}, 문서 폴더 ${hasDocs ? '있음' : '없음'}` });
  }
  if (r.hygiene) parts.push({ key: 'hygiene', label: '프로젝트 위생', score: r.hygiene.score * 100, detail: `점검 항목 ${r.hygiene.passed}/${r.hygiene.total} 충족` });
  if (r.git) {
    const days = (Date.now() - r.git.lastCommit) / 86400000;
    const recency = clamp(100 - ((days - 30) / 700) * 100);
    const bus = Math.min(3, r.git.busFactor) / 3;
    parts.push({ key: 'activity', label: '활동 · 협업', score: recency * 0.7 + bus * 30, detail: `마지막 커밋 ${ago(r.git.lastCommit)} 전, 버스 팩터 ${r.git.busFactor}` });
  }
  const overall = parts.length ? parts.reduce((a, p) => a + p.score, 0) / parts.length : 0;
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';
  return { overall, grade, parts };
}

// ── 발견 사항
function findings(r) {
  const out = [];
  const add = (level, area, title, detail, action) => out.push({ level, area, title, detail, action });
  const s = r.summary;
  const srcCode = r.categories.source?.code || 0;

  // 복잡도 · 함수
  const f = r.functions;
  if (f?.count) {
    const worst = f.topComplex[0];
    if (f.over50) add('bad', '복잡도', `테스트가 사실상 불가능한 수준의 함수 ${num(f.over50)}개`, `순환 복잡도 50을 넘는 함수가 있습니다. 가장 복잡한 함수는 ${worst.name} (${short(worst.path)}:${worst.line}, 복잡도 ${worst.cx}, ${worst.length}줄)입니다.`, '분기별로 작은 함수로 쪼개고, 조건 분기는 조기 반환(guard clause)·전략 패턴·테이블 조회로 단순화하세요.');
    else if (f.over20) add('warn', '복잡도', `복잡도가 높은 함수 ${num(f.over20)}개 (20 초과)`, `가장 복잡한 함수는 ${worst.name} (${short(worst.path)}:${worst.line}, 복잡도 ${worst.cx})입니다.`, '복잡도 10 이하를 목표로 함수를 분리하고, 분리 전에 테스트를 먼저 보강하세요.');
    else if (f.over10 / f.count < 0.03) add('good', '복잡도', '함수 대부분이 단순합니다', `복잡도 10 이하 함수 비율이 ${pct(1 - f.over10 / f.count)}입니다.`);
    if (f.long100) add(f.long100 / f.count > 0.03 ? 'warn' : 'info', '함수', `100줄이 넘는 긴 함수 ${num(f.long100)}개`, `가장 긴 함수는 ${f.topLong[0].name} (${short(f.topLong[0].path)}, ${f.topLong[0].length}줄)입니다. 함수 평균 길이는 ${f.avgLength.toFixed(1)}줄, 상위 10%는 ${f.p90Length}줄 이상입니다.`, '한 함수가 한 가지 일만 하도록 단계별 하위 함수로 추출(Extract Method)하세요.');
    else if (f.avgLength <= 25) add('good', '함수', '함수 길이가 짧게 유지되고 있습니다', `평균 ${f.avgLength.toFixed(1)}줄, 100줄 넘는 함수 없음.`);
    if (f.manyParams) add('info', '함수', `매개변수가 6개 이상인 함수 ${num(f.manyParams)}개`, `예: ${f.topParams[0].name} (${f.topParams[0].params}개).`, '관련된 매개변수를 객체(파라미터 객체)로 묶으면 호출부가 읽기 쉬워지고 순서 실수가 줄어듭니다.');
  }
  if (r.complexity.avgNesting > 6) add('warn', '복잡도', `평균 중첩 깊이가 깊습니다 (${r.complexity.avgNesting.toFixed(1)})`, `최대 중첩은 ${r.complexity.maxNesting}단계입니다. 깊은 중첩은 읽기 어렵고 분기 누락 버그를 만듭니다.`, '조기 반환으로 들여쓰기를 줄이고, 중첩된 루프·조건은 별도 함수로 추출하세요.');

  // 유지보수성
  const m = r.maintainability;
  if (m?.files) {
    if (m.avgMI >= 60) add('good', '유지보수성', `유지보수성 지수 양호 (평균 ${m.avgMI.toFixed(0)})`, 'Halstead 볼륨, 복잡도, 코드 길이를 종합한 지표가 좋은 수준입니다.');
    else if (m.avgMI < 40) add('warn', '유지보수성', `유지보수성 지수가 낮습니다 (평균 ${m.avgMI.toFixed(0)})`, '함수가 길고 복잡하며 사용되는 연산자·식별자가 많다는 뜻입니다.', '유지보수성 탭의 하위 파일부터 함수 분리와 중복 제거를 진행하세요.');
    if (m.low) add('bad', '유지보수성', `유지보수성 위험 파일 ${num(m.low)}개 (MI < 10)`, `가장 낮은 파일: ${short(m.lowest[0].path)} (MI ${m.lowest[0].mi.toFixed(0)}).`, '이 파일들은 변경 시 버그 위험이 큽니다. 리팩터링 우선순위 최상위로 두세요.');
  }

  // 중복
  const d = r.codeDup;
  if (d?.analyzedLines) {
    const sr = d.sourceRatio;
    if (sr > 0.1) add('bad', '중복', `소스 코드 중복률이 높습니다 (${pct(sr)})`, `${d.minLines}줄 이상 똑같은 블록이 ${num(d.sourceDuplicatedLines)}줄입니다. 가장 큰 중복: ${short(d.topPairs[0]?.a || '')} ↔ ${short(d.topPairs[0]?.b || '')}.`, '공통 로직을 함수/모듈로 추출하세요. 한 곳만 고치고 다른 곳을 잊는 버그의 주요 원인입니다.');
    else if (sr > 0.04) add('warn', '중복', `소스 코드 중복 ${pct(sr)}`, `중복 블록이 있는 파일 ${num(d.filesWithDup)}개 (테스트 포함 전체 ${pct(d.ratio)}).`, '중복 탭에서 큰 블록부터 공통 함수로 추출을 검토하세요.');
    else add('good', '중복', `소스 코드 중복이 적습니다 (${pct(sr)})`, `테스트를 포함한 전체 중복률은 ${pct(d.ratio)}입니다.`);
  }
  if (r.duplicates.groupCount) add('info', '중복', `내용이 완전히 같은 파일 ${num(r.duplicates.files)}개 (${num(r.duplicates.groupCount)}그룹)`, `낭비되는 용량 약 ${(r.duplicates.wastedBytes / 1024).toFixed(0)} KB.`, '의도된 복사(템플릿, 벤더 파일)가 아니라면 하나로 합치거나 심볼릭 링크/공유 모듈로 대체하세요.');

  // 테스트 · 주석
  if (srcCode > 500) {
    if (s.testRatio === 0) add('bad', '테스트', '테스트 코드를 찾지 못했습니다', '테스트 폴더(test, tests, __tests__, spec)나 *.test.*, *_test.* 형식의 파일이 없습니다.', '핵심 로직부터 단위 테스트를 추가하고 CI에서 자동 실행하세요.');
    else if (s.testRatio < 0.1) add('warn', '테스트', `테스트 코드 비율이 낮습니다 (${pct(s.testRatio)})`, `소스 ${num(srcCode)}줄 대비 테스트 ${num(r.categories.test?.code)}줄.`, '핫스팟·복잡도 상위 파일부터 테스트를 보강하면 효과가 큽니다.');
    else if (s.testRatio >= 0.3) add('good', '테스트', `테스트 코드가 충분합니다 (${pct(s.testRatio)})`, `테스트 ${num(r.categories.test?.code)}줄.`);
    if (s.commentRatio < 0.05) add('warn', '문서화', `주석이 매우 적습니다 (${pct(s.commentRatio)})`, '코드만으로 의도가 드러나지 않는 부분(왜 이렇게 했는지)에 설명이 부족할 수 있습니다.', '공개 API와 복잡한 알고리즘, 비직관적인 결정에 주석을 다세요.');
    else if (s.commentRatio > 0.35) add('info', '문서화', `주석 비율이 매우 높습니다 (${pct(s.commentRatio)})`, '라이선스 헤더나 주석 처리된 옛 코드가 많은지 확인해 보세요.');
    else if (s.commentRatio >= 0.1) add('good', '문서화', `주석 비율 적정 (${pct(s.commentRatio)})`, '');
  }
  const fixme = (r.todos.counts.FIXME || 0) + (r.todos.counts.BUG || 0) + (r.todos.counts.HACK || 0) + (r.todos.counts.XXX || 0);
  if (fixme) add('warn', '기술 부채', `FIXME/HACK/BUG 주석 ${num(fixme)}개`, '알려진 결함이나 임시방편이 코드에 남아 있습니다.', '이슈 트래커로 옮겨 우선순위를 매기고, 오래된 항목부터 정리하세요.');
  if ((r.todos.counts.TODO || 0) > 30) add('info', '기술 부채', `TODO 주석 ${num(r.todos.counts.TODO)}개`, '미완성 작업 표시가 많습니다.', '정기적으로 TODO를 검토해 완료하거나 이슈로 전환하세요.');

  // 파일 · 구조
  if (r.longFiles) add(r.longFiles > 10 ? 'warn' : 'info', '구조', `1,000줄이 넘는 소스 파일 ${num(r.longFiles)}개`, `가장 긴 파일: ${short(r.largest[0]?.path || '')} (${num(r.largest[0]?.lines)}줄).`, '책임별로 파일을 나누면 탐색·리뷰·병합 충돌이 줄어듭니다.');
  const crowded = r.structure?.crowded[0];
  if (crowded && crowded.files > 60) add('info', '구조', `파일이 몰린 폴더: ${short(crowded.path)} (${crowded.files}개)`, '한 폴더에 파일이 너무 많으면 찾기 어렵습니다.', '기능·도메인 단위 하위 폴더로 나누는 것을 고려하세요.');
  if (s.maxDepth > 10) add('info', '구조', `폴더 깊이가 깊습니다 (최대 ${s.maxDepth}단계)`, `가장 깊은 경로: ${short(r.structure?.deepestPath || '')}.`);
  if (s.longLines && s.code && s.longLines / s.code > 0.05) add('info', '가독성', `120자를 넘는 긴 줄이 많습니다 (${num(s.longLines)}줄)`, `코드 줄의 ${pct(s.longLines / s.code)}입니다.`, '포매터의 줄 길이 제한을 설정하세요.');
  const bigBin = r.heaviest.filter((x) => !x.lang && x.size > 5 * 1024 * 1024);
  if (bigBin.length) add('warn', '저장소', `5MB 넘는 바이너리 파일 ${bigBin.length}개`, `예: ${short(bigBin[0].path)}.`, '큰 바이너리는 Git LFS로 관리하면 클론 속도와 저장소 크기가 좋아집니다.');
  const minified = r.files.filter((x) => x.min).length;
  if (minified > 3) add('info', '저장소', `최소화(minified)된 파일 ${minified}개가 포함되어 있습니다`, '빌드 산출물이나 벤더 파일일 가능성이 큽니다.', '빌드 산출물은 .gitignore에 추가하고 패키지 매니저로 관리하세요.');

  // 의존성 · 위생
  const deps = r.dependencies.flatMap((x) => x.deps);
  if (deps.length > 150) add('info', '의존성', `선언된 의존성이 많습니다 (${num(deps.length)}개)`, '의존성이 많을수록 보안 취약점과 업데이트 부담이 커집니다.', '사용하지 않는 패키지를 정리하고(depcheck 등), 자동 업데이트 봇을 설정하세요.');
  const hy = r.hygiene;
  if (hy) {
    const miss = (k) => hy.items.find((i) => i.key === k && !i.ok && !i.na);
    if (miss('readme')) add('bad', '위생', 'README가 없습니다', '처음 보는 사람이 프로젝트 목적과 실행 방법을 알 수 없습니다.', '목적, 설치, 실행, 기여 방법을 담은 README.md를 추가하세요.');
    if (miss('license') && r.meta?.source === 'github') add('warn', '위생', '라이선스 파일이 없습니다', '공개 저장소라도 라이선스가 없으면 법적으로 재사용할 수 없습니다.', 'MIT, Apache-2.0 등 적합한 라이선스를 선택해 LICENSE 파일을 추가하세요.');
    if (miss('ci') && srcCode > 2000) add('warn', '위생', 'CI 설정을 찾지 못했습니다', '변경마다 빌드·테스트가 자동으로 실행되지 않습니다.', 'GitHub Actions 등으로 빌드·테스트·린트를 자동화하세요.');
    if (miss('lock')) add('info', '의존성', '의존성 잠금 파일이 없습니다', '애플리케이션이라면 환경마다 다른 버전이 설치되어 "내 컴퓨터에선 되는데" 문제가 생길 수 있습니다. 다른 프로젝트가 가져다 쓰는 라이브러리는 의도적으로 커밋하지 않기도 합니다.', '애플리케이션이라면 패키지 매니저가 생성하는 lock 파일을 커밋하세요.');
    if (miss('linter') && srcCode > 2000) add('info', '위생', '린터 설정을 찾지 못했습니다', '', '언어별 린터(ESLint, Ruff, golangci-lint 등)를 도입하세요.');
    if (hy.score >= 0.8) add('good', '위생', `프로젝트 위생 점검 ${hy.passed}/${hy.total} 충족`, '문서, 자동화, 품질 도구가 잘 갖춰져 있습니다.');
  }

  // 히스토리 · 협업
  const g = r.git;
  if (g) {
    const days = (Date.now() - g.lastCommit) / 86400000;
    if (days > 365) add('warn', '활동', `${ago(g.lastCommit)} 동안 커밋이 없습니다`, '유지보수가 중단된 프로젝트일 수 있습니다.', '의존성 보안 업데이트 여부를 확인하세요.');
    else if (g.recent.d30 > 0) add('good', '활동', `활발히 개발 중 (최근 30일 커밋 ${num(g.recent.d30)}개)`, `최근 90일 동안 ${g.recent.authors90}명이 참여했습니다.`);
    if (g.contributors > 1 && g.busFactor === 1) add('warn', '협업', '버스 팩터 1', `${g.topAuthors[0].name} 한 명이 전체 커밋의 ${pct(g.topAuthors[0].commits / g.commits, 0)}를 작성했습니다. 이 사람이 떠나면 프로젝트 지식 대부분이 사라집니다.`, '코드 리뷰와 페어 작업으로 핵심 모듈 지식을 분산하세요.');
    else if (g.busFactor >= 3) add('good', '협업', `버스 팩터 ${g.busFactor}`, '커밋이 여러 사람에게 분산되어 있습니다.');
    if (g.knowledgeSilos?.length) add('info', '협업', `한 사람만 수정한 주요 파일 ${g.knowledgeSilos.length}개`, `예: ${short(g.knowledgeSilos[0].path)} (${g.knowledgeSilos[0].owner}).`, '지식 사일로입니다. 리뷰어를 지정하거나 문서화해 두세요.');
    const hs = g.hotspots?.[0];
    if (hs) add('warn', '핫스팟', `가장 위험한 핫스팟: ${short(hs.path)}`, `최근 ${num(g.churnCommits)}개 커밋 중 ${hs.changes}번 변경되었고 복잡도는 ${hs.cx}입니다. 자주 바뀌면서 복잡한 파일은 버그가 집중되는 곳입니다.`, '이 파일부터 테스트를 보강하고 리팩터링하면 투자 대비 효과가 가장 큽니다.');
    const fixes = g.commitTypes.find((t) => t.type === '버그 수정');
    if (fixes && fixes.count / g.commits > 0.35) add('warn', '히스토리', `버그 수정 커밋 비중이 높습니다 (${pct(fixes.count / g.commits, 0)})`, '새 기능보다 수정 작업에 많은 시간이 쓰이고 있을 수 있습니다.', '핫스팟과 복잡도 상위 파일의 테스트를 강화하세요.');
    if (g.conventionalRatio > 0.6) add('good', '히스토리', `Conventional Commits 규칙 준수 (${pct(g.conventionalRatio, 0)})`, '커밋 메시지가 일관되어 변경 이력 자동화(CHANGELOG, 버전 관리)에 유리합니다.');
    else if (g.avgMessageLength < 15) add('info', '히스토리', `커밋 메시지가 짧습니다 (평균 ${g.avgMessageLength.toFixed(0)}자)`, '', '무엇을, 왜 바꿨는지 드러나는 메시지를 쓰고 Conventional Commits 도입을 고려하세요.');
    const strong = g.coupling?.find((c) => c.degree >= 0.8 && c.a.includes('/') && c.b.includes('/') && c.a.split('/')[0] !== c.b.split('/')[0]);
    if (strong) add('info', '결합도', '서로 다른 영역의 파일이 항상 함께 바뀝니다', `${short(strong.a)} ↔ ${short(strong.b)} (${strong.count}회, 결합도 ${pct(strong.degree, 0)}).`, '숨은 의존성일 수 있습니다. 같은 모듈로 모으거나 인터페이스를 명확히 하세요.');
    if (g.nightRatio > 0.3) add('info', '활동', `야간(22시~6시) 커밋 비중 ${pct(g.nightRatio, 0)}`, '');
  }
  if (r.github?.archived) add('bad', '활동', '보관(archived)된 저장소입니다', '더 이상 유지보수되지 않습니다.', '대체 프로젝트를 찾아보세요.');

  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
