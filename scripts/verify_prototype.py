"""Local Definition-of-Done checks that do not require live provider credentials."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
required_files = [
    "server.py", "README.md", "requirements.txt", "tests/test_workflow.py",
    "src/components/enrich.js", "src/components/outbound.js",
    "src/local-workbook.js", "run_local.sh", "run_local.bat",
    "tests/test_frontend_contract.py",
]
missing = [path for path in required_files if not (ROOT / path).exists()]
if missing:
    print("Missing required files:", ", ".join(missing))
    sys.exit(1)

required_env = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"]
configured = [name for name in required_env if os.environ.get(name)]
print(f"Local prototype structure: OK ({len(required_files)} files checked)")
print(f"Google live verification: {'READY' if len(configured) == len(required_env) else 'PENDING credentials'}")
print("Run: npm test && npm run test:python")
