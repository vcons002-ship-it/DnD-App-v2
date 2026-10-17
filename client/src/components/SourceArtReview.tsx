import type {AssetJob,SourceArtView} from '../../../shared/assetProduction';
import './source-art-review.css';

export function SourceArtReview({job,busy,onApprove,onRegenerate,onRefresh}:{job:AssetJob;busy:boolean;onApprove:()=>void;onRegenerate:()=>void;onRefresh:(view:SourceArtView)=>void}) {
  if(!job.sourceArt)return null;
  const awaiting=job.state==='awaiting_approval',canRefresh=['awaiting_approval','ready','failed','cancelled'].includes(job.state);
  return <section className="source-art-review" aria-label="Source art approval">
    <strong>{awaiting?'Review your source art':'Saved reference images'}</strong>
    <p>{awaiting?'Check the face, proportions, equipment and pose in all four views. The 3D model will use these exact images. Nothing moves to 3D until you approve.':'These source views stay available after crafting. Refresh one view to keep the other three, then approve the revised set before rebuilding.'}</p>
    <a href={job.sourceArt.sheetUrl} target="_blank" rel="noreferrer"><img src={job.sourceArt.sheetUrl} alt="Four-view source art sheet"/><span>Open full-resolution sheet ↗</span></a>
    <div className="source-art-views">{job.sourceArt.views.map(v=><div key={v.view}><a href={v.url} target="_blank" rel="noreferrer"><img src={v.url} alt={`${v.view} reference view`}/><span>{v.view}</span></a><button className="btn" disabled={busy||!canRefresh} onClick={()=>onRefresh(v.view)}>Refresh {v.view}</button></div>)}</div>
    <div className="source-art-actions">{awaiting&&<button className="btn" disabled={busy} onClick={onApprove}>Approve art &amp; create 3D model</button>}<button className="btn" disabled={busy||!canRefresh} onClick={onRegenerate}>Regenerate source art</button></div>
    <small>Appearance, height and weapon edits apply when regenerating. Regeneration makes a new image API request. Your current 3D model stays in use until its replacement is ready.</small>
  </section>;
}
