import type { BiographySection } from './artist-biographies.js';

// Public statements and published rosters, checked without Meta Graph API requests.
// "current" means the named source currently publishes the claim; it is not a contract audit.
export type ArtistMembershipClaim = {
  kind: 'members' | 'label' | 'management' | 'distribution' | 'career';
  status: 'current' | 'historical' | 'unclear';
  text: string;
  sourceUrl: string;
  sourceLabel: string;
  publishedAt?: string;
  evidenceKind: 'first-party' | 'artist-interview' | 'primary-document-reproduction';
  reproductionUrl?: string;
};
export type ArtistMembershipEvidence = {
  slug: string;
  checkedAt: string;
  claims: ArtistMembershipClaim[];
  pending: string[];
  biographyAdditions?: BiographySection[];
  corrections?: {
    shortBio?: { oldText: string; newText: string };
    sections?: { oldHeading: string; newHeading: string; oldBody: string; newBody: string }[];
  };
};

type ClaimKind = ArtistMembershipClaim['kind'];
type ClaimStatus = ArtistMembershipClaim['status'];
const checkedAt = '2026-10-04';
const gmm = (id: number) => `https://www.gmmgrammy.com/newsroom/news-single.php?id=${id}`;
const wtd = 'https://www.whattheduckmusic.com/a';
const fourEve = 'https://www.youtube.com/watch?v=hnwGAz5Q4PA';
const onlyMondayStatement = 'https://www.facebook.com/permalink.php?id=100063624638349&story_fbid=pfbid0sFtMPW724Ky4gX9nxaqP2hRWNYXciopadvvvegEWh5AjA5jFNfLr6hC6kVLXokz2l';
const onlyMondayImage = 'https://thethaiger.com/th/wp-content/uploads/2026/02/Only-Monday-%E0%B9%82%E0%B8%9E%E0%B8%AA%E0%B8%95%E0%B9%8C.jpg';
const atlasInterview = 'https://ellethailand.com/atlas-tell-me-now-interview/';
const claim = (kind: ClaimKind, status: ClaimStatus, text: string, sourceUrl: string,
  sourceLabel: string, publishedAt?: string): ArtistMembershipClaim => ({
  kind, status, text, sourceUrl, sourceLabel, evidenceKind: 'first-party',
  ...(publishedAt ? { publishedAt } : {}),
});
const entry = (slug: string, claims: ArtistMembershipClaim[], pending: string[] = []): ArtistMembershipEvidence => ({
  slug, checkedAt, claims, pending,
});

