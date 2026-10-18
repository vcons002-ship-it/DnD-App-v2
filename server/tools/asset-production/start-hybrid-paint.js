// Copy into the Hunyuan3D-2.1-WinPortable launcher directory.
// Set DND_ASSET_TOOLS to this repository's server/tools/asset-production folder.
module.exports = async () => {
  const path = require('path');
  const tools = process.env.DND_ASSET_TOOLS;
  if (!tools) throw Error('Set DND_ASSET_TOOLS to the DnD asset-production tools directory');
  return {daemon:true,run:[
    {method:'shell.run',params:{conda:{skip:true},path:'runtime/Hunyuan3D2_WinPortable/Hunyuan3D-2.1',env:{
      HF_HOME:"{{path.resolve(cwd, 'runtime/Hunyuan3D2_WinPortable/HuggingFaceHub')}}",
      HF_HUB_CACHE:"{{path.resolve(cwd, 'runtime/Hunyuan3D2_WinPortable/HuggingFaceHub')}}",
      HY3DGEN_MODELS:"{{path.resolve(cwd, 'runtime/Hunyuan3D2_WinPortable/HuggingFaceHub')}}",PYTHONUNBUFFERED:'1'},
      message:['..\\python_standalone\\python.exe','-s',path.join(tools,'hybrid_paint_worker.py'),'42004'].map(s=>`"${s}"`).join(' '),
      on:[{event:'/(http:\\/\\/[0-9.:]+)/',done:true}]}},
    {method:'local.set',params:{url:'{{input.event[1]}}'}}
  ]};
};
