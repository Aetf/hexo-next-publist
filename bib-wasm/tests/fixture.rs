//! Parity checks against the ava snapshot expectations in
//! ../test/snapshots/mcpub.js.md, using the same fixture bib file.

use publist_bib_wasm::parse;

fn fixture() -> String {
    std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../test/data/MCPubs.bib"))
        .expect("fixture readable")
}

#[test]
fn titles_match_old_parser() {
    let out = parse(&fixture());
    assert!(out.errors.is_empty(), "unexpected errors: {:?}", out.errors.iter().map(|e| &e.message).collect::<Vec<_>>());

    let titles: std::collections::HashMap<String, String> = out
        .entries
        .iter()
        .filter_map(|e| {
            let t = e.fields.iter().find(|f| f.name == "title")?;
            Some((e.key.clone(), t.values[0].clone()))
        })
        .collect();

    let expected = [
        ("hug:nsdi16", "HUG: Multi-resource fairness for correlated and elastic demands"),
        ("carbyne:osdi16", "Altruistic scheduling in multi-resource clusters"),
        ("infiniswap:nsdi17", "Efficient memory disaggregation with Infiniswap"),
        ("infiniswap:login17", "Decentralized memory disaggregation over low-latency networks"),
        ("netlock:sigcomm20", "NetLock: Fast, centralized lock management using programmable switches"),
        ("sol:nsdi20", "Sol: Fast distributed computation over slow networks"),
        ("salus:mlsys20", "Fine-grained GPU sharing primitives for deep learning applications"),
        ("salus:arxiv19", "Salus: Fine-grained GPU sharing primitives for deep learning applications"),
        ("leap:atc20", "Effectively prefetching remote memory with Leap"),
        ("allox:eurosys20", "AlloX: Compute allocation in hybrid clusters"),
        ("coda:sigcomm16", "CODA: Toward automatically identifying and scheduling COflows in the DArk"),
        ("tiresias:nsdi19", "Tiresias: A GPU cluster manager for distributed deep learning"),
    ];
    for (key, want) in expected {
        assert_eq!(
            titles.get(key).map(String::as_str),
            Some(want),
            "title mismatch for {key}"
        );
    }

    // guess-already-sentence-cased: left untouched
    let pas = titles.values().find(|t| t.starts_with("Pas de deux"));
    assert_eq!(
        pas.map(String::as_str),
        Some("Pas de deux: Shape the Circuits, and Shape the Apps too!")
    );
}

#[test]
fn bibstr_reconstruction_matches() {
    let out = parse(&fixture());
    let sol = out.entries.iter().find(|e| e.key == "sol:nsdi20").unwrap();
    let want = "@inproceedings{sol:nsdi20,
    author    = {Fan Lai and Jie You and Xiangfeng Zhu and Harsha V. Madhyastha and Mosharaf Chowdhury},
    booktitle = {USENIX NSDI},
    title     = {Sol: Fast Distributed Computation Over Slow Networks},
    year      = {2020},
    pages     = {273--288},
}
";
    assert_eq!(sol.bib_str, want);
    assert!(!sol.bib_str.contains("publist"));
}

#[test]
fn authors_and_plural_fields() {
    let out = parse(&fixture());
    let sol = out.entries.iter().find(|e| e.key == "sol:nsdi20").unwrap();
    let names: Vec<String> = sol
        .creators
        .author
        .iter()
        .map(|p| format!("{} {}", p.first_name, p.last_name))
        .collect();
    assert_eq!(
        names,
        ["Fan Lai", "Jie You", "Xiangfeng Zhu", "Harsha V. Madhyastha", "Mosharaf Chowdhury"]
    );

    let links = sol.fields.iter().find(|f| f.name == "publist_link").unwrap();
    assert_eq!(
        links.values,
        [
            "paper || sol-nsdi20.pdf",
            "slides || sol-nsdi20-slides.pdf",
            "code || https://github.com/SymbioticLab/Sol",
        ]
    );

    // publist_abstract keeps paragraph breaks for markdown rendering
    let abs = sol.abstract_raw.as_ref().unwrap();
    assert!(abs.contains("\n\n") || abs.contains("\n    \n") || abs.contains("\n\r\n"));
}

#[test]
fn malformed_entry_recovers_per_chunk() {
    let src = "@article{good, title = {Fine}}\n@broken{bad\n title = {X},\n}\n@article{good2, title = {Also Fine}}";
    let out = parse(src);
    assert_eq!(out.entries.len(), 2);
    assert_eq!(out.errors.len(), 1);
    assert!(out.errors[0].line >= 2, "error line should be in second chunk, got {}", out.errors[0].line);
}
