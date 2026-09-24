import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { generateImage } from './comfy.js';
import { apiRequest } from './apiRequest.js';
import { reportAi } from './status.js';

/** Image workflows stay local first; Gemini is used only after a local failure. */
export async function generateImageWithBackup(prompt:string, options: Parameters<typeof generateImage>[1]) {
  let local: Awaited<ReturnType<typeof generateImage>>;
  try { local=await generateImage(prompt,options); }
  catch { local={error:'Local image generation failed.'}; }
  if(!('error' in local)) return local;
  if(!config.geminiApiKey) {
    reportAi('Local image generation failed; no Gemini API key is configured for backup.');
    return local;
  }
  reportAi('Local image generation failed. Switching to Gemini image API backup.');
  type Result={candidates?:{content?:{parts?:{inlineData?:{mimeType?:string;data?:string}}[]}}[]};
  const result=await apiRequest<Result>(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiImageModel}:generateContent`,
    {method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':config.geminiApiKey},body:JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:(options?.width ?? 768)>(options?.height ?? 768)?'3:2':'1:1'}}
    })}, {timeoutMs:120000,label:'Gemini image API'});
  const image=result?.data?.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data)?.inlineData;
  const ext=image?.mimeType==='image/png'?'.png':image?.mimeType==='image/jpeg'?'.jpg':image?.mimeType==='image/webp'?'.webp':null;
  if(!image?.data || !ext || image.data.length>35_000_000) {
    reportAi('Image generation failed. The API backup did not return a usable image.');
    return {error:'Local image generation and API backup failed. Check the DM notices and try again.'};
  }
  try {
    const filename=`${randomUUID()}${ext}`;
    await fs.mkdir(config.uploadsDir,{recursive:true});
    await fs.writeFile(path.join(config.uploadsDir,filename),Buffer.from(image.data,'base64'));
    reportAi('Gemini image API backup completed the image.');
    return {path:`/uploads/${filename}`};
  } catch {
    reportAi('The API generated an image, but the server could not save it.');
    return {error:'Could not save the generated image.'};
  }
}
