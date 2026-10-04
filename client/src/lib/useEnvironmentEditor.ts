import {create} from 'zustand';

/** Local DM placement intent only; the saved light goes through map:setEnvironment. */
export const useEnvironmentEditor=create<{
  placement:{mapId:string;lightId?:string}|null;
  place:(placement:{mapId:string;lightId?:string}|null)=>void;
  editMapId:string|null;
  edit:(mapId:string|null)=>void;
}>(set=>({placement:null,place:placement=>set({placement}),editMapId:null,edit:editMapId=>set({editMapId,placement:null})}));
