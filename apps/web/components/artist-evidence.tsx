import type { Artist } from '../lib/api';

export function ArtistImageAttribution({ artist }: { artist: Artist }) {
  const credit = artist.image_credit;
  if (!artist.image_url || !credit) return null;
  return <div className="artist-image-credit">
    <span>ภาพ: {credit.creator} · {credit.photo_date}</span>
    <a href={credit.source_url} target="_blank" rel="noopener noreferrer">{credit.title.replace(/^File:/, '')}</a>
    {credit.license_url ? <a href={credit.license_url} target="_blank" rel="noopener noreferrer">{credit.license}</a> : <span>{credit.license}</span>}
    {artist.image_review?.status === 'admin-provided' && <span>ข้อมูลสิทธิ์ภาพที่ผู้ดูแลระบุ</span>}
    <span>แสดงตามไฟล์ต้นทาง ไม่ตัดภาพ{credit.changes.includes('watermark removed') && ' · ต้นทางลบลายน้ำโดย Beao เมื่อ 20 พ.ย. 2566'}</span>
    {artist.image_review?.caption && <span>{artist.image_review.caption}</span>}
    <details><summary>ข้อมูลการปรับภาพต้นทาง</summary><span>{credit.changes}</span></details>
  </div>;
}

export function ArtistMembershipReview({ artist }: { artist: Artist }) {
  const evidence = artist.membership_evidence;
  if (!evidence) return null;
  const labels = { current: 'หลักฐานล่าสุดที่ตรวจ', historical: 'ข้อมูลตามช่วงเวลา', unclear: 'ยังยืนยันไม่ครบ' };
  const roles: Record<string,string> = { members: 'สมาชิกวง',label: 'ค่ายเพลง',management: 'ผู้ดูแลและบริหาร',distribution: 'ผู้จัดจำหน่าย',career: 'ผลงานและเส้นทางอาชีพ' };
  return <section className="section artist-biography" aria-labelledby="artist-membership-title">
    <h2 id="artist-membership-title">สมาชิกและการร่วมงานกับค่าย</h2>
    <p className="muted">ตรวจ {new Date(evidence.checkedAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })} · สถานะอ้างตามประกาศ ไม่รับรองว่าไม่มีการเปลี่ยนแปลงภายหลัง</p>
    {evidence.claims.some(claim => ['label','management','distribution'].includes(claim.kind)) && <p className="muted">ค่ายเพลง ผู้ดูแล และผู้จัดจำหน่ายเป็นคนละบทบาท เครดิตของผลงานหนึ่งไม่ยืนยันสัญญาสังกัดทุกด้าน</p>}
    <div className="artist-biography-sections">{evidence.claims.map((claim, index) => <article className="artist-biography-section" key={index}>
      <h3>{roles[claim.kind] || 'ข้อมูลที่อ้างอิง'}</h3>
      <span className="tag">{labels[claim.status]}{claim.publishedAt && ' · ' + claim.publishedAt}</span>
      <p>{claim.text}</p>
      <a href={claim.sourceUrl} target="_blank" rel="noopener noreferrer">แหล่งข้อมูล: {claim.sourceLabel}</a>
      {claim.reproductionUrl && <p><a href={claim.reproductionUrl} target="_blank" rel="noopener noreferrer">ภาพประกาศที่ตรวจอ่านข้อความ</a></p>}
    </article>)}</div>
    {!!evidence.pending.length && <div className="notice"><strong>ยังต้องตรวจเพิ่มเติม</strong><ul>{evidence.pending.map(item => <li key={item}>{item}</li>)}</ul></div>}
  </section>;
}

export function ArtistPopularity({ artist }: { artist: Artist }) {
  const evidence = artist.popularity_evidence;
  if (!evidence) return null;
  const snapshot = evidence.status === 'verified-snapshot';
  const report = evidence.status === 'verified-primary-report';
  const date = (value: string) => new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  return <section className="section artist-popularity">
    <h2>หลักฐานความนิยม</h2>
    {snapshot ? <p>{evidence.work} · ยอดชมวิดีโอนี้ {evidence.value?.toLocaleString('th-TH')} ครั้ง</p>
      : <p>{report ? 'รายงานจากศิลปิน ค่าย หรือผู้ดูแล' : 'ยังตรวจยืนยันข้อมูลความนิยมเฉพาะรายไม่ครบ'}</p>}
    {!!evidence.note && <p>{evidence.note}</p>}
    <p className="muted">{snapshot && evidence.measuredAt ? 'วัด ' + date(evidence.measuredAt) : 'ตรวจแหล่ง ' + date(evidence.checkedAt)}
      {evidence.sourceDate && ' · เอกสารลงวันที่ ' + evidence.sourceDate}</p>
    <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">ดูแหล่งหลักฐาน{evidence.sourceLabel ? ': ' + evidence.sourceLabel : ''}</a>
    <p className="muted">ข้อมูลคนละตัวชี้วัดและคนละช่วงเวลา ไม่ใช้เป็นอันดับรวมศิลปิน ยอดชมงานของวงไม่ใช่ยอดความนิยมของสมาชิกแต่ละคน</p>
  </section>;
}
