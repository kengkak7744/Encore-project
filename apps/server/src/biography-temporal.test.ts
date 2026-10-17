import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBiographyDraft, type BiographyDraft, type BiographySource } from './biography-policy.js';
import { extractBiographyPublishedAt, extractBiographyText } from './biography-sources.js';

const quote = 'บทความกล่าวถึงผลงานของศิลปินและการทำงานเพลง โดยเพลงมียอดเข้าชม 70 ล้านครั้งภายใน 7 เดือน';
const source: BiographySource = { id:'source-1',url:'https://example.com/article',label:'Article',text:quote,fetchedAt:'2026-10-10T12:00:00Z',publishedAt:'2020-03-19' };
const make = (body: string): BiographyDraft => ({ identityMatches:true,reason:'',sections:['จุดเริ่มต้น','ผลงาน','การทำงาน'].map(heading=>({heading,body,sourceId:source.id,evidence:[quote]})) });

test('publication metadata keeps article dates separate from fetch and modification dates', () => {
  assert.equal(extractBiographyPublishedAt('<meta property="article:published_time" content="2020-03-19T09:00:00+07:00"><meta property="article:modified_time" content="2026-10-10">'),'2020-03-19');
  assert.equal(extractBiographyPublishedAt('<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","datePublished":"2023-01-09"}]}</script>'),'2023-01-09');
  assert.equal(extractBiographyPublishedAt('<footer><time datetime="2026-10-10">Today</time></footer>'),null);
  assert.equal(extractBiographyPublishedAt('<meta property="article:published_time" content="2020-02-31">'),null);
  assert.equal(extractBiographyPublishedAt('<meta property="article:published_time" content="2099-01-01">'),null);
});

test('old evidence cannot become a latest or current claim', () => {
  assert.throws(()=>validateBiographyDraft(make(quote+' โดยผลงานนี้เป็นซิงเกิลล่าสุดของศิลปินและยังคงมีการทำงานอย่างต่อเนื่อง'),[source]),/temporal/);
  assert.throws(()=>validateBiographyDraft(make(quote+' ปัจจุบันศิลปินทำงานเพลงในสังกัดนี้ โดยแหล่งข้อมูลอธิบายรายละเอียดการเผยแพร่'),[source]),/temporal/);
});

test('volatile metrics require a source-supported historical year, not the fetch year', () => {
  assert.throws(()=>validateBiographyDraft(make(quote+' ข้อมูลดังกล่าวอธิบายถึงยอดเข้าชมเพลงและการเผยแพร่ของศิลปิน'),[source]),/dated context/);
  assert.throws(()=>validateBiographyDraft(make('ตามบทความปี 2026 '+quote),[source]),/dated context/);
  assert.doesNotThrow(()=>validateBiographyDraft(make('ตามบทความปี 2020 '+quote),[source]));
});

test('time quantities cannot silently change months to days even with the same number', () => {
  assert.throws(()=>validateBiographyDraft(make('ตามบทความปี 2020 '+quote.replace('7 เดือน','7 วัน')),[source]),/time quantity/);
});

test('view and stream counts cannot gain a zero or change magnitude',()=>{
  assert.throws(()=>validateBiographyDraft(make('ตามบทความปี 2020 '+quote.replace('70 ล้านครั้ง','700 ล้านครั้ง')),[source]),/numeric metric/);
});

test('Thai month dates, Buddhist years and historical headings retain supported context',()=>{
  const proof='Warner announced today a partnership with the singer to strengthen her domestic fan base and introduce her music throughout Asia.';
  const dated={...source,text:proof,publishedAt:'2022-04-21'};
  for(const date of ['ในเดือนเมษายน 2022','เมื่อวันที่ 21 เมษายน พ.ศ. 2565','ใน April 2022']) {
    const draft=make(date+' ค่ายเพลงประกาศเซ็นสัญญากับศิลปินเพื่อสนับสนุนการขยายฐานแฟนเพลงในเอเชียตามข้อตกลงที่ประกาศ');
    draft.sections.forEach(s=>s.evidence=[proof]);
    assert.doesNotThrow(()=>validateBiographyDraft(draft,[dated]));
  }
  const historical=make('ก่อนเข้าร่วมบริษัท ศิลปินทำงานอิสระและแต่งเพลงของตนเอง โดยเริ่มต้นจากการแสดงละครเพลงและการแสดงบนเวที');
  historical.sections[0].heading='จุดเริ่มต้นและผลงานก่อนสังกัด';
  assert.doesNotThrow(()=>validateBiographyDraft(historical,[source]));
});

