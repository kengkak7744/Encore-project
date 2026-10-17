import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBiographySection,type BiographySource} from './biography-policy.js';
import {extractBiographyCastText,extractBiographyGmmtvNewsText,orderBiographyDocuments} from './biography-sources.js';

const source=(text:string,publishedAt?:string):BiographySource=>({id:'source-1',url:'https://example.org/artist',label:'Artist',text,publishedAt,fetchedAt:'2026-10-17T00:00:00Z'});
const check=(body:string,proof:string,publishedAt?:string)=>validateBiographySection({heading:'ข้อมูลศิลปิน',body,sourceId:'source-1',evidence:[proof]},[source(proof,publishedAt)]);

test('a birth date cannot provide dated context for a Gemini affiliation claim',()=>{
  const proof='Norawit Titicharoenrak (born 13 June 2004), nicknamed Gemini, is a Thai actor under GMMTV and a singer under Riser Music.';
  assert.throws(()=>check('นรวิชญ์ ฐิติเจริญรักษ์ (เกิด 13 มิถุนายน 2004) มีชื่อเล่นว่า เจมีไนน์ เป็นนักแสดงสังกัด GMMTV และนักร้องสังกัด Riser Music',proof),/affiliation.*dated|dated.*affiliation/i);
});

test('PEAKSayaa label synonyms all require dated affiliation context',()=>{
  const proof='พีคศยา จากนักแสดงที่ร้องเพลงตามฟีลลิ่ง สู่ศิลปินเต็มตัว ในค่าย LOVEiS ENTERTAINMENT โดยให้ความสำคัญกับความสุขของคนฟัง';
  for(const relation of ['ในค่าย','ในสังกัดค่ายเพลง','ภายใต้ค่าย'])assert.throws(()=>check('พีคศยาเป็นนักแสดงและศิลปิน '+relation+' LOVEiS ENTERTAINMENT โดยแหล่งข้อมูลเล่าถึงการร้องเพลงและความสุขที่ต้องการส่งต่อให้คนฟัง',proof),/dated/i,relation);
});

test('Fourth role names cannot acquire an unsupported Thai transliteration',()=>{
  const proof='In 2021, he made his acting debut as Glakao in F4 Thailand: Boys Over Flowers, the Thai adaptation of the Japanese manga series Boys Over Flowers.';
  for(const name of ['กล้า (Glakao)','กล้า',"'กล้า' (Glakao)"])assert.throws(()=>check('ในปี 2021 เขาเปิดตัวการแสดงในบทบาท '+name+' ในซีรีส์ F4 Thailand: Boys Over Flowers ซึ่งเป็นเวอร์ชันไทยของมังงะญี่ปุ่นเรื่อง Boys Over Flowers',proof),/role name/i,name);
  assert.doesNotThrow(()=>check('ในปี 2021 เขาเปิดตัวการแสดงในบทบาท Glakao ในซีรีส์ F4 Thailand: Boys Over Flowers ซึ่งเป็นเวอร์ชันไทยของมังงะญี่ปุ่นเรื่อง Boys Over Flowers',proof));
});

test('an unrelated release or formation year cannot date an affiliation, even in another selected excerpt',()=>{
  const proof='The group is under RISER MUSIC. In 2023, the group formed after Project Alpha. In 2026, the group toured Japan.';
  assert.throws(()=>check('ในปี 2023 วงก่อตั้งหลังการประกวด Project Alpha และเป็นศิลปินในค่าย RISER MUSIC โดยมีสมาชิกห้าคนที่ทำงานร่วมกันตามแหล่งข้อมูล',proof),/dated/i);
  assert.throws(()=>check('ตามบทความปี 2026 ศิลปินในค่าย RISER MUSIC ทำงานด้านดนตรีและกิจกรรมของวงร่วมกันตามข้อมูลที่แหล่งอ้างอิงระบุไว้',proof),/dated/i);
});

test('dated publication attribution and an explicit signing clause remain valid',()=>{
  const proof='In 2023 the singer signed to Example Label and worked with its producers on original recordings and musical projects.';
  const body='ในปี 2023 ศิลปินเซ็นสัญญากับค่ายเพลง Example Label และร่วมงานกับผู้ผลิตเพลงในการบันทึกเสียงและทำผลงานดนตรีตามที่แหล่งข้อมูลระบุ';
  assert.doesNotThrow(()=>check(body,proof));
  assert.doesNotThrow(()=>check('ตามบทความปี 2024 ศิลปินอยู่ในค่าย Example Label และร่วมงานกับผู้ผลิตเพลงในการบันทึกเสียงและทำผลงานดนตรีตามที่บทความกล่าวถึง',proof,'2024-04-01'));
  assert.throws(()=>check('ตามบทความปี 2023 ศิลปินอยู่ในค่าย Example Label และร่วมงานกับผู้ผลิตเพลงในการบันทึกเสียงและทำผลงานดนตรีตามที่บทความกล่าวถึง',proof),/publication date/i);
  assert.throws(()=>check('ตามบทความปี 2024 ศิลปินทำงานด้านดนตรีและการบันทึกเสียงร่วมกับผู้ผลิตเพลง. ในปี 2026 ศิลปินอยู่ในค่าย Example Label ตามข้อมูลที่ระบุไว้',proof,'2024-04-01'),/dated context/i);
});

test('selected Thai role spelling is accepted but a shortened name is not',()=>{
  const proof='โฟร์ท ณัฐวรรธน์ จิโรชน์ธิกุล รับบท กล้าข้าว ในซีรีส์ F4 Thailand หัวใจรักสี่ดวงดาว Boys Over Flowers ตามรายชื่อนักแสดง';
  assert.doesNotThrow(()=>check(proof,proof));
  assert.throws(()=>check(proof.replace('รับบท กล้าข้าว','รับบท กล้า'),proof),/role name/i);
});

