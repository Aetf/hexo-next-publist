//! BibTeX parsing core for hexo-next-publist.
//!
//! Replaces `@retorquere/bibtex-parser`: chunk the input for per-entry error
//! recovery, parse each chunk with `biblatex`, and emit a JSON document with
//! the exact shapes `src/bib-renderer.js` consumed from the old library
//! (sentence-cased titles, verbatim `publist_*` fields, reconstructed bibStr).

mod chunker;
mod model;
mod sentence;
pub mod tag;

use biblatex::{Bibliography, RawBibliography};
use unicode_normalization::UnicodeNormalization;
use wasm_bindgen::prelude::wasm_bindgen;

use model::{Creator, Entry, Field, Output, PError};

#[wasm_bindgen]
pub fn parse_bib(input: &str) -> String {
    serde_json::to_string(&parse(input)).expect("output serialization cannot fail")
}

/// Run the publist tag pipeline: yaml instance options + bib items in,
/// template context (pubs, fspecs, instOpts) plus diagnostics out.
#[wasm_bindgen]
pub fn process_tag(input: &str) -> String {
    let out = match serde_json::from_str::<tag::Input>(input) {
        Ok(inp) => tag::process(inp),
        Err(e) => tag::Output {
            fatal: Some(tag::Fatal::tag(format!("invalid tag input: {e}"))),
            ..Default::default()
        },
    };
    serde_json::to_string(&out).expect("output serialization cannot fail")
}

/// Line/column (1-based) of a byte offset within `src`.
fn line_col(src: &str, offset: usize) -> (usize, usize) {
    let offset = offset.min(src.len());
    let before = &src[..offset];
    let line = before.matches('\n').count() + 1;
    let col = before.rfind('\n').map_or(offset + 1, |nl| offset - nl);
    (line, col)
}

/// Strip one layer of surrounding braces or quotes from a raw field value.
fn strip_outer(value: &str) -> &str {
    let v = value.trim();
    if (v.starts_with('{') && v.ends_with('}')) || (v.starts_with('"') && v.ends_with('"')) {
        &v[1..v.len() - 1]
    } else {
        v
    }
}

/// Format resolved chunks as plain text: braces dropped, math kept as `$..$`,
/// source whitespace preserved.
fn format_plain(chunks: &[biblatex::Spanned<biblatex::Chunk>]) -> String {
    let mut out = String::new();
    for chunk in chunks {
        match &chunk.v {
            biblatex::Chunk::Normal(s) => out.push_str(s),
            biblatex::Chunk::Verbatim(s) => out.push_str(s.trim()),
            biblatex::Chunk::Math(s) => {
                out.push('$');
                out.push_str(s);
                out.push('$');
            }
        }
    }
    out.trim().nfc().collect()
}

pub fn parse(input: &str) -> Output {
    let mut out = Output::default();

    for chunk in chunker::chunks(input) {
        let src = &input[chunk.clone()];
        let (base_line, _) = line_col(input, chunk.start);

        let raw = match RawBibliography::parse(src) {
            Ok(raw) => raw,
            Err(err) => {
                let (line, col) = line_col(src, err.span.start);
                out.errors.push(PError {
                    line: line + base_line - 1,
                    column: col,
                    message: err.to_string(),
                });
                continue;
            }
        };

        // Raw view: field spans for bibStr reconstruction and verbatim
        // publist_* values (duplicates preserved, order preserved).
        let raw_entries: Vec<_> = raw.entries.iter().map(|e| e.v.clone()).collect();

        let resolved = match Bibliography::from_raw(raw) {
            Ok(bib) => bib,
            Err(err) => {
                let (line, col) = line_col(src, err.span.start);
                out.errors.push(PError {
                    line: line + base_line - 1,
                    column: col,
                    message: err.to_string(),
                });
                continue;
            }
        };

        for raw_entry in &raw_entries {
            let mut entry = Entry {
                key: raw_entry.key.v.to_string(),
                kind: raw_entry.kind.v.to_lowercase(),
                ..Entry::default()
            };

            // bibStr: original field source minus publist_* fields.
            entry.bib_str = format!("@{}{{{},\n", entry.kind, entry.key);
            let mut kept = vec![];
            for pair in &raw_entry.fields {
                if pair.key.v.to_lowercase().starts_with("publist_") {
                    continue;
                }
                let mut source =
                    src[pair.key.span.start..pair.value.span.end].trim().to_string();
                // The old parser's field source included the trailing comma.
                let rest = &src[pair.value.span.end..];
                if rest.trim_start().starts_with(',') {
                    source.push(',');
                }
                kept.push(format!("    {source}"));
            }
            entry.bib_str.push_str(&kept.join("\n"));
            entry.bib_str.push_str("\n}\n");

            // Verbatim publist_* fields, duplicates appended in order.
            for pair in &raw_entry.fields {
                let name = pair.key.v.to_lowercase();
                if !name.starts_with("publist_") {
                    continue;
                }
                let value = strip_outer(&src[pair.value.span.clone()]);
                if name == "publist_abstract" {
                    entry.abstract_raw = Some(value.to_string());
                }
                entry.push_field(&name, value.trim().to_string());
            }

            let Some(res) = resolved.get(raw_entry.key.v) else {
                continue;
            };

            // Resolved single-value fields (title sentence-cased like the old
            // parser did; the rest as plain de-escaped text).
            for (name, chunks) in &res.fields {
                let name = name.to_lowercase();
                if name.starts_with("publist_") || name == "author" || name == "editor" {
                    continue;
                }
                let value = if name == "title" {
                    sentence::sentence_case_chunks(chunks)
                } else {
                    format_plain(chunks)
                };
                entry.push_field(&name, value);
            }

            if let Ok(persons) = res.author() {
                entry.creators.author = persons
                    .into_iter()
                    .map(|p| {
                        let last = if p.prefix.is_empty() {
                            p.name
                        } else {
                            format!("{} {}", p.prefix, p.name)
                        };
                        Creator {
                            first_name: p.given_name.nfc().collect(),
                            last_name: last.nfc().collect(),
                        }
                    })
                    .collect();
            }

            out.entries.push(entry);
        }
    }

    out
}

// Re-export for integration tests.
pub use model::Output as ParseOutput;

impl Entry {
    fn push_field(&mut self, name: &str, value: String) {
        if let Some(field) = self.fields.iter_mut().find(|f| f.name == name) {
            field.values.push(value);
        } else {
            self.fields.push(Field { name: name.to_string(), values: vec![value] });
        }
    }
}
