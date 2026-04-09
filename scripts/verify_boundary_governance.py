import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CONTEXTS_ROOT = REPO_ROOT / "src" / "backend" / "contexts"

OWNER_TABLES = {
    "inventory": ("groups", "catalog_items", "inventory_items"),
    "space_design": ("containers", "cutting_jobs", "zones"),
    "allocation": ("zone_assignments",),
    "packing": ("packing_results",),
}

DIRECT_WRITE_PATTERN = re.compile(
    r"\b(INSERT INTO|UPDATE|DELETE FROM)\s+"
    r"(groups|catalog_items|inventory_items|containers|cutting_jobs|zones|zone_assignments|packing_results)\b",
    re.IGNORECASE,
)
INFRA_IMPORT_PATTERN = re.compile(
    r"src\.backend\.contexts\.([a-z_]+)\.infrastructure\."
)

# Current temporary exceptions are allowed but documented explicitly here so
# the scan still acts as governance instead of silently permitting everything.
ALLOWED_CROSS_CONTEXT_INFRA_IMPORTS = {
    "src/backend/contexts/packing/infrastructure/packing_repository.py": {
        "inventory"
    },
}


def iter_python_files():
    for path in CONTEXTS_ROOT.rglob("*.py"):
        yield path


def context_name_for(path: Path):
    relative = path.relative_to(CONTEXTS_ROOT)
    return relative.parts[0]


def relative_str(path: Path):
    return path.relative_to(REPO_ROOT).as_posix()


def scan_cross_context_infrastructure_imports():
    violations = []
    for path in iter_python_files():
        current_context = context_name_for(path)
        text = path.read_text(encoding="utf-8")
        imported_contexts = set(INFRA_IMPORT_PATTERN.findall(text))
        imported_other_contexts = {
            imported for imported in imported_contexts if imported != current_context
        }
        if not imported_other_contexts:
            continue

        allowed = ALLOWED_CROSS_CONTEXT_INFRA_IMPORTS.get(relative_str(path), set())
        unexpected = sorted(imported_other_contexts - allowed)
        if unexpected:
            violations.append(
                f"{relative_str(path)} imports cross-context infrastructure: {', '.join(unexpected)}"
            )
    return violations


def scan_direct_cross_context_writes():
    violations = []
    for path in iter_python_files():
        current_context = context_name_for(path)
        text = path.read_text(encoding="utf-8")
        for match in DIRECT_WRITE_PATTERN.finditer(text):
            table = match.group(2)
            owner_context = next(
                context
                for context, tables in OWNER_TABLES.items()
                if table in tables
            )
            if owner_context != current_context:
                violations.append(
                    f"{relative_str(path)} directly writes owner table '{table}' "
                    f"from non-owner context '{current_context}'"
                )
    return violations


def main():
    violations = []
    violations.extend(scan_cross_context_infrastructure_imports())
    violations.extend(scan_direct_cross_context_writes())

    if violations:
        print("Boundary governance scan failed:")
        for violation in violations:
            print(f"- {violation}")
        sys.exit(1)

    print("Boundary governance scan passed.")


if __name__ == "__main__":
    main()