test('a long trailer synopsis cannot push the official cast spelling outside the context cap',()=>{
  const html='<title>F4 Thailand Official Trailer</title><main><p>'+('เนื้อเรื่องของซีรีส์ '.repeat(200))+'</p><div>ไบร์ท วชิรวิชญ์ ชีวอารี รับบท ธาม<br>โฟร์ท ณัฐวรรธน์ จิโรชน์ธิกุล รับบท กล้าข้าว<br>กำกับซีรีส์</div></main><footer>บุคคลอื่น รับบท บทบาทจากรายการอื่น</footer>';
  const text=extractBiographyCastText(html).slice(0,2000);
  assert.ok(text.includes('โฟร์ท ณัฐวรรธน์ จิโรชน์ธิกุล รับบท กล้าข้าว'));
  assert.ok(!text.includes('บทบาทจากรายการอื่น'));
});

test('William main vocalist role cannot be borrowed from another source or inferred from membership',()=>{
  const proof='William, Lego, Tui, Hong and Nut formed the five-member group LYKN in 2023 after being selected through Project Alpha.';
  assert.throws(()=>check('William เป็นนักร้องนำของวง LYKN ซึ่งประกอบด้วยสมาชิกห้าคนจากรายการ Project Alpha โดยทำงานด้านดนตรีและการแสดงร่วมกันตามแหล่งข้อมูล',proof),/main vocalist role/i);
});

test('quoted character aliases in a synopsis cannot bypass source spelling checks',()=>{
  const proof='Ticket to Heaven follows Tanrak (Fourth Nattawat), a devout young man determined to pursue the priesthood. His heart is put to the test when he meets Barth (Gemini Norawit).';
  assert.throws(()=>check("โฟร์ท รับบทเป็น 'แทนรัก' (Tanrak) ใน Ticket to Heaven และได้พบกับ 'บาร์ธ' (Barth) ซึ่งเป็นเพื่อนที่เขาพบในโรงเรียนตามเรื่องย่อของซีรีส์",proof),/role name/i);
  assert.doesNotThrow(()=>check('Fourth รับบทเป็น Tanrak ใน Ticket to Heaven ชายหนุ่มผู้ศรัทธาในศาสนาและมุ่งสู่การเป็นนักบวช โดยได้พบกับ Barth ตามเรื่องย่อที่ระบุไว้',proof));
});

test('a bilingual GMMTV article preserves published Thai role names within the cap',()=>{
  const html='<title>Ticket to Heaven</title><main><p>'+('English series announcement. '.repeat(120))+'</p><p>'+('รายละเอียดประกาศซีรีส์และนักแสดงของผู้ผลิต '.repeat(80))+'</p><p>Ticket to Heaven เป็นเรื่องราวของ แทนรัก (โฟร์ท ณัฐวรรธน์) และ บาร์ธ (เจมีไนน์ นรวิชญ์) ซึ่งต้องพบกับบททดสอบในโรงเรียนตามเรื่องย่อของผู้ผลิต</p></main>';
  const text=extractBiographyGmmtvNewsText(html).slice(0,2000);
  assert.ok(text.includes('แทนรัก (โฟร์ท ณัฐวรรธน์)'));
  assert.ok(text.includes('บาร์ธ (เจมีไนน์ นรวิชญ์)'));
});

test('dated source documents precede undated profiles without borrowing their dates',()=>{
  const undated=source('Undated profile');const dated={...source('Dated work article','2020-03-19'),url:'https://example.org/work'};
  const ordered=orderBiographyDocuments([undated,dated]);
  assert.equal(ordered[0].url,dated.url);assert.equal(ordered[1].publishedAt,undefined);
  assert.deepEqual(ordered.map(d=>d.id),['source-1','source-2']);assert.equal(undated.id,'source-1');
});

test('Japanese historical age units retain the evidenced number and dated context',()=>{
  const proof='WILLIAMが選んだのは「悲しい題材だけど好きなロックバンドの曲で、16歳頃に練習していた」と話す、SILLY FOOLS「ผิดที่ไว้ใจ」。';
  const body='ตามบทความปี 2026 William เลือกร้องเพลง ผิดที่ไว้ใจ ของวง SILLY FOOLS โดยเล่าว่าเขาเคยฝึกซ้อมเพลงนี้เมื่ออายุประมาณ 16 ปี';
  assert.doesNotThrow(()=>check(body,proof,'2026-10-10'));
  assert.throws(()=>check(body.replace('16 ปี','18 ปี'),proof,'2026-10-10'),/time quantity/);
  assert.throws(()=>check(body.replace('16 ปี','16 เดือน'),proof,'2026-10-10'),/time quantity/);
});

test('a shared work title alone cannot establish an adaptation claim',()=>{
  const proof='โฟร์ท ณัฐวรรธน์ จิโรชน์ธิกุล รับบท กล้าข้าว ใน F4 Thailand หัวใจรักสี่ดวงดาว Boys Over Flowers ตามรายชื่อนักแสดง';
  assert.throws(()=>check('โฟร์ท รับบทเป็น กล้าข้าว ใน F4 Thailand หัวใจรักสี่ดวงดาว Boys Over Flowers ซึ่งเป็นผลงานที่ดัดแปลงจากเรื่อง Boys Over Flowers ตามข้อมูลที่ระบุไว้',proof),/adaptation/i);
});
