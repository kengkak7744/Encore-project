import type { ArtistMembershipEvidence } from './artist-membership-evidence.js';
import type { ArtistImageEvidenceSupplementRow } from './artist-image-evidence-supplement.js';

// Dated public observations. Publication dates do not establish ongoing contracts.
const checkedAt='2026-10-18T06:12:00Z';
const hens='https://www.whattheduckmusic.com/post/หาก-what-if';
const flamingo='https://www.whattheduckmusic.com/post/เพราะว่าฉันรักเธอ-มากเกินไป-trust';
const sarah='https://www.youtube.com/watch?v=vbMNDiTh4HA';
export const artistMembershipOct18: ArtistMembershipEvidence[] = [
  {slug:'hens',checkedAt,claims:[
    {kind:'members',status:'historical',text:'ข่าว หาก (What If) ของค่ายวันที่ 4 เมษายน 2566 ระบุ HENS สี่คน: ปู๋ ปิยวัฒน์ มีเครือ ร้องนำ, โฟร์ ประทีป สิริอิสสระนันท์ กีตาร์, บัง เอกสิริ กำบังภัย เบส และจ๊อบ กฤตพงศ์ สกุลนามอเนก กลอง เป็นรายชื่อและหน้าที่ในช่วงข่าวนั้น',sourceUrl:hens,sourceLabel:'What The Duck — HENS, หาก (What If)',publishedAt:'2023-04-04',evidenceKind:'first-party'},
    {kind:'label',status:'historical',text:'ข่าวค่ายวันที่ 4 เมษายน 2566 ระบุ HENS อยู่กับ What The Duck; ไม่ใช้ประกาศปี 2566 ยืนยันวันเริ่มหรือสิ้นสุดสัญญาปัจจุบัน',sourceUrl:hens,sourceLabel:'What The Duck — dated HENS label statement',publishedAt:'2023-04-04',evidenceKind:'first-party'},
  ],pending:['มีรายชื่อพร้อมหน้าที่จากข่าว 4 เมษายน 2566 เพิ่มแล้ว แต่ยังไม่มีประกาศวันเปลี่ยนสมาชิกหรือขอบเขตสัญญาหลังจากนั้น']},
  {slug:'de-flamingo',checkedAt,claims:[
    {kind:'members',status:'historical',text:'ข่าว TRUST วันที่ 26 ตุลาคม 2566 ระบุ De Flamingo สี่คน: โบนัส ปรินทร์ ดุงโคกกรวด ร้องนำและกีตาร์, ปอม กิจพัฒน์ เย็นฤดี กีตาร์, จา สันติสุข วรนุชกุล เบส และบีม กริชภวุฒิ ลิ้มติ้ว กลอง ใช้เป็นรายชื่อในช่วงประกาศ',sourceUrl:flamingo,sourceLabel:'What The Duck — De Flamingo, TRUST',publishedAt:'2023-10-26',evidenceKind:'first-party'},
    {kind:'label',status:'historical',text:'ข่าว TRUST วันที่ 26 ตุลาคม 2566 เรียก De Flamingo ว่าอยู่ภายใต้ What The Duck; ไม่อนุมานรายละเอียดสัญญาหรือสถานะสมาชิกปี 2569 จากข่าวปี 2566',sourceUrl:flamingo,sourceLabel:'What The Duck — dated De Flamingo label statement',publishedAt:'2023-10-26',evidenceKind:'first-party'},
  ],pending:['หลักฐานรายชื่อ/ค่ายที่เพิ่มมีวันที่ 26 ตุลาคม 2566 ยังไม่แทนประกาศการเปลี่ยนสมาชิกหรือสัญญาปี 2569']},
  {slug:'potato',checkedAt,claims:[
    {kind:'label',status:'historical',text:'ข่าว GMM Music วันที่ 9 มกราคม 2569 ระบุ POTATO จากค่าย genie records ในการเปิดตัวเพลง ยินดี เป็นหลักฐานค่ายย่อยในช่วงผลงานนี้ ไม่ใช่รายละเอียดสัญญาทั้งหมด',sourceUrl:'https://www.gmmgrammy.com/newsroom/news-single.php?id=10357',sourceLabel:'GMM Music — POTATO ยินดี, 9 January 2026',publishedAt:'2026-01-09',evidenceKind:'first-party'},
    {kind:'career',status:'historical',text:'ข่าว BLACK DOT วันที่ 16 ตุลาคม 2569 ระบุ Sweet Mullet เป็นวงร่วมค่ายที่มาฟีเจอริงกับ POTATO และแม็ก The Darkest Romance เป็นโปรดิวเซอร์ของผลงาน ไม่ใช่ประกาศเพิ่มทั้งสองเป็นสมาชิก POTATO',sourceUrl:'https://www.gmmgrammy.com/newsroom/news-single.php?id=10478',sourceLabel:'GMM Music — POTATO / Sweet Mullet BLACK DOT',publishedAt:'2026-10-16',evidenceKind:'first-party'},
  ],pending:['เพิ่มหลักฐาน genie records เดือนมกราคม 2569 และบทบาทผู้ร่วมงานเดือนตุลาคมแล้ว แต่รายชื่อพร้อมหน้าที่สมาชิกครบชุดและขอบเขตสัญญายังต้องตรวจแยก']},
  {slug:'sarah-salola',checkedAt,claims:[
    {kind:'career',status:'historical',text:'มิวสิกวิดีโอ หน้าที่ฉัน (If you don’t mind) จากช่อง sarah salola ระบุวันเผยแพร่ 18 มิถุนายน 2569 และ Sarah เป็นศิลปิน/ผู้แสดงในผลงาน โจริญ 4EVE เป็นผู้ร่วมแสดง ไม่ใช่การประกาศสมาชิกวงหรือย้ายค่าย',sourceUrl:sarah,sourceLabel:'sarah salola — หน้าที่ฉัน official MV',publishedAt:'2026-06-18',evidenceKind:'first-party'},
  ],pending:['วันเผยแพร่ MV ใช้ระบุผลงานนี้เท่านั้น ไม่ใช่วันเริ่มสัญญาสังกัดหรือการบริหารศิลปิน']},
  {slug:'jeep',checkedAt,claims:[
    {kind:'management',status:'historical',text:'เครดิต MV หน้าที่ฉัน (If you don’t mind) ที่เผยแพร่ 18 มิถุนายน 2569 ระบุชื่อ JEEP ในบทบาท Executive Director ของผลงานนี้ ไม่ใช้เครดิตโครงการยืนยันตำแหน่งบริษัทหรือขอบเขตการบริหารปัจจุบัน',sourceUrl:sarah,sourceLabel:'sarah salola — dated project credit naming JEEP',publishedAt:'2026-06-18',evidenceKind:'first-party'},
  ],pending:['Executive Director เป็นคำตามเครดิตผลงาน ไม่ใช่หลักฐานตำแหน่งกรรมการบริษัทหรือผู้จัดการศิลปินทุกงาน']},
];

// These ten metadata searches completed; MILLI hit429, and later searches were not made.
export const artistImageReviewsOct18: ArtistImageEvidenceSupplementRow[] = [
  'chart-suchart','copter','de-flamingo','fetch','gabe-watkins','hens','hers','jeep','loserpop','mean-band',
].map(slug=>({slug,status:'unverified',verifiedAt:checkedAt,reason:'ค้น metadata ของ Wikimedia Commons วันที่ 18 ตุลาคม 2569 แล้วยังไม่ได้ภาพที่ยืนยันตัวศิลปินและสิทธิ์ใช้ซ้ำครบ ผลชื่อซ้ำ/บุคคลอื่น/เอกสารไม่ใช้แทนภาพศิลปิน; ชุดค้นหยุดเมื่อพบ429ที่รายการถัดไป ไม่ได้ยืนยันว่าไม่มีภาพที่ใช้ได้จากทุกแหล่ง'}));
