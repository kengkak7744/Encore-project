'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Heart, ImagePlus, MessageCircle, Music2, Plus, Send, Sparkles, X } from 'lucide-react';
import { api, date, type Artist, type FanComment, type FanMedia, type FanPost, type FeedNews, type FeedPage, type FeedSidebar, type Page, type Viewer } from '../lib/api';
import { useData, useSessionReset } from './use-data';
import { ArtistPortrait } from './artist-portrait';
import { NewsMediaViewer } from './news-media';

function Avatar({ name }: { name: string }) {
  return <span className="fan-avatar" aria-hidden="true">{Array.from(name).slice(0,2).join('').toUpperCase()}</span>;
}
export function FeedPager({ page,total,pageSize,onChange,loading }: { page: number; total: number; pageSize: number; onChange: (page: number) => void; loading?: boolean }) {
  const pages = Math.max(1,Math.ceil(total/pageSize));
  return <nav className="feed-pager" aria-label="แบ่งหน้าฟีด"><button disabled={loading || page<=1} onClick={() => onChange(page-1)}><ChevronLeft size={16}/> ก่อนหน้า</button><span>หน้า {page} / {pages} · {total} รายการ</span><button disabled={loading || page>=pages} onClick={() => onChange(page+1)}>ถัดไป <ChevronRight size={16}/></button></nav>;
}

