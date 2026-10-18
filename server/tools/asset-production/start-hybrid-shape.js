// Copy into the installed Hunyuan3d-2-lowvram launcher directory.
// Set DND_ASSET_TOOLS to this repository's server/tools/asset-production folder.
module.exports = async kernel => {
  const path = require('path');
  const tools = process.env.DND_ASSET_TOOLS;
  if (!tools) throw Error('Set DND_ASSET_TOOLS to the DnD asset-production tools directory');
  const launch = await require('./start.js')(kernel);
  launch.run[0].params.message = `python "${path.join(tools, 'hybrid_shape_worker.py')}" 42005`;
  return launch;
};
