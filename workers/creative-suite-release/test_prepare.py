import importlib.util
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('creative_release_prepare',Path(__file__).with_name('prepare.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class InputGuards(unittest.TestCase):
    def test_refuses_existing_output_before_reading_inputs(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'Fresh absolute'):
                module.prepare('/missing',d,'/missing','/missing')
    def test_changed_stage_receipt_refused_before_extraction(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d).resolve();stage=root/'stage';stage.mkdir()
            for name in module.STAGE_HASHES:(stage/name).write_text('{}')
            output=root/'output'
            with self.assertRaisesRegex(ValueError,'Stage metadata drift'):
                module.prepare(stage,output,'/missing','/missing')
            self.assertFalse(output.exists())
    def test_linked_stage_metadata_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d).resolve();stage=root/'stage';stage.mkdir();target=root/'external';target.write_text('{}')
            for name in module.STAGE_HASHES:(stage/name).symlink_to(target)
            with self.assertRaisesRegex(ValueError,'Stage metadata drift'):
                module.prepare(stage,root/'output','/missing','/missing')
if __name__=='__main__':unittest.main()
