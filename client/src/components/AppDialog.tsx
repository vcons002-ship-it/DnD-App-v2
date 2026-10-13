import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {useLocation} from 'react-router-dom';
import {currentPrompt,subscribePrompts,finishPrompt,dismissPrompts,type AppPrompt} from '../lib/dialogs';
import './AppDialog.css';

/** Native dialog supplies modal focus containment, including over a character sheet. */
export function AppDialog(){
  const prompt=useSyncExternalStore(subscribePrompts,currentPrompt);
  const location=useLocation(),route=useRef(location.key);
  useEffect(()=>{if(route.current!==location.key){route.current=location.key;dismissPrompts();}},[location.key]);
  return prompt?createPortal(<Prompt key={prompt.id} prompt={prompt}/>,document.body):null;
}
function Prompt({prompt}:{prompt:AppPrompt}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [text,setText]=useState(prompt.initialValue??'');
  const cancel=()=>finishPrompt(prompt.id,null);
  useLayoutEffect(()=>{
    const element=dialog.current!,previous=document.activeElement as HTMLElement|null;
    element.showModal();
    element.querySelector<HTMLElement>(prompt.kind==='text'?'input':prompt.kind==='confirm'&&prompt.danger?'[data-prompt-cancel]':'button[type="submit"]')?.focus();
    return()=>{element.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <dialog ref={dialog} className="app-dialog" aria-labelledby={`app-dialog-title-${prompt.id}`} aria-describedby={`app-dialog-message-${prompt.id}`}
    onCancel={event=>{event.preventDefault();event.stopPropagation();cancel();}}
    onKeyDown={event=>event.stopPropagation()}
    onClick={event=>{if(event.target!==event.currentTarget)return;const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)cancel();}}>
    <form onSubmit={event=>{event.preventDefault();finishPrompt(prompt.id,prompt.kind==='text'?text: true);}}>
      <header><h2 id={`app-dialog-title-${prompt.id}`}>{prompt.title}</h2><button type="button" className="btn" aria-label="Close prompt" onClick={cancel}>×</button></header>
      <p id={`app-dialog-message-${prompt.id}`}>{prompt.message}</p>
      {prompt.kind==='text'&&<label>Label text<input value={text} onChange={event=>setText(event.target.value)} maxLength={500}/></label>}
      <footer>{prompt.kind!=='notice'&&<button type="button" className="btn" data-prompt-cancel onClick={cancel}>Cancel</button>}
        <button type="submit" className={`btn ${prompt.danger?'danger':'primary'}`} disabled={prompt.kind==='text'&&!text.trim()}>{prompt.acceptLabel??(prompt.kind==='notice'?'Got it':prompt.kind==='text'?'Add label':'Continue')}</button>
      </footer>
    </form>
  </dialog>;
}
