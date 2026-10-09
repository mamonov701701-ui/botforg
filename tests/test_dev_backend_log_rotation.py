"""Isolated checks for the canonical dev backend log writer."""

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


RUNNER_PATH = Path(__file__).resolve().parents[1] / "scripts" / "dev-backend-log-runner.py"
SPEC = importlib.util.spec_from_file_location("dev_backend_log_runner", RUNNER_PATH)
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class BackendLogRotationTests(unittest.TestCase):
    def test_active_file_rotates_and_only_five_backend_logs_remain(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            unrelated = directory / ".dev-backend-20260101-000000.log"
            unrelated.write_text("keep", encoding="utf-8")
            other = directory / "agent.log"
            other.write_text("keep", encoding="utf-8")
            old = directory / ".dev-backend-only-20260101-000000.log"
            old.write_text("old", encoding="utf-8")

            log = runner.RotatingBackendLog(directory, "20261009-120000", 32, 5)
            try:
                log.write(b"a" * 32)
                self.assertEqual(log.path.stat().st_size, 32)
                log.write(b"b" * 32)
                self.assertEqual(log.path.name, ".dev-backend-only-20261009-120000-001.log")
                log.write(b"c" * (32 * 6))
            finally:
                log.close()

            segments = sorted(path for path in directory.iterdir() if runner.LOG_NAME.fullmatch(path.name))
            self.assertEqual(len(segments), 5)
            self.assertTrue(all(path.stat().st_size <= 32 for path in segments))
            self.assertFalse(old.exists())
            self.assertEqual(unrelated.read_text(encoding="utf-8"), "keep")
            self.assertEqual(other.read_text(encoding="utf-8"), "keep")
            self.assertEqual(log.path.read_bytes(), b"c" * 32)

    def test_backend_command_keeps_canonical_runtime_and_reload_arguments(self):
        root = Path(r"C:\Users\mamon\botforg")
        python = root / "backend" / "venv" / "Scripts" / "python.exe"
        self.assertEqual(
            runner.backend_command(root, python, "127.0.0.1", 8001),
            'cd /d "C:\\Users\\mamon\\botforg" && call '
            '"C:\\Users\\mamon\\botforg\\scripts\\dev-backend-runtime-env.cmd" '
            '"C:\\Users\\mamon\\botforg\\backend\\venv\\Scripts\\python.exe" '
            '-u -m uvicorn backend.main:app --host 127.0.0.1 --port 8001 '
            '--reload --reload-dir "C:\\Users\\mamon\\botforg\\backend"',
        )

    def test_command_runs_through_cmd_with_paths_containing_spaces(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "project with spaces"
            scripts = root / "scripts"
            scripts.mkdir(parents=True)
            wrapper = scripts / "dev-backend-runtime-env.cmd"
            wrapper.write_text("@echo off\ncall %*\n", encoding="ascii")
            fake_python = scripts / "fake-python.cmd"
            fake_python.write_text("@echo off\necho reached-fake-python %*\n", encoding="ascii")
            command = runner.backend_command(root, fake_python, "127.0.0.1", 8001)
            result = subprocess.run(
                "cmd.exe /c " + command, cwd=root, capture_output=True, text=True
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("reached-fake-python", result.stdout)
            self.assertIn("backend.main:app --host 127.0.0.1 --port 8001", result.stdout)
            self.assertIn("--reload --reload-dir", result.stdout)

    def test_runner_captures_stdout_and_stderr_without_starting_backend(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "project with spaces"
            scripts = root / "scripts"
            scripts.mkdir(parents=True)
            wrapper = scripts / "dev-backend-runtime-env.cmd"
            wrapper.write_text(
                "@echo off\necho stdout-line\n1>&2 echo stderr-line\nexit /b 0\n",
                encoding="ascii",
            )
            with patch.object(runner, "__file__", str(scripts / "dev-backend-log-runner.py")):
                code = runner.run("20261009-120001", "127.0.0.1", 8001, 1024, 5)
            self.assertEqual(code, 0)
            log = scripts / ".dev-backend-only-20261009-120001.log"
            output = log.read_text(encoding="utf-8")
            self.assertIn("stdout-line", output)
            self.assertIn("stderr-line", output)


if __name__ == "__main__":
    unittest.main()
