import type {AssetJob} from '../../../shared/assetProduction';
import './source-art-review.css';

export function SourceArtReview({job,busy,onApprove,onRegenerate}:{job:AssetJob;busy:boolean;onApprove:()=>void;onRegenerate:()=>void}) {
  if(job.state!=='awaiting_approval'||!job.sourceArt)return null;
  return <section className="source-art-review" aria-label="Source art approval">
    <strong>Review your source art</strong>
    <p>Check the face, proportions, equipment and pose in all four views. The 3D model will use these exact images. Nothing moves to 3D until you approve.</p>
    <a href={job.sourceArt.sheetUrl} target="_blank" rel="noreferrer"><img src={job.sourceArt.sheetUrl} alt="Four-view source art sheet"/><span>Open full-resolution sheet ↗</span></a>
    <div className="source-art-views">{job.sourceArt.views.map(v=><a key={v.view} href={v.url} target="_blank" rel="noreferrer"><img src={v.url} alt={`${v.view} reference view`}/><span>{v.view}</span></a>)}</div>
    <div className="source-art-actions"><button className="btn" disabled={busy} onClick={onApprove}>Approve art &amp; create 3D model</button><button className="btn" disabled={busy} onClick={onRegenerate}>Regenerate source art</button></div>
    <small>You can revise the appearance description before regenerating. Regeneration makes a new image API request.</small>
  </section>;
}
