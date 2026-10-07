import type { ArtistImageEvidenceSupplementRow } from './artist-image-evidence-supplement.js';

// Reuse grants belong to the full videos, not to their YouTube thumbnails.
// Preserve historical captions: a frame does not establish today's roster.
const checkedAt = '2026-10-05T14:42:00Z';
const videoFrame = (slug: string, id: string, title: string, published: string,
  time: number, caption: string, creator = 'THHeadline', verifiedAt = checkedAt): ArtistImageEvidenceSupplementRow => ({
  slug, status: 'verified-license', imageUrl: `/artist-images/${slug}-interview-${published.slice(0, 4)}.png`,
  sourceUrl: `https://www.youtube.com/watch?v=${id}`, creator,
  fileTitle: title, license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  verifiedAt, photoDate: `วิดีโอเผยแพร่ ${published}; ไม่ทราบวันถ่าย`,
  identityEvidence: `ชื่อและเนื้อหาบทสัมภาษณ์ระบุ ${slug.toUpperCase()}; ตรวจเฟรมที่ถอดรหัสจากวิดีโอจริงแล้ว`,
  credit: `${creator} — ${title}`, attributionRequired: true,
  changes: `Extracted one full decoded video frame at ${time.toFixed(3)} seconds to PNG; no additional cropping, retouching or AI alteration. Original graphics retained.`,
  notes: 'Historical interview frame for an informational profile; does not establish current membership or endorsement. URL check refers to the original video watch page; static image serving is checked separately on deployment.',
  originalSourceUrls: [`https://www.youtube.com/watch?v=${id}`, 'https://support.google.com/youtube/answer/2797468?hl=en'],
  licenseReviewPending: false,
  permissionEvidence: 'Original publisher video metadata contains a License row: Creative Commons Attribution license (reuse allowed). YouTube current license documentation links CC BY 4.0. Grant checked 5 October 2026; do not infer the license on the original publication date.',
  caption, ...(slug === 'num-kala' ? {} : { imageKind: 'group-context' as const }),
  urlCheck: { checkedAt: verifiedAt, status: 200, contentType: 'text/html' },
});

export const artistImageEvidenceFinal: ArtistImageEvidenceSupplementRow[] = [
  videoFrame('atlas', '8bM1lzxSaY8', '[ENG SUB] THHeadline X ATLAS | Exclusive Interview', '2022-06-30', 11.983091,
    'ATLAS ในบทสัมภาษณ์ปี 2565: ภาพสมาชิก 7 คนในเวลานั้น ไม่ใช่หลักฐานรายชื่อสมาชิกปัจจุบัน'),
  videoFrame('bus', 'a2yjKAm5Gdo', 'สัมภาษณ์ BUS ใน GQ MEN OF THE YEAR 2024', '2024-11-28', 16.984296,
    'BUS ในงาน GQ MEN OF THE YEAR 2024: เฟรมบทสัมภาษณ์เห็นสมาชิกบางส่วน ไม่ใช่ภาพรายชื่อครบวง'),
  videoFrame('dept', 'DdonpxzQ5kA', 'THHeadline X DEPT | Special Interview', '2022-12-21', 36.975031,
    'Dept ในบทสัมภาษณ์ที่เผยแพร่ปี 2565: ภาพประกอบตามช่วงเวลา ไม่ยืนยันสังกัดปัจจุบัน'),
  videoFrame('lomosonic', 'RcNRMWKqFOA', 'INTERVIEW เพราะความรักมันไม่เลือกเวลาเกิด — LOMOSONIC', '2015-11-02', 36.972779,
    'LOMOSONIC ร่วมบทสัมภาษณ์กับพิธีกร SEED ปี 2558; บุคคลในภาพไม่ใช่รายชื่อสมาชิกปัจจุบัน', 'SEEDMCOT', '2026-10-05T14:55:30Z'),
  videoFrame('klear', 'yxKtq2qL9fY', 'INTERVIEW สิ่งของ — KLEAR', '2015-11-02', 36.979235,
    'KLEAR ร่วมบทสัมภาษณ์กับทีม SEED ปี 2558; ภาพมีผู้สัมภาษณ์ด้วย ไม่ใช่รายชื่อสมาชิกปัจจุบัน', 'SEEDMCOT', '2026-10-05T14:55:30Z'),
  videoFrame('num-kala', 'j0I68CnWaYY', 'ทำตัวไม่ถูก! "หนุ่ม กะลา" เมาท์เมีย ท้อง 5 เดือนแล้วเปลี่ยนไป โทร. ตามยิกๆ ให้กลับบ้าน', '2019-11-12', 21.979408,
    'NUM KALA ในบทสัมภาษณ์เผยแพร่เดือนพฤศจิกายน 2562; ไม่ใช่ภาพปัจจุบัน', 'MGR Online VDO', '2026-10-05T14:55:30Z'),
  {
    slug: 'urboytj', status: 'verified-license',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Urboy_TJ_at_Sanamluang_Suan_Sanarm_Festival_2019.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Urboy_TJ_at_Sanamluang_Suan_Sanarm_Festival_2019.jpg',
    creator: 'Sry85', fileTitle: 'Urboy TJ at Sanamluang Suan Sanarm Festival 2019',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    verifiedAt: checkedAt, photoDate: '2019-10-20 23:49:01',
    identityEvidence: 'Commons file description identifies Urboy TJ performing at Sanamluang Suan Sanarm Festival 2019; photo visually checked.',
    credit: 'Sry85 — Own work', attributionRequired: true,
    changes: 'Display original Commons JPEG without additional cropping or editing.',
    notes: 'Historical performance photo; not evidence of current label affiliation or endorsement.',
    originalSourceUrls: [], licenseReviewPending: false,
    permissionEvidence: 'Commons revision 903806200: uploader Sry85 declares own work and grants self|cc-by-sa-4.0; date agrees with EXIF.',
    caption: 'URBOYTJ แสดงในงาน Sanamluang Suan Sanarm Festival ปี 2562',
    urlCheck: { checkedAt: '2026-10-05T12:13:46.894Z', status: 200, contentType: 'image/jpeg' },
  },
  { slug: 'milli', status: 'unverified', verifiedAt: '2026-10-05T14:55:30Z', reason: 'บทสัมภาษณ์ต้นทางที่ตรวจไม่มีข้ออนุญาตใช้ซ้ำ; วิดีโอข่าว MGR แม้มี CC BY แต่ใช้ภาพแสดง Coachella โดยไม่ระบุผู้ถ่าย/แหล่งภาพในเฟรมที่ตรวจ จึงยังไม่ยืนยันสิทธิ์ภาพที่ประกอบอยู่ในข่าว' },
  { slug: 'only-monday', status: 'unverified', verifiedAt: '2026-10-05T14:55:30Z', reason: 'บทสัมภาษณ์ THHeadline ที่ตรวจไม่มี License row เปิดใช้ซ้ำ และยังไม่มีหนังสืออนุญาต/ภาพที่ถ่ายเอง' },
];
