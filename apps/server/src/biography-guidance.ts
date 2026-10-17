import {biographyExcerpts,groundBiographyEvidence,validateBiographySection,BiographyRejected,type BiographyDraft,type BiographySource} from './biography-policy.js';
import {biographyAffiliationYears} from './biography-claims.js';

export function biographySourceGuidance(sources:BiographySource[]) {
  return sources.map(source=>{
    const year=source.publishedAt&&Number.isFinite(Date.parse(source.publishedAt))?Number(source.publishedAt.slice(0,4)):null;
    const excerpts=biographyExcerpts(source);
    return {sourceId:source.id,publishedAt:source.publishedAt||null,articleYear:year,datedClaimsAllowed:year!==null,
      affiliationEvidence:excerpts.filter(e=>/สังกัด|ค่าย|under|label|sign(?:ed|ing)?|所属|レーベル/i.test(e.text)).map(e=>({evidenceId:e.id,contextYears:biographyAffiliationYears(e.text,source.publishedAt)})),
      roleEvidenceIds:excerpts.filter(e=>/รับบท|role as|debut as|vocalist|นักร้องนำ/i.test(e.text)).map(e=>e.id),
      instruction:year===null
        ? 'แหล่งนี้ไม่ลงวันที่ ให้ละสังกัด อายุ ยอดวิว ยอดสตรีม และระยะประสบการณ์ ใช้ชื่อ บทบาท และผลงานที่หลักฐานรองรับแทน ถ้าหลักฐานเหตุการณ์ลงวันที่ชัด ให้เลือกข้อความนั้น ห้ามใช้ปีที่อ่านเว็บ'
        : `บริบทบทความใช้ ตามบทความปี ${year} ได้เฉพาะข้ออ้างในแหล่งนี้ ปีนี้ไม่ใช่ปีปล่อยเพลงหรือปีเหตุการณ์โดยอัตโนมัติ`,
      selectionRule:'ทุกข้ออ้างในหัวข้อต้องอยู่ใน excerpts ที่เลือกของ sourceId นี้ ถ้าไม่ครบให้เลือก excerpt เพิ่มจากแหล่งเดิม แยกหัวข้อ หรือลบข้ออ้าง ห้ามยืมข้อเท็จจริงจากแหล่งอื่น บทบาทนักร้องนำไม่อนุมานจากการเป็นสมาชิกหรือเครดิตร้องเพลง ปีเกิด/ปีก่อตั้งวง/ปีทัวร์ไม่ใช่วันที่สังกัด ถ้า affiliationEvidence ไม่มี contextYears ให้ละสถานะสังกัด ชื่อตัวละครภาษาไทยต้องปรากฏในหลักฐานที่เลือก มิฉะนั้นคงชื่ออังกฤษตามหลักฐาน ไม่เดาหรือย่อชื่อ',
    };
  });
}

