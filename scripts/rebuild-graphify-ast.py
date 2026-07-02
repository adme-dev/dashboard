#!/usr/bin/env python3
"""Rebuild graphify-out/ from the current source tree using Graphify AST extraction.

Run via `pnpm run graphify:rebuild`. The Graphify Python package is installed in
the local pipx `graphifyy` environment on this machine.
"""
from __future__ import annotations

import json
import shutil
import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path

try:
    from graphify.extract import extract
    from graphify.build import build
    from graphify.cluster import cluster, score_all
    from graphify.analyze import god_nodes, surprising_connections
    from graphify.detect import detect
    from graphify.report import generate as generate_report
    from graphify.wiki import to_wiki
    from graphify.export import to_obsidian, to_canvas
    from networkx.readwrite import json_graph
except ImportError as exc:
    print(f"[graphify] Missing Graphify modules: {exc}", file=sys.stderr)
    print(
        "[graphify] Install/run with: "
        "/Users/paulgiurin/.local/pipx/venvs/graphifyy/bin/python scripts/rebuild-graphify-ast.py",
        file=sys.stderr,
    )
    sys.exit(1)


ROOT = Path(".")
OUT_DIR = ROOT / "graphify-out"

SUPPORTED_SUFFIXES = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".cxx",
    ".ex",
    ".exs",
    ".go",
    ".h",
    ".hpp",
    ".java",
    ".jl",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".lua",
    ".m",
    ".mm",
    ".php",
    ".ps1",
    ".py",
    ".rb",
    ".rs",
    ".scala",
    ".swift",
    ".toc",
    ".ts",
    ".tsx",
    ".zig",
}

EXCLUDE_DIRS = {
    ".cache",
    ".claude",
    ".cursor",
    ".data",
    ".git",
    ".github",
    ".netlify",
    ".nitro",
    ".nuxt",
    ".output",
    ".pnpm-store",
    ".superpowers",
    ".vercel",
    ".worktrees",
    ".wrangler",
    "dist",
    "graphify-out",
    "logs",
    "node_modules",
}


def is_excluded(path: Path) -> bool:
    return any(part in EXCLUDE_DIRS for part in path.parts)


def collect_source_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if is_excluded(path):
            continue
        if path.suffix not in SUPPORTED_SUFFIXES:
            continue
        files.append(path)
    return sorted(files)


def clean_generated_outputs() -> None:
    for child in ("cache", "obsidian", "wiki"):
        path = OUT_DIR / child
        if path.exists():
            shutil.rmtree(path)
    for child in ("graph.json", "GRAPH_REPORT.md", "index.md", "log.md"):
        path = OUT_DIR / child
        if path.exists():
            path.unlink()


def label_communities(graph, communities: dict) -> dict:
    labels = {}
    for cid, nodes in communities.items():
        community_labels = [graph.nodes[node_id].get("label", node_id) for node_id in nodes[:3]]
        labels[cid] = community_labels[0] if community_labels else f"Community {cid}"
    return labels


def attach_community_metadata(graph, communities: dict) -> None:
    for cid, members in communities.items():
        for node_id in members:
            if node_id in graph.nodes:
                graph.nodes[node_id]["community"] = cid


def write_graph_report(graph, communities, cohesion, labels, gods) -> None:
    surprises = surprising_connections(graph, communities, top_n=20)
    detection = detect(ROOT)
    token_cost = {"input": 0, "output": 0}
    report = generate_report(
        graph,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        token_cost,
        str(ROOT.resolve()),
    )
    (OUT_DIR / "GRAPH_REPORT.md").write_text(report)
    print(f"[graphify] Generated GRAPH_REPORT.md ({len(report):,} chars)")


