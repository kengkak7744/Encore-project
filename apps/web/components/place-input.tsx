'use client';
import { useEffect,useId,useRef,useState } from 'react';
import { api } from '../lib/api';
import { useSessionReset } from './use-data';

export type PlaceChoice={id:string;text:string;sessionToken?:string};
export function PlaceInput({label,value,onChange,onSelect,selected,enabled,country='TH'}:{label:string;value:string;onChange:(value:string)=>void;onSelect:(value:PlaceChoice|null)=>void;selected:PlaceChoice|null;enabled:boolean;country?:string}) {
  const id=useId(),sequence=useRef(0),token=useRef('');
  const [editing,setEditing]=useState(false),[suggestions,setSuggestions]=useState<PlaceChoice[]>([]),[error,setError]=useState(''),[active,setActive]=useState(-1);
  useSessionReset(()=>{sequence.current++;token.current='';setEditing(false);setSuggestions([]);setError('');setActive(-1);});
  useEffect(()=>{
    const current=++sequence.current;setSuggestions([]);setError('');setActive(-1);
    if(!enabled||!editing||value.trim().length<3||selected)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      if(!token.current)token.current=crypto.randomUUID();
      void api<{suggestions:PlaceChoice[]}>('/maps/autocomplete',{method:'POST',body:JSON.stringify({input:value,sessionToken:token.current,country}),signal:controller.signal}).then(result=>{
        if(sequence.current===current)setSuggestions(result.suggestions);
      }).catch(err=>{if(sequence.current===current&&!controller.signal.aborted)setError(err.message);});
    },650);
    return()=>{clearTimeout(timer);controller.abort();};
  },[value,enabled,editing,selected,country]);
  function choose(choice:PlaceChoice){onSelect({...choice,sessionToken:token.current});token.current='';setEditing(false);setSuggestions([]);setActive(-1);}
  return <div className="place-input" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setEditing(false);setSuggestions([]);}}}><label htmlFor={id}>{label}</label><input id={id} aria-label={label} role="combobox" aria-autocomplete="list" maxLength={160} autoComplete="off" value={value} aria-expanded={suggestions.length>0} aria-controls={suggestions.length?id+'-choices':undefined} aria-activedescendant={active>=0?id+'-option-'+active:undefined} onChange={event=>{setEditing(true);onSelect(null);onChange(event.target.value);}} onKeyDown={event=>{
      if(event.key==='Escape'){setEditing(false);setSuggestions([]);setActive(-1);}
      if(suggestions.length&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setActive(index=>(index+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length);}
      if(event.key==='Enter'&&active>=0&&suggestions[active]){event.preventDefault();choose(suggestions[active]);}
    }}/>
    {suggestions.length>0&&<div><div id={id+'-choices'} className="place-choices" role="listbox" aria-label={'ตัวเลือก'+label}>{suggestions.map((choice,index)=><button id={id+'-option-'+index} role="option" aria-selected={index===active} type="button" key={choice.id} onClick={()=>choose(choice)}>{choice.text}</button>)}</div><small className="maps-attribution" translate="no">Google Maps</small></div>}
    {selected&&<small className="fine-print">เลือกแล้ว: {selected.text} · <span className="maps-attribution" translate="no">Google Maps</span></small>}
    {error&&<small className="error-text">{error} · กรอกชื่อเองได้</small>}
  </div>;
}
