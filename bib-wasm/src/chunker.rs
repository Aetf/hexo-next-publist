//! Split a bibtex file into per-entry chunks so one malformed entry does not
//! take down the whole file (matches the old `@retorquere` chunker behavior).

use std::ops::Range;

/// Byte ranges of `@...{...}` chunks. Text between chunks is bibtex comment
/// and dropped. A chunk whose braces never close extends to end of input.
pub fn chunks(input: &str) -> Vec<Range<usize>> {
    let bytes = input.as_bytes();
    let mut out = vec![];
    let mut pos = 0;

    while pos < bytes.len() {
        match bytes[pos] {
            b'@' => {
                let start = pos;
                pos += 1;
                // entry type identifier
                while pos < bytes.len() && (bytes[pos].is_ascii_alphanumeric() || bytes[pos] == b'_')
                {
                    pos += 1;
                }
                while pos < bytes.len() && bytes[pos].is_ascii_whitespace() {
                    pos += 1;
                }
                let (open, close) = match bytes.get(pos) {
                    Some(b'{') => (b'{', b'}'),
                    Some(b'(') => (b'(', b')'),
                    _ => continue, // stray '@', treat as comment text
                };
                let mut depth = 0usize;
                let mut in_quote = false;
                while pos < bytes.len() {
                    let c = bytes[pos];
                    if c == b'"' && depth > 0 {
                        // quotes only delimit values at field level; nested
                        // braces inside quotes still count for bibtex, so we
                        // only use quotes to guard the paren form
                        if open == b'(' {
                            in_quote = !in_quote;
                        }
                    }
                    if !in_quote {
                        if c == open {
                            depth += 1;
                        } else if c == close {
                            depth -= 1;
                            if depth == 0 {
                                pos += 1;
                                break;
                            }
                        }
                    }
                    pos += 1;
                }
                out.push(start..pos);
            }
            _ => pos += 1,
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_and_skips_comments() {
        let src = "% comment\n@article{a,\n title={x}\n}\njunk\n@misc{b, note={{y}}}\n";
        let got = chunks(src);
        assert_eq!(got.len(), 2);
        assert!(src[got[0].clone()].starts_with("@article{a"));
        assert!(src[got[1].clone()].starts_with("@misc{b"));
        assert!(src[got[1].clone()].ends_with("{{y}}}"));
    }

    #[test]
    fn unterminated_runs_to_eof() {
        let src = "@article{a, title={x}";
        let got = chunks(src);
        assert_eq!(got, vec![0..src.len()]);
    }
}