test('a quoted song theme is distinguished from a current artist status',()=>{
  const proof='เพลงนี้หยิบยกเรื่องค่านิยมการทำบุญมาตีความจากสิ่งที่เกิดขึ้นในสังคมปัจจุบัน โดยอธิบายเนื้อหาผ่านมุมมองของผู้เขียนเพลง';
  const draft=make(proof);draft.sections.forEach(s=>s.evidence=[proof]);
  assert.doesNotThrow(()=>validateBiographyDraft(draft,[{...source,text:proof}]));
  assert.throws(()=>validateBiographyDraft(make('ปัจจุบันศิลปินสังกัดค่ายเพลงนี้และทำงานอย่างต่อเนื่อง โดยมีผลงานเผยแพร่ผ่านช่องทางของศิลปินตามที่บทความปี 2020 ระบุไว้'),[source]),/temporal/);
  const invented=structuredClone(draft);invented.sections[0].body=proof.replace('สังคมปัจจุบัน','ชีวิตในปัจจุบัน');
  assert.throws(()=>validateBiographyDraft(invented,[{...source,text:proof}]),/temporal/);
});

test('publication year cannot establish a release year or date an unrelated current affiliation',()=>{
  const proof='ศิลปินเล่าเรื่องการเขียนเพลง LET GO และการทำดนตรีผ่านเสียงกีตาร์โปร่ง โดยร่วมทำงานกับผู้ผลิตเพลงในการบันทึกเสียง';
  const dated={...source,text:proof,publishedAt:'2020-03-19'};
  const draft=make('ในปี 2020 ศิลปินปล่อยเพลง LET GO โดยเขียนเนื้อร้องและทำนองเพื่ออธิบายเรื่องราวความสัมพันธ์ตามเนื้อหาของบทความ');draft.sections.forEach(s=>s.evidence=[proof]);
  assert.throws(()=>validateBiographyDraft(draft,[dated]),/event year/);
  assert.throws(()=>validateBiographyDraft(make('ตามบทความปี 2020 ศิลปินมีผลงานเพลงที่กล่าวถึง และศิลปินสังกัดค่ายเพลงที่ระบุไว้โดยไม่ได้กำกับช่วงเวลาของการเป็นสมาชิกในค่าย'),[source]),/affiliation/);
});

test('release dates survive short paragraphs and the context cap',()=>{
  const html='<title>LET GO</title><article><p>'+('เรื่องราวของการแต่งเพลงและการบันทึกเสียง '.repeat(100))+'</p><p>Release Date : 20.12.19</p></article><footer>Release Date : 01.01.26</footer>';
  const text=extractBiographyText(html);
  assert.ok(text.slice(0,2000).includes('Release Date : 20.12.19'));
  assert.ok(!text.includes('01.01.26'));
});

test('explicit release evidence supports its event year, not the later article year',()=>{
  const proof='Release Date : 20.12.19 เพลง LET GO เป็นผลงานที่ศิลปินเล่าเรื่องความสัมพันธ์ผ่านการเขียนเนื้อร้องและทำนองด้วยตนเอง';
  const dated={...source,text:proof,publishedAt:'2020-03-19'};
  const draft=make('ในปี 2019 ศิลปินปล่อยเพลง LET GO ซึ่งเล่าเรื่องความสัมพันธ์ผ่านเนื้อร้องและทำนองโดยใช้เสียงกีตาร์โปร่งประกอบการเล่าเรื่อง');draft.sections.forEach(s=>s.evidence=[proof]);
  assert.doesNotThrow(()=>validateBiographyDraft(draft,[dated]));
  const wrong=structuredClone(draft);wrong.sections[0].body=wrong.sections[0].body.replace('2019','2020');
  assert.throws(()=>validateBiographyDraft(wrong,[dated]),/event year/);
  const fetchYear=structuredClone(draft);fetchYear.sections[0].body=fetchYear.sections[0].body.replace('2019','2026');
  assert.throws(()=>validateBiographyDraft(fetchYear,[dated]),/event year/);
});
