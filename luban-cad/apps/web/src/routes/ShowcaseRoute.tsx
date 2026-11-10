/**
 * ShowcaseRoute（2026-11-06）——产品介绍/宣传页。
 *
 * 目的：把已实测的能力与真实截图/视频集中展示在项目介绍页（用户要求 3：
 * 高清宣传图/视频 + 产品效果/能力）。素材全部来自真实栈（Tutorial 2 /
 * Sample Assignment / 示例复刻库），4K 截图在
 * `public/showcase/*.webp`（3840×2160）；演示视频为真实鼠标级 Tutorial 2
 * 建模录屏 `tutorial2-demo-1080p.webm`。页面本身不请求后端，公开可访问。
 */
import React from 'react';
import { Link } from 'react-router-dom';
import './ShowcaseRoute.css';

const FEATURES = [
  {
    title: '草图与约束',
    copy: '线/矩形/圆弧/圆、构造几何、尺寸与几何约束；光标旁实时读数，DOF/约束矛盾即时呈现。',
    image: '/showcase/sketch.webp',
  },
  {
    title: '参数化特征',
    copy: '拉伸/旋转/圆角/倒角/孔/cPlane；参数对话框与 Onshape 同构，实时半透明预览 + 橙色面/边反馈。',
    image: '/showcase/extrude.webp',
  },
  {
    title: 'BRep 拓扑显示',
    copy: 'TrueForm 内核输出真实 BRep；全部拓扑边/顶点叠加拾取，面、边、点随视图变化精确高亮。',
    image: '/showcase/fillet.webp',
  },
  {
    title: '孔与工程特征',
    copy: '草图点/曲线顶点孔位、简单孔/沉头孔、盲孔/完全贯穿、起始平面与钻尖角；真实布尔去材。',
    image: '/showcase/hole.webp',
  },
];

const EXAMPLES = [
  { name: 'Tutorial 2 - Build a Part', metric: '357.739 cm³ / 去材 0.422 cm³', note: '六特征 + 四棱圆角，严格鼠标级复刻', image: '/showcase/hero-tutorial2.webp' },
  { name: 'Tutorial 2 iOS', metric: '157478.900 mm³', note: '与 Onshape 目标 0.00% 误差', image: '/showcase/example-ios.webp' },
  { name: 'Exercise: Basic Drawing', metric: '2442.2935 mm³', note: '与目标 -0.00% 误差', image: '/showcase/example-basic-drawing.webp' },
  { name: 'Exercise - Hand Brake Update', metric: '1 mm 圆边倒角', note: '真实 UI 拾边 + 距离-角度倒角', image: '/showcase/example-handbrake.webp' },
  { name: 'Sample Assignment', metric: '8915.860 mm³', note: '4 草图 + 4 拉伸 + 4 竖边倒角', image: '/showcase/hero-sample-assignment.webp' },
  {
    name: 'Exercise: Intermediate Drawing / Drive Sleeve',
    metric: '1,175,022.882 mm³',
    note: 'CAP_FACE 起始面 + 6 孔圆周阵列，0.00012% 误差',
    image: '/showcase/example-drive-sleeve.webp',
  },
  {
    name: 'Intro to CAD 1.2 / Part 1–3',
    metric: '409,676.600 / 294,967.152 / 229,418.896 mm³',
    note: '草图建在拉伸端盖 + 同面积面集位置证据，0.000% 误差',
    image: '/showcase/example-intro-part3.webp',
  },
  {
    name: 'Element Organization / O-Ring + Bushing',
    metric: '454.910 / 3,259.620 mm³',
    note: 'revolve 与单圆 imprint 拉伸，≤0.004% 误差',
    image: '/showcase/example-o-ring.webp',
  },
  {
    name: 'DRILL HOTD / ENG_BEARING',
    metric: '2,590.224 mm³',
    note: '对称拉伸端盖草图 + featureMirror，−0.001% 误差',
    image: '/showcase/example-eng-bearing.webp',
  },
];

const STACK = [
  ['iTwin.js / iModel / BIS', '模型、事务、视图、选择、撤销的唯一底座；BriefcaseConnection + saveChanges 可撤销硬约束。'],
  ['真形（TrueForm）', '自研 BRep 几何内核；只经 SolidKernel.h 接入，ACIS 仅 Modeler/Polyhedra。'],
  ['绳墨（ShengMo）', 'solver-neutral 约束求解接口；当前过渡期使用 libslvs（纯云 SaaS 姿态）。'],
  ['LubanFeatureRpcInterface', '唯一跨仓契约；shared → backend → web 同批次发布，FeatureOp 单一编辑管道。'],
];