export function biographyRepairFeedback(raw:unknown,sources:BiographySource[],problem:string,review?:unknown) {
  const sections=(raw as {sections?:unknown[]})?.sections;
  const headings=new Set<string>();
  const checks=(review as {checks?:{index:number;supported:boolean;reason?:string}[]}|undefined)?.checks;
  const sectionProblems: {index:number;heading:unknown;sourceId:unknown;publishedAt:string|null;problem:string;requiredChange:string;instruction:string;selectedEvidence:string[];allowedEvidenceIds:string[]}[]=[];
  if(Array.isArray(sections))sections.slice(0,6).forEach((item,index)=>{
    const section=item as {heading?:unknown;sourceId?:unknown};
    const source=sources.find(s=>s.id===section?.sourceId);
    let selectedEvidence:string[]=[];
    try{
      const grounded=groundBiographyEvidence({sections:[item]},sources).sections[0];
      selectedEvidence=grounded.evidence;
      validateBiographySection(grounded,sources,headings);
      const failed=Array.isArray(checks)?checks.find(check=>check.index===index&&check.supported===false):null;
      if(failed)throw new BiographyRejected('Factual review: '+String(failed.reason||problem).slice(0,1000));
    }catch(error){
      if(!(error instanceof BiographyRejected))throw error;
      const undated=/affiliation.*dated context/i.test(error.message);
      const tooShort=/body has \d+ characters; need/.test(error.message);
      sectionProblems.push({index,heading:section?.heading,sourceId:section?.sourceId,publishedAt:source?.publishedAt||null,problem:error.message,
        requiredChange:undated?'omit_undated_affiliation':tooShort?'resize_with_supported_evidence':'repair_selected_evidence',
        instruction:undated?'หัวข้อนี้ไม่ผ่านเพราะข้ออ้างสังกัด ลบวลีความสัมพันธ์กับค่ายและสังกัดออกจาก body คงข้อมูลสมาชิก/ผลงานอื่นที่มีหลักฐาน ห้ามคัด body เดิมกลับมา ห้ามใช้ปีเกิดหรือปีตั้งวงเติมให้สังกัด ถ้าจะคงสังกัดต้องเลือกแหล่งที่ลงวันที่ของความสัมพันธ์นั้นจริง':tooShort?'เลือกข้อเท็จจริงและ evidenceIds เพิ่มจาก sourceId เดิมเพื่อเขียนเนื้อหาใหม่ประมาณ120–300ตัวอักษร ตัดส่วนเกินหากยาวเกิน800 ห้ามเติมคำชม การอนุมาน หรือข้อเท็จจริงที่ไม่มีหลักฐานเพื่อให้ครบความยาว':'แก้ข้ออ้างหรือเลือกหลักฐานเพิ่มจากแหล่งเดิมให้ครอบคลุม อย่าคัดหัวข้อที่ผิดกลับมาโดยไม่แก้',
        selectedEvidence,allowedEvidenceIds:source?biographyExcerpts(source).map(e=>e.id):[]});
    }
  });
  const structureProblem=Array.isArray(sections)&&sections.length<3?{minimumSections:3,actualSections:sections.length,
    unusedSourceIds:sources.filter(source=>!sections.some(item=>(item as {sourceId?:unknown})?.sourceId===source.id)).map(source=>source.id),
    instruction:'ร่างนี้มีหัวข้อน้อยกว่า3 ให้เลือกข้อเท็จจริงจาก excerpts เพิ่ม โดยเฉพาะแหล่งที่ยังไม่ได้ใช้ เพื่อสร้าง3–4หัวข้อที่ต่างกันและมีหลักฐานครบ คงหัวข้อที่ถูกต้องไว้ ห้ามยืดซ้ำหรือเติมข้อเท็จจริงให้ครบจำนวน ถ้ามีหลักฐานไม่พอจริงให้คืน sections ว่าง'}:null;
  return {rejectedDraft:raw,problem,sectionProblems,structureProblem,
    action:'แก้ทุก sectionProblems ภายในร่างเดียว ถ้าชื่อผลงานหรือรายละเอียดมีอยู่ในแหล่งเดิมแต่ยังไม่ได้เลือก ให้เลือก evidenceIds เพิ่มจาก allowedEvidenceIds ของแหล่งนั้นเพื่อรองรับทุกข้ออ้าง ถ้าหลักฐานไม่มีให้ตัดเฉพาะข้ออ้างที่ไม่รองรับ ไม่ต้องลบทั้งหัวข้อที่ยังแก้หลักฐานได้ ห้ามยืมข้อมูลข้าม sourceId ห้ามเดาปี/หน่วย/สังกัด ถ้าตัดแล้วหัวข้อสั้นให้ใช้ข้อเท็จจริงอื่นที่รองรับ ห้ามเติมคำชมเพื่อให้ครบความยาว ถ้าข้อมูลไม่พอให้คืน sections ว่าง',
  };
}

export function biographyReviewEvidence(draft:BiographyDraft,sources:BiographySource[]) {
  const sectionEvidence=draft.sections.map((section,index)=>{
    const source=sources.find(s=>s.id===section.sourceId);
    if(!source)throw new BiographyRejected('Review cites an unknown source');
    return {index,sourceId:source.id,publishedAt:source.publishedAt||null,evidence:section.evidence};
  });
  return {sectionEvidence,sources:sources.filter(source=>sectionEvidence.some(section=>section.sourceId===source.id)).map(source=>({
    id:source.id,url:source.url,label:source.label,publishedAt:source.publishedAt||null,fetchedAt:source.fetchedAt,
    text:[...new Set(sectionEvidence.filter(section=>section.sourceId===source.id).flatMap(section=>section.evidence))].join('\n'),
  }))};
}
