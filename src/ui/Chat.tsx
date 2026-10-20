'use client';
import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { NODES, nodeState } from '../lib/flow';
import { DEPTS } from '../lib/judge';
import { s, sumCol, ymDash } from '../lib/util';

interface Msg { role: 'user' | 'assistant'; content: string }
const QUICK = ['이 화면 검증 결과를 설명해줘', '이번 달 다음에 뭘 해야 해?', '간선비 화주별 배분 산식을 예시로 알려줘', '배분 제외 기준은 어떻게 쓰면 돼?'];

/** 챗봇에 보낼 현재 상태 요약 (원천 행 데이터는 보내지 않고 합계·건수·검증만) */
function useContextText(active: string) {
  const app = useApp();
  return () => {
    const L: string[] = [];
    L.push(`기준월 ${ymDash(app.month)}, 작업자 ${app.user}`);
    const cur = app.screens.current[active];
    if (cur) {
      L.push(`지금 보는 화면: ${cur.title}${cur.tab ? ` › ${cur.tab} 탭` : ''}`);
      L.push('이 화면 검증:'); cur.checks.forEach((c) => L.push(`- [${c.level}] ${c.title}${c.detail ? ` — ${c.detail}` : ''}`));
    } else L.push(`지금 보는 화면: ${active}`);
    L.push('흐름 상태:');
    NODES.forEach((nd) => { const st = nodeState(nd, app.meta, app.count); const m = app.meta[nd.name]; L.push(`- ${nd.label}: ${st}${app.count(nd.name) ? ` ${app.count(nd.name)}행` : ''}${m ? ` (${m.at} ${m.who})` : ''}`); });
    L.push('합계:');
    L.push(`- 보관비 입력 ${sumCol(app.rows('M08.input'), '총계').toLocaleString()} / 배분 ${sumCol(app.rows('M08.alloc'), '배분원가').toLocaleString()}`);
    L.push(`- 배송비 배분 ${sumCol(app.rows('M09.alloc'), '배송비계').toLocaleString()}`);
    L.push(`- 간선비 입력 ${sumCol(app.rows('M10.input'), '합계').toLocaleString()} / 화주별 ${sumCol(app.rows('M10.shipper'), '합계').toLocaleString()} / 부서별 ${sumCol(app.rows('M10.dept'), '합계').toLocaleString()}`);
    L.push(`- 노무비 도급료 ${sumCol(app.rows('M11.input'), '총계').toLocaleString()} / 배분 ${sumCol(app.rows('M11.shipper'), '배분액').toLocaleString()}`);
    L.push(`- 일반관리비 입력 ${sumCol(app.rows('M13.input'), '금액').toLocaleString()} / 배분 ${sumCol(app.rows('M13.alloc'), '배분액').toLocaleString()}`);
    L.push('간선비입력 행:'); app.rows('M10.input').forEach((r) => L.push(`- ${s(r.부서)} ${s(r.부서명)} ${s(r.이고구분)} ${s(r.생성구분)} 합계 ${Number(r.합계 ?? 0).toLocaleString()}`));
    if (app.trips) {
      const c: Record<string, number> = {}; app.res.forEach((x) => { c[x.v] = (c[x.v] ?? 0) + 1; });
      L.push(`운행실적: ${app.tripSource} · 판정 ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
    L.push(`팀별 원가배부(권역조정) 제외: ${DEPTS.filter((d) => app.judge?.alloc[d.name] === false).map((d) => `${d.code} ${d.name}`).join(', ') || '없음'}`);
    const rules = app.rows('X.rules');
    L.push(`배분 제외 기준 ${rules.length}개: ${rules.slice(0, 30).map((r) => `${s(r.사용) === 'N' ? '(꺼짐)' : ''}${s(r.구분)} ${s(r.코드)} ${s(r.명칭)} [${s(r.적용원가)}] ${s(r.시작월)}~${s(r.종료월)} 사유:${s(r.사유)}`).join(' / ')}`);
    L.push('최근 작업:'); app.log.slice(0, 15).forEach((l) => L.push(`- ${l.at} ${l.who} ${l.menu} ${l.what}`));
    return L.join('\n');
  };
}

export default function Chat({ active }: { active: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ctx = useContextText(active);
  const box = useRef<HTMLDivElement>(null);

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q.trim() }];
    setMsgs([...next, { role: 'assistant', content: '' }]); setText(''); setBusy(true);
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: next, context: ctx() }) });
      if (!r.ok || !r.body) { const t = await r.text(); setMsgs([...next, { role: 'assistant', content: `⚠ ${t}` }]); return; }
      const rd = r.body.getReader(); const dec = new TextDecoder(); let acc = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: 'assistant', content: acc }]);
        box.current?.scrollTo({ top: box.current.scrollHeight });
      }
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: `⚠ 연결 실패: ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  };

  if (!open) return <button type="button" className="chatfab" onClick={() => setOpen(true)}>💬 AI 도우미</button>;
  return (
    <div className="chat">
      <div className="chathead">AI 도우미 <span className="muted">· 지금 화면의 검증·합계를 같이 봅니다</span>
        <span className="grow" /><button type="button" onClick={() => setMsgs([])}>새 대화</button><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <div className="chatbody" ref={box}>
        {msgs.length === 0 && <div className="chatempty">
          <p>원가배분 산식, 화면 사용법, 검증 경고의 뜻, 다음 할 일을 물어보세요. 원천 행 데이터는 보내지 않고 합계·건수·검증 결과만 보냅니다.</p>
          {QUICK.map((q) => <button type="button" key={q} onClick={() => send(q)}>{q}</button>)}
        </div>}
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content || (busy && i === msgs.length - 1 ? '…' : '')}</div>)}
      </div>
      <div className="chatinput">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="질문 입력 (Enter 보내기, Shift+Enter 줄바꿈)"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }} />
        <button type="button" onClick={() => send(text)} disabled={busy}>보내기</button>
      </div>
    </div>
  );
}