function PostComposer({ me,onPosted }: { me: Viewer; onPosted: () => void }) {
  const [body,setBody] = useState(''),[tags,setTags] = useState<Artist[]>([]),[query,setQuery] = useState(''),[search,setSearch] = useState('');
  const [files,setFiles] = useState<{ file: File; preview: string; uploadId?: string }[]>([]),[rights,setRights] = useState(false);
  const [busy,setBusy] = useState(false),[error,setError] = useState(''),[status,setStatus] = useState('');
  const picker = useId(), active = useRef(true), abort = useRef<AbortController | null>(null), previews = useRef<string[]>([]);
  const artists = useData<Page<Artist>>('/artists?q='+encodeURIComponent(search));
  useEffect(() => { const timer=setTimeout(() => setSearch(query),200); return () => clearTimeout(timer); },[query]);
  useEffect(() => { active.current=true; return () => { active.current=false; abort.current?.abort(); for (const url of previews.current) URL.revokeObjectURL(url); }; },[]);
  useSessionReset(() => { abort.current?.abort(); setBody(''); setTags([]); setQuery(''); setFiles([]); setRights(false); setError(''); setStatus(''); });
  function addFiles(input: FileList | null) {
    if (!input) return;
    const next = [...input];
    if (files.length+next.length>4) { setError('แนบได้ไม่เกิน 4 ไฟล์ต่อโพสต์'); return; }
    for (const file of next) {
      if (!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type)) { setError('ใช้ JPG, PNG, WebP, MP4 หรือ WebM'); return; }
      if (file.size>(file.type.startsWith('image/') ? 6 : 25)*1024*1024) { setError('รูปไม่เกิน 6 MB และวิดีโอไม่เกิน 25 MB'); return; }
    }
    setFiles(current => [...current,...next.map(file => { const preview=URL.createObjectURL(file); previews.current.push(preview); return { file,preview }; })]); setError('');
  }
  async function removeFile(index: number) {
    const file=files[index];
    if (file.uploadId) try { await api('/feed/uploads/'+file.uploadId,{ method: 'DELETE' }); } catch (failure) { setError((failure as Error).message); return; }
    URL.revokeObjectURL(file.preview); setFiles(current => current.filter((_,i) => i!==index));
  }
  async function publish(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setStatus('');
    const controller=new AbortController(); abort.current=controller;
    try {
      const ids: string[]=[];
      for (const [index,item] of files.entries()) {
        setStatus('กำลังอัปโหลด '+(index+1)+' / '+files.length);
        const id=item.uploadId || (await api<{ id: string }>('/feed/uploads',{ method: 'POST',body: item.file,signal: AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),headers: { 'Content-Type': item.file.type,'X-Media-Rights': rights ? 'confirmed' : '' } })).id;
        if (!active.current) return;
        item.uploadId=id; ids.push(id);
      }
      await api('/feed/posts',{ method: 'POST',signal: controller.signal,body: JSON.stringify({ body,artistIds: tags.map(artist => artist.id),uploadIds: ids }) });
      if (!active.current) return;
      for (const item of files) URL.revokeObjectURL(item.preview);
      setBody(''); setFiles([]); setTags([]); setRights(false); setStatus('โพสต์แล้ว'); onPosted();
    } catch (failure) { if (active.current && !controller.signal.aborted) { setError((failure as Error).message); setStatus(''); } }
    finally { if (active.current) setBusy(false); }
  }
  return <section className="feed-composer" aria-label="สร้างโพสต์"><div className="feed-author"><Avatar name={me.user.display_name}/><div><strong>{me.user.display_name}</strong><small>เล่าโมเมนต์ของคุณให้แฟนเพลงด้วยกัน</small></div></div>
    <form onSubmit={publish}><fieldset disabled={busy} className="composer-fields"><label className="sr-only" htmlFor={picker+'-text'}>ข้อความโพสต์</label><textarea id={picker+'-text'} value={body} maxLength={3000} rows={3} placeholder="มีอะไรอยากเล่าเกี่ยวกับศิลปินหรือคอนเสิร์ต?" onChange={event => setBody(event.target.value)}/>
      {files.length>0 && <div className="composer-previews">{files.map((item,index) => <div key={item.preview}>{item.file.type.startsWith('image/') ? <img src={item.preview} alt={'ไฟล์แนบ '+(index+1)}/> : <video src={item.preview} muted preload="metadata"/>}<button type="button" aria-label={'เอาไฟล์ '+(index+1)+' ออก'} onClick={() => void removeFile(index)}><X size={15}/></button><small>{item.file.name}</small></div>)}</div>}
      <div className="feed-tags">{tags.map(artist => <button type="button" key={artist.id} onClick={() => setTags(current => current.filter(a => a.id!==artist.id))}>#{artist.name} <X size={12}/><span className="sr-only">เอาแท็กออก</span></button>)}</div>
      <details className="composer-tag-picker"><summary><Music2 size={15}/> แท็กศิลปิน {tags.length}/5</summary><label>ค้นหาศิลปินเพื่อแท็ก<input value={query} onChange={event => setQuery(event.target.value)} placeholder="ชื่อศิลปินหรือวง"/></label>
        <div className="composer-tag-results">{(query ? artists.data?.items : [...me.follows,...(artists.data?.items || []).filter(a => !me.follows.some(f => f.id===a.id))])?.slice(0,12).map(artist => <button type="button" key={artist.id} disabled={tags.length>=5 || tags.some(a => a.id===artist.id)} onClick={() => setTags(current => [...current,artist])}><Plus size={12}/>{artist.name}</button>)}</div>{artists.error && <small role="alert">{artists.error}</small>}
      </details>
      {files.length>0 && <label className="composer-rights"><input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)}/>ฉันมีสิทธิ์เผยแพร่รูป/วิดีโอเหล่านี้</label>}
      <div className="composer-bottom"><label className="composer-media-picker" htmlFor={picker}><ImagePlus size={19}/> รูป / วิดีโอ<input id={picker} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={event => { addFiles(event.target.files); event.target.value=''; }}/></label><small>{body.length}/3000</small><button className="button primary" disabled={busy || (!body.trim() && !files.length) || (!!files.length && !rights)}><Send size={16}/>{busy ? 'กำลังโพสต์...' : 'โพสต์'}</button></div>
      <small className="muted">ไม่เกิน 4 ไฟล์ · รูป 6 MB · วิดีโอ 25 MB</small></fieldset></form>
    {error && <p className="notice error" role="alert">{error}</p>}{status && <p className="inline-message" role="status">{status}</p>}
  </section>;
}

