export type CuratedArtistProfile = {
  slug: string;
  bio: string;
  genres: string[];
  sourceUrl: string;
  sourceLabel: string;
  accounts?: { platform: 'x' | 'facebook' | 'instagram' | 'website'; url: string; evidenceUrl: string }[];
  biography?: { heading: string; body: string; sourceUrl: string; sourceLabel: string }[];
};

// Short, original summaries of facts published by an artist, label, manager, or distributor.
// Keep source URLs here so a seed run can show provenance on the public profile.
export const curatedArtistProfiles: CuratedArtistProfile[] = [
  { slug: 'bodyslam', bio: 'วงดนตรีไทยในกลุ่มศิลปิน GMM Music เจ้าของเพลง “งมงาย” และ “อกหัก”', genres: ['rock'], sourceUrl: 'https://www.gmmgrammy.com/newsroom/news-single.php?id=10418', sourceLabel: 'GMM Music' },
  { slug: 'tilly-birds', bio: 'วงอัลเทอร์เนทีฟไทย สมาชิกหลักคือ 3RD, Billy และ Milo', genres: ['alternative', 'pop', 'rock'], sourceUrl: 'https://www.tillybirds.com/about', sourceLabel: 'เว็บไซต์ Tilly Birds', accounts: [{ platform: 'website', url: 'https://www.tillybirds.com/', evidenceUrl: 'https://www.tillybirds.com/about' }] },
  { slug: 'three-man-down', bio: 'วงร็อกไทยที่มีสมาชิก 4 คน ภายใต้การดูแลของ Kruengkao', genres: ['rock'], sourceUrl: 'https://www.kruengkao.com/en/artist/three-man-down', sourceLabel: 'Kruengkao Group' },
  { slug: 'cocktail', bio: 'วงร็อกไทยที่มีสมาชิก 4 คน และสร้างผลงานเพลงต่อเนื่องมากว่าสองทศวรรษ', genres: ['rock'], sourceUrl: 'https://universalmusic.fr/artistes/36484961805', sourceLabel: 'Universal Music' },
  { slug: 'slot-machine', bio: 'วงร็อกไทย สมาชิกคือ Foet, Gak และ Vit', genres: ['rock'], sourceUrl: 'https://slotmachine.band/bio.php', sourceLabel: 'เว็บไซต์ Slot Machine', accounts: [{ platform: 'website', url: 'https://slotmachine.band/', evidenceUrl: 'https://slotmachine.band/bio.php' }] },
  { slug: 'getsunova', bio: 'วงดนตรีไทยจาก White Music ในเครือ GMM Music เจ้าของเพลง “ไกลแค่ไหนคือใกล้”', genres: ['pop', 'rock'], sourceUrl: 'https://www.gmmgrammy.com/newsroom/news-single.php?id=10199', sourceLabel: 'GMM Music' },
  { slug: 'polycat', bio: 'วงซินธ์ป็อปไทยจากค่าย Smallroom มีสมาชิก 3 คน', genres: ['synth-pop', 'indie'], sourceUrl: 'https://smallroom.co.th/artist/1/polycat', sourceLabel: 'Smallroom' },
  { slug: '4eve', bio: 'เกิร์ลกรุ๊ปไทยจากค่าย XOXO Entertainment', genres: ['t-pop'], sourceUrl: 'https://chet.com/news/agent/679/', sourceLabel: 'CHET Asia และ XOXO Entertainment', accounts: [
    { platform: 'x', url: 'https://twitter.com/4eveOfficial', evidenceUrl: 'https://chet.com/news/agent/679/' },
    { platform: 'instagram', url: 'https://www.instagram.com/4eve_official/', evidenceUrl: 'https://chet.com/news/agent/679/' },
    { platform: 'facebook', url: 'https://www.facebook.com/4EVEofficial/', evidenceUrl: 'https://chet.com/news/agent/679/' },
  ] },
  { slug: 'bus', bio: 'บอยกรุ๊ปไทย 12 คนจาก SONRAY MUSIC', genres: ['t-pop'], sourceUrl: 'https://www.busofficialmembership.com/th/', sourceLabel: 'เว็บไซต์ทางการ BUS', accounts: [{ platform: 'website', url: 'https://www.busofficialmembership.com/th/', evidenceUrl: 'https://www.busofficialmembership.com/th/' }] },
  { slug: 'proxie', bio: 'วง T-Pop ไทยจาก bROTHERS MUSIC ที่มีผลงานเพลงเผยแพร่ถึงปี 2569', genres: ['t-pop'], sourceUrl: 'https://music.apple.com/us/album/%E0%B8%AE-%E0%B8%AD%E0%B8%9A-single/1888457358', sourceLabel: 'Apple Music / bROTHERS MUSIC' },
  { slug: 'pixxie', bio: 'เกิร์ลกรุ๊ปไทย 3 คนจาก LIT Entertainment ประกอบด้วย Mabelz, Pimma และ Ingkho', genres: ['t-pop'], sourceUrl: 'https://www.universal-music.co.jp/pixxie/biography/', sourceLabel: 'Universal Music Japan' },
  { slug: 'atlas', bio: 'บอยกรุ๊ปไทยจากค่าย XOXO Entertainment', genres: ['t-pop'], sourceUrl: 'https://chet.com/news/agent/679/', sourceLabel: 'CHET Asia และ XOXO Entertainment', accounts: [
    { platform: 'x', url: 'https://twitter.com/atlasofficialth', evidenceUrl: 'https://chet.com/news/agent/679/' },
    { platform: 'instagram', url: 'https://www.instagram.com/atlas_official_th/', evidenceUrl: 'https://chet.com/news/agent/679/' },
    { platform: 'facebook', url: 'https://www.facebook.com/ATLAS.officialTH/', evidenceUrl: 'https://chet.com/news/agent/679/' },
  ] },
  { slug: 'jeff-satur', bio: 'ศิลปินเดี่ยวไทยที่ทำเพลงในแนวป็อป R&B และฮิปฮอป', genres: ['pop', 'r&b'], sourceUrl: 'https://wmg.jp/jeffsatur', sourceLabel: 'Warner Music Japan' },
  { slug: 'nont-tanont', bio: 'ศิลปินเดี่ยวไทยในสังกัด LOVEiS Entertainment', genres: ['pop'], sourceUrl: 'https://www.loveisentertainment.com/nont-tanont', sourceLabel: 'LOVEiS Entertainment' },
  { slug: 'ink-waruntorn', bio: 'ศิลปินป็อปไทยในค่าย BOXX MUSIC', genres: ['pop'], sourceUrl: 'https://www.muzikmove.co.th/OurBusiness/MusicLabel/BOXX-MUSIC?lang=en', sourceLabel: 'Muzik Move / BOXX MUSIC' },
  { slug: 'bowkylion', bio: 'ศิลปินเดี่ยวจาก What The Duck เจ้าของอัลบั้ม “Lionheart”', genres: ['pop'], sourceUrl: 'https://www.whattheduckmusic.com/a', sourceLabel: 'What The Duck' },
  { slug: 'the-toys', bio: 'ศิลปินเดี่ยวและโปรดิวเซอร์จาก What The Duck เจ้าของเพลง “ก่อนฤดูฝน”', genres: ['pop'], sourceUrl: 'https://www.whattheduckmusic.com/a', sourceLabel: 'What The Duck' },
  { slug: 'milli', bio: 'แร็ปเปอร์ไทยในสังกัด YUPP! Entertainment', genres: ['hip-hop'], sourceUrl: 'https://www.yuppentertainment.com/artist', sourceLabel: 'YUPP! Entertainment', accounts: [{ platform: 'instagram', url: 'https://www.instagram.com/phuckitol/', evidenceUrl: 'https://www.yuppentertainment.com/artist' }] },
  { slug: 'phum-viphurit', bio: 'นักร้องและนักแต่งเพลงชาวไทย เจ้าของเพลง “Lover Boy” และอัลบั้ม “Manchild”', genres: ['indie', 'pop'], sourceUrl: 'https://shop.phumviphurit.com/pages/about-us', sourceLabel: 'เว็บไซต์ Phum Viphurit', accounts: [{ platform: 'instagram', url: 'https://www.instagram.com/phumviphurit/', evidenceUrl: 'https://shop.phumviphurit.com/pages/about-us' }] },
  { slug: 'violette-wautier', bio: 'ศิลปินและนักแสดงไทย ผู้สร้างอัลบั้มภาษาอังกฤษ “Glitter and Smoke” และอัลบั้มภาษาไทย “Your Girl”', genres: ['pop'], sourceUrl: 'https://www.universal-music.co.jp/violette-wautier/biography/', sourceLabel: 'Universal Music Japan' },
  { slug: 'pp-krit', bio: 'กฤษฏ์ อำนวยเดชกร เป็นนักร้องและนักแสดงชาวไทยที่ใช้ชื่อศิลปิน PP Krit', genres: ['pop'], sourceUrl: 'https://www.universal-music.co.jp/billkin-and-ppkrit/biography/', sourceLabel: 'Universal Music Japan' },
  { slug: 'billkin', bio: 'ศิลปินเดี่ยวชาวไทยที่เผยแพร่ผลงานเพลงในชื่อ Billkin', genres: ['pop'], sourceUrl: 'https://www.universal-music.co.jp/billkin/', sourceLabel: 'Universal Music Japan', accounts: [{ platform: 'instagram', url: 'https://www.instagram.com/bbillkin/', evidenceUrl: 'https://www.universal-music.co.jp/billkin/' }] },
  { slug: 'palmy', bio: 'ปาล์มมี่ หรือ อีฟ ปานเจริญ เป็นศิลปินเดี่ยวในค่าย genie records', genres: ['pop'], sourceUrl: 'https://www.gmmgrammy.com/newsroom/news-single.php?id=8888', sourceLabel: 'GMM Music' },
  { slug: 'stamp-apiwat', bio: 'แสตมป์ อภิวัชร์ เป็นนักร้องและนักแต่งเพลงชาวไทยที่มีผลงานในต่างประเทศ', genres: ['pop'], sourceUrl: 'https://avexnet.jp/column/1000398', sourceLabel: 'Avex', accounts: [{ platform: 'instagram', url: 'https://www.instagram.com/stampapiwat/', evidenceUrl: 'https://avexnet.jp/column/1000398' }] },
  { slug: 'tattoo-colour', bio: 'วงป็อปไทยจากค่าย Smallroom มีสมาชิก 4 คน', genres: ['pop'], sourceUrl: 'https://www.smallroom.co.th/artist/2/tattoo-colour', sourceLabel: 'Smallroom' },
  { slug: 'scrubb', bio: 'ดูโอ้ป็อปไทย ประกอบด้วยเมื่อยเป็นนักร้อง และบอลเล่นกีตาร์', genres: ['pop', 'indie'], sourceUrl: 'https://www.universal-music.co.jp/scrubb/biography/', sourceLabel: 'Universal Music Japan' },
  { slug: 'musketeers', bio: 'วงโมเดิร์นร็อก 3 คนจาก What The Duck', genres: ['rock'], sourceUrl: 'https://www.whattheduckmusic.com/a', sourceLabel: 'What The Duck' },
  { slug: 'paper-planes', bio: 'วงดนตรีไทยจาก genie records ที่มีผลงานแนวร็อกและป็อปพังก์', genres: ['rock', 'pop-punk'], sourceUrl: 'https://www.gmmgrammy.com/newsroom/news-single.php?id=9927', sourceLabel: 'GMM Music' },
  { slug: 'only-monday', bio: 'วงร็อกไทยที่มีสมาชิกชื่อธีร์ โปรด และเฟรม', genres: ['rock'], sourceUrl: 'https://www.gmmgrammy.com/newsroom/news-single.php?id=9990', sourceLabel: 'GMM Music' },
  { slug: 'dept', bio: 'ดูโอ้ซินธ์ป็อปไทยจากค่าย Smallroom', genres: ['synth-pop', 'indie'], sourceUrl: 'https://www.smallroom.co.th/artist/3/Dept', sourceLabel: 'Smallroom' },
  { slug: 'mind-4eve', bio: 'มายด์เป็นหนึ่งในสมาชิกเกิร์ลกรุ๊ปไทย 4EVE', genres: ['t-pop'], sourceUrl: 'https://workpointtoday.com/girl-group-4eve-debut22/', sourceLabel: 'Workpoint' },
  { slug: 'jorin-4eve', bio: 'โจริญเป็นหนึ่งในสมาชิกเกิร์ลกรุ๊ปไทย 4EVE', genres: ['t-pop'], sourceUrl: 'https://workpointtoday.com/girl-group-4eve-debut22/', sourceLabel: 'Workpoint' },
  { slug: 'taaom-4eve', bio: 'ตาออมเป็นหนึ่งในสมาชิกเกิร์ลกรุ๊ปไทย 4EVE', genres: ['t-pop'], sourceUrl: 'https://workpointtoday.com/girl-group-4eve-debut22/', sourceLabel: 'Workpoint' },
  { slug: 'hannah-4eve', bio: 'แฮนน่าเป็นหนึ่งในสมาชิกเกิร์ลกรุ๊ปไทย 4EVE', genres: ['t-pop'], sourceUrl: 'https://workpointtoday.com/girl-group-4eve-debut22/', sourceLabel: 'Workpoint' },
  { slug: 'fai-4eve', bio: 'ฝ้ายเป็นหนึ่งในสมาชิกเกิร์ลกรุ๊ปไทย 4EVE', genres: ['t-pop'], sourceUrl: 'https://workpointtoday.com/girl-group-4eve-debut22/', sourceLabel: 'Workpoint' },
  { slug: 'punch-4eve', bio: 'พั้นช์เป็นหนึ่งในสมาชิกเกิร์ลกรุ๊ปไทย 4EVE', genres: ['t-pop'], sourceUrl: 'https://workpointtoday.com/girl-group-4eve-debut22/', sourceLabel: 'Workpoint' },
  { slug: 'aheye-4eve', bio: 'อ๊ะอาย หรือ กรณิศ เล้าสุบินประเสริฐ เป็นนักร้องและนักแสดงไทย สมาชิกวง 4EVE', genres: ['t-pop'], sourceUrl: 'https://www.thepeople.co/interview/culture/55294', sourceLabel: 'The People', biography: [
    { heading: 'วัยเด็กและจุดเริ่มต้นของการร้องเพลง', body: 'อ๊ะอายมีชื่อจริงว่า กรณิศ เล้าสุบินประเสริฐ เธอเล่าว่าความสนใจในการร้องเพลงเริ่มจากการร้องเพลงกับคุณพ่อระหว่างนั่งรถ ก่อนที่ครอบครัวจะส่งไปเรียนร้องเพลงเป็นกลุ่ม แม้ในวัยเด็กจะเคยเขินอายจนพลาดโอกาสจากการคัดเลือกนักแสดง เธอก็กลับมาลองใหม่และค่อย ๆ คุ้นกับการแสดงต่อหน้าคนอื่น ต่อมา BLACKPINK ทำให้เธออยากเป็นสมาชิกเกิร์ลกรุ๊ป', sourceUrl: 'https://www.thepeople.co/interview/culture/55294', sourceLabel: 'The People — สัมภาษณ์อ๊ะอาย' },
    { heading: 'เส้นทางสู่ 4EVE', body: 'อ๊ะอายผ่านรายการคัดเลือก 4EVE Girl Group Star ซึ่งเปิดโอกาสให้ผู้สมัครมากกว่าหนึ่งพันคนเข้าร่วมและคัดเด็กฝึกมาแข่งขัน ก่อนประกาศสมาชิกเจ็ดคนของ 4EVE ภายใต้ XOXO Entertainment เธอเป็นสมาชิกที่อายุน้อยที่สุดในกลุ่มเมื่อวงเปิดตัว', sourceUrl: 'https://workpointtoday.com/girl-group-4eve-debut22/', sourceLabel: 'Workpoint — การเปิดตัว 4EVE' },
    { heading: 'การเติบโตบนเวที', body: 'หลังเข้าวง อ๊ะอายพัฒนาทั้งการร้อง การเต้น และการสื่อสารกับผู้ชมบนเวที เธอเล่าว่าคอนเสิร์ตใหญ่ของ 4EVE ที่อิมแพ็ค อารีน่าเป็นหนึ่งในช่วงเวลาที่ทำให้รู้สึกถึงการเป็นศิลปินเต็มตัว ประสบการณ์การซ้อม การแสดงสด และการทำงานร่วมกับสมาชิกวงทำให้เธอเห็นพัฒนาการของตัวเองชัดขึ้น', sourceUrl: 'https://ellethailand.com/aheye-4eve-cover-october-2025-interview/', sourceLabel: 'ELLE Thailand — สัมภาษณ์อ๊ะอาย' },
    { heading: 'การเรียนควบคู่กับงาน', body: 'ช่วงมัธยมปลาย อ๊ะอายต้องแบ่งเวลาระหว่างการเรียนกับงานในวง โดยช่วงเตรียมสอบจบชั้น ม.6 ตรงกับการเตรียมคอนเสิร์ตใหญ่ครั้งแรกของ 4EVE เธอเล่าถึงความกดดันจากการสอบทฤษฎีดนตรีและการซ้อมคอนเสิร์ต ก่อนจะค่อย ๆ จัดการภารกิจทีละอย่าง', sourceUrl: 'https://www.thepeople.co/interview/culture/55294', sourceLabel: 'The People — สัมภาษณ์อ๊ะอาย' },
    { heading: 'งานแสดง', body: 'นอกเหนือจากงานเพลง อ๊ะอายรับบท “จิน” ในภาพยนตร์เรื่อง Attack 13 วิญญาณเลขที่ 13 เธอมองว่าบทนี้เป็นงานที่ท้าทาย เพราะต้องถ่ายทอดบุคลิกและอารมณ์ต่างจากตัวเอง งานแสดงจึงเป็นอีกพื้นที่ให้เธอฝึกทักษะและลองบทบาทใหม่ ๆ', sourceUrl: 'https://www.thepeople.co/interview/culture/55294', sourceLabel: 'The People — สัมภาษณ์อ๊ะอาย' },
    { heading: 'ละครเวที', body: 'ในปี 2567 อ๊ะอายร่วมแสดงละครเวที นิทานหิ่งห้อย เดอะมิวสิคัล รับบท “พระจันทร์” โดยแสดงสลับรอบกับมายด์ สมาชิก 4EVE อีกคน ผลงานนี้เปิดพื้นที่ให้เธอใช้ทั้งการร้องเพลงและการแสดงต่อหน้าผู้ชมสดในรูปแบบละครเวที', sourceUrl: 'https://workpointtoday.com/firefly-tales/', sourceLabel: 'Workpoint — นิทานหิ่งห้อย เดอะมิวสิคัล' },
    { heading: 'มุมมองต่อการทำงาน', body: 'อ๊ะอายให้ความสำคัญกับแฟนเพลงและสมาชิกอีกหกคนในวง เธอเล่าว่าเมื่อเติบโตขึ้นก็กล้าเสนอความคิดเห็นในการทำงานของ 4EVE มากกว่าเดิม และมองความก้าวหน้าของตัวเองผ่านประสบการณ์ที่ได้ทำร่วมกับวง ทั้งงานเพลง คอนเสิร์ต และการพบผู้ชม', sourceUrl: 'https://www.thepeople.co/interview/culture/55294', sourceLabel: 'The People — สัมภาษณ์อ๊ะอาย' },
  ] },
];
