import test from 'node:test';import assert from 'node:assert/strict';
import {extractBiographyText} from './biography-sources.js';
import {biographyExcerpts} from './biography-policy.js';

test('source extraction and excerpt selection retain the paragraph separating two song themes',()=>{
 const debut='ศิลปินเริ่มทำเพลงกับซิงเกิลแรกชื่อ เพลงแรก ซึ่งเป็นเพลงให้กำลังใจสำหรับคนที่ผ่านช่วงเวลายากลำบาก';
 const next='เพลงที่สองเป็นผลงานถัดมาที่เล่าถึงข่าวลือและความไม่แน่นอนของความสัมพันธ์ โดยศิลปินลงมือทำทุกขั้นตอน';
 const text=extractBiographyText('<html><title>ข้อมูลศิลปิน</title><article><p>'+debut+'</p><p>'+next+'</p></article></html>');
 assert.ok(text.includes((debut+'\n\n'+next).normalize('NFKC')));
 const excerpts=biographyExcerpts({id:'source-1',url:'https://example.org',label:'Official',text,fetchedAt:'2026-10-14T02:00:00Z'});
 assert.ok(excerpts.some(e=>e.text===next.normalize('NFKC')));
 assert.ok(excerpts.every(e=>!(e.text.includes('เพลงให้กำลังใจ'.normalize('NFKC'))&&e.text.includes('เพลงที่สอง'))));
});