function FanMediaViewer({ media }: { media: FanMedia[] }) {
  const [index,setIndex] = useState(0),[failed,setFailed] = useState<string[]>([]);
  const item=media[Math.min(index,media.length-1)]; if (!item) return null;
  return <div className="fan-media">{failed.includes(item.id) ? <p className="empty">สื่อนี้ไม่พร้อมแสดง</p> : item.type==='image' ? <img src={item.url} alt={'รูปในโพสต์ '+(index+1)} loading="lazy" onError={() => setFailed(current => [...current,item.id])}/> : <video key={item.id} controls preload="metadata" playsInline src={item.url} aria-label={'วิดีโอในโพสต์ '+(index+1)} onError={() => setFailed(current => [...current,item.id])}/>}
    {media.length>1 && <div className="news-media-navigation"><button aria-label="สื่อก่อนหน้า" disabled={index<=0} onClick={() => setIndex(index-1)}><ChevronLeft size={17}/></button><span>{index+1} / {media.length}</span><button aria-label="สื่อถัดไป" disabled={index>=media.length-1} onClick={() => setIndex(index+1)}><ChevronRight size={17}/></button></div>}
  </div>;
}
function PostComments({ postId,signedIn,onChange }: { postId: string; signedIn: boolean; onChange: () => void }) {
  const [page,setPage] = useState(1),[body,setBody] = useState(''),[error,setError] = useState(''),[busy,setBusy] = useState(false);
  const result=useData<Page<FanComment>>('/feed/posts/'+postId+'/comments?page='+page);
  useSessionReset(() => { setBody(''); setError(''); setPage(1); });
  async function comment(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/feed/posts/'+postId+'/comments',{ method: 'POST',body: JSON.stringify({ body }) }); setBody(''); setPage(1); await result.reload(); onChange(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError('');
    try { await api('/feed/comments/'+id,{ method: 'DELETE' }); await result.reload(); onChange(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <section className="fan-comments" aria-label="ความคิดเห็น">{result.loading && <p className="muted">กำลังโหลดความคิดเห็น...</p>}{(error || result.error) && <p className="notice error" role="alert">{error || result.error}</p>}
    {result.data?.items.map(item => <article key={item.id}><div><strong>{item.author.display_name}</strong><small>{date(item.created_at)}</small>{item.own && <button disabled={busy} onClick={() => void remove(item.id)} aria-label={'ลบความคิดเห็นของ '+item.author.display_name}><X size={13}/></button>}</div><p>{item.body}</p></article>)}
    {(result.data?.total || 0)>10 && <FeedPager page={result.data!.page} total={result.data!.total!} pageSize={10} onChange={setPage}/>}
    {signedIn ? <form onSubmit={comment}><label className="sr-only" htmlFor={'comment-'+postId}>เขียนความคิดเห็น</label><input id={'comment-'+postId} value={body} maxLength={1000} required placeholder="เขียนความคิดเห็น..." disabled={busy} onChange={event => setBody(event.target.value)}/><button disabled={busy || !body.trim()} aria-label="ส่งความคิดเห็น"><Send size={17}/></button></form> : <p className="muted"><Link href="/account">เข้าสู่ระบบ</Link>เพื่อร่วมพูดคุย</p>}
  </section>;
}
function FanPostCard({ item,signedIn,onChange }: { item: FanPost; signedIn: boolean; onChange: () => void }) {
  const [open,setOpen] = useState(false),[editing,setEditing] = useState(false),[body,setBody] = useState(item.body),[busy,setBusy] = useState(false),[error,setError] = useState('');
  useSessionReset(() => { setOpen(false); setEditing(false); setError(''); });
  async function action(path: string,method: string,payload?: unknown) {
    if (busy) return;
    setBusy(true); setError('');
    try { await api(path,{ method,...(payload===undefined ? {} : { body: JSON.stringify(payload) }) }); setEditing(false); onChange(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <article className="feed-card fan-post" data-post-id={item.id}><header><div className="feed-author"><Avatar name={item.author.display_name}/><div><strong>{item.author.display_name}</strong><small>แฟนเพลง · {date(item.published_at)}</small></div></div>{item.own && <details className="post-menu"><summary aria-label="จัดการโพสต์">•••</summary><button disabled={busy} onClick={() => { setBody(item.body); setEditing(true); }}>แก้ข้อความ</button><button disabled={busy} onClick={() => { if (window.confirm('ลบโพสต์นี้และไฟล์แนบ?')) void action('/feed/posts/'+item.id,'DELETE'); }}>ลบโพสต์</button></details>}</header>
    <div className="feed-reason">{item.reason}</div><FanMediaViewer media={item.media}/>
    {editing ? <form className="post-edit" onSubmit={event => { event.preventDefault(); void action('/feed/posts/'+item.id,'PATCH',{ body }); }}><label htmlFor={'post-edit-'+item.id}>แก้ข้อความโพสต์</label><textarea id={'post-edit-'+item.id} value={body} maxLength={3000} rows={4} disabled={busy} onChange={event => setBody(event.target.value)}/><div className="editor-actions"><button className="button primary" disabled={busy}>บันทึกโพสต์</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>ยกเลิก</button></div></form> : <p className="feed-body">{item.body}</p>}
    <div className="feed-tags">{item.artists.map(artist => <Link key={artist.id} href={'/artists/'+artist.slug}>#{artist.name}</Link>)}</div>
    <div className="post-actions"><button className={item.liked ? 'liked' : ''} aria-pressed={item.liked} disabled={busy || !signedIn} onClick={() => void action('/feed/posts/'+item.id+'/like',item.liked ? 'DELETE' : 'PUT')} aria-label={item.liked ? 'เลิกถูกใจ' : 'ถูกใจ'}><Heart size={20} fill={item.liked ? 'currentColor' : 'none'}/><span>{item.likes}</span></button><button aria-expanded={open} onClick={() => setOpen(!open)}><MessageCircle size={20}/><span>{item.comments} ความคิดเห็น</span></button>{!signedIn && <Link href="/account">เข้าสู่ระบบเพื่อถูกใจ</Link>}</div>
    {error && <p className="notice error" role="alert">{error}</p>}{open && <PostComments postId={item.id} signedIn={signedIn} onChange={onChange}/>}
  </article>;
}
function OfficialNewsCard({ item }: { item: FeedNews }) {
  const body=item.summary || item.body || 'โพสต์นี้ไม่มีข้อความที่ระบบอ่านได้ เปิดต้นทางเพื่อดูเนื้อหา';
  return <article className="feed-card official-news"><header><div className="feed-author"><span className="official-avatar"><Music2 size={21}/></span><div><Link href={'/artists/'+item.artist_slug}><strong>{item.artist_name}</strong></Link><small>ข่าวศิลปิน · {item.platform.toUpperCase()} · {date(item.published_at)}</small></div></div><a href={item.source_url} target="_blank" rel="noopener noreferrer" aria-label={'เปิดโพสต์ต้นทางของ '+item.artist_name}><ArrowUpRight size={18}/></a></header><div className="feed-reason">{item.reason}{item.stale ? ' · ข้อมูลอาจล้าสมัย' : ''}</div><NewsMediaViewer item={item}/>
    {body.length>500 ? <details className="feed-long-text"><summary>{body.slice(0,180)}… <span>อ่านเพิ่มเติม</span></summary><p className="feed-body">{body}</p></details> : <p className="feed-body">{body}</p>}<a href={item.source_url} target="_blank" rel="noopener noreferrer" className="feed-source">ดูโพสต์ต้นทาง <ArrowUpRight size={14}/></a>
  </article>;
}

export function CommunityFeed() {
  const [tab,setTab] = useState('for-you'),[page,setPage] = useState(1),[followError,setFollowError] = useState(''),[following,setFollowing] = useState<string | null>(null);
  const [snapshot,setSnapshot] = useState(''),[browseSnapshot,setBrowseSnapshot] = useState(''),[feedRevision,setFeedRevision] = useState(0),[feedNotice,setFeedNotice] = useState('');
  const me=useData<Viewer>('/me'),feed=useData<FeedPage>('/feed?'+new URLSearchParams({ tab,page: String(page),refresh: String(feedRevision),...(tab==='for-you' && browseSnapshot ? { snapshot: browseSnapshot } : {}) }),60000),sidebar=useData<FeedSidebar>('/feed/sidebar',60000);
  useEffect(() => {
    if (!feed.data || tab!=='for-you') return;
    if (feed.data.snapshot) setSnapshot(feed.data.snapshot);
    if (feed.data.snapshotReset) { setBrowseSnapshot(feed.data.snapshot || ''); setPage(1); setFeedNotice('ฟีดอัปเดตแล้ว เริ่มจากหน้าแรกเพื่อดูโพสต์ตามลำดับใหม่'); }
  },[feed.data,tab]);
  useSessionReset(() => { setTab('for-you'); setPage(1); setSnapshot(''); setBrowseSnapshot(''); setFeedNotice(''); setFollowError(''); });
  function refreshFeed() { setSnapshot(''); setBrowseSnapshot(''); setPage(1); setFeedNotice(''); setFeedRevision(value => value+1); }
  const signedIn=!!me.data;
  async function follow(artist: Artist) {
    setFollowing(artist.id); setFollowError('');
    try { await api('/me/follows/'+artist.id,{ method: 'PUT' }); refreshFeed(); await Promise.all([me.reload(),sidebar.reload()]); }
    catch (failure) { setFollowError((failure as Error).message); } finally { setFollowing(null); }
  }
  function posted() { setTab('for-you'); refreshFeed(); }
  return <div className="community-shell"><div className="community-heading"><div><span className="eyebrow">YOUR MUSIC COMMUNITY</span><h1>โมเมนต์ของคนรักเพลง<span>.</span></h1><p>ข่าวจากศิลปิน เรื่องเล่าจากแฟนเพลง และคอนเสิร์ตถัดไปของคุณ</p></div><Link href="/concerts" className="text-link"><CalendarDays size={16}/> สำรวจคอนเสิร์ต</Link></div>
    <div className="community-layout"><aside className="feed-left" aria-label="คอนเสิร์ตที่กำลังจะมา"><div className="feed-side-panel"><div className="side-heading"><h2><CalendarDays size={18}/> คอนเสิร์ตถัดไป</h2><Link href="/concerts">ดูทั้งหมด</Link></div>
      {sidebar.error && <p className="notice error">{sidebar.error}</p>}{sidebar.loading && <p className="muted">กำลังโหลด...</p>}
      {sidebar.data?.concerts.map(concert => <Link href={'/concerts/'+concert.slug} className="side-concert" key={concert.id}><div className="side-date"><strong>{concert.starts_at ? new Intl.DateTimeFormat('th-TH',{ day: 'numeric',timeZone: 'Asia/Bangkok' }).format(new Date(concert.starts_at)) : '—'}</strong><small>{concert.starts_at ? new Intl.DateTimeFormat('th-TH',{ month: 'short',timeZone: 'Asia/Bangkok' }).format(new Date(concert.starts_at)) : ''}</small></div><div><strong>{concert.title}</strong><small>{concert.happening ? 'กำลังแสดง' : date(concert.starts_at,concert.time_tba)}</small><small>{concert.venue || concert.city || 'รอสถานที่'}</small>{concert.followed && <span>ศิลปินที่คุณติดตาม</span>}</div></Link>)}
      {sidebar.data?.concerts.length===0 && <p className="muted">ยังไม่มีงานที่กำลังจะมาในข้อมูลที่ตรวจพบ</p>}</div><div className="feed-side-note"><Music2 size={22}/><p>พบกันหน้าเวที<br/>แล้วมาเล่าโมเมนต์ด้วยกัน</p><Link href="/artists">ค้นหาศิลปิน →</Link></div></aside>
      <section className="feed-center" aria-label="ฟีดข่าวและชุมชน"><div className="feed-tabs" role="tablist" aria-label="เลือกฟีด"><button id="feed-for-you" role="tab" aria-selected={tab==='for-you'} aria-controls="feed-content" onClick={() => { setTab('for-you'); setPage(1); }}><Sparkles size={17}/> สำหรับคุณ</button><button id="feed-following" role="tab" aria-selected={tab==='following'} aria-controls="feed-content" onClick={() => { setTab('following'); setPage(1); }}><Heart size={17}/> กำลังติดตาม</button></div>
        {tab==='for-you' && <div className="feed-ranking-note"><span>ข่าวที่คุณสนใจ พร้อมศิลปินและมุมมองใหม่ ๆ</span><button type="button" disabled={feed.loading} onClick={refreshFeed}>อัปเดตฟีด</button></div>}
        {feedNotice && tab==='for-you' && <p className="notice" role="status">{feedNotice}</p>}
        {signedIn ? <PostComposer key={me.data!.user.id} me={me.data!} onPosted={posted}/> : !me.loading && <div className="feed-signin"><strong>ทุกโมเมนต์มีเรื่องให้เล่า</strong><p>เข้าสู่ระบบเพื่อโพสต์ ติดตามศิลปิน และร่วมพูดคุย</p><Link href="/account" className="button primary">เข้าสู่ระบบ</Link></div>}
        <div id="feed-content" role="tabpanel" aria-labelledby={tab==='following' ? 'feed-following' : 'feed-for-you'}>
          {tab==='following' && !signedIn && !me.loading ? <div className="feed-empty"><Heart size={30}/><h2>ฟีดจากศิลปินที่คุณติดตาม</h2><p>เข้าสู่ระบบและเลือกติดตามศิลปินก่อน</p><Link href="/account">เข้าสู่ระบบ →</Link></div> : <>{feed.error && <p className="notice error" role="alert">{feed.error}</p>}{feed.loading && <p className="loading">กำลังโหลดฟีด...</p>}{feed.data?.items.map(item => item.kind==='news' ? <OfficialNewsCard key={'news-'+item.id} item={item}/> : <FanPostCard key={'post-'+item.id} item={item} signedIn={signedIn} onChange={() => void feed.reload()}/>)}
            {!feed.loading && !feed.error && feed.data?.items.length===0 && <div className="feed-empty"><Music2 size={30}/><h2>{tab==='following' ? 'เริ่มจากศิลปินที่คุณชอบ' : 'ยังไม่มีโพสต์ในขณะนี้'}</h2><p>{tab==='following' ? 'ติดตามศิลปินเพื่อเห็นข่าวและโพสต์ที่แท็กศิลปินนั้น' : 'ข่าวและเรื่องเล่าจากแฟนเพลงจะแสดงที่นี่'}</p><Link href="/artists">สำรวจศิลปิน →</Link></div>}
            {feed.data && <FeedPager page={feed.data.page} total={feed.data.total || 0} pageSize={15} onChange={value => { if (tab==='for-you') setBrowseSnapshot(snapshot); setPage(value); document.querySelector('.feed-tabs')?.scrollIntoView({ behavior: 'smooth',block: 'start' }); }} loading={feed.loading}/>}</>}
        </div>
      </section>
      <aside className="feed-right" aria-label="ศิลปินแนะนำ"><div className="feed-side-panel"><div className="side-heading"><h2>ศิลปินที่น่าติดตาม</h2><Link href="/artists">ดูทั้งหมด</Link></div>{sidebar.loading && <p className="muted">กำลังโหลด...</p>}{sidebar.data?.artists.map(artist => <div className="suggested-artist" key={artist.id}><Link href={'/artists/'+artist.slug}><ArtistPortrait artist={artist}/></Link><div><Link href={'/artists/'+artist.slug}><strong>{artist.name}</strong></Link><small>{artist.reason}</small></div>{signedIn ? <button disabled={following!==null} aria-label={'ติดตาม '+artist.name} onClick={() => void follow(artist)}><Plus size={17}/></button> : <Link href="/account" aria-label={'เข้าสู่ระบบเพื่อติดตาม '+artist.name}><Plus size={17}/></Link>}</div>)}{sidebar.data?.artists.length===0 && <p className="muted">คุณติดตามศิลปินในระบบครบแล้ว</p>}{followError && <p className="notice error" role="alert">{followError}</p>}</div>
        <div className="feed-side-links"><Link href="/status">สถานะข้อมูล</Link><Link href="/assistant">ผู้ช่วยวางแผนทริป</Link><small>ข่าวศิลปินมีลิงก์ต้นทาง<br/>โพสต์แฟนเพลงเป็นความเห็นของผู้โพสต์</small><span>© Encore · Made for music fans</span></div>
      </aside></div>
  </div>;
}
