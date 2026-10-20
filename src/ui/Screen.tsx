'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../lib/store';
import { NODES, nodeState } from '../lib/flow';

export type Level = 'ok' | 'warn' | 'block' | 'info';
export interface Check { level: Level; title: string; detail?: string }

export interface Action { label: string; onClick: () => void; tabs?: string[]; disabled?: boolean; title?: string; added?: boolean }

export interface ScreenProps {
  id: string;
  title: string;
  menu: string;
  conds?: ReactNode;
  actions?: Action[];
  tabs?: { key: string; title: string; added?: boolean }[];
  tab?: string;
  onTab?: (k: string) => void;
  onQuery?: () => void;
  onNew?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  onExcel?: () => void;
  onUpload?: (f: File) => void;
  onTemplate?: () => void;
  help: ReactNode;
  checks: Check[];
  children: ReactNode;
  dirty?: boolean;
}

const ICON: Record<Level, string> = { ok: '✓', warn: '!', block: '✕', info: 'i' };

export default function Screen(p: ScreenProps) {
  const { meta, count, busy, register, runs } = useApp();
  const tabTitle = p.tabs?.find((t) => t.key === p.tab)?.title;
  useEffect(() => { register(p.menu, { title: p.title, tab: tabTitle, checks: p.checks }); }, [register, p.menu, p.title, tabTitle, p.checks]);
  const [side, setSide] = useState<'help' | 'check' | null>(() => (typeof window !== 'undefined' && window.innerWidth > 1400 ? 'help' : null));
  const file = useRef<HTMLInputElement>(null);
  const nodes = NODES.filter((n) => n.menu === p.menu);
  const nBlock = p.checks.filter((c) => c.level === 'block').length;
  const nWarn = p.checks.filter((c) => c.level === 'warn').length;
  const visible = (a: Action) => !a.tabs || !p.tab || a.tabs.includes(p.tab);

  return (
    <div className="screen">
      <div className="pagehead">
        <div className="breadcrumb">손익관리 › 공동물류 원가배분 › {p.title}</div>
        <h1 className="page-title">{p.title}</h1>
      </div>

      <div className="toolbar">
        <button type="button" className="primary" onClick={p.onQuery} disabled={!p.onQuery}>조회</button>
        <button type="button" className="neutral" onClick={p.onNew} disabled={!p.onNew}>신규</button>
        <button type="button" className={`neutral ${p.dirty ? 'dirty' : ''}`} onClick={p.onSave} disabled={!p.onSave}>
          저장{p.dirty ? ' *' : ''}
        </button>
        <button type="button" className="neutral" onClick={p.onDelete} disabled={!p.onDelete}>삭제</button>
        <button type="button" className="neutral" onClick={() => window.print()}>인쇄</button>
        <span className="sep" />
        <button type="button" className="neutral" onClick={p.onExcel} disabled={!p.onExcel} title="지금 보이는 행(필터 반영)을 엑셀로">엑셀 내려받기</button>
        <button type="button" className="neutral" onClick={p.onTemplate} disabled={!p.onTemplate} title="Excel Upload 양식(열 이름)">양식 받기</button>
        <span className="grow" />
        <span className="screenid">{p.id}</span>
      </div>

      <div className="condbar">
        <div className="conds">{p.conds}</div>
        <div className="actions">
          {(p.actions ?? []).filter(visible).map((a) => (
            <button type="button" key={a.label} className={`act ${a.added ? 'added' : ''}`} onClick={a.onClick} disabled={a.disabled || !!busy} title={a.title}>
              {a.label.split('\n').map((x, i) => <div key={i}>{x}</div>)}
            </button>
          ))}
          {p.onUpload && <>
            <button type="button" className="act primary" onClick={() => file.current?.click()} disabled={!!busy}>Excel Upload</button>
            <input ref={file} type="file" accept=".xlsx,.xls,.xlsm,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) p.onUpload!(f); }} />
          </>}
        </div>
      </div>

      <div className="infobar">
        <button type="button" className={`pill ${side === 'help' ? 'on' : ''}`} onClick={() => setSide(side === 'help' ? null : 'help')}>이 화면은</button>
        <button type="button" className={`pill ${side === 'check' ? 'on' : ''} ${nBlock ? 'block' : nWarn ? 'warn' : 'ok'}`} onClick={() => setSide(side === 'check' ? null : 'check')}>
          검증 {nBlock ? `✕ ${nBlock}` : ''} {nWarn ? `! ${nWarn}` : ''} {!nBlock && !nWarn ? '이상 없음' : ''}
        </button>
        {(() => {
          const last = runs.find((r) => r.menu === p.menu);
          if (!last) return null;
          const later = last.inputs.filter((i) => (meta[i.name]?.t ?? 0) > last.t).map((i) => i.label);
          return <span className="lastrun" title={`${last.at} ${last.who} · ${last.action}\n사유: ${last.reason}${later.length ? `\n이후 다시 만들어진 입력: ${later.join(', ')}` : ''}\n(작업 이력 › 실행 이력에서 자세히)`}>
            최근 실행 <b>{last.at.slice(5, 16)} {last.who}</b> · {last.reason}{later.length ? <span style={{ color: 'var(--block)' }}> · 이후 입력 변경({later.join(', ')})</span> : null}
          </span>;
        })()}
        <span className="nodes">
          {nodes.map((n) => {
            const st = nodeState(n, meta, count);
            const m = meta[n.name];
            return <span key={n.name} className={`node ${st === '완료' ? 'done' : st === '없음' ? 'none' : 'stale'}`} title={m ? `${m.at} ${m.who} · ${m.n.toLocaleString()}행` : '아직 없음'}>
              {n.label}: {st}{m ? ` (${m.at.slice(5, 16)})` : ''}
            </span>;
          })}
        </span>
      </div>

      {p.tabs && (
        <div className="tabs">
          {p.tabs.map((t) => (
            <button type="button" key={t.key} className={`tab ${p.tab === t.key ? 'on' : ''} ${t.added ? 'added' : ''}`} onClick={() => p.onTab?.(t.key)}>{t.title}</button>
          ))}
        </div>
      )}

      <div className="body">
        <div className="main">{p.children}</div>
        {side && (
          <aside className="side">
            <div className="sidehead">
              <button type="button" className={side === 'help' ? 'on' : ''} onClick={() => setSide('help')}>이 화면은</button>
              <button type="button" className={side === 'check' ? 'on' : ''} onClick={() => setSide('check')}>검증 ({p.checks.length})</button>
              <button type="button" className="x" onClick={() => setSide(null)}>×</button>
            </div>
            {side === 'help' ? <div className="help">{p.help}</div> : (
              <ul className="checks">
                {p.checks.length === 0 && <li className="info"><b>i</b> 조회·생성 후 검증 결과가 나옵니다.</li>}
                {p.checks.map((c, i) => (
                  <li key={i} className={c.level}>
                    <b>{ICON[c.level]}</b>
                    <div>
                      <div className="ct">{c.title}</div>
                      {c.detail && <div className="cd">{c.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** 조건 입력 칸 */
export function Cond({ label, children }: { label: string; children: ReactNode }) {
  return <label className="cond"><span>{label}</span>{children}</label>;
}
