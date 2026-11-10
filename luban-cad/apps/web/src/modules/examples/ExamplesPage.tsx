/**
 * 全部 Onshape 示例目录页（public，2026-11-10）。
 *
 * `replicable-now` 示例的单一入口：公开可读的封面/元数据 +
 * 当前账号可见时按名解析出的持久 iModel 直达链接。页面不创建/修改模型，
 * 也不把私有 index 的原始数据带进公共 bundle。
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  EXAMPLE_CATALOG,
  EXAMPLE_OWNERS,
  formatExampleVolume,
  type ExampleCatalogEntry,
} from './catalog.js';
import { useExampleTargets } from './hooks/useExampleTargets.js';
import './ExamplesPage.css';

const ALL_OWNERS = 'all';

function ownerCount(owner: string): number {
  return EXAMPLE_CATALOG.filter((entry) => entry.owner === owner).length;
}

function matchesQuery(entry: ExampleCatalogEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [entry.title, entry.owner, entry.document, entry.partStudio]
    .join('\n')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function statusLabel(entry: ExampleCatalogEntry): string {
  return entry.strictness === 'strict-oracle' ? 'strict · oracle 16/16' : 'strict';
}

export function ExamplesPage(): React.JSX.Element {
  const [owner, setOwner] = React.useState<string>(ALL_OWNERS);
  const [query, setQuery] = React.useState('');
  const { isAuthenticated, targets, isLoading, isError } = useExampleTargets();

  const filtered = React.useMemo(
    () =>
      EXAMPLE_CATALOG.filter(
        (entry) => (owner === ALL_OWNERS || entry.owner === owner) && matchesQuery(entry, query.trim()),
      ),
    [owner, query],
  );
  const documentCount = React.useMemo(
    () => new Set(EXAMPLE_CATALOG.map((entry) => entry.document)).size,
    [],
  );

  return (
    <div className="examples-page" data-testid="examples-page">
      <header className="examples-header">
        <Link className="examples-brand" to="/">
          <span className="examples-brand__mark">鲁</span>
          <span>鲁班CAD</span>
        </Link>
        <nav className="examples-nav" aria-label="示例目录导航">
          <Link className="examples-nav__active" to="/examples">全部示例</Link>
          <Link to="/showcase">产品介绍</Link>
          <Link to={isAuthenticated ? '/documents' : '/login'}>文档中心</Link>
        </nav>
        <Link className="examples-header__cta" to={isAuthenticated ? '/documents' : '/login'}>
          {isAuthenticated ? '打开应用' : '登录'}
        </Link>
      </header>

      <main>
        <section className="examples-hero">
          <div className="examples-hero__copy">
            <span className="examples-kicker">ONSHAPE PARITY · REPLICABLE NOW</span>
            <h1>{EXAMPLE_CATALOG.length} 个 Onshape 示例，<br />逐个体积对拍。</h1>
            <p>
              全部来自真实 iModel、真实 FeatureOp 与标准事务。封面是真实栈运行截图；
              目标体积来自 Onshape 采集证据。打开入口按当前账号可见的示例 iModel
              精确解析，未定位时如实回退，不伪造链接。
            </p>
            <ul className="examples-hero__facts" aria-label="示例统计">
              <li><strong>{EXAMPLE_CATALOG.length}</strong> 个严格示例</li>
              <li><strong>{documentCount}</strong> 个文档</li>
              <li><strong>{EXAMPLE_OWNERS.length}</strong> 个 owner</li>
              <li><strong>{EXAMPLE_CATALOG.length}</strong> 个体积对拍</li>
            </ul>
            <div className="examples-hero__actions">
              <a className="examples-button examples-button--primary" href="#catalog">浏览全部示例</a>
              <Link className="examples-button" to={isAuthenticated ? '/documents' : '/login'}>
                {isAuthenticated ? '进入文档中心' : '登录后打开 iModel'}
              </Link>
            </div>
          </div>
          <div className="examples-hero__panel" aria-hidden="true">
            <span className="examples-hero__panel-label">CATALOG</span>
            <div className="examples-hero__panel-row"><span>{EXAMPLE_CATALOG.length}</span><small>replicable-now</small></div>
            <div className="examples-hero__panel-row"><span>{documentCount}</span><small>Onshape 文档</small></div>
            <div className="examples-hero__panel-row"><span>0.00%</span><small>代表示例体积误差</small></div>
            <div className="examples-hero__panel-note">真实 BRep · 标准事务 · 冷重开验证</div>
          </div>
        </section>

        <section className="examples-catalog" id="catalog" aria-labelledby="examples-catalog-title">
          <div className="examples-catalog__head">
            <div>
              <span className="examples-kicker">CATALOG</span>
              <h2 id="examples-catalog-title">全部示例</h2>
              <p>按 owner 过滤或搜索文档、Part Studio。Bumper Block 走 strict oracle 轨。</p>
            </div>
            <div className="examples-catalog__controls">
              <label className="examples-search">
                <span className="examples-search__label">搜索示例</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="文档、Part Studio 或 owner"
                  data-testid="example-search"
                />
              </label>
            </div>
          </div>

          <div className="examples-owner-filter" role="group" aria-label="按 owner 过滤">
            <button
              type="button"
              className={owner === ALL_OWNERS ? 'examples-chip examples-chip--active' : 'examples-chip'}
              onClick={() => setOwner(ALL_OWNERS)}
            >
              全部 <span>{EXAMPLE_CATALOG.length}</span>
            </button>
            {EXAMPLE_OWNERS.map((name) => (
              <button
                key={name}
                type="button"
                className={owner === name ? 'examples-chip examples-chip--active' : 'examples-chip'}
                onClick={() => setOwner(name)}
              >
                {name} <span>{ownerCount(name)}</span>
              </button>
            ))}
          </div>

          {isError && (
            <div className="examples-notice" role="status">
              当前账号未能读取示例库（可能未登录或无项目权限）。目录仍可浏览；
              打开入口回退到文档中心。
            </div>
          )}
          {isLoading && <div className="examples-notice">正在定位当前账号可访问的示例 iModel…</div>}

          <div className="examples-grid" data-testid="examples-grid">
            {filtered.map((entry) => {
              const target = targets.get(entry.id);
              const href = target
                ? `/documents/${target.itwinId}/${target.imodelId}`
                : isAuthenticated
                  ? '/documents'
                  : '/login';
              const action = target
                ? '打开示例'
                : isAuthenticated
                  ? '在文档中心查找'
                  : '登录后打开';
              return (
                <article className="examples-card" key={entry.id} data-testid="example-card">
                  <div className="examples-card__cover">
                    <img src={entry.cover} alt={`${entry.title} 真实栈截图`} loading="lazy" />
                    <span className={entry.strictness === 'strict-oracle'
                      ? 'examples-badge examples-badge--oracle'
                      : 'examples-badge'}
                    >
                      {statusLabel(entry)}
                    </span>
                  </div>
                  <div className="examples-card__body">
                    <span className="examples-card__owner">{entry.owner}</span>
                    <h3>{entry.title}</h3>
                    <p className="examples-card__doc">
                      {entry.document} <span aria-hidden="true">/</span> {entry.partStudio}
                    </p>
                    {entry.note && <p className="examples-card__note">{entry.note}</p>}
                    <dl className="examples-card__meta">
                      <div>
                        <dt>目标体积</dt>
                        <dd>{formatExampleVolume(entry.volumeMm3)}</dd>
                      </div>
                      <div>
                        <dt>对象</dt>
                        <dd>1 body</dd>
                      </div>
                    </dl>
                    <div className="examples-card__footer">
                      <Link className="examples-card__open" to={href}>
                        {action}
                      </Link>
                      <span className="examples-card__locator">
                        {target ? '已定位 iModel' : isAuthenticated ? '按名查找' : '需登录'}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="examples-empty">
              <strong>没有匹配的示例。</strong>
              <button type="button" onClick={() => { setOwner(ALL_OWNERS); setQuery(''); }}>
                清除筛选
              </button>
            </div>
          )}
        </section>

        <section className="examples-cta">
          <div>
            <span className="examples-kicker">NEXT</span>
            <h2>从目录进入真实 Part Studio。</h2>
            <p>
              示例 iModel 位于「Onshape 示例复刻」项目；当前账号无权限时，
              文档中心仍可浏览已共享的模型。
            </p>
          </div>
          <Link className="examples-button examples-button--primary" to={isAuthenticated ? '/documents' : '/login'}>
            {isAuthenticated ? '打开文档中心' : '登录并打开'}
          </Link>
        </section>
      </main>

      <footer className="examples-footer">
        <span>© 2013–2026 鲁班CAD · 天工开物平台</span>
        <Link to="/showcase">产品介绍</Link>
      </footer>
    </div>
  );
}
