"""Import reviewed starter JSON without loading application migrations. Existing entries survive."""
import argparse,json,sqlite3,time,uuid
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--db',required=True);p.add_argument('--source',required=True);p.add_argument('--backup',required=True);p.add_argument('--report',required=True);a=p.parse_args()
backup=Path(a.backup)
if backup.exists():raise ValueError('Backup path already exists')
entries=json.loads(Path(a.source).read_text(encoding='utf-8'))
with sqlite3.connect(Path(a.db).resolve().as_uri()+'?mode=rw',uri=True) as db:
 with sqlite3.connect(backup) as target:db.backup(target)
 report={'added':[],'preserved':[],'mageHandInstancesUpdated':0,'backup':str(backup)}
 db.execute('BEGIN IMMEDIATE')
 for c in entries:
  if db.execute('select 1 from library_creatures where lower(name)=lower(?)',(c['name'],)).fetchone():report['preserved'].append(c['name']);continue
  db.execute('''insert into library_creatures (id,name,creature_type,level,max_hp,armor_class,speed,stats,resistances,weaknesses,weapons,actions,abilities,sheet_abilities,icon,created_at,model_type,model_color,visual_tags) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(str(uuid.uuid4()),c['name'],c['creatureType'],c.get('level',0),c['maxHp'],c['armorClass'],c['speed'],*[json.dumps(c.get(k,[])) for k in ['stats','resistances','weaknesses','weapons','actions','abilities','sheetAbilities']],c['icon'],int(time.time()*1000),c['modelType'],c.get('modelColor',''),json.dumps(c['visualTags'])))
  report['added'].append(c['name'])
 # Existing spell markers explicitly identified by name and prior no-model choice.
 report['mageHandInstancesUpdated']=db.execute("update monsters set model_type='mage-hand' where lower(name)='mage hand' and model_type in ('','none') and coalesce(object_kind,'')='' ").rowcount
 db.execute("insert or replace into app_meta(key,value) values ('starter-creatures-3d-v1','1')")
 db.commit()
Path(a.report).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
