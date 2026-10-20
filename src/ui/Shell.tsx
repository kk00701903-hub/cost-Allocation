'use client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AppProvider, useApp } from '../lib/store';
import { NODES, STEPS, nodeState } from '../lib/flow';
import N00, { LogScreen, MENU_NAME } from '../screens/N00';
import { M01, M02 } from '../screens/M01M02';
import { M03, M04, M05, M06, M07 } from '../screens/Volume';
import M08 from '../screens/M08';
import M09 from '../screens/M09';
import M10 from '../screens/M10';
import M11 from '../screens/M11';
import { M12, M13 } from '../screens/M12M13';
import X01 from '../screens/X01';
import { ymDash } from '../lib/util';
import { dbInfo } from '../lib/db';
import Chat from './Chat';

const IDS: Record<string, string> = {
  M01: 'JTPF040010', M02: 'JTPF040020', M03: 'JTPF040030', M04: 'JTPF040040', M05: 'JTPF040050',
  M06: 'JTPF040060', M07: 'JTPF040070', M08: 'JTPF040080', M09: 'JTPF040090', M10: 'JTPF040100',
  M11: 'JTPF040110', M12: 'JTPF040130', M13: 'JTPF040120', N00: 'CA-N00', X01: 'CA-X01', LOG: 'CA-LOG',
};
const NAME: Record<string, string> = { ...MENU_NAME, N00: '월 마감 흐름', LOG: '작업 이력' };

/** 2레벨 내비: 카테고리 › 화면 (월 마감 흐름과 동일 축) */
const NAV: { id: string; label: string; items: string[] }[] = [
  { id: 'home', label: '대시보드', items: ['N00', 'LOG'] },
  { id: 'base', label: '기준 관리', items: ['X01', 'M01', 'M02'] },
  { id: 'vol', label: '물동량', items: ['M03', 'M04', 'M05', 'M06', 'M07'] },
  { id: 'alloc', label: '원가 배분', items: ['M08', 'M09', 'M10', 'M11', 'M12', 'M13'] },
];
const NAV_OF = Object.fromEntries(NAV.flatMap((g) => g.items.map((m) => [m, g.id])));

export default function Shell() {
  return <AppProvider><Inner /></AppProvider>;
}

