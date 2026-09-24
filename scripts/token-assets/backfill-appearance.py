"""Apply a reviewed ID/name appearance plan without changing game rules or state.

Dry run is the default. --apply requires a new --backup path. Only empty
appearance fields are filled; current nonempty DM choices are preserved.
"""
import argparse, json, sqlite3
from contextlib import closing
from pathlib import Path

FIELDS = {'model_type': "TEXT NOT NULL DEFAULT ''", 'model_color': "TEXT NOT NULL DEFAULT ''", 'visual_tags': "TEXT NOT NULL DEFAULT '[]'"}
TABLES = {'monsters', 'library_creatures'}

def run(db_path, plan, apply=False, backup=None):
    db_path=Path(db_path).resolve(strict=True)
    entries=plan['entries']
    seen=set()
    for e in entries:
        if e['table'] not in TABLES or (e['table'],e['id']) in seen:raise ValueError('Invalid or duplicate plan target')
        seen.add((e['table'],e['id']))
        if not isinstance(e['visual_tags'],list) or not all(isinstance(t,str) for t in e['visual_tags']):raise ValueError('Invalid tags')
    db=sqlite3.connect(db_path.as_uri()+('?mode=rw' if apply else '?mode=ro'),uri=True,timeout=30)
    db.row_factory=sqlite3.Row
    report={'apply':apply,'updated':[],'preserved':[],'conflicts':[],'unresolved':plan.get('unresolved',[])}
    try:
        if apply:
            if backup is None:raise ValueError('Apply requires backup path')
            backup=Path(backup).resolve()
            if backup.exists() or backup==db_path:raise ValueError('Backup must be a new file')
            backup.parent.mkdir(parents=True,exist_ok=True)
            with closing(sqlite3.connect(backup)) as target:db.backup(target)
            report['backup']=str(backup)
            db.execute('BEGIN IMMEDIATE')
            for table in {e['table'] for e in entries}:
                columns={r['name'] for r in db.execute(f'PRAGMA table_info({table})')}
                for field,definition in FIELDS.items():
                    if field not in columns:db.execute(f'ALTER TABLE {table} ADD COLUMN {field} {definition}')
        for e in entries:
            row=db.execute(f"SELECT * FROM {e['table']} WHERE id=?",(e['id'],)).fetchone()
            if row is None or row['name']!=e['name']:
                report['conflicts'].append({'table':e['table'],'id':e['id'],'reason':'Missing or renamed since review'});continue
            before=dict(row);changes={}
            for field in FIELDS:
                old=before.get(field)
                empty=old in (None,'','[]')
                value=json.dumps(e[field],separators=(',',':')) if field=='visual_tags' else e[field]
                if empty and value not in ('','[]'):changes[field]=value
            target={'table':e['table'],'id':e['id'],'name':e['name'],'changes':changes}
            report['updated' if changes else 'preserved'].append(target)
            if apply and changes:
                assignments=','.join(f'{k}=?' for k in changes)
                db.execute(f"UPDATE {e['table']} SET {assignments} WHERE id=?",(*changes.values(),e['id']))
                after=dict(db.execute(f"SELECT * FROM {e['table']} WHERE id=?",(e['id'],)).fetchone())
                if any(after[k]!=v for k,v in before.items() if k not in FIELDS):raise RuntimeError('Non-appearance data changed')
        if apply:db.commit()
        return report
    except BaseException:
        if apply:db.rollback()
        raise
    finally:db.close()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db',required=True,type=Path);p.add_argument('--plan',required=True,type=Path)
    p.add_argument('--apply',action='store_true');p.add_argument('--backup',type=Path);p.add_argument('--report',required=True,type=Path)
    args=p.parse_args()
    result=run(args.db,json.loads(args.plan.read_text(encoding='utf-8')),args.apply,args.backup)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'apply':args.apply,'updated':len(result['updated']),'preserved':len(result['preserved']),'conflicts':len(result['conflicts']),'unresolved':len(result['unresolved'])}))
