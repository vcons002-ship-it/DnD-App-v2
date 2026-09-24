import importlib.util,sqlite3,tempfile,unittest
from contextlib import closing
from pathlib import Path
spec=importlib.util.spec_from_file_location('backfill',Path(__file__).with_name('backfill-appearance.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class AppearanceBackfillTest(unittest.TestCase):
    def test_backup_rules_preservation_and_idempotence(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);db=root/'game.db'
            with closing(sqlite3.connect(db)) as c, c:
                c.execute('CREATE TABLE monsters(id TEXT PRIMARY KEY,name TEXT,max_hp INTEGER,cur_hp INTEGER,stats TEXT)')
                c.execute("INSERT INTO monsters VALUES('a','Herald',125,0,'{\"str\":17}')")
            plan={'entries':[{'table':'monsters','id':'a','name':'Herald','model_type':'royal-archmage','model_color':'','visual_tags':['royal','white']}]}
            dry=module.run(db,plan)
            self.assertEqual(len(dry['updated']),1)
            with closing(sqlite3.connect(db)) as c:self.assertEqual(len(c.execute('PRAGMA table_info(monsters)').fetchall()),5)
            result=module.run(db,plan,True,root/'before.db')
            self.assertEqual(len(result['updated']),1)
            with closing(sqlite3.connect(db)) as c, c:
                self.assertEqual(c.execute('SELECT max_hp,cur_hp,stats,model_type FROM monsters').fetchone(),(125,0,'{"str":17}','royal-archmage'))
                c.execute("UPDATE monsters SET model_color='blue'")
            with closing(sqlite3.connect(root/'before.db')) as c:self.assertEqual(len(c.execute('PRAGMA table_info(monsters)').fetchall()),5)
            plan['entries'][0]['model_color']='red'
            result=module.run(db,plan,True,root/'second.db')
            self.assertEqual(len(result['updated']),0)
            with closing(sqlite3.connect(db)) as c:self.assertEqual(c.execute('SELECT model_color FROM monsters').fetchone()[0],'blue')
            plan['entries'][0]['name']='Renamed'
            self.assertEqual(len(module.run(db,plan)['conflicts']),1)

    def test_invalid_plan_does_not_touch_db(self):
        with tempfile.TemporaryDirectory() as directory:
            db=Path(directory)/'game.db';db.touch()
            with self.assertRaises(ValueError):module.run(db,{'entries':[{'table':'sessions','id':'x'}]},True,Path(directory)/'backup.db')
            self.assertFalse((Path(directory)/'backup.db').exists())

if __name__=='__main__':unittest.main()
