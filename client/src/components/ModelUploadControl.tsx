import {useState} from 'react';
import {apiFetch} from '../lib/api';
import {useStore} from '../state/socket';
import {refreshMiniatureCatalog} from '../lib/miniatures';

export function ModelUploadControl({kind,id}:{kind:'character'|'monster';id:string}){
  const token=useStore(s=>s.chatAccessToken);
  const [file,setFile]=useState<File|null>(null),[upAxis,setUpAxis]=useState('y'),[hasBase,setHasBase]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const upload=async()=>{
    if(!file)return;setBusy(true);setError('');setMessage('Preparing your miniature…');
    try{
      const body=new FormData();body.append('model',file);body.append('upAxis',upAxis);body.append('hasBase',String(hasBase));
      const response=await apiFetch(`/api/assets/upload/${kind}/${encodeURIComponent(id)}`,{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'The model could not be uploaded.');
      await refreshMiniatureCatalog();setMessage(`Miniature ready · ${(result.model.bytes/1024/1024).toFixed(2)} MB · ${Math.round(result.model.triangles).toLocaleString()} triangles`);
    }catch(e){setError(e instanceof Error?e.message:'Upload failed. Try again.');setMessage('');}finally{setBusy(false);}
  };
  return <details className="model-upload-control"><summary>Upload your own 3D miniature</summary>
    <p className="hint">One static GLB with embedded textures, up to 25 MB. The model is fitted to the board and saved on the host. Uploading replaces this token’s 3D appearance; its stats stay the same.</p>
    <label>3D model file<input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setError('');setMessage('');}}/></label>
    <label>Model up direction<select value={upAxis} disabled={busy} onChange={e=>setUpAxis(e.target.value)}><option value="y">Y up (standard GLB)</option><option value="z">Z up</option></select></label>
    <label><input type="checkbox" checked={hasBase} disabled={busy} onChange={e=>setHasBase(e.target.checked)}/>Model already has a circular base</label>
    <small>Leave unchecked to add a dark pewter base. Uses the existing token size controls, fog rules and facing.</small>
    <button className="btn" disabled={busy||!file} onClick={()=>void upload()}>{busy?'Preparing…':'Upload & use miniature'}</button>
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  </details>;
}
