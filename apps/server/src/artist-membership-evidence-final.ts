import { artistMembershipEvidence } from './artist-membership-evidence.js';
import type { ArtistMembershipClaim, ArtistMembershipEvidence } from './artist-membership-evidence.js';
import { expandedArtistProfiles } from './expanded-artist-profiles.js';

// Overrides for public roles checked on 5 October. Credits describe a release,
// while a published roster describes the organisation's public artist listing.
// Neither proves every private recording, management or distribution contract.
const checkedAt = '2026-10-05T12:20:00Z';
const gmm = (id: number) => `https://www.gmmgrammy.com/newsroom/news-single.php?id=${id}`;
const domestic = 'https://umusic.co.th/pages/domestic-artists';
const phum = 'https://open.spotify.com/intl-id/artist/5mqguTgtaoCMNMZD6txCh6';
const pp = 'https://music.apple.com/us/album/%E0%B9%80%E0%B8%81-%E0%B8%87%E0%B9%84%E0%B8%A1-%E0%B8%9E%E0%B8%AD-good-not-enough-single/6768934697';
const billkin = 'https://open.spotify.com/track/5sxfpwXQU6636cZerTtiTG';
const nunew = 'https://open.spotify.com/track/3xgbJWnKccTeGlLFjFeE1Z';
const credit = (kind: ArtistMembershipClaim['kind'], status: ArtistMembershipClaim['status'],
  text: string, sourceUrl: string, sourceLabel: string, publishedAt?: string): ArtistMembershipClaim => ({
  kind, status, text, sourceUrl, sourceLabel, evidenceKind: 'first-party',
  ...(publishedAt ? { publishedAt } : {}),
});

function review(slug: string, claims: ArtistMembershipClaim[], pending: string[],
  changes: Pick<ArtistMembershipEvidence, 'biographyAdditions' | 'corrections'> = {}): ArtistMembershipEvidence {
  const existing = artistMembershipEvidence.find(record => record.slug === slug);
  const expanded = expandedArtistProfiles.find(profile => profile.slug === slug);
  if (!existing && !expanded) throw new Error(`Unknown membership review artist: ${slug}`);
  const priorClaims: ArtistMembershipClaim[] = existing?.claims || [{
    kind: 'career', status: 'historical', text: expanded!.biography![0].body,
    sourceUrl: expanded!.biography![0].sourceUrl, sourceLabel: expanded!.biography![0].sourceLabel,
    evidenceKind: 'first-party',
  }];
  return { ...existing, slug, checkedAt, claims: [...priorClaims, ...claims], pending, ...changes };
}

