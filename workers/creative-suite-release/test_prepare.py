import importlib.util
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('creative_release_prepare',Path(__file__).with_name('prepare.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class LoadingGuards(unittest.TestCase):
    def test_unknown_loading_contract_refuses_to_hide_or_replace_arbitrary_content(self):
        with self.assertRaisesRegex(ValueError, 'Unknown editor loading screen'):
            module.personalise_loading('<head></head><div id="unrelated">Work</div>', 'photocraft')
    def test_existing_loading_brand_is_replaced_once_without_changing_boot_script(self):
        html = '<head><script src="./app.js" integrity="sha256-existing"></script></head><div id="photocraft_loading"></div>'
        once = module.personalise_loading(html, 'photocraft')
        twice = module.personalise_loading(once, 'photocraft')
        self.assertEqual(twice.count('id="xeroflow-loading-brand"'), 1)
        self.assertIn('<script src="./app.js" integrity="sha256-existing"></script>', twice)

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
