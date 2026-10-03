import type { Artist } from '../lib/api';

export function ArtistImageAttribution({ artist }: { artist: Artist }) {
  const credit = artist.image_credit;
  if (!artist.image_url || !credit) return null;
  return <div className="artist-image-credit">
    <span>ภาพ: {credit.creator} · {credit.photo_date}</span>
    <a href={credit.source_url} target="_blank" rel="noopener noreferrer">{credit.title.replace(/^File:/, '')}</a>
    <a href={credit.license_url} target="_blank" rel="noopener noreferrer">{credit.license}</a>
    <span>แสดงตามไฟล์ต้นทาง ไม่ตัดภาพ{credit.changes.includes('watermark removed') && ' · ต้นทางลบลายน้ำโดย Beao เมื่อ 20 พ.ย. 2566'}</span>
  </div>;
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