export function ShowcaseRoute(): React.JSX.Element {
  return (
    <div className="showcase-page" data-testid="showcase-route">
      <header className="showcase-header">
        <Link className="showcase-brand" to="/documents">
          <span className="showcase-brand__mark">鲁</span>
          <span>鲁班CAD</span>
        </Link>
        <nav className="showcase-nav" aria-label="产品介绍导航">
          <a href="#video">演示视频</a>
          <a href="#features">核心能力</a>
          <a href="#examples">示例复刻</a>
          <Link to="/examples">全部示例</Link>
          <a href="#stack">技术底座</a>
        </nav>
        <Link className="showcase-header__cta" to="/login">打开应用</Link>
      </header>

      <main>
        <section id="video" className="showcase-hero">
          <div className="showcase-hero__copy">
            <div className="showcase-kicker">AI + CAD · 云原生 · 参数化建模</div>
            <h1>把设计意图，变成真实可制造的 BRep。</h1>
            <p>
              鲁班CAD 是天工开物平台的云端 CAD 产品：草图、约束、参数化特征、
              多体布尔、真实示例复刻与可撤销事务，全部落在 iTwin.js / BIS 之上。
              右侧是完整宣传片，下方是实机截图——全部来自真实栈运行，不是概念图。
            </p>
            <div className="showcase-hero__actions">
              <Link className="showcase-button showcase-button--primary" to="/login">进入鲁班CAD</Link>
              <a className="showcase-button" href="#video">观看演示</a>
            </div>
            <ul className="showcase-hero__facts">
              <li><strong>4K</strong> 实机截图</li>
              <li><strong>18</strong> 个严格验证示例</li>
              <li><strong>0.00%</strong> 示例体积对拍</li>
            </ul>
          </div>
          <div className="showcase-hero__media showcase-hero__media--video">
            <video
              src="/showcase/tutorial2-demo-1080p.webm"
              poster="/showcase/video-poster.webp"
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            />
            <span className="showcase-hero__badge">完整宣传片 · 1080p · 01:21</span>
            <span className="showcase-hero__video-caption">从文档中心到草图、拉伸、圆角、倒角与孔 · 真实鼠标轨迹</span>
          </div>
        </section>

        <section id="features" className="showcase-section">
          <div className="showcase-section__head">
            <span className="showcase-kicker">CAPABILITIES</span>
            <h2>一条完整的参数化建模链</h2>
            <p>从二维草图到实体特征，再到多体布尔与工程特征；交互与 Onshape 同构，数据事实源始终是 params + BIS。</p>
          </div>
          <div className="showcase-grid showcase-grid--features">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="showcase-card">
                <img src={feature.image} alt={feature.title} loading="lazy" />
                <div className="showcase-card__body">
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="examples" className="showcase-section showcase-examples">
          <div className="showcase-section__head">
            <span className="showcase-kicker">REPLICATION</span>
            <h2>真实示例，真实 iModel，真实体积</h2>
            <p>Onshape 公共示例逐一复刻为持久 luban-cad iModel；重开验证逐库检查特征树与体积。</p>
          </div>
          <div className="showcase-grid showcase-grid--examples">
            {EXAMPLES.map((example) => (
              <article key={example.name} className="showcase-example">
                <img src={example.image} alt={example.name} loading="lazy" />
                <div className="showcase-example__body">
                  <h3>{example.name}</h3>
                  <strong>{example.metric}</strong>
                  <span>{example.note}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="showcase-section showcase-ui">
          <div className="showcase-section__head">
            <span className="showcase-kicker">UI PARITY</span>
            <h2>与 Onshape 对齐的工作界面</h2>
            <p>文档中心、Part Studio 壳层、特征对话框与 ViewCube 按 live 证据逐区对齐；渲染观感差异由引擎决定。</p>
          </div>
          <div className="showcase-ui__grid">
            <img src="/showcase/documents.webp" alt="鲁班CAD 文档中心" loading="lazy" />
            <img src="/showcase/create-document.webp" alt="新建文档对话框" loading="lazy" />
            <img src="/showcase/chamfer.webp" alt="倒角参数对话框" loading="lazy" />
            <img src="/showcase/sketch.webp" alt="草图编辑对话框" loading="lazy" />
          </div>
        </section>

        <section id="stack" className="showcase-section showcase-stack">
          <div className="showcase-section__head">
            <span className="showcase-kicker">FOUNDATION</span>
            <h2>不是演示壳，是可演进的 CAD 底座</h2>
          </div>
          <div className="showcase-stack__grid">
            {STACK.map(([title, copy]) => (
              <article key={title} className="showcase-stack__item">
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="showcase-cta">
          <div>
            <h2>把下一个零件，交给鲁班CAD。</h2>
            <p>打开应用，或在全部示例目录查看 18 个示例的封面、目标体积与打开入口。</p>
          </div>
          <div className="showcase-cta__actions">
            <Link className="showcase-button showcase-button--primary" to="/login">立即体验</Link>
            <Link className="showcase-button showcase-button--ghost" to="/examples">浏览全部示例</Link>
          </div>
        </section>
      </main>

      <footer className="showcase-footer">
        <span>© 2013–2026 鲁班CAD · 天工开物平台</span>
        <span>真形几何内核 · 绳墨约束求解 · iTwin.js / BIS</span>
      </footer>
    </div>
  );
}
