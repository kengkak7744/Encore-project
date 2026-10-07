'use client';
import { Suspense,useEffect,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send,Sparkles } from 'lucide-react';
import { api,type Concert,type Page } from '../../lib/api';
import { safeLink } from '../../lib/trip-prices';
import { useData, useSessionReset } from '../../components/use-data';
import { TripPlanner } from '../../components/trip-planner';

function AssistantContent() {
  // Recheck idle sessions on focus and once a minute, as on account/admin pages.
  useData('/me');
  const params = useSearchParams();
  const initialConcertId = params.get('concertId') || '';
  const concerts = useData<Page<Concert>>('/concerts');
  const [selectedConcert,setSelectedConcert] = useState<Concert | null>(null),[concertError,setConcertError] = useState('');
  useEffect(() => {
    let current = true; setSelectedConcert(null); setConcertError('');
    if (initialConcertId) void api<Concert>('/concerts/'+encodeURIComponent(initialConcertId)).then(concert => { if (current) setSelectedConcert(concert); }).catch(err => { if (current) setConcertError(err.message); });
    return () => { current = false; };
  },[initialConcertId]);
  const choices = concerts.data?.items || [];
  const tripConcerts = selectedConcert && !choices.some(concert => concert.id===selectedConcert.id) ? [selectedConcert,...choices] : choices;
  const [message,setMessage] = useState(''),[answer,setAnswer] = useState('');
  const [sources,setSources] = useState<string[]>([]),[busy,setBusy] = useState(false),[error,setError] = useState('');
  useSessionReset(() => { setMessage(''); setAnswer(''); setSources([]); setError(''); });
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!message.trim()) return;
    setBusy(true); setError(''); setAnswer(''); setSources([]);
    try {
      const data = await api<{ answer: string; sources: string[] }>('/chat',{ method: 'POST',body: JSON.stringify({ message }) });
      setAnswer(data.answer); setSources(data.sources || []);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="container page">
    <div className="page-heading"><span className="eyebrow">YOUR FAN COMPANION</span><h1>ผู้ช่วยของ<br/><em>แฟนเพลง</em></h1><p>ถามจากข้อมูลศิลปิน ข่าว และคอนเสิร์ตที่ระบบมี พร้อมวางแผนงบทริปจากราคาที่คุณเลือก</p></div>
    <div className="assistant-grid">
      <section className="assistant-panel"><div className="panel-heading"><Sparkles size={21}/><h2>ถาม Encore AI</h2></div>
        <div className="chat-area">{answer ? <p className="chat-answer">{answer}</p> : <p className="chat-placeholder">ลองถามว่า “ศิลปินที่ติดตามมีงานที่ไหนบ้าง?” หรือ “มีคอนเสิร์ตในกรุงเทพเดือนนี้ไหม?”</p>}</div>
        <div>{[...new Set(sources)].filter(source => safeLink(source)).map((source,index) => <p key={source}><a href={safeLink(source)!} target="_blank" rel="noreferrer">แหล่งอ้างอิง {index+1}</a></p>)}</div>
        <form onSubmit={send} className="chat-form"><input value={message} onChange={e => setMessage(e.target.value)} placeholder="พิมพ์คำถามของคุณ..."/><button disabled={busy} aria-label="ส่งคำถาม"><Send size={18}/></button></form>
        <small>ต้องเข้าสู่ระบบ · หากเครื่อง AI ไม่พร้อม ข้อมูลศิลปินและคอนเสิร์ตยังใช้งานได้</small>
        {error && <p className="notice error">{error}</p>}
      </section>
      <div>{(concertError || concerts.error) && <p className="notice error">{concertError || concerts.error}</p>}<TripPlanner key={initialConcertId} concerts={tripConcerts} initialConcertId={initialConcertId}/></div>
    </div>
  </div>;
}
export default function AssistantPage() { return <Suspense fallback={<p className="loading">กำลังโหลด...</p>}><AssistantContent/></Suspense>; }
