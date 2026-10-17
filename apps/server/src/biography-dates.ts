// Dates are evidence, not an instruction to treat the source as current.
const months = 'มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.|January|February|March|April|May|June|July|August|September|October|November|December';
const digits = (text:string) => text.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50));
export const calendarYear = (year:number) => year>=2400?year-543:year;
export function biographyYears(text:string): number[] {
  return [...new Set([...digits(text).matchAll(/(?<![\d,.])((?:19|20|25|26)\d{2})(?!\d|[,.]\d)/g)].map(m=>calendarYear(Number(m[1]))))];
}
export function biographyContextYears(text:string): number[] {
  const prefix='(?:ตามบทความปี|ปี|พ\\.ศ\\.|ค\\.ศ\\.|ณ|เมื่อ|ใน|as of|in)';
  const context=new RegExp(prefix+'\\s*(?:เดือน\\s*)?(?:(?:วันที่\\s*)?\\d{1,2}\\s*)?(?:(?:'+months+')\\s*)?(?:(?:พ\\.ศ\\.|ค\\.ศ\\.)\\s*)?((?:19|20|25|26)\\d{2})(?!\\d|[,.]\\d)','gi');
  const monthDate=new RegExp('(?:'+months+')\\s*(?:(?:พ\\.ศ\\.|ค\\.ศ\\.)\\s*)?((?:19|20|25|26)\\d{2})(?!\\d|[,.]\\d)','gi');
  return [...new Set([...digits(text).matchAll(context),...digits(text).matchAll(monthDate)].map(m=>calendarYear(Number(m[1]))))];
}
// Only an explicitly labelled release date can expand a two-digit year.
export function biographyReleaseYears(text:string): number[] {
  const result:number[]=[];
  for(const m of digits(text).matchAll(/(?:Release Date|วัน(?:ที่)?(?:วางจำหน่าย|เผยแพร่|ปล่อยเพลง))\s*[:：]?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?!\d)/gi)) {
    let year=Number(m[3]);if(m[3].length===2)year+=year>=70?1900:2000;year=calendarYear(year);
    const day=Number(m[1]),month=Number(m[2]),date=new Date(Date.UTC(year,month-1,day));
    if(year>=1900&&year<=2099&&date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day)result.push(year);
  }
  return [...new Set(result)];
}
