export class OllamaHttpError extends Error {
  constructor(readonly status:number,readonly detail:string) {
    super('Ollama HTTP '+status+(detail?': '+detail:''));
  }
  get retryable() {
    return [500,502,503,504].includes(this.status)&&!/out of memory|not enough memory|requires more.*memory|(?:failed|unable|cannot).*allocat|invalid.*(?:schema|grammar)|unsupported|context.*(?:length|limit)|failed to parse/i.test(this.detail);
  }
}

export async function ollamaHttpError(response:Response) {
  let text='',size=0;const reader=response.body?.getReader(),decoder=new TextDecoder();
  try{
    if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();break;}text+=decoder.decode(part.value,{stream:true});}
    text+=decoder.decode();
  }catch{/* Keep the HTTP status even if the error stream is unavailable. */}
  finally{reader?.releaseLock();}
  let detail='';
  try{const value=JSON.parse(text);if(typeof value.error==='string')detail=value.error;}catch{/* Do not persist arbitrary HTML or response bodies. */}
  detail=detail.replace(/\bBearer\s+\S+/gi,'Bearer <REDACTED>')
    .replace(/\b(api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,'$1=<REDACTED>')
    .replace(/[\r\n\u0000-\u001f]+/g,' ').slice(0,600);
  return new OllamaHttpError(response.status,detail);
}