export const artistMembershipEvidenceFinal: ArtistMembershipEvidence[] = [
  review('tilly-birds', [
    credit('management', 'current', 'Kruengkao ซึ่งระบุว่าทำธุรกิจบริหารศิลปิน เผยแพร่โปรไฟล์ Tilly Birds พร้อมผลงานและทัวร์ปี 2569; แหล่งนี้ยืนยันบทบาทผู้ดูแลที่เผยแพร่ต่อสาธารณะ', 'https://www.kruengkao.com/en/artist/tilly-birds', 'Kruengkao — Tilly Birds'),
  ], ['สมาชิกสามคนยืนยันจากเว็บไซต์วงและผู้ดูแลแล้ว; ยังไม่พบประกาศปี 2569 ที่ยืนยันสัญญาค่ายเพลง GeneLab หรือผู้จัดจำหน่ายทั้งหมด จึงไม่อนุมานจากรายชื่อผู้ดูแล']),
  review('three-man-down', [], ['Kruengkao ยังเผยแพร่สมาชิกสี่คนและผลงานถึงมีนาคม 2569; การเริ่มกับ GeneLab เป็นประวัติเดิม ยังไม่พบประกาศปี 2569 ที่แจกแจงการเปลี่ยนสัญญาค่ายเพลง/ผู้จัดจำหน่าย']),
  review('phum-viphurit', [
    credit('label', 'current', 'ประวัติในโปรไฟล์ Spotify ของ Phum Viphurit ระบุว่าเขาทำงานเป็นศิลปินอิสระ และแยกการเริ่มกับ Rats Records ปี 2557 เป็นประวัติเดิม', phum, 'Phum Viphurit — ประวัติศิลปินบน Spotify'),
    credit('career', 'historical', 'ประวัติศิลปินระบุ Paul Vibhavadi Vol. 1 ในปี 2567 เป็นผลงานอิสระชุดแรกของเขา ไม่ได้ระบุวันสิ้นสุดสัญญา Rats Records', phum, 'Phum Viphurit — ประวัติศิลปินบน Spotify', '2024'),
  ], [], { biographyAdditions: [{
    heading: 'ผลงานอิสระและ Paul Vibhavadi',
    body: 'ประวัติที่เผยแพร่ในโปรไฟล์ Spotify ของ Phum Viphurit ระบุว่าเขาออก Paul Vibhavadi Vol. 1 ในปี 2567 เป็นผลงานอิสระชุดแรก โดยนำอิทธิพลเฮาส์และแทรนซ์มาสร้างเสียงดนตรีผ่านตัวตน Paul Vibhavadi และระบุว่าทำงานเป็นศิลปินอิสระ ข้อมูลการเริ่มกับ Rats Records ในปี 2557 จึงเป็นช่วงก่อนหน้า แหล่งนี้ไม่ได้เปิดเผยวันสิ้นสุดสัญญาหรือรายละเอียดสัญญาการจัดจำหน่ายทุกผลงาน',
    sourceUrl: phum, sourceLabel: 'Phum Viphurit — ประวัติศิลปินบน Spotify',
  }] }),
  review('violette-wautier', [
    credit('label', 'current', 'Universal Music Thailand เผยแพร่ Violette Wautier ในหน้า Domestic Artists ของค่ายไทย; โปรไฟล์ค่ายอธิบายการเริ่มทำงานร่วมกันตั้งแต่ปี 2561 และผลงานถึงปี 2568', domestic, 'Universal Music Thailand — Domestic Artists'),
    credit('career', 'historical', 'หน้าแนะนำศิลปินของ Universal Music Thailand ระบุเริ่มเส้นทางกับบริษัทในปี 2561; ไม่ใช้ปีเริ่มต้นแทนระยะเวลาสัญญาทั้งหมด', 'https://umusic.co.th/collections/violette-wautier', 'Universal Music Thailand — Violette Wautier', '2018'),
  ], []),
  review('scrubb', [
    credit('label', 'current', 'เว็บไซต์ Universal Music Thailand เผยแพร่ SCRUBB ในหน้า Domestic Artists ของค่ายไทย พร้อมเชื่อมหน้าผลงานและสินค้าของวง; บทบาทนี้แยกจากหน้า Universal Japan', domestic, 'Universal Music Thailand — Domestic Artists'),
  ], []),
  review('nene', [
    credit('label', 'current', 'Sony Music Entertainment China เผยแพร่ Nene郑乃馨 ในหมวดศิลปินทางการภาษาจีน (华语); ข้อมูลนี้ยืนยันการอยู่ในรายชื่อที่ค่ายจีนเผยแพร่ ไม่ได้ระบุบริษัทจัดการในไทย', 'https://sonymusic.com.cn/%E5%8D%8E%E8%AF%AD/', 'Sony Music Entertainment China — ศิลปินทางการภาษาจีน'),
  ], []),
  review('pp-krit', [
    credit('label', 'historical', 'เครดิต เก่งไม่พอ GOOD (not) ENOUGH ระบุสิทธิ์สิ่งบันทึกเสียงปี 2569 ในนาม PP Krit ENTERTAINMENT CO., LTD. ยืนยันบทบาทบริษัทสำหรับเพลงนี้', pp, 'Apple Music — เครดิตที่ผู้เผยแพร่เพลงส่งมา', '2026-05-25'),
    credit('distribution', 'historical', 'เพลงเดียวกันระบุ Universal Music (Thailand) Ltd. เป็นผู้จัดจำหน่ายแบบ exclusive สำหรับผลงานนี้ ไม่ใช้ขยายเป็นสัญญาทุกผลงานหรือสัญญาบริหารศิลปิน', pp, 'Apple Music — เก่งไม่พอ GOOD (not) ENOUGH', '2026-05-25'),
  ], ['มีเครดิตบริษัทเพลงและผู้จัดจำหน่ายไทยปี 2569 แล้ว; ยังไม่มีประกาศรายชื่อหรือสัญญาบริหารศิลปินปัจจุบันที่อ่านยืนยันได้ จึงไม่อ้างว่า Universal เป็นผู้จัดการหรือเป็นเจ้าของ PP Krit Entertainment']),
  review('billkin', [
    credit('label', 'historical', 'เครดิต CHECKLIST ระบุสิทธิ์สิ่งบันทึกเสียงปี 2569 ในนาม BILLKIN ENTERTAINMENT CO., LTD.; เป็นหลักฐานบทบาทบริษัทในเพลงนี้', billkin, 'Spotify — เครดิต CHECKLIST', '2026-09-08'),
    credit('distribution', 'historical', 'CHECKLIST ระบุ Universal Music (Thailand) Ltd. เป็นผู้จัดจำหน่ายแบบ exclusive ของผลงานนี้ แยกจากผู้จัดจำหน่ายในญี่ปุ่นและบทบาทบริหารศิลปิน', billkin, 'Spotify — เครดิต CHECKLIST', '2026-09-08'),
  ], ['เครดิตเพลงและผู้จัดจำหน่ายไทยปี 2569 ยืนยันได้แล้ว; ยังไม่เปิดเผยขอบเขตสัญญาบริหารศิลปินหรือสัญญาของผลงานอื่น จึงไม่ใช้เครดิตเพลงแทนข้อมูลเหล่านั้น']),
  review('nunew', [
    credit('label', 'historical', 'เครดิต ปักใจ (Still) ระบุสิทธิ์สิ่งบันทึกเสียงปี 2569 ในนาม DMD MUSIC สำหรับเพลงประกอบ ภพเธอ Love Upon a Time', nunew, 'Spotify — เครดิต ปักใจ (Still)', '2026-05-20'),
    credit('distribution', 'historical', 'เพลงนี้ระบุ Universal Music (Thailand) Ltd. เป็นผู้จัดจำหน่ายแบบ exclusive; ไม่ใช้แทนสังกัดผู้จัดการหรือสถานะบริษัท DMD', nunew, 'Spotify — เครดิต ปักใจ (Still)', '2026-05-20'),
  ], ['มีเครดิต DMD MUSIC และการจัดจำหน่ายไทยปี 2569; ยังต้องประกาศ/รายชื่อผู้ดูแลศิลปินที่ลงวันที่หากจะแสดงสังกัดการบริหารปัจจุบัน']),
  review('potato', [
    credit('members', 'historical', 'ข่าว POTATO วันที่ 7 สิงหาคม 2569 ระบุสมาชิกทั้งห้าคน แต่ไม่ได้แจกแจงรายชื่อและหน้าที่ครบชุด', gmm(10436), 'GMM Music — ข่าว POTATO', '2026-08-07'),
    credit('label', 'current', 'ข่าว GMM Music เดือนกรกฎาคม 2569 จัด POTATO ในกลุ่มศิลปินของบริษัท; ไม่ได้แจกแจงรายละเอียดสัญญาค่ายย่อย', gmm(10418), 'GMM Music — รายชื่อศิลปินของบริษัท', '2026-07-08'),
  ], ['จำนวนสมาชิกห้าคนมีหลักฐานปี 2569; ยังต้องรายชื่อพร้อมหน้าที่ครบชุดและประกาศค่ายย่อยล่าสุด ไม่แปลงจำนวนคนเป็นรายชื่อที่ตรวจครบแล้ว']),
  review('klear', [
    credit('label', 'current', 'GMM Music เผยแพร่ KLEAR ในกลุ่มศิลปินของบริษัทในข่าวเดือนกรกฎาคม 2569; ข้อมูลไม่แจกแจงค่ายย่อย', gmm(10418), 'GMM Music — รายชื่อศิลปินของบริษัท', '2026-07-08'),
  ], ['สมาชิกที่บันทึกเดิมเป็นรายชื่อในประกาศปี 2565; ข่าวปี 2569 ระบุบริษัทแต่ไม่ยืนยันรายชื่อสมาชิกครบชุดหรือค่ายย่อยปัจจุบัน']),
  review('num-kala', [
    credit('label', 'historical', 'ข่าวบริษัทปลายปี 2568 ระบุ หนุ่ม ณพสิน เป็นหนึ่งในศิลปิน GMM Music ที่ร่วมกิจกรรมกาชาด ใช้ยืนยันบทบาทในช่วงข่าวนั้น', gmm(10356), 'GMM Music — กิจกรรมกาชาดปี 2568', '2025-12-19'),
  ], ['มีหลักฐาน GMM Music ปลายปี 2568; ยังไม่พบประกาศสังกัด/ค่ายย่อยปี 2569 ที่ชัด จึงคง genie records ในประวัติเดิม']),
  review('lomosonic', [
    credit('members', 'current', 'ข่าวค่ายวันที่ 28 กันยายน 2569 ระบุสมาชิก บอย ร้องนำ ป้อม กีตาร์ ปิติ กีตาร์ และออตโต้ กลองครบสี่คน', gmm(10462), 'GMM Music — LOMOSONIC', '2026-09-28'),
    credit('label', 'current', 'ข่าวเดียวกันระบุ LOMOSONIC อยู่ภายใต้ genie records', gmm(10462), 'GMM Music — LOMOSONIC', '2026-09-28'),
  ], []),
  review('lykn', [
    credit('members', 'current', 'ประวัติของ Universal Music Japan ระบุ William, Lego, Tui, Hong และ Nut รวมห้าคน พร้อมแผนเวิลด์ทัวร์ปี 2569', 'https://www.universal-music.co.jp/lykn/biography/', 'Universal Music Japan — LYKN'),
    credit('label', 'current', 'ประวัติเดียวกันระบุ RISER MUSIC เป็นค่ายเพลงของ LYKN และแยก Universal International เป็นบทบาทเผยแพร่ในญี่ปุ่น', 'https://www.universal-music.co.jp/lykn/biography/', 'Universal Music Japan — LYKN'),
  ], []),
  review('joey-boy', [
    credit('label', 'historical', 'เครดิต ฉีมาหา ที่เผยแพร่ 9 เมษายน 2569 ระบุสิทธิ์สิ่งบันทึกเสียง GANCORE CLUB ใช้ยืนยันบทบาทผู้เผยแพร่สำหรับเพลงนี้', 'https://music.apple.com/us/album/%E0%B8%89-%E0%B8%A1%E0%B8%B2%E0%B8%AB%E0%B8%B2-feat-gunner-%E0%B9%83%E0%B8%AB%E0%B8%A1-%E0%B8%9E-%E0%B8%8A%E0%B8%A3-single/1891617719', 'Apple Music — เครดิตเพลง Joey Boy', '2026-04-09'),
  ], ['เครดิต GANCORE CLUB ปี 2569 ไม่ระบุรายละเอียดสัญญาค่ายเพลงหรือผู้จัดการปัจจุบัน; ไม่ใช้ข่าว/เครดิตก้านคอคลับเก่าแทนสัญญารายบุคคล']),
  review('d-gerrard', [
    credit('label', 'historical', 'เครดิต Astronomy ที่เผยแพร่ 20 พฤษภาคม 2569 ระบุสิทธิ์สิ่งบันทึกเสียง D Gerrard ไม่ใช่ Warner Music Thailand; ข้อมูลจำกัดที่อัลบั้มนี้', 'https://music.apple.com/us/album/astronomy/6769315644', 'Apple Music — เครดิต Astronomy', '2026-05-20'),
  ], ['เครดิตอัลบั้มใหม่ใช้ชื่อ D Gerrard; ยังไม่พบประกาศต้นทางวันสิ้นสุดสัญญา Warner หรือรายละเอียดผู้จัดการปัจจุบัน จึงไม่ยกเครดิตข่าว Warner ปี 2566–2567 เป็นสถานะปี 2569']),
  review('offroad-kantapon', [
    credit('distribution', 'historical', 'ONE MUSIC เผยแพร่มิวสิกวิดีโอ ฉันไม่รู้จักชื่อดอกไม้ (แต่จะหามาให้เธอ) วันที่ 2 กันยายน 2569 พร้อมบัญชีศิลปินและแท็ก OPENLABEL; ยืนยันช่องทางเผยแพร่ของผลงานนี้', 'https://www.youtube.com/watch?v=nnd0zhhsmvs', 'ONE MUSIC — OFFROAD KANTAPON Official MV', '2026-09-02'),
  ], ['มีผลงานเดี่ยวผ่าน ONE MUSIC ปี 2569 แล้ว; แท็ก OPENLABEL ไม่ใช่รายละเอียดสัญญาบริหารหรือหลักฐานสถานะ LAZ1 ปัจจุบัน จึงยังต้องประกาศผู้ดูแล/วงที่ระบุบทบาทชัด']),
];