export const artistMembershipEvidence: ArtistMembershipEvidence[] = [
  entry('bodyslam', [
    claim('members', 'historical', 'ข่าวค่ายวันที่ 8 พฤษภาคม 2561 ระบุสมาชิก ตูน ปิ๊ด ยอด ชัช และโอม', gmm(4846), 'GMM Music', '2018-05-08'),
    claim('label', 'current', 'ข่าว GMM Music เดือนกรกฎาคม 2569 ยังนำเสนอ bodyslam ในกลุ่มศิลปินของบริษัท แต่ไม่ได้แจกแจงสัญญารายค่าย', gmm(10418), 'GMM Music', '2026-07-08'),
  ], ['ยังไม่มีประกาศรายชื่อสมาชิกครบชุดปี 2569 ที่อ่านยืนยันได้ จึงไม่ย้ายรายชื่อปี 2561 เป็นรายชื่อปัจจุบัน']),
  entry('tilly-birds', [
    claim('members', 'current', 'เว็บไซต์วงระบุ 3RD ร้องนำและเขียนเนื้อร้อง Billy กีตาร์และโปรดิวซ์ และ Milo กลอง', 'https://www.tillybirds.com/about', 'เว็บไซต์ Tilly Birds'),
  ], ['เว็บไซต์วงยืนยันสมาชิก แต่ยังไม่ยืนยันสถานะสัญญา GeneLab/Bridge และการจัดการศิลปินในปี 2569']),
  entry('three-man-down', [
    claim('members', 'current', 'หน้าแนะนำวงของ Kruengkao ระบุสมาชิกสี่คน: กิต ร้องนำ ตูน กีตาร์ เต กลอง และเส็ง คีย์บอร์ด/ซินธิไซเซอร์', 'https://www.kruengkao.com/en/artist/three-man-down', 'Kruengkao Group'),
    claim('management', 'current', 'Kruengkao เผยแพร่โปรไฟล์วงในหมวด Bridge พร้อมผลงานจนถึงคอนเสิร์ตเดือนมีนาคม 2569', 'https://www.kruengkao.com/en/artist/three-man-down', 'Kruengkao Group'),
    claim('label', 'historical', 'หน้าแนะนำเดียวกันบันทึกการเริ่มต้นกับ GeneLab หลังชนะ Band Lab ปี 2561', 'https://www.kruengkao.com/en/artist/three-man-down', 'Kruengkao Group'),
  ], ['รายชื่อในเว็บไซต์ผู้ดูแลไม่ใช่หลักฐานวันสิ้นสุดสัญญาจัดจำหน่ายหรือสัญญาเดิมกับ GeneLab']),
  entry('cocktail', [
    claim('members', 'historical', 'ประวัติที่ Universal Music เผยแพร่ระบุ โอม เชาว์ ปาร์ค และฟิลิปส์ ใช้อ้างอิงโครงสร้างวงในช่วงผลงานที่หน้านั้นบันทึก', 'https://universalmusic.fr/artistes/36484961805', 'Universal Music France'),
    claim('career', 'historical', 'ผู้จัด Kruengkao ระบุ COCKTAIL 77 EVER TOUR เป็นทัวร์ครั้งสุดท้าย ครอบคลุม 77 จังหวัดระหว่าง 26 เมษายน–24 ธันวาคม 2568', 'https://www.kruengkao.com/service', 'Kruengkao — COCKTAIL 77 EVER TOUR', '2025-12-24'),
  ], ['คำว่าทัวร์ครั้งสุดท้ายไม่ยืนยันวันยุบวงหรือสถานะสัญญาของสมาชิกในปี 2569']),
  entry('slot-machine', [
    claim('members', 'current', 'เว็บไซต์วงระบุสามคน: Foet/Karinyawat Durongjirakan ร้องนำ Gak/Atirath Pintong เบส และ Vit/Janevit Chanpanyawong กีตาร์', 'https://slotmachine.band/bio.php', 'เว็บไซต์ Slot Machine'),
  ]),
  entry('getsunova', [
    claim('members', 'historical', 'ข่าวค่ายวันที่ 6 ธันวาคม 2567 ระบุสมาชิกสี่คน เนม ปณต ไปร์ท และนาฑี', gmm(10199), 'GMM Music / White Music', '2024-12-06'),
    claim('label', 'historical', 'ข่าวกิจกรรมดังกล่าวระบุ White Music ในเครือ GMM Music', gmm(10199), 'GMM Music / White Music', '2024-12-06'),
  ], ['ยังต้องประกาศหรือเครดิตใหม่ที่แจกแจงสมาชิกครบทั้งสี่และค่ายในปี 2569']),
  entry('polycat', [
    claim('members', 'current', 'หน้า Smallroom ระบุ นะ ร้องนำ เพียว เบส และโต้ง คีย์บอร์ด', 'https://smallroom.co.th/artist/1/polycat', 'Smallroom'),
    claim('label', 'current', 'Smallroom เผยแพร่ POLYCAT ในรายชื่อศิลปินของค่าย', 'https://smallroom.co.th/artist/1/polycat', 'Smallroom'),
  ]),
  entry('4eve', [
    claim('members', 'current', 'เครดิต MY CHAINZ วันที่ 30 เมษายน 2569 ระบุสมาชิกครบเจ็ดคน: มายด์ โจริญ ตาออม แฮนน่า ฝ้าย พั้นช์ และอ๊ะอาย พร้อมบัญชีของแต่ละคน', fourEve, '4EVE — MY CHAINZ Official MV', '2026-04-30'),
    claim('label', 'current', 'เครดิตผลงานปี 2569 ระบุ Music Production by XOXO Entertainment', fourEve, '4EVE — MY CHAINZ Official MV', '2026-04-30'),
  ]),
  entry('bus', [
    claim('members', 'current', 'เว็บไซต์ BUS ระบุสิบสองคน: ALAN HEART NEX AA MARCKRIS JINWOOK PHUTATCHAI JUNGT KHUNPOL THAI COPPER และ PEEMWASU', 'https://www.busofficialmembership.com/th/', 'เว็บไซต์ทางการ BUS'),
    claim('management', 'current', 'เว็บไซต์สมาชิกอย่างเป็นทางการระบุ SONRAY และกิจกรรมที่ SONRAY จัด', 'https://www.busofficialmembership.com/th/', 'เว็บไซต์ทางการ BUS / SONRAY'),
  ]),
  {
    ...entry('proxie', [
      claim('members', 'current', 'เครดิต Don’t Rush! วันที่ 21 มกราคม 2569 ระบุ Gun Kim Chokun Gorn Onglee และ Victor ครบหกคน', 'https://www.youtube.com/watch?v=nYnIn4gUPk0', 'PROXIE — Don’t Rush! Official MV', '2026-01-21'),
      claim('management', 'historical', 'เครดิตมิวสิกวิดีโอปี 2569 ระบุ Dreamers Dream Team ในทีมทำงาน จึงยืนยันการทำงานร่วมกันในผลงานนี้', 'https://www.youtube.com/watch?v=nYnIn4gUPk0', 'PROXIE — Don’t Rush! Official MV', '2026-01-21'),
      claim('distribution', 'historical', 'เครดิตเผยแพร่ Don’t Rush! ระบุ bROTHERS MUSIC เป็นผู้ให้เพลงแก่ YouTube', 'https://www.youtube.com/watch?v=gO3saqWtUk0', 'PROXIE — เพลงจากผู้เผยแพร่อย่างเป็นทางการ', '2026-01-21'),
    ], ['เครดิตเพลงและทีมงานไม่ยืนยันสัญญาบริหารศิลปินแบบผูกขาดหรือสถานะยูนิต VOC ปัจจุบัน']),
    biographyAdditions: [{ heading: 'สมาชิกในเครดิตผลงานปี 2569', body: 'มิวสิกวิดีโอ “ไม่รีบงับป๋ม (Don’t Rush!)” ที่เผยแพร่วันที่ 21 มกราคม 2569 ระบุสมาชิก PROXIE ครบหกคน ได้แก่ กัน คิม โชกุน กร อองรี และวิคเตอร์ เครดิตเดียวกันระบุทีม Dreamers Dream Team ในการผลิตผลงาน ส่วนชื่อ bROTHERS MUSIC เป็นเครดิตด้านเพลง ไม่ได้ใช้แทนการยืนยันรายละเอียดสัญญาจัดการศิลปิน', sourceUrl: 'https://www.youtube.com/watch?v=nYnIn4gUPk0', sourceLabel: 'PROXIE — Don’t Rush! Official MV' }],
  },
  entry('pixxie', [
    claim('members', 'current', 'ประวัติค่ายระบุ Mabelz, Pimma และ Ingkho สามคน', 'https://www.universal-music.co.jp/pixxie/biography/', 'Universal Music Japan'),
    claim('label', 'current', 'หน้านี้ระบุ LIT Entertainment เป็นค่ายของวงในไทย', 'https://www.universal-music.co.jp/pixxie/biography/', 'Universal Music Japan'),
  ]),
  {
    ...entry('atlas', [
      { ...claim('members', 'current', 'บทสัมภาษณ์สมาชิกวันที่ 22 พฤษภาคม 2569 มี จูเนียร์ เจ็ท ภูมิ ไนซ์ เออร์วิน และแทด รวมหกคน', atlasInterview, 'ELLE Thailand — สัมภาษณ์ ATLAS', '2026-05-22'), evidenceKind: 'artist-interview' },
      claim('members', 'historical', 'ข่าวจาก CHET วันที่ 27 กุมภาพันธ์ 2566 ระบุเจ็ดคนรวม Muon รายชื่อนี้เป็นประวัติเดิม', 'https://prtimes.jp/main/html/rd/p/000000299.000058915.html', 'CHET Group — ข่าวเผยแพร่โดยบริษัท', '2023-02-27'),
      claim('label', 'historical', 'CHET ระบุ XOXO Entertainment เป็นค่ายไทย ส่วน CHET เป็นผู้ร่วมเผยแพร่ผลงานในญี่ปุ่น', 'https://prtimes.jp/main/html/rd/p/000000299.000058915.html', 'CHET Group', '2023-02-27'),
    ], ['พบ URL ประกาศ XOXO 5 ธันวาคม 2568 เรื่อง Muon แต่เปิดต้นฉบับไม่ได้ จึงยังไม่บันทึกวันสิ้นสุดบทบาท 31 ธันวาคมเป็นข้อเท็จจริงที่ตรวจจากต้นฉบับโดยตรง']),
    biographyAdditions: [{ heading: 'สมาชิกในบทสัมภาษณ์ปี 2569', body: 'บทสัมภาษณ์ ATLAS โดย ELLE วันที่ 22 พฤษภาคม 2569 พูดคุยกับสมาชิกหกคน ได้แก่ จูเนียร์ เจ็ท ภูมิ ไนซ์ เออร์วิน และแทด รายชื่อเจ็ดคนที่มีมิวอ้อนในข่าวเปิดตัวและข่าวปี 2566 จึงเป็นข้อมูลของช่วงก่อนหน้า ในบทสัมภาษณ์สมาชิกยังเล่าการพัฒนาการแสดงและประสบการณ์ทัวร์ต่างประเทศของวง', sourceUrl: atlasInterview, sourceLabel: 'ELLE Thailand — สัมภาษณ์ ATLAS 22 พฤษภาคม 2569' }],
    corrections: { shortBio: { oldText: 'บอยกรุ๊ปไทยจากค่าย XOXO Entertainment มีสมาชิก 7 คน', newText: 'บอยกรุ๊ปไทยที่บทสัมภาษณ์เดือนพฤษภาคม 2569 ระบุสมาชิก 6 คน' } },
  },
  entry('jeff-satur', [
    claim('distribution', 'historical', 'Warner Music Japan แสดงผลงาน Space Shuttle No.8 ฉบับญี่ปุ่นในปี 2568 และประวัติการทำงานกับ Wayfer Records', 'https://wmg.jp/jeffsatur', 'Warner Music Japan', '2025-08-13'),
  ], ['ยังต้องหลักฐานปี 2569 แยกบริษัทจัดการ Studio On Saturn ออกจากค่ายเพลงและการจัดจำหน่าย Warner']),
  entry('nont-tanont', [
    claim('label', 'current', 'LOVEiS เผยแพร่โปรไฟล์ NONT TANONT และผลงาน “คำนั้น” ในเดือนพฤษภาคม 2569', 'https://www.loveisentertainment.com/nont-tanont', 'LOVEiS Entertainment', '2026-05-21'),
  ]),
  entry('ink-waruntorn', [
    claim('label', 'current', 'Muzik Move ระบุ INK WARUNTORN เป็นศิลปิน BOXX MUSIC', 'https://www.muzikmove.co.th/OurArtists/Artist/INK-WARUNTORN?lang=en', 'Muzik Move / BOXX MUSIC'),
  ]),
  entry('bowkylion', [
    claim('label', 'current', 'โปรไฟล์ Universal Music Southeast Asia ระบุสังกัด What The Duck และการก่อตั้ง CCORE ในฐานะค่ายย่อย', 'https://universalmusicsea.com/artists/bowkylion/', 'Universal Music Southeast Asia'),
  ]),
  entry('the-toys', [
    claim('label', 'current', 'What The Duck ระบุ THE TOYS เป็นศิลปินเดี่ยวและโปรดิวเซอร์ของค่าย รวมถึงการดูแล WHOOP ร่วมกับ What The Duck', wtd, 'What The Duck'),
  ]),
  entry('milli', [
    claim('label', 'current', 'MILLI ปรากฏในหน้า Artist ของ YUPP! Entertainment พร้อมบัญชีศิลปิน', 'https://www.yuppentertainment.com/artist', 'YUPP! Entertainment'),
  ]),
  entry('phum-viphurit', [
    claim('label', 'historical', 'เว็บไซต์ศิลปินระบุเริ่มเขียนและเผยแพร่เพลงกับ Rats Records ตั้งแต่ปี 2557', 'https://shop.phumviphurit.com/pages/about-us', 'เว็บไซต์ Phum Viphurit', '2014'),
    claim('career', 'historical', 'เว็บไซต์ศิลปินระบุย้ายไปเติบโตในนิวซีแลนด์เมื่ออายุเก้าปี ก่อนกลับมาสร้างงานเพลงในไทย', 'https://shop.phumviphurit.com/pages/about-us', 'เว็บไซต์ Phum Viphurit'),
  ], ['ข้อความเริ่มต้นปี 2557 ไม่ยืนยันสัญญากับ Rats Records ในปี 2569']),
  entry('violette-wautier', [
    claim('career', 'historical', 'ประวัติ Universal Japan แยก Glitter and Smoke เป็นอัลบั้มภาษาอังกฤษปี 2563 และ Your Girl เป็นอัลบั้มภาษาไทยปี 2565', 'https://www.universal-music.co.jp/violette-wautier/biography/', 'Universal Music Japan'),
    claim('distribution', 'historical', 'หน้า Universal Japan เป็นช่องทางเผยแพร่ในญี่ปุ่น; เนื้อหายังกล่าวถึงแผนผลงานปี 2567', 'https://www.universal-music.co.jp/violette-wautier/biography/', 'Universal Music Japan'),
  ], ['หน้าประวัติเก่ายังไม่ยืนยันค่ายไทยหรือผู้จัดการศิลปินปี 2569']),
  entry('pp-krit', [
    claim('label', 'historical', 'ข่าว FIRE BOY วันที่ 4 พฤศจิกายน 2565 ระบุเป็นเพลงแรกที่ออกจากค่ายของตนเอง PP Krit Entertainment', 'https://www.universal-music.co.jp/billkin-and-ppkrit/news/2022-11-04/', 'Universal Music Japan', '2022-11-04'),
  ], ['NADAO เป็นประวัติเดิม; ควรใช้เครดิตผลงานปี 2569 เมื่อต้องยืนยันสัญญาปัจจุบัน']),
  entry('billkin', [
    claim('distribution', 'current', 'เว็บไซต์ Universal Japan แสดงผลงาน Billkin จนถึง CHECKLIST ปี 2569 และลิงก์ Billkin Entertainment', 'https://www.universal-music.co.jp/billkin/', 'Universal Music Japan'),
  ], ['เว็บไซต์ผู้จัดจำหน่ายญี่ปุ่นไม่เปิดเผยสัญญาบริหารหรือสัญญาค่ายเพลงไทยทั้งหมด']),
  entry('palmy', [
    claim('label', 'historical', 'ข่าววันที่ 22 พฤศจิกายน 2564 ระบุ PALMY อยู่ genie records', gmm(8888), 'GMM Music / genie records', '2021-11-22'),
    claim('label', 'current', 'ข่าวบริษัทเดือนกรกฎาคม 2569 ยังกล่าวถึง PALMY ในรายชื่อศิลปิน GMM Music', gmm(10418), 'GMM Music', '2026-07-08'),
  ], ['ข่าวล่าสุดไม่ได้ระบุค่ายย่อยหรือรายละเอียดสัญญา genie ในปี 2569']),
  entry('stamp-apiwat', [
    { ...claim('distribution', 'historical', 'STAMP ให้สัมภาษณ์ Avex เกี่ยวกับการออกผลงานภาษาญี่ปุ่นในปี 2563', 'https://avexnet.jp/column/1000398', 'Avex — สัมภาษณ์ STAMP', '2020-09-30'), evidenceKind: 'artist-interview' },
    claim('label', 'historical', 'ประวัติ STAMP ที่ Avex เผยแพร่ระบุการดูแลค่ายของตนเอง 123records แต่เนื้อหาหน้าประวัติอยู่ในช่วงผลงานปี 2563–2565', 'https://avex.jp/stamp/', 'Avex — STAMP Official Website'),
  ], ['พบหลักฐานบทบาท 123records ในประวัติทางการเดิมแล้ว แต่ยังไม่มีประกาศสังกัดไทยใหม่ปี 2569']),
  entry('tattoo-colour', [
    claim('members', 'current', 'Smallroom ระบุ ดิม ร้องนำ รัฐ กีตาร์ จั๊ม เบส และตง กลอง', 'https://www.smallroom.co.th/artist/2/tattoo-colour', 'Smallroom'),
    claim('label', 'current', 'Tattoo Colour ปรากฏในรายชื่อศิลปินของ Smallroom', 'https://www.smallroom.co.th/artist/2/tattoo-colour', 'Smallroom'),
  ]),
  entry('scrubb', [
    claim('members', 'current', 'ประวัติ Universal Japan ระบุคู่ศิลปิน เมื่อย/Thawatphon Wongbunsiri ร้องนำ และบอล/Torpong Chantabubpha กีตาร์', 'https://www.universal-music.co.jp/scrubb/biography/', 'Universal Music Japan'),
    claim('distribution', 'current', 'Universal Japan มีหน้าประวัติและผลงานของ scrubb สำหรับผู้ฟังในญี่ปุ่น', 'https://www.universal-music.co.jp/scrubb/biography/', 'Universal Music Japan'),
  ], ['บทบาทผู้จัดจำหน่ายญี่ปุ่นไม่ยืนยันค่ายไทยหรือบริษัทจัดการปี 2569']),
  entry('musketeers', [
    claim('members', 'current', 'What The Duck ระบุสมาชิกสามคน เท็น ร้องนำ บิ๊ก กีตาร์ และด๋อย เบส', wtd, 'What The Duck'),
    claim('label', 'current', 'Musketeers ปรากฏในรายชื่อศิลปินของ What The Duck', wtd, 'What The Duck'),
  ]),
  entry('paper-planes', [
    claim('members', 'historical', 'ข่าวค่ายวันที่ 8 มกราคม 2567 ระบุคู่ศิลปิน ฮาย ธันวา เกตุสุวรรณ และเซน นครินทร์ ขุนภักดี', gmm(10022), 'GMM Music / genie records', '2024-01-08'),
    claim('label', 'historical', 'ข่าวเดียวกันระบุ genie records เป็นค่ายของ Paper Planes', gmm(10022), 'GMM Music / genie records', '2024-01-08'),
  ], ['ข่าวปี 2569 ที่พบกล่าวถึงฮายรายคน ยังไม่ยืนยันสมาชิกและค่ายครบวงในปี 2569']),
  {
    ...entry('only-monday', [
      claim('members', 'historical', 'ข่าว GeneLab วันที่ 1 พฤศจิกายน 2566 ระบุสมาชิก ธีร์ โปรด และเฟรม', gmm(9990), 'GMM Music / GeneLab', '2023-11-01'),
      { ...claim('label', 'historical', 'ประกาศของวงเดือนกุมภาพันธ์ 2569 ระบุสัญญา GMM Music สิ้นสุดวันที่ 21 กุมภาพันธ์ 2569 และวงตัดสินใจไม่ต่อสัญญา โดยระบุว่าไม่ได้อยู่ค่ายใดในเวลาที่ประกาศ', onlyMondayStatement, 'Only Monday Band — ประกาศของวง', '2026-02-24'), evidenceKind: 'primary-document-reproduction', reproductionUrl: onlyMondayImage },
    ], ['Facebook ต้นฉบับเปิดโดยตรงไม่ได้; อ่านภาพประกาศของบัญชีวงที่สำนักข่าวนำมาแสดงแทน ยังไม่มีหลักฐานค่ายใหม่หลังประกาศเดือนกุมภาพันธ์']),
    biographyAdditions: [{ heading: 'การเปลี่ยนสถานะสังกัดในปี 2569', body: 'ประกาศของ Only Monday ในเดือนกุมภาพันธ์ 2569 ระบุว่าสัญญากับ GMM Music สิ้นสุดวันที่ 21 กุมภาพันธ์ 2569 และวงเลือกไม่ต่อสัญญาที่เสนอ โดยระบุว่าไม่ได้อยู่ค่ายใดในเวลาที่ออกประกาศ ข้อมูล GeneLab ในข่าวปี 2566 จึงเป็นประวัติการทำงานเดิม ไม่ใช่การยืนยันค่ายปัจจุบัน หลักฐานที่ตรวจครั้งนี้เป็นภาพประกาศของบัญชีวงที่เผยแพร่ซ้ำโดยสำนักข่าว', sourceUrl: onlyMondayStatement, sourceLabel: 'Only Monday Band — ประกาศของวง 24 กุมภาพันธ์ 2569' }],
    corrections: { sections: [{ oldHeading: 'วงในสังกัด GeneLab', newHeading: 'ช่วงทำงานกับ GeneLab', oldBody: 'Only Monday เป็นวงร็อกของ GeneLab ในเครือ GMM Music ข่าวค่ายปี 2566 ระบุสมาชิก ธีร์ โปรด และเฟรม ขณะที่ข่าวการทำเพลงร่วมกับ FOOL STEP ระบุว่าธีร์เป็นนักร้องนำและมือกีตาร์ของวง', newBody: 'ในช่วงข่าวค่ายปี 2566 Only Monday เป็นวงร็อกของ GeneLab ในเครือ GMM Music โดยมีสมาชิก ธีร์ โปรด และเฟรม ข่าวการทำเพลงร่วมกับ FOOL STEP ระบุว่าธีร์เป็นนักร้องนำและมือกีตาร์ ข้อมูลสังกัดในย่อหน้านี้เป็นประวัติของช่วงปี 2566' }] },
  },
  entry('dept', [
    claim('members', 'current', 'Smallroom ระบุคู่ศิลปิน เบนซ์ ภวัต โอภาสสิริโชติ และลุค ลุค ทาวน์เซน', 'https://www.smallroom.co.th/artist/3/Dept', 'Smallroom'),
    claim('label', 'current', 'Dept ปรากฏในรายชื่อศิลปินของ Smallroom', 'https://www.smallroom.co.th/artist/3/Dept', 'Smallroom'),
  ]),
  ...[
    ['mind-4eve', 'มายด์', '_.tiya_'],
    ['jorin-4eve', 'โจริญ', 'jorinja'],
    ['taaom-4eve', 'ตาออม', 'taaoem'],
    ['hannah-4eve', 'แฮนน่า', 'hannah_kmz'],
    ['fai-4eve', 'ฝ้าย', 'callmebanananana'],
    ['punch-4eve', 'พั้นช์', 'ppunnch'],
    ['aheye-4eve', 'อ๊ะอาย', 'aheyekrn_'],
  ].map(([slug, name, account]) => entry(slug, [
    claim('members', 'current', `เครดิต MY CHAINZ วันที่ 30 เมษายน 2569 ระบุ ${name} เป็นสมาชิก 4EVE และเชื่อมบัญชี Instagram ${account}`, fourEve, '4EVE — MY CHAINZ Official MV', '2026-04-30'),
  ])),
];
