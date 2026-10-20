'use client';
import { useEffect, useRef, useState } from 'react';
import type { RunEntry } from '../lib/runlog';

export interface ReasonRequest { action: string; menu: string; menuName: string; tables: string[]; last: RunEntry | null; staleInputs: string[] }

const CHIPS = ['원천 자료 변경으로 재생성', '기준(가중치·제외 기준) 변경', '오류 수정 후 재생성', '월 마감 정기 생성', '검증·비교용 실행'];

/** 생성 실행 전에 사유를 받는 창. 사유 없이는 확인할 수 없다. */
export default function ReasonModal({ req, onDone }: { req: ReasonRequest; onDone: (reason: string | null) => void }) {
  const [text, setText] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ta.current?.focus(); }, []);
  const ok = text.trim().length >= 2;
  return (
    <div className="modal-back" onKeyDown={(e) => { if (e.key === 'Escape') onDone(null); }}>
      <div className="modal" role="dialog" aria-label="실행 사유">
        <h3>실행 사유 입력 — {req.menuName}</h3>
        <p className="modal-sub"><b>{req.action}</b> 을(를) 실행하면 아래 표가 새로 만들어집니다. 사유는 작업 이력 › 실행 이력에 남습니다.</p>
        <ul className="modal-list">{req.tables.map((t) => <li key={t}>{t}</li>)}</ul>
        {req.last ? (
          <div className="modal-last">
            <div>직전 실행: {req.last.at} · {req.last.who} · {req.last.action}</div>
            <div>직전 사유: {req.last.reason}</div>
          </div>
        ) : <div className="modal-last">이 메뉴의 이번 달 첫 실행입니다.</div>}
        {req.staleInputs.length > 0 && <div className="modal-warn">직전 실행 이후 다시 만들어진 입력: {req.staleInputs.join(', ')}</div>}
        <div className="modal-chips">{CHIPS.map((c) => <button type="button" key={c} onClick={() => setText((t) => (t ? `${t} / ${c}` : c))}>{c}</button>)}</div>
        <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="예) 보관비입력 화성 전력비 수정 반영(10/16 회계팀 요청)"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && ok) onDone(text.trim()); }} />
        <div className="modal-btns">
          <button type="button" onClick={() => onDone(null)}>취소</button>
          <button type="button" className="primary" disabled={!ok} onClick={() => onDone(text.trim())}>확인 후 실행</button>
        </div>
      </div>
    </div>
  );
}