def write_master_index(graph, communities, labels, file_count: int) -> None:
    edge_types = Counter(data.get("relation", "unknown") for _, _, data in graph.edges(data=True))
    community_sizes = sorted(
        ((cid, len(members)) for cid, members in communities.items()),
        key=lambda row: -row[1],
    )[:25]
    degree = Counter()
    for source, target, _ in graph.edges(data=True):
        degree[source] += 1
        degree[target] += 1

    id_to_label = {node_id: data.get("label", node_id) for node_id, data in graph.nodes(data=True)}
    id_to_file = {node_id: data.get("source_file", "") for node_id, data in graph.nodes(data=True)}

    lines = [
        "# graphify-out Master Index",
        "",
        "> Auto-generated master catalog for the code knowledge graph.",
        "",
        "## Overview",
        "",
        f"- **Project:** {ROOT.resolve().name}",
        f"- **Generated:** {date.today().isoformat()}",
        f"- **Files indexed:** {file_count:,} supported source files",
        f"- **Graph:** {graph.number_of_nodes():,} nodes · {graph.number_of_edges():,} edges · {len(communities):,} communities",
        "- **Edge types:** " + " · ".join(f"{key} ({count:,})" for key, count in edge_types.most_common()),
        "",
        "## Entry points",
        "",
        "- [[GRAPH_REPORT.md|Graph Report]]",
        "- [[wiki/index.md|Wiki Community Index]]",
        "- [[obsidian/graph.canvas|Obsidian Graph Canvas]]",
        "- [[log.md|Log]]",
        "",
        "## Top communities by size",
        "",
    ]

    for cid, size in community_sizes:
        label = labels[cid]
        lines.append(f"- [[wiki/_COMMUNITY_{label}|{label}]] - {size} nodes")

    lines.extend(["", "## God nodes", ""])
    for node_id, degree_count in degree.most_common(15):
        lines.append(f"- `{id_to_label[node_id]}` - {degree_count} edges ({id_to_file[node_id]})")

    lines.extend(
        [
            "",
            "## Recent log",
            "",
            f"- [[log.md|{date.today().isoformat()} - Full AST rebuild from active worktree]]",
            "",
        ]
    )
    (OUT_DIR / "index.md").write_text("\n".join(lines))
    print("[graphify] Generated index.md")


def append_log(file_count: int, graph, elapsed: float) -> None:
    log_path = OUT_DIR / "log.md"
    entry = [
        "",
        f"## [{date.today().isoformat()}] ingest | Full AST rebuild from active worktree",
        "",
        f"- **Files indexed:** {file_count:,} supported source files",
        f"- **Graph:** {graph.number_of_nodes():,} nodes · {graph.number_of_edges():,} edges",
        f"- **Elapsed:** {elapsed:.1f}s",
        "- **Builder:** `scripts/rebuild-graphify-ast.py`",
    ]
    if not log_path.exists():
        log_path.write_text("# graphify-out Log\n" + "\n".join(entry) + "\n")
    else:
        with log_path.open("a") as handle:
            handle.write("\n".join(entry) + "\n")
    print("[graphify] Appended log.md")


def main() -> int:
    start = time.time()
    OUT_DIR.mkdir(exist_ok=True)
    clean_generated_outputs()

    print("[graphify] Collecting supported source files...")
    files = collect_source_files()
    print(f"[graphify] Found {len(files):,} files")

    print("[graphify] Extracting AST nodes and edges...")
    extraction = extract(files)
    print(f"[graphify] Extracted {len(extraction['nodes']):,} nodes, {len(extraction['edges']):,} edges")

    print("[graphify] Building graph...")
    graph = build([extraction], directed=False)
    print(f"[graphify] Graph: {graph.number_of_nodes():,} nodes, {graph.number_of_edges():,} edges")

    print("[graphify] Clustering and analyzing...")
    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    gods = god_nodes(graph)
    labels = label_communities(graph, communities)
    attach_community_metadata(graph, communities)

    print("[graphify] Saving graph.json...")
    graph_json = json_graph.node_link_data(graph, edges="links")
    (OUT_DIR / "graph.json").write_text(json.dumps(graph_json, indent=2))

    print("[graphify] Generating wiki and Obsidian vault...")
    wiki_count = to_wiki(graph, communities, str(OUT_DIR / "wiki"), labels, cohesion, gods)
    obsidian_count = to_obsidian(graph, communities, str(OUT_DIR / "obsidian"), labels, cohesion)
    try:
        to_canvas(graph, communities, str(OUT_DIR / "obsidian" / "graph.canvas"), labels)
        canvas_status = " + canvas"
    except Exception as exc:
        canvas_status = f" (canvas skipped: {exc})"
    print(f"[graphify] Wiki: {wiki_count} articles | Obsidian: {obsidian_count} notes{canvas_status}")

    write_graph_report(graph, communities, cohesion, labels, gods)
    write_master_index(graph, communities, labels, len(files))

    elapsed = time.time() - start
    append_log(len(files), graph, elapsed)
    print(f"[graphify] Done in {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
