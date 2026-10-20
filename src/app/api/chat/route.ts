import { KNOWLEDGE } from '../../../lib/knowledge';

export const dynamic = 'force-dynamic';

interface Msg { role: 'user' | 'assistant'; content: string }

/**
 * 챗봇: .env.local 의 ANTHROPIC_API_KEY 로 Claude API 를 부른다(키는 서버에만 있고 브라우저로 가지 않는다).
 * 요청: { messages, context } — context 는 화면이 보낸 현재 상태 요약(JSON 문자열)
 * 응답: 글자 스트림(text/plain)
 */
export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response('ANTHROPIC_API_KEY 가 없습니다. 프로젝트 폴더의 .env.local 에 넣고 서버를 다시 시작하세요.', { status: 500 });
  const { messages, context } = (await req.json()) as { messages: Msg[]; context: string };
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const body = {
    model,
    max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 2000),
    stream: true,
    system: [
      { type: 'text', text: KNOWLEDGE, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `[현재 상태]\n${context}` },
    ],
    messages: messages.slice(-20),
  };
  const r = await fetch(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) return new Response(`Claude API 오류 ${r.status}: ${await r.text()}`, { status: 502 });

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') ctrl.enqueue(enc.encode(ev.delta.text));
            if (ev.type === 'error') ctrl.enqueue(enc.encode(`\n[오류] ${ev.error?.message ?? ''}`));
          } catch { /* 부분 줄 */ }
        }
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
