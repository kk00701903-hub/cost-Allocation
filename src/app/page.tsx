'use client';
import dynamic from 'next/dynamic';

const Shell = dynamic(() => import('../ui/Shell'), { ssr: false, loading: () => <div style={{ padding: 24, color: '#706e6b' }}>공동물류 원가배분을 여는 중…</div> });

export default function Page() {
  return <Shell />;
}
