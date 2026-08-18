from pathlib import Path
import runpy

provider_workflow = Path('.github/workflows/essential-provider-diagnostics.yml')
one_off_workflow = Path('.github/workflows/one-off-essential-manuscript-binding-v2.yml')
wrapper = Path('scripts/commercial-quality/run-essential-binding-no-workflow-mutation.py')

provider_before = provider_workflow.read_text()
one_off_before = one_off_workflow.read_text() if one_off_workflow.exists() else None

runpy.run_path('scripts/commercial-quality/apply-essential-manuscript-binding.py', run_name='__main__')

# GitHub Actions' token may write source files but not workflow files. Restore both
# workflow files byte-for-byte so the generated commit contains source/test changes only.
provider_workflow.write_text(provider_before)
if one_off_before is not None:
    one_off_workflow.write_text(one_off_before)

# This wrapper is temporary patch machinery and should retire in the generated source commit.
if wrapper.exists():
    wrapper.unlink()

print('Binding source patch applied; workflow files intentionally left unchanged for connector cleanup.')
