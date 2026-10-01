import {Router,type Request} from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import {db,newId} from './db.js';
import {config} from './config.js';
import {chatMediaConnection,type Conn} from './connections.js';
import {parseChatPrivacy,privateChatVisible} from './privateChat.js';

type ChatImage={id:string;session_id:string;uploader_owner_id:string|null;name:string;file_name:string;mime:string};
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export const privateChatDir=()=>path.join(config.dataDir,'private-chat-images');
export const getChatImage=(id:string):ChatImage|undefined=>uuid.test(id)?db.prepare('SELECT * FROM chat_images WHERE id=?').get(id) as ChatImage|undefined:undefined;
export function chatImageForSend(conn:Conn,id:string):{id:string;name:string}|undefined {
  const image=getChatImage(id);
  if(!image||image.session_id!==conn.sessionId)return undefined;
  const uploader=conn.role==='dm'?image.uploader_owner_id===null:!!conn.playerId&&image.uploader_owner_id===conn.playerId;
  return uploader&&canReadChatImage(conn,image)?{id:image.id,name:image.name}:undefined;
}
export function canReadChatImage(conn:Conn,image:ChatImage):boolean {
  if(image.session_id!==conn.sessionId)return false;
  const references=db.prepare('SELECT * FROM chat_messages WHERE session_id=? AND image_id=?').all(conn.sessionId,image.id) as Record<string,unknown>[];
  if(references.some(row=>{const p=parseChatPrivacy(row);return !!p&&privateChatVisible(p,conn.role,conn.playerId,!!row.dm_only);}))return true;
  // Only the original uploader may preview unsent images. Referenced player-only
  // images never become visible to the DM, including after a backup restore.
  if(conn.role==='player')return !!conn.playerId&&image.uploader_owner_id===conn.playerId;
  return !references.length&&image.uploader_owner_id===null;
}
function authenticate(req:Request):Conn|undefined {
  const header=req.get('authorization')??'';
  return header.startsWith('Bearer ')?chatMediaConnection(header.slice(7)):undefined;
}

export function createChatImageRouter():Router {
  const router=Router();
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:0}}).single('image');
  router.use((req,res,next)=>{
    const conn=authenticate(req);
    if(!conn){res.status(401).json({error:'Reconnect to the campaign to access private images.'});return;}
    res.locals.chatConnection=conn;
    res.set('Cache-Control','private, no-store');
    next();
  });
  router.post('/',(req,res)=>{
    const uploader=res.locals.chatConnection as Conn;
    if(uploader.role==='player'&&!uploader.playerId){res.status(403).json({error:'Reconnect as a player before attaching an image.'});return;}
    upload(req,res,async(error:unknown)=>{
      if(error){res.status(400).json({error:error instanceof multer.MulterError&&error.code==='LIMIT_FILE_SIZE'?'Choose an image smaller than 10 MB.':'Choose one PNG, JPEG, WebP or GIF image.'});return;}
      if(!req.file){res.status(400).json({error:'Choose an image to attach.'});return;}
      let saved:string|undefined;
      try {
        const raster=sharp(req.file.buffer,{limitInputPixels:40_000_000});
        const metadata=await raster.metadata();
        const format=metadata.format;
        if(!format||!['png','jpeg','webp','gif'].includes(format))throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
        await raster.stats(); // Decode before accepting; do not trust the upload's MIME or extension.
        // A reconnect while decoding must not authorize a stale upload.
        const conn=authenticate(req);
        if(!conn){res.status(401).json({error:'Reconnect and attach the image again.'});return;}
        const id=newId(),extension=format==='jpeg'?'jpg':format;
        const fileName=`${id}.${extension}`;
        const name=path.basename(path.win32.basename(req.file.originalname)).replace(/[\x00-\x1f\x7f]/g,'').slice(0,160)||`Image.${extension}`;
        fs.mkdirSync(privateChatDir(),{recursive:true});
        saved=path.join(privateChatDir(),fileName);
        fs.writeFileSync(saved,req.file.buffer);
        db.prepare('INSERT INTO chat_images (id,session_id,uploader_owner_id,name,file_name,mime,created_at) VALUES (?,?,?,?,?,?,?)')
          .run(id,conn.sessionId,conn.role==='player'?conn.playerId:null,name,fileName,`image/${format}`,Date.now());
        res.json({id,name});
      } catch(error) {
        if(saved)fs.rmSync(saved,{force:true});
        res.status(400).json({error:error instanceof Error&&error.message.startsWith('Choose ')?error.message:'That image could not be read. Try a PNG, JPEG, WebP or GIF.'});
      }
    });
  });
  router.get('/:id',(req,res)=>{
    const conn=res.locals.chatConnection as Conn;
    const image=getChatImage(String(req.params.id));
    if(!image||!canReadChatImage(conn,image)){res.status(404).json({error:'This private image is not available to you.'});return;}
    if(!/^[a-f\d-]{36}\.(png|jpg|jpeg|webp|gif)$/i.test(image.file_name)){res.status(404).end();return;}
    const file=path.join(privateChatDir(),image.file_name);
    if(!fs.existsSync(file)){res.status(404).json({error:'This attachment is missing from the server.'});return;}
    res.set('Content-Type',image.mime);
    res.set('X-Content-Type-Options','nosniff');
    res.sendFile(file);
  });
  return router;
}
