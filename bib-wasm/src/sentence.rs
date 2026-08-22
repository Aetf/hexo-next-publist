//! Port of `@retorquere/bibtex-parser` v7 title sentence-casing, including the
//! guess-already-sentence-cased heuristic, so titles render identically to the
//! old parser. Braced (verbatim) chunks and math are case-protected.
//!
//! This module is a derivative work of @retorquere/bibtex-parser
//! (<https://github.com/retorquere/bibtex-parser>, `sentence-case.js` and the
//! sentence-casing logic in `index.js` as of v7.0.5), Copyright (c) 2017
//! Derek P Sifford, 2019 Derek P Sifford & Emiliano Heyns, MIT licensed.
//! See ../LICENSE.MIT-bibtex-parser for the full license text, which is also
//! shipped in the npm package.

use std::ops::Range;

use biblatex::{Chunk, Spanned};
use unicode_normalization::UnicodeNormalization;

const SKIP_WORDS: &[&str] = &[
    "but", "or", "yet", "so", "for", "and", "nor", "a", "an", "the", "at", "by", "from", "in",
    "into", "of", "on", "to", "with", "updown", "as",
];

pub fn sentence_case_chunks(chunks: &[Spanned<Chunk>]) -> String {
    // Flatten chunks into text + case-protected ranges.
    let mut text = String::new();
    let mut protected: Vec<Range<usize>> = vec![];
    for chunk in chunks {
        match &chunk.v {
            Chunk::Normal(s) => text.push_str(s),
            Chunk::Verbatim(s) => {
                let start = text.len();
                text.push_str(s.trim());
                protected.push(start..text.len());
            }
            Chunk::Math(s) => {
                let start = text.len();
                text.push('$');
                text.push_str(s);
                text.push('$');
                protected.push(start..text.len());
            }
        }
    }

    // Trim without invalidating ranges: adjust for removed leading bytes.
    let trimmed_start = text.len() - text.trim_start().len();
    let text = text.trim().to_string();
    let protected: Vec<Range<usize>> = protected
        .into_iter()
        .map(|r| r.start.saturating_sub(trimmed_start)..r.end.saturating_sub(trimmed_start).min(text.len()))
        .filter(|r| r.start < r.end)
        .collect();

    sentence_case(&text, &protected).nfc().collect()
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Word ranges: maximal runs of alphanumeric/underscore.
fn words(text: &str) -> Vec<Range<usize>> {
    let mut out = vec![];
    let mut start = None;
    for (i, c) in text.char_indices() {
        if is_word_char(c) {
            start.get_or_insert(i);
        } else if let Some(s) = start.take() {
            out.push(s..i);
        }
    }
    if let Some(s) = start {
        out.push(s..text.len());
    }
    out
}

fn intersects(r: &Range<usize>, ranges: &[Range<usize>]) -> bool {
    ranges.iter().any(|p| r.start < p.end && p.start < r.end)
}

/// Word-class counters feeding the guess heuristic.
fn count_words(text: &str, protected: &[Range<usize>]) -> (usize, usize, usize) {
    let (mut upper, mut lower, mut other) = (0, 0, 0);
    for w in words(text) {
        if intersects(&w, protected) {
            continue;
        }
        let word = &text[w];
        let chars: Vec<char> = word.chars().collect();
        if !chars.iter().any(|c| c.is_alphabetic()) {
            continue;
        }
        if chars.len() >= 2 && chars.iter().all(|c| c.is_lowercase() || c.is_numeric()) {
            lower += 1;
        } else if chars.len() >= 2 && chars.iter().all(|c| c.is_uppercase() || c.is_numeric()) {
            upper += 1;
        } else {
            other += 1;
        }
    }
    (upper, lower, other)
}

fn lowercase_word(word: &str, allcaps_field: bool) -> String {
    if allcaps_field {
        return word.to_lowercase();
    }
    if SKIP_WORDS.contains(&word.to_lowercase().as_str()) {
        return word.to_lowercase();
    }
    let chars: Vec<char> = word.chars().collect();
    let title_case = chars.len() >= 2
        && chars[0].is_uppercase()
        && chars[1..].iter().all(|c| c.is_lowercase() || c.is_numeric());
    if title_case {
        return word.to_lowercase();
    }
    if chars.len() == 1 {
        return if word == "A" { word.to_lowercase() } else { word.to_string() };
    }
    if chars[1..].iter().any(|c| c.is_uppercase()) {
        return word.to_string(); // inner caps: NetLock, USENIX, DArk
    }
    if chars.iter().any(|c| c.is_numeric()) {
        return word.to_string(); // identifiers like mod5
    }
    word.to_lowercase()
}

/// Ranges of sentence-start capitals: `^X` and `[—:?!.]\s+X`, excluding
/// capitals right after an acronym like `U.S.`.
fn sentence_starts(text: &str) -> Vec<Range<usize>> {
    let mut out = vec![];
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut i = 0;
    while i < chars.len() {
        let (pos, c) = chars[i];
        if i == 0 {
            if c.is_uppercase() {
                out.push(pos..pos + c.len_utf8());
            }
            i += 1;
            continue;
        }
        if matches!(c, '\u{2014}' | ':' | '?' | '!' | '.') {
            // an acronym like "U.S." does not start a sub-sentence
            let acronym = c == '.'
                && i >= 2
                && chars[i - 1].1.is_uppercase()
                && chars[i - 2].1 == '.';
            let mut j = i + 1;
            let mut saw_ws = false;
            while j < chars.len() && chars[j].1.is_whitespace() {
                saw_ws = true;
                j += 1;
            }
            if saw_ws && !acronym && j < chars.len() && chars[j].1.is_uppercase() {
                let (p, u) = chars[j];
                out.push(p..p + u.len_utf8());
            }
            i = j.max(i + 1);
            continue;
        }
        i += 1;
    }
    out
}

/// Double-quoted spans are kept as-is.
fn quoted_ranges(text: &str) -> Vec<Range<usize>> {
    let mut out = vec![];
    let mut start = None;
    for (i, c) in text.char_indices() {
        if c == '"' {
            match start.take() {
                None => start = Some(i),
                Some(s) => out.push(s..i + 1),
            }
        }
    }
    out
}

fn sentence_case(text: &str, verbatim: &[Range<usize>]) -> String {
    let (upper, lower, other) = count_words(text, verbatim);
    let has_ws = text.chars().any(char::is_whitespace);
    let allcaps_field = has_ws && upper > 0 && lower == 0 && other == 0;
    let seems_cased = upper.max(lower) > other + upper.min(lower);

    if !allcaps_field && seems_cased {
        return text.to_string();
    }

    let mut protected: Vec<Range<usize>> =
        if allcaps_field { vec![] } else { verbatim.to_vec() };
    protected.extend(sentence_starts(text));
    protected.extend(quoted_ranges(text));

    let mut out = String::with_capacity(text.len());
    let mut cursor = 0;
    for w in words(text) {
        out.push_str(&text[cursor..w.start]);
        let word = &text[w.clone()];
        if intersects(&w, &protected) {
            out.push_str(word);
        } else {
            out.push_str(&lowercase_word(word, allcaps_field));
        }
        cursor = w.end;
    }
    out.push_str(&text[cursor..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn case(text: &str, verbatim: &[Range<usize>]) -> String {
        sentence_case(text, verbatim)
    }

    #[test]
    fn plain_title_case_is_converted() {
        assert_eq!(
            case("Sol: Fast Distributed Computation Over Slow Networks", &[]),
            "Sol: Fast distributed computation over slow networks"
        );
    }

    #[test]
    fn already_sentence_cased_is_preserved() {
        assert_eq!(
            case("Pas de deux: Shape the Circuits, and Shape the Apps too!", &[]),
            "Pas de deux: Shape the Circuits, and Shape the Apps too!"
        );
    }

    #[test]
    fn protected_and_inner_caps_kept() {
        // {HUG}: Multi-Resource Fairness for Correlated and Elastic Demands
        assert_eq!(
            case("HUG: Multi-Resource Fairness for Correlated and Elastic Demands", &[0..3]),
            "HUG: Multi-resource fairness for correlated and elastic demands"
        );
    }

    #[test]
    fn capital_after_exclamation_kept() {
        assert_eq!(
            case("No! Not Another Deep Learning Framework", &[]),
            "No! Not another deep learning framework"
        );
    }
}
