/** Preview-only asynchronous GPU timing. Never waits for the GPU. */
export function createPreviewGpuTiming(context:WebGLRenderingContext|WebGL2RenderingContext) {
  const gl=context as WebGL2RenderingContext;
  const extension=typeof gl.beginQuery==='function'?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
  const pending:WebGLQuery[]=[],samples:number[]=[];
  let active:WebGLQuery|null=null;
  return {
    begin(){
      if(!extension)return;
      if(gl.getParameter(extension.GPU_DISJOINT_EXT)){
        pending.splice(0).forEach(q=>gl.deleteQuery(q));samples.length=0;return;
      }
      while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
        const query=pending.shift()!;
        samples.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(query);
        if(samples.length>120)samples.shift();
      }
      if(pending.length>=12)return;
      active=gl.createQuery();if(active)gl.beginQuery(extension.TIME_ELAPSED_EXT,active);
    },
    end(){if(extension&&active){gl.endQuery(extension.TIME_ELAPSED_EXT);pending.push(active);active=null;}},
    get median(){const sorted=[...samples].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:null;},
    get count(){return samples.length;},
    dispose(){if(active&&extension){gl.endQuery(extension.TIME_ELAPSED_EXT);gl.deleteQuery(active);}pending.forEach(q=>gl.deleteQuery(q));},
  };
}