function Inner() {
  const app = useApp();
  const [open, setOpen] = useState<string[]>(['N00']);
  const [active, setActive] = useState('N00');
  const [navOpen, setNavOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [store, setStore] = useState('');
  const [navExpand, setNavExpand] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV.map((g) => [g.id, true])),
  );
  useEffect(() => { dbInfo().then((x) => setStore(x.root)).catch(() => setStore('저장소 연결 실패')); }, []);
  useEffect(() => {
    const gid = NAV_OF[active];
    if (gid) setNavExpand((e) => (e[gid] ? e : { ...e, [gid]: true }));
  }, [active]);
  const go = (m: string) => { setOpen((o) => (o.includes(m) ? o : [...o, m])); setActive(m); };
  const toggleCat = (id: string) => setNavExpand((e) => ({ ...e, [id]: !e[id] }));
  const catLabel = NAV.find((g) => g.id === NAV_OF[active])?.label;
  const close = (m: string) => {
    setOpen((o) => {
      const nx = o.filter((x) => x !== m);
      if (active === m) setActive(nx[nx.length - 1] ?? 'N00');
      return nx.length ? nx : ['N00'];
    });
  };
  const idx = open.indexOf(active);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { tabsRef.current?.querySelector('.wt.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active, open]);

  const screens: Record<string, ReactElement> = {
    N00: <N00 open={go} />, M01: <M01 />, M02: <M02 />, M03: <M03 />, M04: <M04 />, M05: <M05 />, M06: <M06 />, M07: <M07 />,
    M08: <M08 />, M09: <M09 />, M10: <M10 />, M11: <M11 />, M12: <M12 />, M13: <M13 />, X01: <X01 />, LOG: <LogScreen />,
  };
  const stepState = STEPS.map((_, i) => {
    const ns = NODES.filter((n) => n.step === i).map((n) => nodeState(n, app.meta, app.count));
    return { done: ns.filter((x) => x === '완료').length, stale: ns.filter((x) => x === '다시 생성 필요').length, none: ns.filter((x) => x === '없음').length, all: ns.length };
  });

  return (
    <div className="shell">
      <header className="titlebar">
        <span className="logo" aria-hidden>CA</span>
        <div>
          <div className="app-name">공동물류 원가배분</div>
          <div className="app-sub">{NAME[active]} · {IDS[active]}</div>
        </div>
        <span className="grow" />
        <div className="flowmini" onClick={() => go('N00')} title="월 마감 흐름 열기" role="navigation" aria-label="월 마감 단계">
          {STEPS.map((st, i) => {
            const x = stepState[i];
            const cls = x.stale ? 'stale' : x.done === x.all ? 'done' : x.done ? 'part' : 'none';
            return <span key={st} className={`fm ${cls}`}>{i + 1}.{st} {x.done}/{x.all}{x.stale ? ` !${x.stale}` : ''}</span>;
          })}
        </div>
        <label>작업자 <input value={app.user} onChange={(e) => app.setUser(e.target.value)} aria-label="작업자" /></label>
        <span className="month-badge">기준월 {ymDash(app.month)}</span>
      </header>

      <div className="menubar">
        <button type="button" className={`nav-toggle ${navOpen ? 'on' : ''}`} onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen}>
          {navOpen ? '메뉴 숨기기' : '메뉴 보기'}
        </button>
        <button type="button" className="util-btn" onClick={() => go('N00')}>월 마감 흐름</button>
        <button type="button" className="util-btn" onClick={() => idx > 0 && setActive(open[idx - 1])} disabled={idx <= 0}>이전</button>
        <button type="button" className="util-btn" onClick={() => idx < open.length - 1 && setActive(open[idx + 1])} disabled={idx >= open.length - 1}>다음</button>
        <button type="button" className={`nav-toggle ${chatOpen ? 'on' : ''}`} onClick={() => setChatOpen((v) => !v)} aria-pressed={chatOpen}>
          AI 도우미
        </button>
        <span className="grow" />
        <span className="muted" style={{ fontSize: 12 }}>
          손익관리 › 공동물류 원가배분{catLabel ? ` › ${catLabel}` : ''}
        </span>
      </div>

      <div className="workarea">
        {navOpen && (
          <nav className="menupanel" aria-label="앱 메뉴">
            <div className="menuhead">
              내비게이션
              <button type="button" onClick={() => setNavOpen(false)} aria-label="메뉴 닫기">×</button>
            </div>
            <div className="tree">
              <div className="nav-app">공동물류 원가배분</div>
              {NAV.map((g) => {
                const openCat = !!navExpand[g.id];
                const hasActive = g.items.includes(active);
                return (
                  <div key={g.id} className={`nav-group ${hasActive ? 'active' : ''} ${openCat ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="nav-cat"
                      aria-expanded={openCat}
                      onClick={() => toggleCat(g.id)}
                    >
                      <span className="nav-chevron" aria-hidden>{openCat ? '▾' : '▸'}</span>
                      <span className="nav-cat-label">{g.label}</span>
                    </button>
                    {openCat && (
                      <div className="nav-items" role="group" aria-label={g.label}>
                        {g.items.map((m) => (
                          <div
                            key={m}
                            className={`leaf ${active === m ? 'on' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => go(m)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(m); } }}
                          >
                            <span className="leaf-name">{NAME[m]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>
        )}
        <div className="windows">
          {!app.ready && <div className="loading">기준월 {ymDash(app.month)} 데이터를 불러오는 중…</div>}
          {app.ready && open.map((m) => <div key={m} className="win" style={{ display: m === active ? 'flex' : 'none' }}>{screens[m]}</div>)}
          {app.busy && <div className="busy"><div>{app.busy}…</div></div>}
        </div>
        <Chat active={active} open={chatOpen} onOpenChange={setChatOpen} />
      </div>

      <div className="wintabs" ref={tabsRef} onWheel={(e) => { if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY; }}>
        {open.map((m) => (
          <span key={m} className={`wt ${m === active ? 'on' : ''}`} title={NAME[m]} onClick={() => setActive(m)} onAuxClick={(e) => { if (e.button === 1) close(m); }}>
            <span className="wtn">{NAME[m]}</span>
            <b title="닫기" onClick={(e) => { e.stopPropagation(); close(m); }}>×</b>
          </span>
        ))}
        {open.length > 3 && (
          <button type="button" className="wtall" onClick={() => { setOpen([active]); }} title="지금 화면만 남기고 닫기">
            다른 탭 닫기
          </button>
        )}
      </div>
      <footer className="statusbar">
        <span className="msg">{app.status || `준비 · ${app.tripSource}`}</span>
        <span>화면 ID · {IDS[active]}</span>
        <span className="store" title={store}>저장소 · {store}</span>
        {!chatOpen && (
          <button type="button" className="chatfab" onClick={() => setChatOpen(true)}>AI 도우미</button>
        )}
      </footer>
    </div>
  );
}
