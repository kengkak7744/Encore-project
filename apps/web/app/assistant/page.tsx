'use client';
import { Suspense,useEffect,useRef,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send,Sparkles } from 'lucide-react';
import { api,type Concert,type Page } from '../../lib/api';
import { safeLink } from '../../lib/trip-prices';
import { useData, useSessionReset } from '../../components/use-data';
import { TripPlanner } from '../../components/trip-planner';

type ChatTurn = { role: 'user' | 'assistant'; content: string; sources?: string[] };

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
  const [message,setMessage] = useState(''),[turns,setTurns] = useState<ChatTurn[]>([]);
  const [busy,setBusy] = useState(false),[error,setError] = useState('');
  const generation = useRef(0),pending = useRef<AbortController | null>(null),chatEnd = useRef<HTMLDivElement | null>(null);
  function resetChat() {
    generation.current++; pending.current?.abort(); pending.current=null;
    setMessage(''); setTurns([]); setBusy(false); setError('');
  }
  useSessionReset(resetChat);
  useEffect(() => () => { generation.current++; pending.current?.abort(); },[]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }); },[turns,busy]);
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!message.trim() || pending.current) return;
    const question=message.trim().slice(0,1500),request=++generation.current;
    const controller=new AbortController(); pending.current=controller;
    const history=turns.slice(-8).map(({role,content}) => ({role,content}));
    setBusy(true); setError(''); setMessage('');
    setTurns(previous => [...previous,{role:'user',content:question}]);
    try {
      const data = await api<{ answer: string; sources: string[] }>('/chat',{ method: 'POST',body: JSON.stringify({ message:question,history }),signal:controller.signal });
      if (request===generation.current) setTurns(previous => [...previous,{role:'assistant',content:data.answer,sources:data.sources || []}]);
    } catch (err) {
      if (request===generation.current && !controller.signal.aborted) { setError((err as Error).message); setMessage(question); setTurns(previous => previous.slice(0,-1)); }
    } finally { if (request===generation.current) { pending.current=null; setBusy(false); } }
  }
  return <div className="container page">
    <div className="page-heading"><span className="eyebrow">YOUR FAN COMPANION</span><h1>ผู้ช่วยของ<br/><em>แฟนเพลง</em></h1><p>ถามจากข้อมูลศิลปิน ข่าว และคอนเสิร์ตที่ระบบมี พร้อมวางแผนงบทริปจากราคาที่คุณเลือก</p></div>
    <div className="assistant-grid">
      <section className="assistant-panel"><div className="panel-heading"><Sparkles size={21}/><h2>ถาม Encore AI</h2><button type="button" className="text-link chat-reset" onClick={resetChat} disabled={!turns.length && !busy}>เริ่มคุยใหม่</button></div>
        <div className="chat-area chat-conversation" role="log" aria-label="บทสนทนากับ Encore AI" aria-live="polite">
          {!turns.length && <p className="chat-placeholder">คุยเรื่องศิลปินที่ชอบกันไหม? ลองถามว่า “รู้จัก Aheye ไหม” แล้วถามต่อเรื่องผลงานหรือคอนเสิร์ตได้เลย</p>}
          {turns.map((turn,index) => <div key={index} className={'chat-bubble chat-'+turn.role}>
            <small>{turn.role==='user'?'คุณ':'Encore AI'}</small><p>{turn.content}</p>
            {!!turn.sources?.length && <div className="chat-sources">{turn.sources.map((source,i) => safeLink(source) && <a key={source} href={safeLink(source)!} target="_blank" rel="noreferrer">[{i+1}] แหล่งอ้างอิง</a>)}</div>}
          </div>)}
          {busy && <p className="chat-placeholder" role="status">Encore กำลังคิดคำตอบ…</p>}<div ref={chatEnd}/>
        </div>
        <form onSubmit={send} className="chat-form"><input aria-label="ข้อความถึง Encore AI" maxLength={1500} value={message} onChange={e => setMessage(e.target.value)} placeholder="พิมพ์คุยกับ Encore..."/><button disabled={busy || !message.trim()} aria-label="ส่งคำถาม"><Send size={18}/></button></form>
        <small>ต้องเข้าสู่ระบบ · หากเครื่อง AI ไม่พร้อม ข้อมูลศิลปินและคอนเสิร์ตยังใช้งานได้</small>
        {error && <p className="notice error">{error}</p>}
      </section>
      <div>{(concertError || concerts.error) && <p className="notice error">{concertError || concerts.error}</p>}<TripPlanner key={initialConcertId} concerts={tripConcerts} initialConcertId={initialConcertId}/></div>
    </div>
  </div>;
}
export default function AssistantPage() { return <Suspense fallback={<p className="loading">กำลังโหลด...</p>}><AssistantContent/></Suspense>; }
